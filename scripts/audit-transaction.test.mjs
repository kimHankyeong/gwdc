// 실제 실행기에 RPC 장애를 주입합니다. 실제 네트워크·실제 ETH는 사용하지 않습니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Wallet, Transaction, parseEther } from "ethers";
import { executeTransaction } from "./audit-transaction.mjs";

// 서명은 실제 ethers 구현을 쓰고, 체인 응답만 메모리로 대체합니다.
function scenario() {
  const wallet = Wallet.createRandom();
  const expected = { to: Wallet.createRandom().address, data: "0x1234", value: 0n, nonce: 0 };
  const blockHash = "0x" + "78".repeat(32);
  const broadcasts = [];
  let receipt = null;
  let signed = 0;
  let known = false;
  let loseResponse = false;
  let timeout = false;
  let nonce = 0;
  const realSign = wallet.signTransaction.bind(wallet);
  wallet.populateTransaction = async tx => ({ ...tx, nonce: tx.nonce ?? 0, gasLimit: 50000n, gasPrice: 1000000000n, type: 0 });
  wallet.signTransaction = async tx => { signed++; return realSign(tx); };

  // 2개의 서로 다른 RPC 객체가 같은 가짜 체인을 바라봅니다.
  function node() {
    return {
      getBalance: async () => parseEther("1"),
      getTransactionCount: async () => nonce,
      getTransaction: async () => known ? {} : null,
      getTransactionReceipt: async () => receipt,
      getBlock: async tag => ({
        number: tag === "finalized" ? 10 : tag,
        hash: blockHash,
        transactions: receipt ? [receipt.hash] : [],
      }),
    };
  }
  const provider = node();
  const witness = node();
  provider.broadcastTransaction = async raw => {
    broadcasts.push(raw);
    known = true;
    const tx = Transaction.from(raw);
    if (!timeout) {
      receipt = {
        hash: tx.hash, status: 1, blockHash, blockNumber: 10,
        from: tx.from, to: tx.to, contractAddress: null, logs: [],
      };
    }
    if (loseResponse) throw Object.assign(new Error("response lost"), { code: "NETWORK_ERROR" });
    return { hash: tx.hash };
  };
  provider.waitForTransaction = async () => receipt;
  const state = {};
  const input = { label: "recording", expected, state, wallet, provider, witness, save: () => {}, waitMilliseconds: 1 };
  return {
    input, broadcasts,
    signedCount: () => signed,
    setLostResponse: () => { loseResponse = true; },
    setTimeout: () => { timeout = true; },
    setNonce: value => { nonce = value; },
    mine: () => {
      const tx = Transaction.from(state.recording.raw);
      receipt = { hash: tx.hash, status: 1, blockHash, blockNumber: 10, from: tx.from, to: tx.to, contractAddress: null, logs: [] };
    },
  };
}

test("crash after signed checkpoint but before broadcast resumes exactly the same bytes", async () => {
  const s = scenario();
  let persisted;
  s.input.save = () => {
    persisted = structuredClone(s.input.state);
    throw new Error("simulated process crash after durable save");
  };
  await assert.rejects(executeTransaction(s.input), /simulated process crash/);
  assert.equal(s.broadcasts.length, 0);
  assert.equal(s.signedCount(), 1);

  // 재시작은 디스크에서 읽은 값만 사용하며 지갑에 새 서명을 요청하지 않습니다.
  s.input.state = persisted;
  s.input.save = () => {};
  await executeTransaction(s.input);
  assert.equal(s.signedCount(), 1);
  assert.equal(s.broadcasts[0], persisted.recording.raw);
});

test("lost broadcast responses retry identical bytes and a subsequent run does not rebroadcast", async () => {
  const s = scenario();
  s.setLostResponse();
  const receipt = await executeTransaction(s.input);
  assert.equal(receipt.status, 1);
  assert.equal(s.broadcasts.length, 3);
  assert.equal(new Set(s.broadcasts).size, 1);
  await executeTransaction(s.input);
  assert.equal(s.broadcasts.length, 3);
  assert.equal(s.signedCount(), 1);
});

test("timeout preserves signed transaction and later receipt completes without another send", async () => {
  const s = scenario();
  s.setTimeout();
  await assert.rejects(executeTransaction(s.input), /no receipt yet/);
  const hash = s.input.state.recording.txHash;
  s.mine();
  await executeTransaction(s.input);
  assert.equal(s.input.state.recording.txHash, hash);
  assert.equal(s.broadcasts.length, 1);
});

test("consumed nonce, read-only migration and authentication-era nonce rollback cannot create new transactions", async () => {
  const s = scenario();
  await assert.rejects(executeTransaction({ ...s.input, readOnly: true }), /cannot sign/);
  assert.equal(s.signedCount(), 0);
  s.setTimeout();
  await assert.rejects(executeTransaction(s.input), /no receipt yet/);
  s.setNonce(1);
  await assert.rejects(executeTransaction(s.input), /manual review/);
  assert.equal(s.broadcasts.length, 1);
  // 초기 상태로 롤백되어도 고정된 의도 nonce와 노드 nonce가 다르면 서명하지 않습니다.
  await assert.rejects(executeTransaction({ ...s.input, state: {} }), /nonce disagreement/);
  assert.equal(s.signedCount(), 1);
});

test("malicious witness and changed call arguments stop the execution path", async () => {
  const s = scenario();
  await executeTransaction(s.input);
  const forgedWitness = { ...s.input.witness, getTransactionReceipt: async () => ({ status: 1 }) };
  await assert.rejects(executeTransaction({ ...s.input, witness: forgedWitness }), /Unexpected receipt transaction/);
  await assert.rejects(executeTransaction({ ...s.input, expected: { ...s.input.expected, data: "0xabcd" } }), /Unexpected calldata/);
  assert.equal(s.broadcasts.length, 1);
});
