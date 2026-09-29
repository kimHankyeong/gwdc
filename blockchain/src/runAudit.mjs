// Sepolia 합성 감사 기록 데모입니다. 공개 네트워크 공격은 하지 않고 자체 거래만 검증합니다.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  Contract, ContractFactory, FetchRequest, JsonRpcProvider,
  Wallet, keccak256, getCreateAddress,
} from "ethers";
import {
  CHAIN_ID, hashPayload, atomicJson, acquireLock, validatePayloads,
  validateCheckpoint, validateSigned, retryRpc, verifyInclusion,
  sealCheckpoint, openCheckpoint,
} from "../scripts/audit-safety.mjs";
import { executeTransaction } from "../scripts/audit-transaction.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const randomHash = () => `0x${randomBytes(32).toString("hex")}`;

// URL은 연결 주소이고 chainId는 별도의 검증 대상입니다. 자격 증명을 로그로 출력하지 않습니다.
function createProviders() {
  config({ path: path.join(ROOT, ".env.sepolia") });
  const primaryUrl = new URL(process.env.TRACK_RPC_URL ?? "");
  const witnessUrl = new URL(process.env.TRACK_VERIFY_RPC_URL ?? "");
  for (const url of [primaryUrl, witnessUrl]) {
    assert.equal(url.protocol, "https:", "Sepolia RPC must use HTTPS");
  }
  assert.notEqual(primaryUrl.hostname, witnessUrl.hostname, "Use a separate RPC operator");

  // 서로 다른 호스트라는 검사만으로 실제 운영자 독립성이 보장되지는 않습니다.
  return [primaryUrl, witnessUrl].map(url => {
    const request = new FetchRequest(url.href);
    request.timeout = 15000;
    return new JsonRpcProvider(request);
  });
}

