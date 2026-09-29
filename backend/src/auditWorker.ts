import path from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "./db.js";
import { digest } from "./policy.js";
import { requireThat } from "./errors.js";
import { JsonRpcProvider,Wallet,parseEther } from "ethers";
import type { PoolClient } from "pg";
import {walletMasterKey,sealWallet,openWallet} from './walletVault.js';
export class AuditWorker {
 private running=false;
 constructor(private db:Database,private root:string,private env:NodeJS.ProcessEnv) {}
 private relayed(){return this.env.AUDIT_GAS_MODE==='relayer';}
 configured(){return !!((!this.env.AUDIT_GAS_MODE||['personal','relayer'].includes(this.env.AUDIT_GAS_MODE))&&this.env.TRACK_RPC_URL&&this.env.TRACK_VERIFY_RPC_URL&&this.env.WALLET_MASTER_KEY&&(!this.relayed()||this.env.AUDIT_RELAYER_PRIVATE_KEY));}
 async readiness(){
  let state="UNAVAILABLE",relayState="UNAVAILABLE";
  const providers:JsonRpcProvider[]=[];
  try {
   requireThat(this.configured(),"AUDIT_NOT_READY");
   requireThat(!this.env.AUDIT_GAS_MODE||['personal','relayer'].includes(this.env.AUDIT_GAS_MODE),"AUDIT_NOT_READY");
   const urls=[new URL(this.env.TRACK_RPC_URL!),new URL(this.env.TRACK_VERIFY_RPC_URL!)];
   requireThat(urls.every(u=>u.protocol==="https:")&&urls[0].hostname!==urls[1].hostname,"AUDIT_NOT_READY");
   walletMasterKey(this.env.WALLET_MASTER_KEY);
   urls.forEach(u=>providers.push(new JsonRpcProvider(u.href)));
   await Promise.race([Promise.all(providers.map(async p=>{
    requireThat((await p.getNetwork()).chainId===11155111n,"WRONG_CHAIN");
   })),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error("RPC_TIMEOUT")),8000);timer.unref();})]);
   if(this.relayed()){
    const signer=new Wallet(this.env.AUDIT_RELAYER_PRIVATE_KEY!);
    const balances=await Promise.all(providers.map(p=>p.getBalance(signer.address)));
    requireThat(balances.every(b=>b>=parseEther('0.004')),"AUDIT_NOT_FUNDED");
    relayState="VERIFIED";
   }else{
    const active=(await this.db.pool.query("SELECT w.owner_id,w.address FROM owner_wallets w WHERE EXISTS(SELECT 1 FROM agent_runs r WHERE r.owner_id=w.owner_id AND r.active) ORDER BY w.funding_checked_at NULLS FIRST LIMIT 20")).rows;
    await Promise.all(active.map(async w=>{try{const balances=await Promise.all(providers.map(p=>p.getBalance(w.address)));await this.db.pool.query("UPDATE owner_wallets SET funded_at=$2,funding_checked_at=now() WHERE owner_id=$1",[w.owner_id,balances.every(b=>b>=parseEther('0.004'))?new Date():null]);}catch{}}));
   }
   state="VERIFIED";
  }catch{}finally{providers.forEach(p=>p.destroy());}
  await this.db.pool.query("INSERT INTO service_health(name,state) VALUES('audit',$1) ON CONFLICT(name) DO UPDATE SET state=$1,checked_at=now()",[state]);
  await this.db.pool.query("INSERT INTO service_health(name,state) VALUES('audit-relayer',$1) ON CONFLICT(name) DO UPDATE SET state=$1,checked_at=now()",[relayState]);
 }
 async tick(){
  if(this.running||!this.configured())return false;this.running=true;
  // One shared signer must have one nonce allocator across all worker hosts.
  let relayerConnection:PoolClient|null=null;
  let relayerLocked=false;
  try {
   if(this.relayed())relayerConnection=await this.db.pool.connect();
   if(relayerConnection){
    const address=new Wallet(this.env.AUDIT_RELAYER_PRIVATE_KEY!).address;
    relayerLocked=(await relayerConnection.query("SELECT pg_try_advisory_lock(110012,hashtext($1)) AS locked",[address.toLowerCase()])).rows[0].locked;
    if(!relayerLocked)return false;
    const ready=(await relayerConnection.query("SELECT count(*)::int AS n FROM service_health WHERE name IN ('audit','audit-relayer') AND state='VERIFIED' AND checked_at>now()-interval '60 seconds'")).rows[0].n;
    if(ready!==2)return false;
   }
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
    const owner=(await this.db.pool.query("SELECT owner_id FROM receipts WHERE id=$1",[job.receipt_id])).rows[0]?.owner_id;
    requireThat(owner,"NOT_FOUND");
    const signer=this.relayed()?new Wallet(this.env.AUDIT_RELAYER_PRIVATE_KEY!):null;
    const personal=signer?null:(await this.db.pool.query("SELECT owner_id,address,encrypted_key FROM owner_wallets WHERE owner_id=$1",[owner])).rows[0];
    requireThat(signer||personal,"WALLET_NOT_READY");
    const privateKey=signer?.privateKey??openWallet(personal.owner_id,personal.encrypted_key,walletMasterKey(this.env.WALLET_MASTER_KEY),personal.address);
    const address=signer?.address??personal.address;
    const adapter=await import(pathToFileURL(path.resolve(this.root,"blockchain/src/runAudit.mjs")).href);
    const report=await adapter.runAuditWithInput({...job.input,requestId:job.request_id,sourceMode:"SIMULATION"},privateKey);
    requireThat(report.requestId===job.request_id&&report.purchaseId===job.input.purchaseId&&report.chainId==="11155111"&&report.signer.toLowerCase()===address.toLowerCase()&&report.receiptStatus===1&&report.verification==="verified","AUDIT_REPORT_MISMATCH");
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
  } finally{
   if(relayerConnection){if(relayerLocked)await relayerConnection.query("SELECT pg_advisory_unlock(110012,hashtext($1))",[new Wallet(this.env.AUDIT_RELAYER_PRIVATE_KEY!).address.toLowerCase()]).catch(()=>{});relayerConnection.release();}
   this.running=false;
  }
 }
}
