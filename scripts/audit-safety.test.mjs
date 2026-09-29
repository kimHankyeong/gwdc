// 외부 네트워크·실제 키 없이 공격 입력을 검사하는 회귀 테스트입니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Wallet, keccak256, parseEther } from "ethers";
import {
  CHAIN_ID, hashPayload, validatePayloads, validateCheckpoint, validateSigned,
  validateCost, acquireLock, atomicJson, pendingStatus, verifyInclusion, retryRpc,
  sealCheckpoint, openCheckpoint,
} from "./audit-safety.mjs";

const salt = "0x" + "12".repeat(32);
const transactionHash = "0x" + "34".repeat(32);
const blockHash = "0x" + "56".repeat(32);
const policy = {
  version: 1, maxBudget: 1000, reviewRequired: false,
  reviewMinimum: 0, reviewRatingMinimum: 0, salt,
};
const record = { quantity: 1, unitPrice: 100, shipping: 0, total: 100, currency: "KRW", salt };

// 올바른 영수증을 기준으로 각 공격에서 필요한 필드만 변조합니다.
function receiptFixture() {
  return { status: 1, hash: transactionHash, blockNumber: 10, blockHash, logs: [] };
}

// 노드마다 독립 객체를 사용해 한쪽의 거짓 응답만 주입할 수 있도록 합니다.
function providerFixture(receipt = receiptFixture(), finalizedHeight = 10) {
  return {
    getTransactionReceipt: async () => receipt,
    getBlock: async tag => ({
      number: tag === "finalized" ? finalizedHeight : tag,
      hash: blockHash,
      transactions: [transactionHash],
    }),
  };
}

test("invalid amounts, unknown fields and unsupported review policies are rejected", () => {
  validatePayloads(policy, record);
  const attacks = [
    { total: 99 }, { quantity: -1 }, { unitPrice: Number.MAX_SAFE_INTEGER + 1 },
    { currency: "USD" }, { name: "private data" },
  ];
  for (const change of attacks) assert.throws(() => validatePayloads(policy, { ...record, ...change }));
  assert.throws(() => validatePayloads({ ...policy, maxBudget: 99 }, record));
  assert.throws(() => validatePayloads({ ...policy, reviewRequired: true }, record));
  const reversed = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(hashPayload(validatePayloads(policy, reversed).record), hashPayload(record));
});

test("checkpoint identity and authenticated contents reject coordinated payload/hash rewriting", () => {
  const wallet = Wallet.createRandom();
  const state = {
    version: 2, chainId: CHAIN_ID.toString(), signer: wallet.address,
    requestId: "request", bytecodeHash: "code", purchaseId: salt,
    policy, record, policyHash: hashPayload(policy), recordHash: hashPayload(record),
  };
  validateCheckpoint(state, wallet.address, "request", "code");
  const sealed = sealCheckpoint(state, wallet.privateKey);
  assert.deepEqual(openCheckpoint(sealed, wallet.privateKey), state);

  // 이전 구현에서 통과했던 원문·해시 동시 변경을 이제 인증 태그가 거절해야 합니다.
  const attacked = structuredClone(sealed);
  attacked.state.record.total = 999;
  attacked.state.record.unitPrice = 999;
  attacked.state.recordHash = hashPayload(attacked.state.record);
  assert.throws(() => openCheckpoint(attacked, wallet.privateKey), /authentication failed/);
  assert.throws(() => openCheckpoint(state, wallet.privateKey), /Unauthenticated/);
  assert.throws(() => openCheckpoint(sealed, Wallet.createRandom().privateKey), /authentication failed/);
  for (const args of [["other", "request", "code"], [wallet.address, "other", "code"], [wallet.address, "request", "other"]]) {
    assert.throws(() => validateCheckpoint(state, ...args));
  }
});

