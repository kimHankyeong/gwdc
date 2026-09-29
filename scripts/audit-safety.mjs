import assert from "node:assert/strict";
import { openSync, closeSync, writeFileSync, fsyncSync, renameSync, mkdirSync, unlinkSync, existsSync, copyFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { Transaction, keccak256, toUtf8Bytes, parseEther } from "ethers";

export const CHAIN_ID = 11155111n;
// 자동 견적이 커져도 이 상한을 넘는 거래에는 서명하지 않습니다.
export const MAX_TRANSACTION_FEE = parseEther("0.002");
export const MAX_GAS = 2_000_000n;
export const hashPayload = value => keccak256(toUtf8Bytes(JSON.stringify(value)));

export function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(value, null, 2) + "\n");
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  // 이전 정상본을 별도로 보관합니다. 손상 시 자동으로 옛 거래를 재전송하지 않습니다.
  if (existsSync(file)) copyFileSync(file, `${file}.bak`);
  renameSync(temporary, file);
}

export function acquireLock(signer, directory = path.join(tmpdir(), "sepolia-audit-locks")) {
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${CHAIN_ID}-${signer.toLowerCase()}.lock`);
  let fd;
  try {
    fd = openSync(file, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`Another run or stale lock exists: ${file}. Confirm no process is running before removing it.`);
    throw error;
  }
  try {
    writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
  } finally {
    closeSync(fd);
  }
  return () => unlinkSync(file);
}

function exactKeys(value, keys) {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), "Invalid payload");
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), "Unexpected or missing payload field");
}

function integer(value, minimum = 0) {
  assert.ok(Number.isSafeInteger(value) && value >= minimum, "Expected a safe nonnegative integer");
}

function bytes32(value) {
  assert.match(value, /^0x[0-9a-f]{64}$/i, "Expected bytes32");
  assert.notEqual(BigInt(value), 0n, "Zero bytes32 is forbidden");
}

export function validatePayloads(policy, record) {
  exactKeys(policy, ["version", "maxBudget", "reviewRequired", "reviewMinimum", "reviewRatingMinimum", "salt"]);
  exactKeys(record, ["quantity", "unitPrice", "shipping", "total", "currency", "salt"]);
  assert.equal(policy.version, 1);
  integer(policy.maxBudget);
  integer(policy.reviewMinimum);
  assert.ok(Number.isFinite(policy.reviewRatingMinimum) && policy.reviewRatingMinimum >= 0 && policy.reviewRatingMinimum <= 5);
  assert.equal(typeof policy.reviewRequired, "boolean");
  // 이 단독 데모는 리뷰 증빙을 받지 않습니다. 요구되는 정책을 임의로 통과시키지 않습니다.
  assert.equal(policy.reviewRequired, false, "Review evidence is unsupported by this demo");
  integer(record.quantity, 1);
  for (const field of ["unitPrice", "shipping", "total"]) integer(record[field]);
  assert.equal(BigInt(record.total), BigInt(record.quantity) * BigInt(record.unitPrice) + BigInt(record.shipping), "Incorrect total");
  assert.ok(record.total <= policy.maxBudget, "Budget exceeded");
  assert.equal(record.currency, "KRW", "This demo uses integer KRW amounts only");
  bytes32(policy.salt);
  bytes32(record.salt);
  // 키 삽입 순서가 달라도 동일한 직렬화 순서를 사용합니다.
  return {
    policy: { version: policy.version, maxBudget: policy.maxBudget, reviewRequired: policy.reviewRequired, reviewMinimum: policy.reviewMinimum, reviewRatingMinimum: policy.reviewRatingMinimum, salt: policy.salt },
    record: { quantity: record.quantity, unitPrice: record.unitPrice, shipping: record.shipping, total: record.total, currency: record.currency, salt: record.salt },
  };
}

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

export function validateCost(tx) {
  const gas = BigInt(tx.gasLimit ?? 0);
  const price = BigInt(tx.maxFeePerGas ?? tx.gasPrice ?? 0);
  assert.ok(gas > 0n && gas <= MAX_GAS, "Gas limit exceeds allowed range");
  assert.ok(price > 0n && gas * price <= MAX_TRANSACTION_FEE, "Maximum transaction fee exceeded");
  return gas * price;
}

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
  validateCost(tx);
  return tx;
}

export async function retryRpc(operation) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      // 실행 거절, 잘못된 인자, nonce 오류는 재시도로 숨기지 않습니다.
      const transient = ["NETWORK_ERROR", "TIMEOUT", "SERVER_ERROR"].includes(error.code);
      if (!transient || attempt === 2) throw error;
      await delay(500 * 2 ** attempt);
    }
  }
}

export async function pendingStatus(provider, tx, hash) {
  // 이미 채굴된 nonce인데 원래 영수증이 없으면 재방송을 멈추고 조사합니다.
  const minedNonce = await retryRpc(() => provider.getTransactionCount(tx.from, "latest"));
  if (minedNonce > tx.nonce) return "nonce-consumed-or-replaced";
  const pendingNonce = await retryRpc(() => provider.getTransactionCount(tx.from, "pending"));
  const known = await retryRpc(() => provider.getTransaction(hash));
  if (!known && pendingNonce > tx.nonce) return "possible-replacement";
  return known ? "pending" : "not-seen";
}

export async function verifyInclusion(provider, receipt) {
  assert.equal(receipt.status, 1, "Transaction reverted");
  const block = await retryRpc(() => provider.getBlock(receipt.blockNumber));
  assert.equal(block?.hash, receipt.blockHash, "Receipt was orphaned by a reorg");
  const finalized = await retryRpc(() => provider.getBlock("finalized"));
  return finalized && finalized.number >= receipt.blockNumber ? "finalized" : "included";
}