// 실행 잠금은 모든 요청의 nonce 사용을 직렬화합니다.
async function runAuditTest(provider, witness, input, signerKey, storage) {
  const wallet = new Wallet(signerKey, provider);
  const release = storage ? () => {} : acquireLock(wallet.address);
  try {
    return await runLocked();
  } finally {
    release();
  }

  // 파일, 거래, 보고서가 같은 요청을 가리키도록 요청 식별자를 고정합니다.
  async function runLocked() {
    const requestId = input.requestId;
    assert.match(requestId, /^[a-z0-9_-]{1,80}$/, "Request ID must use lowercase ASCII");
    const checkpointFile = path.join(ROOT, "state", `${requestId}.json`);
    const reportFile = path.join(ROOT, "evidence", `${requestId}.json`);
    const store = storage ?? {
      loadCheckpoint: async () => existsSync(checkpointFile) ? JSON.parse(readFileSync(checkpointFile, "utf8")) : null,
      hasReport: async () => existsSync(reportFile),
      saveCheckpoint: async value => atomicJson(checkpointFile, value),
      saveReport: async value => atomicJson(reportFile, value),
    };
    let artifact;
    let bytecodeHash;
    let legacy = false;
    let state;
    const hadReport = await store.hasReport();

    // 이전 성공 보고서를 이번 실행의 결과로 오해하지 않도록 먼저 상태를 바꿉니다.
    if (!storage) await store.saveReport({ requestId, verification: "running", startedAt: new Date().toISOString() });
    try {
      // RPC 장애나 컴파일 산출물 손상도 최신 검증 실패로 보고합니다.
      const networks = await Promise.all([provider, witness].map(node => retryRpc(() => node.getNetwork())));
      assert.ok(networks.every(network => network.chainId === CHAIN_ID), "Sepolia only");
      const artifactFile = path.join(ROOT, "artifacts/contracts/AuditRecord.sol/AuditRecord.json");
      artifact = JSON.parse(readFileSync(artifactFile, "utf8"));
      bytecodeHash = keccak256(artifact.bytecode);
      state = await loadState();
      return await verifyAndRecord();
    } catch (error) {
      if (!storage || state) await store.saveReport({
        requestId,
        verification: "failed-or-unavailable",
        txHash: state?.recording?.txHash ?? null,
        checkedAt: new Date().toISOString(),
      });
      throw error;
    }

    // HMAC가 없는 기존 파일은 이미 서명된 두 거래의 읽기 전용 검증만 허용합니다.
    async function loadState() {
      const envelope = await store.loadCheckpoint();
      if (envelope) {
        let saved;
        if (envelope.format) {
          saved = openCheckpoint(envelope, wallet.privateKey);
        } else {
          legacy = true;
          saved = envelope;
          assert.ok(saved.deployment && saved.recording, "Unsigned legacy checkpoint requires manual recovery");
        }
        validateCheckpoint(saved, wallet.address, requestId, bytecodeHash);
        const expected = validatePayloads(input.policy, input.record);
        assert.equal(hashPayload(expected.policy), saved.policyHash, "Policy input conflict");
        assert.equal(hashPayload(expected.record), saved.recordHash, "Record input conflict");
        assert.equal(input.purchaseId, saved.purchaseId, "Purchase ID conflict");
        return saved;
      }
      // 상태가 사라졌는데 보고서가 남아 있으면 같은 요청을 새로 생성하지 않습니다.
      assert.ok(!hadReport, "Missing checkpoint for an existing request; restore a verified backup");
      const nonces = await Promise.all([provider, witness].map(node =>
        retryRpc(() => node.getTransactionCount(wallet.address, "pending"))));
      assert.equal(nonces[0], nonces[1], "RPC nonce disagreement");
      const payloads = validatePayloads(input.policy, input.record);
      const fresh = {
        version: 2, requestId, chainId: CHAIN_ID.toString(), signer: wallet.address,
        bytecodeHash, deploymentNonce: nonces[0], purchaseId: input.purchaseId, ...payloads,
        policyHash: hashPayload(payloads.policy), recordHash: hashPayload(payloads.record),
      };
      await store.saveCheckpoint(sealCheckpoint(fresh, wallet.privateKey));
      return fresh;
    }

    // 레거시는 모든 온체인 대조가 끝난 뒤에만 인증 형식으로 전환합니다.
    async function save() {
      if (!legacy) await store.saveCheckpoint(sealCheckpoint(state, wallet.privateKey));
    }

    // 내부 함수로 배포·기록·검증의 순서를 한 곳에서 보여줍니다.
    async function verifyAndRecord() {
      const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
      const deployRequest = await factory.getDeployTransaction();
      // 초기 인증 상태로 되돌려도 새 nonce로 재배포하지 못하도록 고정합니다.
      deployRequest.nonce = state.deploymentNonce ?? state.deployment?.nonce;

      // 기록 호출 데이터는 저장된 인증 원문에서 재생성하고 서명 원문과 대조합니다.
      function recordRequest(address) {
        return {
          to: address,
          data: factory.interface.encodeFunctionData("recordPurchase", [
            state.purchaseId, state.policyHash, state.recordHash,
          ]),
          value: 0n,
        };
      }

      // 저장된 거래 전체를 먼저 검사해 뒤쪽 거래의 변조도 방송 전에 발견합니다.
      if (state.deployment) {
        const tx = validateSigned(state.deployment, deployRequest, wallet.address);
        const address = getCreateAddress({ from: wallet.address, nonce: tx.nonce });
        if (state.contractAddress) assert.equal(state.contractAddress, address);
        if (state.recording) validateSigned(state.recording, recordRequest(address), wallet.address);
      } else {
        assert.ok(!state.recording, "Recording without deployment");
      }

      // 공통 실행기에 의도와 저장 함수를 전달합니다. 레거시 검증은 방송도 금지합니다.
      function sendOnce(label, expected) {
        return executeTransaction({
          label, expected, state, wallet, provider, witness, save, readOnly: legacy,
        });
      }

      // 코드 일치와 권한 상태를 두 노드에서 확인한 후 기록을 진행합니다.
      async function deployContract() {
        const receipt = await sendOnce("deployment", deployRequest);
        const address = getCreateAddress({ from: wallet.address, nonce: state.deployment.nonce });
        assert.equal(receipt.contractAddress, address);
        for (const node of [provider, witness]) {
          const code = await retryRpc(() => node.getCode(address));
          assert.equal(code.toLowerCase(), artifact.deployedBytecode.toLowerCase(), "Unexpected deployed contract code");
          const view = new Contract(address, artifact.abi, node);
          // 이미 기록된 거래 조회는 소유권 이전·일시 중지 뒤에도 가능합니다.
          if (!state.recording) {
            assert.equal(await retryRpc(() => view.owner()), wallet.address);
            assert.equal(await retryRpc(() => view.paused()), false, "Contract is paused");
          }
        }
        state.contractAddress = address;
        await save();
        return new Contract(address, artifact.abi, wallet);
      }

      // 출처·ID·해시를 검증합니다. RPC 간 로그 일치는 실행기의 영수증 검사에서 확인합니다.
      async function verifyRecord(book, receipt) {
        const events = receipt.logs
          .filter(log => log.address.toLowerCase() === state.contractAddress.toLowerCase())
          .map(log => book.interface.parseLog(log))
          .filter(event => event?.name === "PurchaseRecorded");
        assert.equal(events.length, 1, "Expected exactly one audit event");
        assert.equal(events[0].args.purchaseId, state.purchaseId);
        assert.equal(events[0].args.policyHash, state.policyHash);
        assert.equal(events[0].args.recordHash, state.recordHash);
        for (const node of [provider, witness]) {
          const view = new Contract(state.contractAddress, artifact.abi, node);
          assert.equal(await retryRpc(() => view.recordedPurchases(state.purchaseId)), true);
        }
      }

      const book = await deployContract();
      const receipt = await sendOnce("recording", recordRequest(state.contractAddress));
      await verifyRecord(book, receipt);
      const finality = await verifyInclusion(provider, receipt, state.recording.txHash, witness);
      legacy = false;
      await save();
      const report = {
        scope: "SIMULATION order; real Sepolia audit; no proof of real purchase",
        sourceMode: "SIMULATION", chainMode: "SEPOLIA_REAL",
        verification: "verified",
        requestId, chainId: state.chainId, signer: wallet.address,
        contractAddress: state.contractAddress, deploymentTxHash: state.deployment.txHash,
        txHash: state.recording.txHash, purchaseId: state.purchaseId,
        policyHash: state.policyHash, recordHash: state.recordHash,
        blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
        receiptStatus: receipt.status, finality,
        checks: {
          eventMatches: true, signedIntentVerified: true,
          runtimeCodeVerified: true, independentRpcAgreement: true,
          checkpointAuthenticated: true,
        },
        explorerUrl: `https://sepolia.etherscan.io/tx/${state.recording.txHash}`,
        verifiedAt: new Date().toISOString(),
      };
      await store.saveReport(report);
      return report;
    }
  }
}

// Explicit invocation only: importing this module never contacts a network.
export async function runAuditWithInput(input, signerKey = process.env.TRACK_CHAIN_PRIVATE_KEY ?? "", storage) {
  assert.equal(input.sourceMode, "SIMULATION");
  validatePayloads(input.policy, input.record);
  assert.match(input.purchaseId, /^0x[0-9a-f]{64}$/);
  let providers = [];
  try {
    providers = createProviders();
    return await runAuditTest(...providers, input, signerKey, storage);
  } finally {
    for (const provider of providers) provider.destroy();
  }
}
