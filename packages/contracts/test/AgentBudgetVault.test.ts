import assert from "node:assert/strict";
import { describe, it } from "mocha";
import { network } from "hardhat";
import { encodeBytes32String, parseEther } from "ethers";

describe("AgentBudgetVault", function () {
  it("charges one allowed order including delivery and records its details hash", async function () {
    const { ethers } = await network.connect();
    const [hq, branch, supplier] = await ethers.getSigners();
    const token = await ethers.deployContract("DemoKRW");
    const vault = await ethers.deployContract("AgentBudgetVault", [await token.getAddress()]);
    await token.mint(hq.address, 1_000_000n);
    await token.approve(await vault.getAddress(), 1_000_000n);
    await vault.fundTreasury(1_000_000n);
    const policyId = encodeBytes32String("branch-01");
    const orderId = encodeBytes32String("order-001");
    const detailsHash = `0x${"a".repeat(64)}`;
    await vault.setPolicy(policyId, branch.address, 50_000n, BigInt(Math.floor(Date.now() / 1000) + 3600), [supplier.address]);

    const tx = await vault.connect(branch).pay(policyId, orderId, supplier.address, 39_000n, 2_000n, detailsHash);
    const receipt = await tx.wait();
    assert.equal(await token.balanceOf(supplier.address), 41_000n);
    assert.equal((await vault.policies(policyId)).spent, 41_000n);
    assert.equal((await vault.policies(policyId)).version, 1n);
    const event = receipt?.logs.map((log) => { try { return vault.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === "PaymentExecuted");
    assert.equal(event?.args.detailsHash, detailsHash);
  });

  it("rejects disallowed suppliers, delivery-inclusive budget overruns and replayed orders", async function () {
    const { ethers } = await network.connect();
    const [hq, branch, supplier, outsider] = await ethers.getSigners();
    const token = await ethers.deployContract("DemoKRW");
    const vault = await ethers.deployContract("AgentBudgetVault", [await token.getAddress()]);
    await token.mint(hq.address, 100_000n);
    await token.approve(await vault.getAddress(), 100_000n);
    await vault.fundTreasury(100_000n);
    const policyId = encodeBytes32String("branch-02");
    const orderId = encodeBytes32String("order-002");
    const detailsHash = `0x${"b".repeat(64)}`;
    await vault.setPolicy(policyId, branch.address, 50_000n, BigInt(Math.floor(Date.now() / 1000) + 3600), [supplier.address]);
    await assert.rejects(vault.connect(branch).pay(policyId, encodeBytes32String("order-003"), outsider.address, 1_000n, 0n, detailsHash), /SupplierNotAllowed/);
    await assert.rejects(vault.connect(branch).pay(policyId, encodeBytes32String("order-004"), supplier.address, 49_000n, 2_000n, detailsHash), /BudgetExceeded/);
    await vault.connect(branch).pay(policyId, orderId, supplier.address, 10_000n, 2_000n, detailsHash);
    await assert.rejects(vault.connect(branch).pay(policyId, orderId, supplier.address, 1_000n, 0n, detailsHash), /OrderAlreadySettled/);
  });

  it("revokes branch authority and refuses payments after revocation", async function () {
    const { ethers } = await network.connect();
    const [hq, branch, supplier] = await ethers.getSigners();
    const token = await ethers.deployContract("DemoKRW");
    const vault = await ethers.deployContract("AgentBudgetVault", [await token.getAddress()]);
    await token.mint(hq.address, 25_000n);
    await token.approve(await vault.getAddress(), 25_000n);
    await vault.fundTreasury(25_000n);
    const policyId = encodeBytes32String("branch-03");
    await vault.setPolicy(policyId, branch.address, 20_000n, BigInt(Math.floor(Date.now() / 1000) + 3600), [supplier.address]);
    await vault.revokePolicy(policyId);
    assert.equal((await vault.policies(policyId)).active, false);
    assert.equal(await vault.reservedAmount(), 0n);
    await assert.rejects(vault.connect(branch).pay(policyId, encodeBytes32String("order-005"), supplier.address, 1_000n, 0n, `0x${"c".repeat(64)}`), /PolicyStopped/);
  });

  it("does not spend funds on a policy with a past expiry", async function () {
    const { ethers } = await network.connect();
    const [hq, branch, supplier] = await ethers.getSigners();
    const token = await ethers.deployContract("DemoKRW");
    const vault = await ethers.deployContract("AgentBudgetVault", [await token.getAddress()]);
    await token.mint(hq.address, 25_000n);
    await token.approve(await vault.getAddress(), 25_000n);
    await vault.fundTreasury(25_000n);
    const policyId = encodeBytes32String("branch-04");
    const past = BigInt(Math.floor(Date.now() / 1000) - 10);
    await assert.rejects(vault.setPolicy(policyId, branch.address, 20_000n, past, [supplier.address]), /InvalidPolicy/);
  });
});
