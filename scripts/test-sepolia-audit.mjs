// 앱과 DB를 사용하지 않는 Sepolia 감사 기록 테스트입니다.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import {
  Contract, ContractFactory, FetchRequest, JsonRpcProvider,
  Wallet, keccak256, toUtf8Bytes,
} from "ethers";

// Sepolia가 정한 네트워크 ID입니다. RPC 응답 확인과 트랜잭션 서명에 함께 사용합니다.
// n은 JavaScript BigInt 표기이며 JSON에 저장할 때는 문자열로 변환합니다.
const SEPOLIA_CHAIN_ID = 11155111n;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKPOINT_FILE = path.join(ROOT, "state/sepolia-audit-checkpoint.json");
const REPORT_FILE = path.join(ROOT, "evidence/sepolia-audit-verification.json");

function randomHash() {
  return `0x${randomBytes(32).toString("hex")}`;
}

function hashPayload(payload) {
  // 필드 순서와 salt까지 동일해야 재실행에서도 같은 해시가 나옵니다.
  return keccak256(toUtf8Bytes(JSON.stringify(payload)));
}

function writeJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

function createProvider() {
  config({ path: path.join(ROOT, ".env.sepolia") });
  // RPC URL은 접속할 서버 주소입니다. 실제로 Sepolia인지 여부는 별도로 검사합니다.
  const url = new URL(process.env.TRACK_RPC_URL ?? "");
  assert.equal(url.protocol, "https:", "Sepolia RPC must use HTTPS.");
  const request = new FetchRequest(url.href);
  request.timeout = 15000;
  return new JsonRpcProvider(request);
}

function loadCheckpoint(signer) {
  // 저장된 데이터와 salt를 재사용합니다. 처음 실행할 때만 새 값을 생성합니다.
  const state = existsSync(CHECKPOINT_FILE)
    ? JSON.parse(readFileSync(CHECKPOINT_FILE, "utf8"))
    : {
        chainId: SEPOLIA_CHAIN_ID.toString(),
        signer,
        purchaseId: randomHash(),
        policy: {
          version: 1,
          maxBudget: 1000,
          reviewRequired: false,
          reviewMinimum: 0,
          reviewRatingMinimum: 0,
          salt: randomHash(),
        },
        record: {
          quantity: 1,
          unitPrice: 100,
          shipping: 0,
          total: 100,
          currency: "KRW",
          salt: randomHash(),
        },
      };

  assert.equal(state.signer, signer, "Checkpoint belongs to another test wallet.");
  assert.equal(state.chainId, SEPOLIA_CHAIN_ID.toString());
  state.policyHash = hashPayload(state.policy);
  state.recordHash = hashPayload(state.record);
  writeJson(CHECKPOINT_FILE, state);
  return state;
}

