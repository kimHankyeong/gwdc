import { network } from "hardhat";

const { ethers } = await network.connect();
const [hq] = await ethers.getSigners();
const token = await ethers.deployContract("DemoKRW");
await token.waitForDeployment();
const vault = await ethers.deployContract("AgentBudgetVault", [await token.getAddress()]);
await vault.waitForDeployment();
await token.mint(hq.address, 10_000_000n);
await token.approve(await vault.getAddress(), 10_000_000n);
await vault.fundTreasury(10_000_000n);
console.log(JSON.stringify({ chainId: await ethers.provider.getNetwork().then((n) => n.chainId.toString()), owner: hq.address, token: await token.getAddress(), vault: await vault.getAddress(), seededDemoBalance: "10000000 DKRW" }, null, 2));
