// 하나의 거래를 서명·저장·전송·검증합니다. 테스트에서는 RPC와 저장 함수를 주입합니다.
import assert from "node:assert/strict";
import { keccak256 } from "ethers";
import {
  CHAIN_ID, validateCost, validateSigned, retryRpc,
  pendingStatus, verifyInclusion,
} from "./audit-safety.mjs";

// 저장된 거래가 있으면 새 서명이나 nonce를 만들지 않습니다.
export async function executeTransaction({
  label, expected, state, wallet, provider, witness, save,
  readOnly = false, waitMilliseconds = 45000,
}) {
  if (!state[label]) {
    assert.ok(!readOnly, "Legacy migration cannot sign transactions");
    const populated = await retryRpc(() => wallet.populateTransaction({ ...expected, chainId: CHAIN_ID }));
    const witnessNonce = await retryRpc(() => witness.getTransactionCount(wallet.address, "pending"));
    assert.equal(populated.nonce, witnessNonce, "RPC nonce disagreement");
    const fee = validateCost(populated);
    const balances = await Promise.all([provider, witness].map(node => retryRpc(() => node.getBalance(wallet.address))));
    assert.ok(balances.every(balance => balance >= fee), "Insufficient balance for maximum fee");
    const raw = await wallet.signTransaction(populated);
    state[label] = { raw, txHash: keccak256(raw), nonce: populated.nonce, status: "signed" };
    validateSigned(state[label], expected, wallet.address);
    save(); // 이 저장이 실패하면 방송으로 진행하지 않습니다.
  }

  const saved = state[label];
  const tx = validateSigned(saved, expected, wallet.address);
  let receipt = await retryRpc(() => provider.getTransactionReceipt(saved.txHash));
  if (!receipt) {
    assert.ok(!readOnly, "Legacy checkpoint needs already mined transactions for migration");
    const statuses = await Promise.all([provider, witness].map(node => pendingStatus(node, tx, saved.txHash)));
    saved.status = statuses.join("/");
    save();
    const allowed = new Set(["pending", "not-seen"]);
    assert.ok(statuses.every(status => allowed.has(status)), `${saved.status}: manual review required`);

    try {
      // 방송 응답이 유실되어도 재시도는 동일한 서명 바이트만 사용합니다.
      await retryRpc(() => provider.broadcastTransaction(saved.raw));
    } catch (error) {
      if (!await retryRpc(() => provider.getTransaction(saved.txHash))) throw error;
    }
    console.log(JSON.stringify({ stage: label, txHash: saved.txHash, status: "waiting" }));
    try {
      receipt = await provider.waitForTransaction(saved.txHash, 1, waitMilliseconds);
    } catch (error) {
      if (error.code !== "TIMEOUT") throw error;
    }
    if (!receipt) {
      saved.status = await pendingStatus(provider, tx, saved.txHash);
      save();
      throw new Error(`${saved.status}: no receipt yet; reuse the same request ID`);
    }
  }

  // 거절·재구성·RPC 불일치는 모두 완료 상태로 저장하지 않습니다.
  if (receipt.status !== 1) {
    saved.status = "reverted";
    save();
    throw new Error(`${label} reverted; manual review required`);
  }
  saved.status = await verifyInclusion(provider, receipt, saved.txHash, witness);
  saved.blockNumber = receipt.blockNumber;
  saved.blockHash = receipt.blockHash;
  save();
  return receipt;
}
