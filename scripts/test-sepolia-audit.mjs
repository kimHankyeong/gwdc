// 앱·DB 없이 합성 감사 데이터를 기록합니다. 개인키와 원문은 공개 보고서에 넣지 않습니다.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Contract, ContractFactory, FetchRequest, JsonRpcProvider, Wallet, keccak256, getCreateAddress } from "ethers";
import {
  CHAIN_ID, hashPayload, atomicJson, acquireLock, validatePayloads,
  validateCheckpoint, validateCost, validateSigned, retryRpc, pendingStatus, verifyInclusion,
} from "./audit-safety.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const randomHash = () => `0x${randomBytes(32).toString("hex")}`;

function createProvider() {
  config({ path: path.join(ROOT, ".env.sepolia") });
  const url = new URL(process.env.TRACK_RPC_URL ?? "");
  assert.equal(url.protocol, "https:", "Sepolia RPC must use HTTPS");
  const request = new FetchRequest(url.href);
  request.timeout = 15000;
  return new JsonRpcProvider(request);
}

async function runAuditTest(provider) {
  assert.equal((await retryRpc(() => provider.getNetwork())).chainId, CHAIN_ID, "Sepolia only");
  const wallet = new Wallet(process.env.TRACK_CHAIN_PRIVATE_KEY ?? "", provider);
  // 같은 PC의 다른 체크아웃도 같은 지갑을 동시에 쓰지 못하도록 잠급니다.
  const release = acquireLock(wallet.address);
  try {
    await runLocked();
  } finally {
    release();
  }

  async function runLocked() {
    const artifact = JSON.parse(readFileSync(path.join(ROOT, "artifacts/contracts/AuditRecord.sol/AuditRecord.json"), "utf8"));
    const requestId = process.env.TRACK_AUDIT_REQUEST_ID ?? "audit-v2-demo";
    assert.match(requestId, /^[a-zA-Z0-9_-]{1,80}$/, "Invalid request ID");
    const checkpointFile = path.join(ROOT, "state", `${requestId}.json`);
    const reportFile = path.join(ROOT, "evidence", `${requestId}.json`);
    const bytecodeHash = keccak256(artifact.bytecode);
    const state = loadState();
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployRequest = await factory.getDeployTransaction();

    function loadState() {
      if (existsSync(checkpointFile)) {
        const saved = JSON.parse(readFileSync(checkpointFile, "utf8"));
        // 저장값을 덮어써서 복구하지 않고, 불일치 시 전송 전에 중단합니다.
        validateCheckpoint(saved, wallet.address, requestId, bytecodeHash);
        return saved;
      }
      const payloads = validatePayloads(
        { version: 1, maxBudget: 1000, reviewRequired: false, reviewMinimum: 0, reviewRatingMinimum: 0, salt: randomHash() },
        { quantity: 1, unitPrice: 100, shipping: 0, total: 100, currency: "KRW", salt: randomHash() },
      );
      const fresh = {
        version: 2, requestId, chainId: CHAIN_ID.toString(), signer: wallet.address,
        bytecodeHash, purchaseId: randomHash(), ...payloads,
        policyHash: hashPayload(payloads.policy), recordHash: hashPayload(payloads.record),
      };
      atomicJson(checkpointFile, fresh);
      return fresh;
    }

    function save() { atomicJson(checkpointFile, state); }

    function recordRequest(address) {
      return {
        to: address,
        data: factory.interface.encodeFunctionData("recordPurchase", [state.purchaseId, state.policyHash, state.recordHash]),
        value: 0n,
      };
    }

    // 기존 서명 두 개를 먼저 검증합니다. 하나라도 변조되었으면 방송하지 않습니다.
    if (state.deployment) {
      const tx = validateSigned(state.deployment, deployRequest, wallet.address);
      const address = getCreateAddress({ from: wallet.address, nonce: tx.nonce });
      if (state.contractAddress) assert.equal(state.contractAddress, address);
      if (state.recording) validateSigned(state.recording, recordRequest(address), wallet.address);
    } else {
      assert.ok(!state.recording, "Recording without deployment");
    }

    async function sendOnce(label, expected) {
      if (!state[label]) {
        const populated = await retryRpc(() => wallet.populateTransaction({ ...expected, chainId: CHAIN_ID }));
        const fee = validateCost(populated);
        assert.ok(await retryRpc(() => provider.getBalance(wallet.address)) >= fee, "Insufficient balance for maximum fee");
        const raw = await wallet.signTransaction(populated);
        state[label] = { raw, txHash: keccak256(raw), nonce: populated.nonce, status: "signed" };
        validateSigned(state[label], expected, wallet.address);
        save(); // 방송 전에 서명과 nonce를 영속화합니다.
      }
      const saved = state[label];
      const tx = validateSigned(saved, expected, wallet.address);
      let receipt = await retryRpc(() => provider.getTransactionReceipt(saved.txHash));
      if (!receipt) {
        const status = await pendingStatus(provider, tx, saved.txHash);
        saved.status = status;
        save();
        assert.ok(!status.includes("replaced") && status !== "possible-replacement", `${status}: manual transaction review required`);
        try {
          // 오류로 다시 호출되어도 정확히 같은 서명 바이트만 방송합니다.
          await retryRpc(() => provider.broadcastTransaction(saved.raw));
        } catch (error) {
          if (!await retryRpc(() => provider.getTransaction(saved.txHash))) throw error;
        }
        console.log(JSON.stringify({ stage: label, txHash: saved.txHash, status: "waiting" }));
        try {
          receipt = await provider.waitForTransaction(saved.txHash, 1, 45000);
        } catch (error) {
          if (error.code !== "TIMEOUT") throw error;
        }
        if (!receipt) {
          saved.status = await pendingStatus(provider, tx, saved.txHash);
          save();
          throw new Error(`${saved.status}: no receipt yet. Rerun with the same request ID; do not create a new request.`);
        }
      }
      if (receipt.status !== 1) {
        saved.status = "reverted";
        save();
        throw new Error(`${label} reverted; manual review required`);
      }
      saved.status = await verifyInclusion(provider, receipt);
      saved.blockNumber = receipt.blockNumber;
      saved.blockHash = receipt.blockHash;
      save();
      return receipt;
    }

    async function deployContract() {
      const receipt = await sendOnce("deployment", deployRequest);
      const address = getCreateAddress({ from: wallet.address, nonce: state.deployment.nonce });
      assert.equal(receipt.contractAddress, address);
      // owner()가 같다는 것만으로는 같은 계약이라고 판단할 수 없습니다.
      const code = await retryRpc(() => provider.getCode(address));
      assert.equal(code.toLowerCase(), artifact.deployedBytecode.toLowerCase(), "Unexpected deployed contract code");
      state.contractAddress = address;
      save();
      const book = new Contract(address, artifact.abi, wallet);
      assert.equal(await retryRpc(() => book.owner()), wallet.address);
      assert.equal(await retryRpc(() => book.paused()), false, "Contract is paused");
      return book;
    }

    async function verifyRecord(book, receipt) {
      const events = receipt.logs
        .filter(log => log.address.toLowerCase() === state.contractAddress.toLowerCase())
        .map(log => book.interface.parseLog(log))
        .filter(event => event?.name === "PurchaseRecorded");
      assert.equal(events.length, 1, "Expected exactly one audit event");
      assert.equal(events[0].args.purchaseId, state.purchaseId);
      assert.equal(events[0].args.policyHash, state.policyHash);
      assert.equal(events[0].args.recordHash, state.recordHash);
      assert.equal(await retryRpc(() => book.recordedPurchases(state.purchaseId)), true);
      await assert.rejects(book.recordPurchase.staticCall(state.purchaseId, state.policyHash, state.recordHash), /DuplicatePurchase/);
      const outsider = Wallet.createRandom().connect(provider);
      await assert.rejects(book.connect(outsider).recordPurchase.staticCall(randomHash(), state.policyHash, state.recordHash), /Unauthorized/);
    }

    const book = await deployContract();
    const receipt = await sendOnce("recording", recordRequest(state.contractAddress));
    await verifyRecord(book, receipt);
    // 여러 RPC 호출 중의 재구성도 마지막에 확인하며, 블록 포함과 최종 확정을 구분합니다.
    const finality = await verifyInclusion(provider, receipt);
    const report = {
      scope: "standalone chain; synthetic data; no payment or proof of real purchase",
      requestId, chainId: state.chainId, signer: wallet.address,
      contractAddress: state.contractAddress, deploymentTxHash: state.deployment.txHash,
      txHash: state.recording.txHash, purchaseId: state.purchaseId,
      policyHash: state.policyHash, recordHash: state.recordHash,
      blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
      receiptStatus: receipt.status, finality,
      checks: { eventMatches: true, duplicateRejected: true, unauthorizedRejected: true, signedIntentVerified: true, runtimeCodeVerified: true },
      explorerUrl: `https://sepolia.etherscan.io/tx/${state.recording.txHash}`,
      verifiedAt: new Date().toISOString(),
    };
    atomicJson(reportFile, report);
    console.log(JSON.stringify(report, null, 2));
  }
}

const provider = createProvider();
try {
  await runAuditTest(provider);
} finally {
  provider.destroy();
}