test("signed intent rejects changed signer, chain, destination, data, value, nonce and fees", async () => {
  const wallet = Wallet.createRandom();
  const other = Wallet.createRandom();
  const expected = { to: other.address, data: "0x1234", nonce: 0 };
  const transaction = {
    ...expected, chainId: CHAIN_ID, nonce: 0, value: 0n,
    gasLimit: 50000n, gasPrice: 1000000000n, type: 0,
  };
  // 서명은 일회용 로컬 키로만 생성합니다.
  async function saved(changes = {}, signer = wallet) {
    const raw = await signer.signTransaction({ ...transaction, ...changes });
    return { raw, txHash: keccak256(raw), nonce: 0 };
  }
  validateSigned(await saved(), expected, wallet.address);
  const attacks = [
    { chainId: 1n }, { to: wallet.address }, { data: "0xabcd" },
    { value: 1n }, { nonce: 1 }, { gasPrice: parseEther("1") },
  ];
  for (const change of attacks) {
    const checkpoint = await saved(change);
    assert.throws(() => validateSigned(checkpoint, expected, wallet.address));
  }
  const foreign = await saved({}, other);
  assert.throws(() => validateSigned(foreign, expected, wallet.address));
  assert.throws(() => validateCost({ gasLimit: 21000n, gasPrice: parseEther("1") }));
});

test("200 lock contenders admit one; replaced lock is not deleted by its former owner", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-lock-test-"));
  try {
    const attempts = await Promise.allSettled(Array.from({ length: 200 }, async () => acquireLock("wallet", dir)));
    const winners = attempts.filter(result => result.status === "fulfilled");
    assert.equal(winners.length, 1);
    const lockFile = path.join(dir, `${CHAIN_ID}-wallet.lock`);
    writeFileSync(lockFile, JSON.stringify({ token: "replacement" }));
    assert.throws(winners[0].value, /ownership changed/);
    assert.equal(JSON.parse(readFileSync(lockFile, "utf8")).token, "replacement");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("atomic backup remains readable and refuses a symbolic-link backup target", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "audit-storage-test-"));
  try {
    const file = path.join(dir, "checkpoint.json");
    atomicJson(file, { version: 1 });
    atomicJson(file, { version: 2 });
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")), { version: 2 });
    assert.deepEqual(JSON.parse(readFileSync(file + ".bak", "utf8")), { version: 1 });
    rmSync(file + ".bak");
    const target = path.join(dir, "unrelated.json");
    writeFileSync(target, "do not overwrite");
    symlinkSync(target, file + ".bak", "file");
    assert.throws(() => atomicJson(file, { version: 3 }), /Symbolic link/);
    assert.equal(readFileSync(target, "utf8"), "do not overwrite");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("nonce status identifies consumed and replaced transactions", async () => {
  const tx = { from: "wallet", nonce: 1 };
  const provider = (latest, pending, known) => ({
    getTransactionCount: async (_, tag) => tag === "latest" ? latest : pending,
    getTransaction: async () => known,
  });
  assert.equal(await pendingStatus(provider(2, 2, null), tx, "hash"), "nonce-consumed-or-replaced");
  assert.equal(await pendingStatus(provider(1, 2, null), tx, "hash"), "possible-replacement");
  assert.equal(await pendingStatus(provider(1, 2, {}), tx, "hash"), "pending");
  assert.equal(await pendingStatus(provider(1, 1, null), tx, "hash"), "not-seen");
});

test("forged, incomplete and non-member receipts cannot become confirmed", async () => {
  const good = receiptFixture();
  const primary = providerFixture();
  const witness = providerFixture();
  assert.equal(await verifyInclusion(primary, good, transactionHash, witness), "finalized");
  assert.equal(await verifyInclusion(primary, good, transactionHash, providerFixture(good, 9)), "included");
  for (const attack of [{ status: 1 }, { ...good, hash: salt }, { ...good, blockHash: salt }, { ...good, status: 0 }]) {
    await assert.rejects(verifyInclusion(primary, attack, transactionHash, witness));
  }
  const noMember = { ...primary, getBlock: async tag => ({ number: tag, hash: blockHash, transactions: [] }) };
  await assert.rejects(verifyInclusion(noMember, good, transactionHash, witness), /absent from block/);
  await assert.rejects(verifyInclusion(primary, good, transactionHash, primary), /Independent/);
  const forgedLogs = providerFixture({ ...good, logs: [{ address: "fake", topics: [], data: "0x" }] });
  await assert.rejects(verifyInclusion(primary, good, transactionHash, forgedLogs), /disagreement/);
});

test("RPC retry is bounded and never hides a contract rejection", async () => {
  let calls = 0;
  const result = await retryRpc(async () => {
    if (++calls === 1) throw Object.assign(new Error("offline"), { code: "NETWORK_ERROR" });
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(retryRpc(async () => {
    calls++;
    throw Object.assign(new Error("reverted"), { code: "CALL_EXCEPTION" });
  }));
  assert.equal(calls, 1);
});
