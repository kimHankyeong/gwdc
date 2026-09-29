// 체크포인트 인증, 입력 검증, RPC 응답 검증을 모읍니다. 네트워크에 거래를 직접 보내지 않습니다.
import assert from "node:assert/strict";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import {
  openSync, closeSync, writeFileSync, fsyncSync, renameSync, mkdirSync,
  unlinkSync, existsSync, lstatSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Transaction, keccak256, toUtf8Bytes, parseEther } from "ethers";

export const CHAIN_ID = 11155111n;
export const MAX_TRANSACTION_FEE = parseEther("0.002");
export const MAX_GAS = 2_000_000n;

// 직렬화 순서는 validatePayloads가 고정하며, salt도 해시 입력에 포함됩니다.
export const hashPayload = value => keccak256(toUtf8Bytes(JSON.stringify(value)));

// 파일 링크를 통한 의도치 않은 대상 덮어쓰기를 거절합니다. 상위 폴더는 신뢰 경계입니다.
function rejectLink(file) {
  try {
    assert.ok(!lstatSync(file).isSymbolicLink(), "Symbolic link is forbidden");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

// 임시 파일을 완전히 쓴 뒤 교체합니다. 실패한 임시 파일은 다음 실행을 막지 않도록 제거합니다.
function replaceFile(file, contents) {
  rejectLink(file);
  const temporary = `${file}.${randomBytes(12).toString("hex")}.tmp`;
  let fd;
  try {
    fd = openSync(temporary, "wx", 0o600);
    writeFileSync(fd, contents);
    fsyncSync(fd);
    closeSync(fd);
    fd = undefined;
    renameSync(temporary, file);
  } finally {
    if (fd !== undefined) closeSync(fd);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

// 이전 정상본도 같은 원자적 쓰기를 사용해 백업 경로의 링크를 따라가지 않습니다.
export function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  rejectLink(file);
  if (existsSync(file)) replaceFile(`${file}.bak`, readFileSync(file));
  replaceFile(file, JSON.stringify(value, null, 2) + "\n");
}

// 개인키를 외부로 보내지 않고 용도를 구분한 HMAC 키를 유도합니다. 암호화는 아닙니다.
function checkpointMac(state, privateKey) {
  const key = createHmac("sha256", Buffer.from(privateKey.slice(2), "hex"))
    .update("sepolia-audit/checkpoint-auth/v1")
    .digest();
  return createHmac("sha256", key).update(JSON.stringify(state)).digest("hex");
}

// 원문과 해시를 동시에 바꿔도 인증 태그를 새로 만들 수 없으면 거절됩니다.
export function sealCheckpoint(state, privateKey) {
  return { format: "authenticated-checkpoint-v1", state, mac: checkpointMac(state, privateKey) };
}

// 인증 후에만 내부 상태를 반환합니다. 오래된 유효본 재생은 별도 온체인 검사도 필요합니다.
export function openCheckpoint(envelope, privateKey) {
  assert.equal(envelope.format, "authenticated-checkpoint-v1", "Unauthenticated checkpoint");
  assert.match(envelope.mac, /^[0-9a-f]{64}$/, "Invalid checkpoint authentication tag");
  const expected = Buffer.from(checkpointMac(envelope.state, privateKey), "hex");
  assert.ok(timingSafeEqual(Buffer.from(envelope.mac, "hex"), expected), "Checkpoint authentication failed");
  return envelope.state;
}

// 같은 컴퓨터의 동일 지갑 실행을 직렬화합니다. 다른 호스트나 외부 지갑은 통제하지 않습니다.
export function acquireLock(signer, directory = path.join(tmpdir(), "sepolia-audit-locks")) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, `${CHAIN_ID}-${signer.toLowerCase()}.lock`);
  const token = randomBytes(16).toString("hex");
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(`Another run or stale lock exists: ${file}. Confirm no process is running before removing it.`);
    }
    throw error;
  }
  try {
    writeFileSync(fd, JSON.stringify({ token, pid: process.pid, startedAt: new Date().toISOString() }));
  } finally {
    closeSync(fd);
  }
  return () => {
    // 실행 중 잠금이 교체된 경우 다른 프로세스의 잠금을 삭제하지 않습니다.
    const saved = JSON.parse(readFileSync(file, "utf8"));
    assert.equal(saved.token, token, "Lock ownership changed");
    unlinkSync(file);
  };
}

// 허용되지 않은 개인정보 필드와 누락된 필드를 함께 차단합니다.
function exactKeys(value, keys) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Invalid payload");
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), "Unexpected or missing payload field");
}

