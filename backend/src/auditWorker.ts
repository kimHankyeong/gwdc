import path from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "./db.js";
import { digest } from "./policy.js";
import { requireThat } from "./errors.js";
import { JsonRpcProvider,Wallet,parseEther } from "ethers";
import {walletMasterKey,sealWallet,openWallet} from './walletVault.js';
export class AuditWorker {
 private running=false;
 constructor(private db:Database,private root:string,private env:NodeJS.ProcessEnv) {}
 configured(){return !!(this.env.TRACK_RPC_URL&&this.env.TRACK_VERIFY_RPC_URL&&this.env.WALLET_MASTER_KEY);}
 async readiness(){
  let state="UNAVAILABLE";
  const providers:JsonRpcProvider[]=[];
  try {
   requireThat(this.configured(),"AUDIT_NOT_READY");
   const urls=[new URL(this.env.TRACK_RPC_URL!),new URL(this.env.TRACK_VERIFY_RPC_URL!)];
   requireThat(urls.every(u=>u.protocol==="https:")&&urls[0].hostname!==urls[1].hostname,"AUDIT_NOT_READY");
   walletMasterKey(this.env.WALLET_MASTER_KEY);
   urls.forEach(u=>providers.push(new JsonRpcProvider(u.href)));
   await Promise.race([Promise.all(providers.map(async p=>{
    requireThat((await p.getNetwork()).chainId===11155111n,"WRONG_CHAIN");
   })),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error("RPC_TIMEOUT")),8000);timer.unref();})]);
   const active=(await this.db.pool.query("SELECT w.owner_id,w.address FROM owner_wallets w WHERE EXISTS(SELECT 1 FROM agent_runs r WHERE r.owner_id=w.owner_id AND r.active) ORDER BY w.funding_checked_at NULLS FIRST LIMIT 20")).rows;
   await Promise.all(active.map(async w=>{try{const balances=await Promise.all(providers.map(p=>p.getBalance(w.address)));await this.db.pool.query("UPDATE owner_wallets SET funded_at=$2,funding_checked_at=now() WHERE owner_id=$1",[w.owner_id,balances.every(b=>b>=parseEther('0.004'))?new Date():null]);}catch{}}));
   state="VERIFIED";
  }catch{}finally{providers.forEach(p=>p.destroy());}
  await this.db.pool.query("INSERT INTO service_health(name,state) VALUES('audit',$1) ON CONFLICT(name) DO UPDATE SET state=$1,checked_at=now()",[state]);
 }
 async tick(){
  if(this.running||!this.configured())return false;this.running=true;
  try {
   const request=await this.db.tx(async c=>(await c.query("SELECT owner_id FROM wallet_requests WHERE NOT EXISTS(SELECT 1 FROM owner_wallets w WHERE w.owner_id=wallet_requests.owner_id) ORDER BY requested_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0]);
   if(request){const wallet=Wallet.createRandom(),key=walletMasterKey(this.env.WALLET_MASTER_KEY);
    await this.db.tx(async c=>{await c.query("INSERT INTO owner_wallets(owner_id,address,encrypted_key) VALUES($1,$2,$3) ON CONFLICT(owner_id) DO NOTHING",[request.owner_id,wallet.address,sealWallet(request.owner_id,wallet.privateKey,key)]);await c.query("DELETE FROM wallet_requests WHERE owner_id=$1",[request.owner_id]);});return true;}
   const job=await this.db.tx(async c=>{
    const r=(await c.query("SELECT * FROM audit_jobs WHERE state<>'FINALIZED' AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY request_id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if(!r)return null;
    return (await c.query("UPDATE audit_jobs SET state='RUNNING',fence=fence+1,lease_until=now()+interval '10 minutes' WHERE receipt_id=$1 RETURNING *",[r.receipt_id])).rows[0];
   });
   if(!job)return false;
   try {
    requireThat(digest(job.input)===job.fingerprint,"AUDIT_INPUT_CONFLICT");
    const signer=(await this.db.pool.query("SELECT w.owner_id,w.address,w.encrypted_key FROM owner_wallets w JOIN receipts r ON r.owner_id=w.owner_id WHERE r.id=$1",[job.receipt_id])).rows[0];
    requireThat(signer,"WALLET_NOT_READY");
    const privateKey=openWallet(signer.owner_id,signer.encrypted_key,walletMasterKey(this.env.WALLET_MASTER_KEY),signer.address);
    const adapter=await import(pathToFileURL(path.resolve(this.root,"blockchain/src/runAudit.mjs")).href);
    const report=await adapter.runAuditWithInput({...job.input,requestId:job.request_id,sourceMode:"SIMULATION"},privateKey);
    requireThat(report.requestId===job.request_id&&report.purchaseId===job.input.purchaseId&&report.chainId==="11155111"&&report.signer.toLowerCase()===signer.address.toLowerCase()&&report.receiptStatus===1&&report.verification==="verified","AUDIT_REPORT_MISMATCH");
    await this.db.tx(async c=>{
     await c.query("SELECT id FROM policy_scopes WHERE id=$1 FOR UPDATE",[job.scope_id]);
     const saved=await c.query("UPDATE audit_jobs SET state=$2,report=$3,lease_until=NULL,next_attempt=now()+interval '30 seconds' WHERE receipt_id=$1 AND fence=$4 RETURNING receipt_id",[job.receipt_id,report.finality==="finalized"?"FINALIZED":"INCLUDED",report,job.fence]);
     if(saved.rowCount&&report.finality==="finalized"){
      const r=(await c.query("SELECT p.run_id FROM receipts r JOIN purchase_intents p ON p.id=r.intent_id WHERE r.id=$1",[job.receipt_id])).rows[0];
      await c.query("UPDATE agent_runs SET active=false,state='COMPLETED',version=version+1 WHERE id=$1",[r.run_id]);
     }
    });
   }catch{
    await this.db.pool.query("UPDATE audit_jobs SET state='RECONCILIATION_REQUIRED',report=NULL,lease_until=NULL,next_attempt=now()+interval '60 seconds' WHERE receipt_id=$1 AND fence=$2",[job.receipt_id,job.fence]);
   }
   return true;
  } finally{this.running=false;}
 }
}
