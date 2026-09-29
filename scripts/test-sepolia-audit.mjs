// Standalone chain test. Does not import the app, touch its DB, or send payments.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Contract, ContractFactory, FetchRequest, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
config({path:path.join(root,".env.sepolia")});
const url=new URL(process.env.TRACK_RPC_URL??"");
assert.equal(url.protocol,"https:","Sepolia RPC must use HTTPS.");
const request=new FetchRequest(url.href);request.timeout=15000;
const provider=new JsonRpcProvider(request);
try {
  assert.equal((await provider.getNetwork()).chainId,11155111n,"Sepolia only: refusing a different chain.");
  const wallet=new Wallet(process.env.TRACK_CHAIN_PRIVATE_KEY??"",provider);
  assert.ok(await provider.getBalance(wallet.address)>0n,"Test wallet needs Sepolia ETH.");
  const artifact=JSON.parse(readFileSync(path.join(root,"artifacts/contracts/AuditRecord.sol/AuditRecord.json"),"utf8"));
  const outDir=path.join(root,"state");mkdirSync(outDir,{recursive:true});
  const checkpointFile=path.join(outDir,"sepolia-audit-checkpoint.json");
  mkdirSync(path.join(root,"evidence"),{recursive:true});
  const reportFile=path.join(root,"evidence/sepolia-audit-verification.json");
  const save=()=>writeFileSync(checkpointFile,JSON.stringify(state,null,2)+"\n");
  const salt=()=>`0x${randomBytes(32).toString("hex")}`;
  const hash=payload=>keccak256(toUtf8Bytes(JSON.stringify(payload)));
  const state=existsSync(checkpointFile)?JSON.parse(readFileSync(checkpointFile,"utf8")):{
    chainId:"11155111",signer:wallet.address,purchaseId:salt(),
    policy:{version:1,maxBudget:1000,reviewRequired:false,reviewMinimum:0,reviewRatingMinimum:0,salt:salt()},
    record:{quantity:1,unitPrice:100,shipping:0,total:100,currency:"KRW",salt:salt()},
  };
  assert.equal(state.signer,wallet.address,"Checkpoint belongs to another test wallet.");
  assert.equal(state.chainId,"11155111");
  state.policyHash=hash(state.policy);state.recordHash=hash(state.record);save();
  // Persist signed bytes before broadcasting, so rerunning resumes the same transaction.
  async function sendOnce(label,txRequest) {
    if(!state[label]) {
      const raw=await wallet.signTransaction(await wallet.populateTransaction({...txRequest,chainId:11155111n}));
      state[label]={raw,txHash:keccak256(raw)};save();
    }
    const tx=state[label];
    assert.equal(keccak256(tx.raw),tx.txHash);
    let receipt=await provider.getTransactionReceipt(tx.txHash);
    if(!receipt) {
      try{await provider.broadcastTransaction(tx.raw);}
      catch(error){if(!await provider.getTransaction(tx.txHash))throw error;}
      console.log(JSON.stringify({stage:label,txHash:tx.txHash,status:"waiting"}));
      receipt=await provider.waitForTransaction(tx.txHash,1,120000);
    }
    assert.ok(receipt,"Not mined yet; rerun this script to resume.");
    assert.equal(receipt.status,1,`${label} reverted`);
    return receipt;
  }
  const factory=new ContractFactory(artifact.abi,artifact.bytecode,wallet);
  const deployment=await sendOnce("deployment",await factory.getDeployTransaction());
  state.contractAddress=deployment.contractAddress;save();
  assert.ok(state.contractAddress);
  const book=new Contract(state.contractAddress,artifact.abi,wallet);
  assert.equal(await book.owner(),wallet.address);
  const receipt=await sendOnce("recording",await book.recordPurchase.populateTransaction(state.purchaseId,state.policyHash,state.recordHash));
  const event=receipt.logs.filter(log=>log.address.toLowerCase()===state.contractAddress.toLowerCase()).map(log=>{try{return book.interface.parseLog(log);}catch{return null;}}).find(log=>log?.name==="PurchaseRecorded");
  assert.ok(event,"Missing audit event");
  assert.equal(event.args.purchaseId,state.purchaseId);
  assert.equal(event.args.policyHash,state.policyHash);
  assert.equal(event.args.recordHash,state.recordHash);
  assert.equal(await book.recordedPurchases(state.purchaseId),true);
  await assert.rejects(book.recordPurchase.staticCall(state.purchaseId,state.policyHash,state.recordHash),/DuplicatePurchase/);
  const outsider=Wallet.createRandom().connect(provider);
  await assert.rejects(book.connect(outsider).recordPurchase.staticCall(salt(),state.policyHash,state.recordHash),/Unauthorized/);
  const report={scope:"standalone-chain-only; synthetic audit payloads; no application or DB integration",chainId:state.chainId,signer:state.signer,contractAddress:state.contractAddress,deploymentTxHash:state.deployment.txHash,txHash:state.recording.txHash,purchaseId:state.purchaseId,policyHash:state.policyHash,recordHash:state.recordHash,blockNumber:receipt.blockNumber,gasUsed:receipt.gasUsed.toString(),receiptStatus:receipt.status,checks:{eventMatches:true,recorded:true,duplicateRejected:true,unauthorizedRejected:true},explorerUrl:`https://sepolia.etherscan.io/tx/${state.recording.txHash}`,verifiedAt:new Date().toISOString()};
  writeFileSync(reportFile,JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
} finally { provider.destroy(); }
