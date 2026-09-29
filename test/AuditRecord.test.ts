// 로컬 EVM만 대상으로 권한 탈취·중복 기록 공격을 검사합니다.
import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { network } from "hardhat";

describe("AuditRecord", function () {
  it("records both commitments once and rejects outsiders and zero inputs", async function () {
    const { ethers } = await network.create();
    const [, outsider] = await ethers.getSigners();
    const book = await ethers.deployContract("AuditRecord");
    const purchaseId = ethers.id("random purchase");
    const policyHash = ethers.id("policy");
    const recordHash = ethers.id("record");
    const receipt = await (await book.recordPurchase(purchaseId, policyHash, recordHash)).wait();
    const events = receipt!.logs.map(log => book.interface.parseLog(log));
    const event = events.find(log => log?.name === "PurchaseRecorded");
    assert.equal(event?.args.purchaseId, purchaseId);
    assert.equal(event?.args.policyHash, policyHash);
    assert.equal(event?.args.recordHash, recordHash);
    assert.equal(await book.recordedPurchases(purchaseId), true);
    await assert.rejects(book.recordPurchase(purchaseId, policyHash, recordHash), /DuplicatePurchase/);
    await assert.rejects(book.connect(outsider).recordPurchase(ethers.id("other"), policyHash, recordHash), /Unauthorized/);

    // 잘못된 입력으로 호출한 ID는 사용된 것으로 표시되면 안 됩니다.
    const unusedId = ethers.id("unused");
    for (let index = 0; index < 3; index++) {
      const args = [unusedId, policyHash, recordHash];
      args[index] = ethers.ZeroHash;
      await assert.rejects(book.recordPurchase(...args), /InvalidRecord/);
    }
    assert.equal(await book.recordedPurchases(unusedId), false);
  });

  it("blocks privilege theft and stale ownership acceptance while preserving old records", async function () {
    const { ethers } = await network.create();
    const [owner, nextOwner, outsider] = await ethers.getSigners();
    const book = await ethers.deployContract("AuditRecord");
    const args = [ethers.id("request"), ethers.id("policy"), ethers.id("record")];
    await assert.rejects(book.connect(outsider).setPaused(true), /Unauthorized/);
    await assert.rejects(book.connect(outsider).transferOwnership(nextOwner.address), /Unauthorized/);
    await assert.rejects(book.transferOwnership(ethers.ZeroAddress), /InvalidOwner/);
    await (await book.setPaused(true)).wait();
    await assert.rejects(book.recordPurchase(...args), /Paused/);

    // 지명된 소유자가 교체되면 이전 후보도 소유권을 수락할 수 없습니다.
    await (await book.transferOwnership(outsider.address)).wait();
    await (await book.transferOwnership(nextOwner.address)).wait();
    assert.equal(await book.owner(), owner.address);
    await assert.rejects(book.connect(outsider).acceptOwnership(), /Unauthorized/);
    await (await book.connect(nextOwner).acceptOwnership()).wait();
    assert.equal(await book.owner(), nextOwner.address);
    assert.equal(await book.pendingOwner(), ethers.ZeroAddress);
    await assert.rejects(book.setPaused(false), /Unauthorized/);
    await (await book.connect(nextOwner).setPaused(false)).wait();
    await (await book.connect(nextOwner).recordPurchase(...args)).wait();
    await assert.rejects(book.recordPurchase(...args), /Unauthorized/);
    assert.equal(await book.recordedPurchases(args[0]), true);
  });

  it("mines 200 competing duplicate-ID transactions with exactly one successful record", async function () {
    const { ethers } = await network.create();
    const [owner] = await ethers.getSigners();
    const book = await ethers.deployContract("AuditRecord");
    const args = [ethers.id("same request"), ethers.id("policy"), ethers.id("record")];
    const startNonce = await owner.getNonce();
    // 모든 공격 거래를 같은 대기 블록에 모아 컨트랙트의 중복 검사를 직접 실행합니다.
    await ethers.provider.send("evm_setAutomine", [false]);
    try {
      const transactions = [];
      for (let index = 0; index < 200; index++) {
        transactions.push(await book.recordPurchase(...args, {
          nonce: startNonce + index,
          gasLimit: 100000,
        }));
      }
      await ethers.provider.send("evm_mine", []);
      const receipts = await Promise.all(transactions.map(tx => ethers.provider.getTransactionReceipt(tx.hash)));
      assert.ok(receipts.every(receipt => receipt !== null), "All attack transactions must be mined");
      assert.equal(receipts.filter(receipt => receipt!.status === 1).length, 1);
      assert.equal(receipts.filter(receipt => receipt!.status === 0).length, 199);
      assert.equal(receipts.reduce((sum, receipt) => sum + receipt!.logs.length, 0), 1);
      assert.equal(await book.recordedPurchases(args[0]), true);
    } finally {
      await ethers.provider.send("evm_setAutomine", [true]);
    }
  });
});
