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