async function runAuditTest(provider) {
  const network = await provider.getNetwork();
  assert.equal(network.chainId, SEPOLIA_CHAIN_ID, "Sepolia only: refusing a different chain.");

  const wallet = new Wallet(process.env.TRACK_CHAIN_PRIVATE_KEY ?? "", provider);
  assert.ok(await provider.getBalance(wallet.address) > 0n, "Test wallet needs Sepolia ETH.");
  const artifact = JSON.parse(readFileSync(
    path.join(ROOT, "artifacts/contracts/AuditRecord.sol/AuditRecord.json"), "utf8",
  ));
  const state = loadCheckpoint(wallet.address);

  // 아래 내부 함수들은 이번 실행의 지갑과 체크포인트를 공유합니다.
  function saveCheckpoint() {
    writeJson(CHECKPOINT_FILE, state);
  }

  async function sendOnce(label, txRequest) {
    if (!state[label]) {
      const transaction = await wallet.populateTransaction({
        ...txRequest,
        chainId: SEPOLIA_CHAIN_ID,
      });
      const raw = await wallet.signTransaction(transaction);
      state[label] = { raw, txHash: keccak256(raw) };
      // 방송 전에 서명 결과를 저장해야 재시작 후 같은 거래를 재전송할 수 있습니다.
      saveCheckpoint();
    }

    const tx = state[label];
    assert.equal(keccak256(tx.raw), tx.txHash);
    let receipt = await provider.getTransactionReceipt(tx.txHash);
    if (!receipt) {
      try {
        await provider.broadcastTransaction(tx.raw);
      } catch (error) {
        // 방송 응답이 유실되어도 노드가 이미 거래를 받았다면 확인을 계속합니다.
        if (!await provider.getTransaction(tx.txHash)) throw error;
      }
      console.log(JSON.stringify({ stage: label, txHash: tx.txHash, status: "waiting" }));
      // 1블록 포함을 기다립니다. 타임아웃 시 체크포인트는 남겨 재실행할 수 있습니다.
      receipt = await provider.waitForTransaction(tx.txHash, 1, 120000);
    }
    assert.ok(receipt, "Not mined yet; rerun this script to resume.");
    assert.equal(receipt.status, 1, `${label} reverted`);
    return receipt;
  }

  async function deployContract() {
    const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
    const deployment = await sendOnce("deployment", await factory.getDeployTransaction());
    state.contractAddress = deployment.contractAddress;
    saveCheckpoint();
    assert.ok(state.contractAddress);
    const book = new Contract(state.contractAddress, artifact.abi, wallet);
    assert.equal(await book.owner(), wallet.address);
    return book;
  }

  async function recordPurchase(book) {
    const transaction = await book.recordPurchase.populateTransaction(
      state.purchaseId, state.policyHash, state.recordHash,
    );
    return sendOnce("recording", transaction);
  }

  async function verifyRecord(book, receipt) {
    // 성공 영수증뿐 아니라 해당 계약이 남긴 이벤트의 ID와 두 해시를 대조합니다.
    let event;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== state.contractAddress.toLowerCase()) continue;
      let parsed;
      try {
        parsed = book.interface.parseLog(log);
      } catch {
        continue; // 이 ABI로 해석할 수 없는 이벤트는 검사 대상이 아닙니다.
      }
      if (parsed?.name === "PurchaseRecorded") {
        event = parsed;
        break;
      }
    }
    assert.ok(event, "Missing audit event");
    assert.equal(event.args.purchaseId, state.purchaseId);
    assert.equal(event.args.policyHash, state.policyHash);
    assert.equal(event.args.recordHash, state.recordHash);
    assert.equal(await book.recordedPurchases(state.purchaseId), true);
  }

  async function verifyRejectedCalls(book) {
    // staticCall은 거래를 방송하지 않고 실행 결과만 조회하므로 가스를 지불하지 않습니다.
    await assert.rejects(
      book.recordPurchase.staticCall(state.purchaseId, state.policyHash, state.recordHash),
      /DuplicatePurchase/,
    );
    const outsider = Wallet.createRandom().connect(provider);
    await assert.rejects(
      book.connect(outsider).recordPurchase.staticCall(randomHash(), state.policyHash, state.recordHash),
      /Unauthorized/,
    );
  }

  function saveReport(receipt) {
    // 공개 가능한 검증 결과만 저장합니다. 개인키와 서명 원문은 포함하지 않습니다.
    const report = {
      scope: "standalone-chain-only; synthetic audit payloads; no application or DB integration",
      chainId: state.chainId,
      signer: state.signer,
      contractAddress: state.contractAddress,
      deploymentTxHash: state.deployment.txHash,
      txHash: state.recording.txHash,
      purchaseId: state.purchaseId,
      policyHash: state.policyHash,
      recordHash: state.recordHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      receiptStatus: receipt.status,
      checks: {
        eventMatches: true,
        recorded: true,
        duplicateRejected: true,
        unauthorizedRejected: true,
      },
      explorerUrl: `https://sepolia.etherscan.io/tx/${state.recording.txHash}`,
      verifiedAt: new Date().toISOString(),
    };
    writeJson(REPORT_FILE, report);
    console.log(JSON.stringify(report, null, 2));
  }

  // 전체 실행 순서: 배포(또는 재사용) → 기록 → 검증 → 결과 저장.
  const book = await deployContract();
  const receipt = await recordPurchase(book);
  await verifyRecord(book, receipt);
  await verifyRejectedCalls(book);
  saveReport(receipt);
}

const provider = createProvider();
try {
  await runAuditTest(provider);
} finally {
  // 오류가 발생해도 RPC 연결과 내부 타이머를 정리합니다.
  provider.destroy();
}
