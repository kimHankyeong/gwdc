import { randomUUID } from "node:crypto";
import { Workflow } from "./workflow.js";
import { requireThat } from "./errors.js";
import { digest } from "./policy.js";
export class PurchaseWorker {
 constructor(private flow:Workflow) {}
 async tick() {
  const job=await this.flow.db.tx(async c=>{
   const row=(await c.query("SELECT * FROM purchase_jobs WHERE state='PENDING' OR (state='RUNNING' AND lease_until<now()) ORDER BY intent_id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
   if(!row)return null;
   return (await c.query("UPDATE purchase_jobs SET state='RUNNING',lease_until=now()+interval '30 seconds',fence=fence+1 WHERE intent_id=$1 AND generation=$2 RETURNING *",[row.intent_id,row.generation])).rows[0];
  });
  if(!job)return false;
  await this.flow.db.tx(async c=>{
   const initial=(await c.query("SELECT * FROM purchase_intents WHERE id=$1",[job.intent_id])).rows[0];
   await this.flow.gate(c,initial.scope_id);
   const it=(await c.query("SELECT * FROM purchase_intents WHERE id=$1 FOR UPDATE",[job.intent_id])).rows[0];
   const current=(await c.query("SELECT * FROM purchase_jobs WHERE intent_id=$1 AND generation=$2 FOR UPDATE",[job.intent_id,job.generation])).rows[0];
   if(current.fence!==job.fence||current.state!=="RUNNING"||it.generation!==job.generation)return;
   if(it.state==="COMMITTED"){await c.query("UPDATE purchase_jobs SET state='DONE' WHERE intent_id=$1 AND generation=$2",[it.id,job.generation]);return;}
   requireThat(it.state==="PROCESSING"&&it.approval?.generation===it.generation,"STALE_JOB");
   const r=await this.flow.ownedRun(c,it.run_id,it.owner_id);
   await this.flow.cache.load(r.scope_id,r.policy_version,r.policy_digest);
   requireThat(r.active&&r.constraint_approval?.version===it.constraint_version&&r.policy_digest===it.policy_digest,"STALE_APPROVAL");
   if(new Date(it.expires_at).getTime()<=Date.now()){
    await c.query("UPDATE purchase_intents SET state='NEEDS_RECONFIRMATION' WHERE id=$1",[it.id]);
    await c.query("UPDATE purchase_jobs SET state='SUPERSEDED' WHERE intent_id=$1 AND generation=$2",[it.id,job.generation]);return;
   }
   const result=await this.flow.evaluate(c,r,it.quote,it.reserved);
   requireThat(BigInt(it.reserved)===BigInt(result.total),"RESERVATION_MISMATCH");
   const decision=result.allowed?"APPROVED":"REJECTED", reason=result.allowed?"SIMULATED_ORDER":result.reasonCodes[0];
   if(result.allowed){
    const receiptId=randomUUID();
    await c.query("UPDATE balances SET reserved=reserved-$1,balance=balance-$1,spent=spent+$1 WHERE owner_id=$2 AND scope_id=$3 AND currency=$4",[result.total,it.owner_id,it.scope_id,it.quote.currency]);
    const receipt={mode:"SIMULATION",intentId:it.id,quote:it.quote,policyVersion:it.policy_version,policyDigest:it.policy_digest,
     notice:"모의 주문 영수증: 실제 주문·청구·배송 없음"};
    await c.query("INSERT INTO receipts(id,intent_id,owner_id,scope_id,mode,data) VALUES($1,$2,$3,$4,'SIMULATION',$5)",[receiptId,it.id,it.owner_id,it.scope_id,receipt]);
    await c.query("INSERT INTO audit_jobs(receipt_id,request_id,scope_id,input,fingerprint) VALUES($1,$2,$3,$4,$5)",[receiptId,receiptId,it.scope_id,it.audit_input,digest(it.audit_input)]);
   }else await c.query("UPDATE balances SET reserved=reserved-$1 WHERE owner_id=$2 AND scope_id=$3 AND currency=$4",[it.reserved,it.owner_id,it.scope_id,it.quote.currency]);
   await c.query("INSERT INTO decision_logs(intent_id,owner_id,decision,reason,policy_digest,currency,amount) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",[it.id,it.owner_id,decision,reason,it.policy_digest,it.quote.currency,result.total]);
   await c.query("UPDATE purchase_intents SET reserved=0,state=$2 WHERE id=$1",[it.id,result.allowed?"COMMITTED":"REJECTED"]);
   await c.query("UPDATE purchase_jobs SET state='DONE' WHERE intent_id=$1 AND generation=$2",[it.id,job.generation]);
   await c.query("UPDATE agent_runs SET state=$2,version=version+1 WHERE id=$1",[r.id,result.allowed?"AUDIT_PENDING":"REJECTED"]);
  });
  return true;
 }
}
