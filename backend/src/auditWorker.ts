import path from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "./db.js";
import { digest } from "./policy.js";
import { requireThat } from "./errors.js";
export class AuditWorker {
 private running=false;
 constructor(private db:Database,private root:string,private env:NodeJS.ProcessEnv) {}
 configured(){return !!(this.env.TRACK_RPC_URL&&this.env.TRACK_VERIFY_RPC_URL&&this.env.TRACK_CHAIN_PRIVATE_KEY);}
 async tick(){
  if(this.running||!this.configured())return false;this.running=true;
  try {
   const job=await this.db.tx(async c=>{
    const r=(await c.query("SELECT * FROM audit_jobs WHERE state<>'FINALIZED' AND next_attempt<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY request_id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if(!r)return null;
    return (await c.query("UPDATE audit_jobs SET state='RUNNING',fence=fence+1,lease_until=now()+interval '10 minutes' WHERE receipt_id=$1 RETURNING *",[r.receipt_id])).rows[0];
   });
   if(!job)return false;
   try {
    requireThat(digest(job.input)===job.fingerprint,"AUDIT_INPUT_CONFLICT");
    const adapter=await import(pathToFileURL(path.resolve(this.root,"blockchain/src/runAudit.mjs")).href);
    const report=await adapter.runAuditWithInput({...job.input,requestId:job.request_id,sourceMode:"SIMULATION"});
    requireThat(report.requestId===job.request_id&&report.purchaseId===job.input.purchaseId&&report.chainId==="11155111"&&report.receiptStatus===1&&report.verification==="verified","AUDIT_REPORT_MISMATCH");
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