// 금액은 부동소수점 반올림이 없는 안전한 정수 범위만 허용합니다.
function integer(value, minimum = 0) {
  assert.ok(Number.isSafeInteger(value) && value >= minimum, "Expected a safe nonnegative integer");
}

// ID와 salt에는 0이 아닌 정확한 32바이트를 요구합니다.
function bytes32(value) {
  assert.match(value, /^0x[0-9a-f]{64}$/i, "Expected bytes32");
  assert.notEqual(BigInt(value), 0n, "Zero bytes32 is forbidden");
}

// 의미 검증 후 정해진 필드 순서로 반환합니다. 실제 구매 사실은 검증하지 않습니다.
export function validatePayloads(policy, record) {
  exactKeys(policy, ["version", "maxBudget", "reviewRequired", "reviewMinimum", "reviewRatingMinimum", "salt"]);
  exactKeys(record, ["quantity", "unitPrice", "shipping", "total", "currency", "salt"]);
  assert.equal(policy.version, 1);
  integer(policy.maxBudget);
  integer(policy.reviewMinimum);
  assert.ok(Number.isFinite(policy.reviewRatingMinimum) && policy.reviewRatingMinimum >= 0 && policy.reviewRatingMinimum <= 5);
  assert.equal(typeof policy.reviewRequired, "boolean");
  assert.equal(policy.reviewRequired, false, "Review evidence is unsupported by this demo");
  integer(record.quantity, 1);
  for (const field of ["unitPrice", "shipping", "total"]) integer(record[field]);
  const expectedTotal = BigInt(record.quantity) * BigInt(record.unitPrice) + BigInt(record.shipping);
  assert.equal(BigInt(record.total), expectedTotal, "Incorrect total");
  assert.ok(record.total <= policy.maxBudget, "Budget exceeded");
  assert.equal(record.currency, "KRW", "This demo uses integer KRW amounts only");
  bytes32(policy.salt);
  bytes32(record.salt);
  return {
    policy: {
      version: policy.version,
      maxBudget: policy.maxBudget,
      reviewRequired: policy.reviewRequired,
      reviewMinimum: policy.reviewMinimum,
      reviewRatingMinimum: policy.reviewRatingMinimum,
      salt: policy.salt,
    },
    record: {
      quantity: record.quantity,
      unitPrice: record.unitPrice,
      shipping: record.shipping,
      total: record.total,
      currency: record.currency,
      salt: record.salt,
    },
  };
}

// 체크포인트가 이번 요청·지갑·계약 코드와 맞는지 확인합니다. 인증 검사는 별도로 선행합니다.
export function validateCheckpoint(state, signer, requestId, bytecodeHash) {
  assert.equal(state.version, 2, "Unsupported checkpoint version");
  assert.equal(state.chainId, CHAIN_ID.toString());
  assert.equal(state.signer, signer);
  assert.equal(state.requestId, requestId);
  assert.equal(state.bytecodeHash, bytecodeHash, "Contract changed; use a new explicit request ID");
  bytes32(state.purchaseId);
  const payloads = validatePayloads(state.policy, state.record);
  assert.equal(state.policyHash, hashPayload(payloads.policy), "Policy changed after checkpoint creation");
  assert.equal(state.recordHash, hashPayload(payloads.record), "Record changed after checkpoint creation");
}

// RPC가 비정상적으로 큰 견적을 보내더라도 최대 지출을 제한합니다.
export function validateCost(tx) {
  const gas = BigInt(tx.gasLimit ?? 0);
  const price = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 0);
  assert.ok(gas > 0n && gas <= MAX_GAS, "Gas limit exceeds allowed range");
  assert.ok(price > 0n && gas * price <= MAX_TRANSACTION_FEE, "Maximum transaction fee exceeded");
  return gas * price;
}

// 해시 일치만 검사하지 않고 서명된 거래의 모든 실행 의도를 비교합니다.
export function validateSigned(saved, expected, signer) {
  assert.equal(keccak256(saved.raw), saved.txHash, "Signed transaction hash mismatch");
  const tx = Transaction.from(saved.raw);
  assert.equal(tx.from, signer, "Unexpected signer");
  assert.equal(tx.chainId, CHAIN_ID, "Unexpected chain");
  assert.ok(tx.type === 0 || tx.type === 2, "Unsupported transaction type");
  assert.equal(tx.to?.toLowerCase() ?? null, expected.to?.toLowerCase() ?? null, "Unexpected destination");
  assert.equal(tx.data.toLowerCase(), expected.data.toLowerCase(), "Unexpected calldata or deployment code");
  assert.equal(tx.value, 0n, "ETH transfer is forbidden");
  assert.equal(tx.nonce, saved.nonce, "Nonce mismatch");
  if (expected.nonce !== undefined) assert.equal(tx.nonce, expected.nonce, "Unexpected intent nonce");
  validateCost(tx);
  return tx;
}

