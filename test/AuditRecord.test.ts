import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { network } from "hardhat";

describe("AuditRecord", function () {
  it("records both commitments once, rejects outsiders and zero inputs", async function () {
    const {ethers}=await network.connect();
    const [,outsider]=await ethers.getSigners();
    const book=await ethers.deployContract("AuditRecord");
    const purchaseId=ethers.id("random purchase"),policyHash=ethers.id("policy"),recordHash=ethers.id("record");
    const receipt=await (await book.recordPurchase(purchaseId,policyHash,recordHash)).wait();
    const event=receipt?.logs.map(log=>{try{return book.interface.parseLog(log);}catch{return null;}}).find(log=>log?.name==="PurchaseRecorded");
    assert.equal(event?.args.purchaseId,purchaseId);
    assert.equal(event?.args.policyHash,policyHash);
    assert.equal(event?.args.recordHash,recordHash);
    assert.equal(await book.recordedPurchases(purchaseId),true);
    await assert.rejects(book.recordPurchase(purchaseId,policyHash,recordHash),/DuplicatePurchase/);
    await assert.rejects(book.connect(outsider).recordPurchase(ethers.id("other"),policyHash,recordHash),/Unauthorized/);
    for(let i=0;i<3;i++) {
      const args=[ethers.id("unused"),policyHash,recordHash];args[i]=ethers.ZeroHash;
      await assert.rejects(book.recordPurchase(...args),/InvalidRecord/);
    }
  });
});


// 소유권 교체와 비상 중지는 외부 호출자에게 허용하지 않습니다.
describe("AuditRecord administration", function () {
  it("pauses writes and transfers ownership only after acceptance", async function () {
    const { ethers } = await network.connect();
    const [owner, nextOwner, outsider] = await ethers.getSigners();
    const book = await ethers.deployContract("AuditRecord");
    const args = [ethers.id("request"), ethers.id("policy"), ethers.id("record")];
    await assert.rejects(book.connect(outsider).setPaused(true), /Unauthorized/);
    await assert.rejects(book.connect(outsider).transferOwnership(nextOwner.address), /Unauthorized/);
    await assert.rejects(book.transferOwnership(ethers.ZeroAddress), /InvalidOwner/);
    await (await book.setPaused(true)).wait();
    await assert.rejects(book.recordPurchase(...args), /Paused/);
    await (await book.transferOwnership(nextOwner.address)).wait();
    assert.equal(await book.owner(), owner.address);
    await assert.rejects(book.connect(outsider).acceptOwnership(), /Unauthorized/);
    await (await book.connect(nextOwner).acceptOwnership()).wait();
    assert.equal(await book.owner(), nextOwner.address);
    assert.equal(await book.pendingOwner(), ethers.ZeroAddress);
    await assert.rejects(book.setPaused(false), /Unauthorized/);
    await (await book.connect(nextOwner).setPaused(false)).wait();
    await (await book.connect(nextOwner).recordPurchase(...args)).wait();
    assert.equal(await book.recordedPurchases(args[0]), true);
  });
});