// 통신 오류만 제한적으로 재시도합니다. 계약 거절이나 인자 오류는 즉시 호출자에게 전달합니다.
export async function retryRpc(operation) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const transient = ["NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].includes(error.code);
      if (!transient || attempt === 2) throw error;
      await delay(500 * 2 ** attempt);
    }
  }
}

// 이미 사용된 nonce의 다른 거래를 자동으로 덮어쓰지 않습니다.
export async function pendingStatus(provider, tx, hash) {
  const minedNonce = await retryRpc(() => provider.getTransactionCount(tx.from, "latest"));
  if (minedNonce > tx.nonce) return "nonce-consumed-or-replaced";
  const pendingNonce = await retryRpc(() => provider.getTransactionCount(tx.from, "pending"));
  const known = await retryRpc(() => provider.getTransaction(hash));
  if (!known && pendingNonce > tx.nonce) return "possible-replacement";
  return known ? "pending" : "not-seen";
}

// 노드가 잘못된 영수증을 돌려주거나 일부 필드를 생략하면 성공으로 처리하지 않습니다.
function validateReceipt(receipt, expectedHash) {
  bytes32(expectedHash);
  assert.ok(receipt, "Missing receipt");
  assert.equal(receipt.hash, expectedHash, "Unexpected receipt transaction");
  assert.equal(receipt.status, 1, "Transaction reverted");
  bytes32(receipt.blockHash);
  integer(receipt.blockNumber);
}

// 비교에 필요한 영수증 필드만 정규화합니다. 노드별 부가 필드 차이는 허용합니다.
function receiptEvidence(receipt) {
  return {
    hash: receipt.hash,
    status: receipt.status,
    blockHash: receipt.blockHash,
    blockNumber: receipt.blockNumber,
    from: receipt.from,
    to: receipt.to,
    contractAddress: receipt.contractAddress,
    logs: receipt.logs.map(log => ({ address: log.address, topics: log.topics, data: log.data })),
  };
}

// 블록 번호·해시뿐 아니라 해당 블록의 거래 목록에 목표 거래가 있는지도 확인합니다.
async function checkBlock(provider, receipt) {
  const block = await retryRpc(() => provider.getBlock(receipt.blockNumber));
  assert.ok(block, "Missing canonical block");
  assert.equal(block.number, receipt.blockNumber, "Unexpected block number");
  assert.equal(block.hash, receipt.blockHash, "Receipt was orphaned by a reorg");
  assert.ok(block.transactions.includes(receipt.hash), "Transaction is absent from block");
  return block;
}

// 두 RPC가 영수증과 블록에 동의해야 인정합니다. 두 운영자가 공모하는 경우까지 증명하지는 않습니다.
export async function verifyInclusion(provider, receipt, expectedHash, witness) {
  assert.ok(witness && witness !== provider, "Independent verification RPC is required");
  validateReceipt(receipt, expectedHash);
  const peerReceipt = await retryRpc(() => witness.getTransactionReceipt(expectedHash));
  validateReceipt(peerReceipt, expectedHash);
  assert.deepEqual(receiptEvidence(receipt), receiptEvidence(peerReceipt), "RPC receipt disagreement");
  await Promise.all([checkBlock(provider, receipt), checkBlock(witness, peerReceipt)]);
  const heads = await Promise.all([provider, witness].map(node => retryRpc(() => node.getBlock("finalized"))));
  assert.ok(heads.every(head => head && Number.isSafeInteger(head.number) && head.number >= 0), "Missing finalized head");
  const commonHeight = Math.min(...heads.map(head => head.number));
  const commonBlocks = await Promise.all([provider, witness].map(node => retryRpc(() => node.getBlock(commonHeight))));
  assert.ok(commonBlocks[0] && commonBlocks[1], "Missing common finalized block");
  bytes32(commonBlocks[0].hash);
  bytes32(commonBlocks[1].hash);
  assert.equal(commonBlocks[0].hash, commonBlocks[1].hash, "RPC finalized chain disagreement");
  return commonHeight >= receipt.blockNumber ? "finalized" : "included";
}
