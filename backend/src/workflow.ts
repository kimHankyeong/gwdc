import { randomUUID, randomBytes } from "node:crypto";
import { mkdir,writeFile,readFile } from "node:fs/promises";
import path from "node:path";
import type { PoolClient } from "pg";
import { Database } from "./db.js";
import { PolicyCache,digest,canonical } from "./policy.js";
import { policySchema,constraintsSchema,startSchema,money } from "./schema.js";
import {z} from 'zod';
import { AppError,requireThat } from "./errors.js";
import { PythonEvaluator } from "./python.js";
import { SearchService } from "./search.js";

export class Workflow {
 constructor(readonly db:Database,readonly cache:PolicyCache,readonly python:PythonEvaluator,
  readonly search:SearchService,readonly policyRoot:string,readonly publisher:Database|null,
  readonly policyStorage:'file'|'database'='file') {}
 async setup(owner:string,raw:unknown){
  requireThat(this.publisher&&this.policyStorage==='database','POLICY_ADMIN_UNAVAILABLE',503);
  const a=z.object({policy:policySchema,balance:money,approvedDigest:z.string().length(64)}).strict().parse(raw);
  requireThat(digest(a.policy)===a.approvedDigest,'POLICY_DIGEST_MISMATCH');
  requireThat(new Date(a.policy.validUntil).getTime()>Date.now(),'POLICY_EXPIRED');
  return this.publisher.tx(async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',['setup:'+owner]);
   const existing=(await c.query('SELECT id FROM policy_scopes WHERE owner_id=$1',[owner])).rows[0];
   requireThat(!existing,'POLICY_ALREADY_EXISTS',409);
   const scopeId=randomUUID();
   await c.query('INSERT INTO policy_scopes(id,owner_id,active_version) VALUES($1,$2,1)',[scopeId,owner]);
   await c.query('INSERT INTO policy_versions(scope_id,version,digest,policy) VALUES($1,1,$2,$3)',[scopeId,digest(a.policy),a.policy]);
   await c.query('INSERT INTO balances(owner_id,scope_id,currency,balance) VALUES($1,$2,$3,$4)',[owner,scopeId,a.policy.currency,a.balance]);
   return {scopeId};
  });
 }
 async auditReady(client:any=this.db.pool,owner?:string) {
  if(!(await client.query("SELECT 1 FROM service_health WHERE name='audit' AND state='VERIFIED' AND checked_at>now()-interval '60 seconds'")).rowCount)return false;
  if((await client.query("SELECT 1 FROM service_health WHERE name='audit-relayer' AND state='VERIFIED' AND checked_at>now()-interval '60 seconds'")).rowCount)return true;
  return !owner||!!(await client.query("SELECT 1 FROM owner_wallets WHERE owner_id=$1 AND funded_at>now()-interval '5 minutes' AND funding_checked_at>now()-interval '5 minutes'",[owner])).rowCount;
 }
 async ownedRun(c:PoolClient,id:string,owner:string,lock=false) {
  const r=(await c.query("SELECT * FROM agent_runs WHERE id=$1 AND owner_id=$2"+(lock?" FOR UPDATE":""),[id,owner])).rows[0];
  requireThat(r,"NOT_FOUND",404);return r;
 }
 async gate(c:PoolClient,scope:string) {
  const p=(await c.query("SELECT * FROM policy_scopes WHERE id=$1 FOR UPDATE",[scope])).rows[0];
  requireThat(p,"NOT_FOUND",404);requireThat(p.mode==="NORMAL","POLICY_BUSY");return p;
 }
 async run(owner:string,id:string) {
  return this.db.tx(async c=>{const r=await this.ownedRun(c,id,owner);
   const candidates=(await c.query("SELECT id,data FROM candidates WHERE run_id=$1",[id])).rows;
   const intents=(await c.query("SELECT id,state,quote,quote_version,generation,approval,expires_at FROM purchase_intents WHERE run_id=$1",[id])).rows;
   const evaluations=(await c.query("SELECT id,kind,result FROM evaluations WHERE run_id=$1 AND constraint_version=$2",[id,r.constraint_version])).rows;
   const receipts=(await c.query("SELECT rc.id,rc.mode,a.state AS audit_state FROM receipts rc JOIN purchase_intents pi ON pi.id=rc.intent_id LEFT JOIN audit_jobs a ON a.receipt_id=rc.id WHERE pi.run_id=$1",[id])).rows;
   return {...r,candidates,intents,evaluations,receipts};});
 }
 async start(owner:string,raw:unknown) {
  const a=startSchema.parse(raw);
  requireThat(!a.autoPurchase||(a.track==="HardInput"&&!!a.input.maxTotal&&!!a.input.quantity&&!!a.input.requiredName?.trim()),"AUTO_PURCHASE_REQUIRES_FIXED_LIMITS");
  return this.db.tx(async c=>{
   const p=await this.gate(c,a.scopeId);requireThat(p.owner_id===owner,"NOT_FOUND",404);
   const v=(await c.query("SELECT * FROM policy_versions WHERE scope_id=$1 AND version=$2",[p.id,p.active_version])).rows[0];
   await this.cache.load(p.id,v.version,v.digest);
   const id=randomUUID();await c.query("INSERT INTO agent_runs(id,owner_id,scope_id,policy_version,policy_digest,track,input,auto_purchase,state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'READY')",[id,owner,p.id,v.version,v.digest,a.track,a.input,a.autoPurchase]);
   return {runId:id,state:"READY"};
  });
 }
 async event(owner:string,id:string,event:any) {
  return this.db.tx(async c=>{
   let r=await this.ownedRun(c,id,owner);await this.gate(c,r.scope_id);r=await this.ownedRun(c,id,owner,true);
   const old=(await c.query("SELECT fingerprint FROM run_events WHERE run_id=$1 AND event_id=$2",[id,event.eventId])).rows[0];
   if(old){requireThat(old.fingerprint===digest(event),"EVENT_CONFLICT");return {state:r.state};}
   requireThat(r.version===event.expectedVersion&&r.active,"STALE_RUN");
   if(event.type==="CANCEL"){
    const audit=await c.query("SELECT 1 FROM audit_jobs a JOIN receipts rc ON rc.id=a.receipt_id JOIN purchase_intents pi ON pi.id=rc.intent_id WHERE pi.run_id=$1 AND a.state<>'FINALIZED' LIMIT 1",[id]);
    requireThat(!audit.rowCount,"RECOVERY_REQUIRED");
    const intents=(await c.query("SELECT * FROM purchase_intents WHERE run_id=$1 ORDER BY id FOR UPDATE",[id])).rows;
    for(const it of intents){
     if(it.state==="COMMITTED")continue;
     if(BigInt(it.reserved)>0n)await c.query("UPDATE balances SET reserved=reserved-$1 WHERE owner_id=$2 AND scope_id=$3 AND currency=$4",[it.reserved,owner,r.scope_id,it.quote.currency]);
     await c.query("UPDATE purchase_intents SET state='CANCELED',reserved=0,generation=generation+1 WHERE id=$1",[it.id]);
     await c.query("UPDATE purchase_jobs SET state='SUPERSEDED' WHERE intent_id=$1 AND state<>'DONE'",[it.id]);
    }
    await c.query("UPDATE agent_runs SET active=false,state='CANCELED',version=version+1 WHERE id=$1",[id]);
   }else{
    requireThat(["ACTION_REQUIRED","NEEDS_INPUT","READY","CONSTRAINTS_DRAFT"].includes(r.state),"INVALID_STAGE");
    let input=r.input;
    if(event.type==="ANSWER"){
     input={...input,...event.payload};
     requireThat(!Object.keys(event.payload).some(k=>!["query","maxTotal","quantity","requiredName"].includes(k)),"INVALID_ANSWER");
     // Editing the request voids the original auto-purchase consent.
     await c.query("UPDATE agent_runs SET input=$2,input_version=input_version+1,question=NULL,constraint_approval=NULL,auto_purchase=false WHERE id=$1",[id,input]);
     // Results and evaluations belong to the exact input version that produced them.
     await c.query("DELETE FROM candidates WHERE run_id=$1",[id]);
     await c.query("DELETE FROM evaluations WHERE run_id=$1",[id]);
    }
    await c.query("UPDATE agent_runs SET state='READY',error_code=NULL,version=version+1 WHERE id=$1",[id]);
   }
   await c.query("INSERT INTO run_events VALUES($1,$2,$3)",[id,event.eventId,digest(event)]);
   return {state:event.type==="CANCEL"?"CANCELED":"READY"};
  });
 }
 async approveConstraints(owner:string,id:string,a:any) {
  return this.db.tx(async c=>{
   let r=await this.ownedRun(c,id,owner);await this.gate(c,r.scope_id);r=await this.ownedRun(c,id,owner,true);
   requireThat(r.active&&r.constraints&&r.constraint_version===a.constraintVersion&&r.policy_digest===a.policyDigest,"STALE_APPROVAL");
   const rows=(await c.query("SELECT id,kind,result FROM evaluations WHERE run_id=$1 AND constraint_version=$2 AND policy_digest=$3",[id,a.constraintVersion,a.policyDigest])).rows;
   if(r.track==="Plan")requireThat(a.trackEvidenceIds.length>=1&&a.trackEvidenceIds.length<=2&&a.trackEvidenceIds.every((id:string)=>rows.some(e=>e.id===id&&e.kind==="EXAMPLE")),"EXAMPLES_REQUIRED");
   else {
    requireThat(r.constraints.query===r.input.query&&r.constraints.quantity===r.input.quantity&&r.constraints.maxTotal===r.input.maxTotal&&r.constraints.requiredName===r.input.requiredName,"EXACT_INPUT_MISMATCH");
    requireThat(a.trackEvidenceIds.length>0&&a.trackEvidenceIds.every((id:string)=>rows.some(e=>e.id===id&&e.kind==="EVALUATION"&&e.result.allowed)),"EVALUATION_REQUIRED");
   }
   await c.query("UPDATE agent_runs SET constraint_approval=$2,state='READY',version=version+1 WHERE id=$1",[id,{version:a.constraintVersion,policyDigest:a.policyDigest,evidenceIds:a.trackEvidenceIds}]);
   return {state:"READY"};
  });
 }
 async quote(c:PoolClient,r:any,candidateId:string,quantity:number):Promise<any> {
  const candidate=(await c.query("SELECT data FROM candidates WHERE id=$1 AND run_id=$2",[candidateId,r.id])).rows[0]?.data;
  requireThat(candidate,"NOT_FOUND",404);
  const p=(await this.cache.load(r.scope_id,r.policy_version,r.policy_digest)).policy;
  const f=candidate.fields??{};
  requireThat(candidate.evidenceType==="HTML_OBSERVATION"&&candidate.contentHash&&candidate.verifiedMerchantHost,"PRICE_EVIDENCE_MISSING");
  requireThat(Date.now()-new Date(candidate.fetchedAt).getTime()<5*60*1000,"PRICE_EVIDENCE_STALE");
  requireThat(f.currency===p.currency&&f.shippingCurrency===p.currency,"PRICE_CURRENCY_MISMATCH");
  const amount=(v:unknown)=>{if(typeof v!=="string")return null;const m=/^(0|[1-9][0-9]{0,14})(?:\.([0-9]{1,3}))?$/.exec(v);if(!m||m[2]&&m[2].length>p.minorDigits)return null;return (BigInt(m[1])*10n**BigInt(p.minorDigits)+BigInt((m[2]??'').padEnd(p.minorDigits,'0')||'0')).toString();};
  const unitPrice=amount(f.observedPrice),shipping=amount(f.observedShipping);
  requireThat(unitPrice!==null,"PRICE_EVIDENCE_MISSING");
  requireThat(shipping!==null,"SHIPPING_EVIDENCE_MISSING");
  return {candidateId,name:f.name??candidate.name,quantity,unitPrice,shipping,
   currency:p.currency,merchant:[...p.allowedMerchants,...p.blockedMerchants].every((x:string)=>x===x.toLowerCase()&&/^[a-z0-9.-]+\.[a-z]{2,}$/.test(x))?sourceMerchant(candidate):null,brand:f.brand??null,rating:f.rating??null,
   sourceUrl:candidate.url,sourceId:candidate.sourceId,fetchedAt:candidate.fetchedAt,
   amountEvidence:"SOURCE_OBSERVED",sourceHash:candidate.contentHash,mode:"SIMULATION"};
 }
 async evaluate(c:PoolClient,r:any,quote:any,ownReservation="0") {
  const p=(await this.cache.load(r.scope_id,r.policy_version,r.policy_digest)).policy;
  const b=(await c.query("SELECT * FROM balances WHERE owner_id=$1 AND scope_id=$2 AND currency=$3 FOR UPDATE",[r.owner_id,r.scope_id,p.currency])).rows[0];
  requireThat(b,"SIMULATION_BALANCE_NOT_CONFIGURED");
  const facts={quote,balance:b.balance,spent:b.spent,reserved:(BigInt(b.reserved)-BigInt(ownReservation)).toString(),now:new Date().toISOString()};
  return this.python.evaluate({policy:p,constraints:r.constraints,facts,policyDigest:r.policy_digest,inputDigest:digest(facts)});
 }
 async approvePurchase(owner:string,id:string,a:any) {
  return this.db.tx(async c=>{
   let it=(await c.query("SELECT * FROM purchase_intents WHERE id=$1 AND owner_id=$2",[id,owner])).rows[0];requireThat(it,"NOT_FOUND",404);
   await this.gate(c,it.scope_id);it=(await c.query("SELECT * FROM purchase_intents WHERE id=$1 FOR UPDATE",[id])).rows[0];
   const key="approval:"+a.requestKey;const existing=(await c.query("SELECT * FROM operations WHERE owner_id=$1 AND key=$2",[owner,key])).rows[0];
   if(existing){requireThat(existing.fingerprint===digest(a)&&existing.intent_id===id,"IDEMPOTENCY_CONFLICT");return {state:it.state};}
   requireThat(it.state!=="COMMITTED"&&it.state!=="CANCELED"&&it.generation===a.expectedGeneration&&it.quote_version===a.quoteVersion,"STALE_APPROVAL");
   requireThat(new Date(it.expires_at).getTime()>Date.now(),"QUOTE_EXPIRED");
   const r=await this.ownedRun(c,it.run_id,owner);requireThat(r.active&&r.constraint_approval&&r.constraint_version===it.constraint_version,"STALE_CONSTRAINTS");
   const evaluation=await this.evaluate(c,r,it.quote,it.reserved);requireThat(evaluation.allowed,evaluation.reasonCodes[0]??"POLICY_REJECTED");
   // Reapproval fences previous workers. Existing reservation is replaced, never added twice.
   const total=evaluation.total;
   if(BigInt(it.reserved)>0n)await c.query("UPDATE balances SET reserved=reserved-$1+$2 WHERE owner_id=$3 AND scope_id=$4 AND currency=$5",[it.reserved,total,owner,it.scope_id,it.quote.currency]);
   const generation=it.generation+1;
   await c.query("UPDATE purchase_jobs SET state='SUPERSEDED' WHERE intent_id=$1 AND state<>'DONE'",[id]);
   await c.query("UPDATE purchase_intents SET approval=$2,generation=$3,state='READY_FOR_TOOL',reserved=$4 WHERE id=$1",[id,{quoteVersion:a.quoteVersion,generation,mode:"SIMULATION",requestKey:a.requestKey},generation,BigInt(it.reserved)>0n?total:"0"]);
   await c.query("INSERT INTO operations VALUES($1,$2,$3,$4)",[owner,key,digest(a),id]);
   await c.query("UPDATE agent_runs SET state='READY',version=version+1 WHERE id=$1",[r.id]);
   return {state:"READY_FOR_TOOL",runId:r.id};
  });
 }
 async refreshQuote(owner:string,id:string) {
  return this.db.tx(async c=>{
   const initial=(await c.query("SELECT * FROM purchase_intents WHERE id=$1 AND owner_id=$2",[id,owner])).rows[0];requireThat(initial,"NOT_FOUND",404);
   await this.gate(c,initial.scope_id);
   const it=(await c.query("SELECT * FROM purchase_intents WHERE id=$1 FOR UPDATE",[id])).rows[0];
   requireThat(it.state==="NEEDS_RECONFIRMATION"||(['NEEDS_APPROVAL','READY_FOR_TOOL'].includes(it.state)&&new Date(it.expires_at).getTime()<=Date.now()),"INVALID_STAGE");
   requireThat(it.quote.amountEvidence!=="SOURCE_OBSERVED"||Date.now()-new Date(it.quote.fetchedAt).getTime()<5*60*1000,"PRICE_EVIDENCE_STALE");
   await c.query("UPDATE purchase_intents SET state='NEEDS_RECONFIRMATION',quote_version=quote_version+1,approval=NULL,expires_at=now()+interval '5 minutes' WHERE id=$1",[id]);
   return {quote:it.quote,quoteVersion:it.quote_version+1,generation:it.generation,mode:"SIMULATION"};
  });
 }
 async receipt(owner:string,id:string,audit=false) {
  const row=(await this.db.pool.query("SELECT * FROM receipts WHERE id=$1 AND owner_id=$2",[id,owner])).rows[0];requireThat(row,"NOT_FOUND",404);
  if(!audit)return {...row.data,id:row.id,mode:"SIMULATION"};
  const job=(await this.db.pool.query("SELECT state,report FROM audit_jobs WHERE receipt_id=$1",[id])).rows[0];
  return {sourceMode:"SIMULATION",chainMode:"SEPOLIA_REAL",state:job?.state??"PENDING",report:job?.report??null};
 }
 async enterPolicyEdit(owner:string,scope:string) {
  requireThat(this.publisher,"POLICY_ADMIN_UNAVAILABLE",503);
  return this.publisher.tx(async c=>{
   const p=await this.gate(c,scope);requireThat(p.owner_id===owner,"NOT_FOUND",404);
   requireThat(!(await c.query("SELECT 1 FROM agent_runs WHERE scope_id=$1 AND active LIMIT 1",[scope])).rowCount,"POLICY_BUSY");
   requireThat(!(await c.query("SELECT 1 FROM audit_jobs WHERE scope_id=$1 AND state<>'FINALIZED' LIMIT 1",[scope])).rowCount,"POLICY_BUSY");
   const id=randomUUID();await c.query("UPDATE policy_scopes SET mode='POLICY_EDIT',edit_id=$2,edit_base=active_version,edit_owner=$3 WHERE id=$1",[scope,id,owner]);
   return {editId:id,baseVersion:p.active_version};
  });
 }
 async publish(owner:string,scope:string,a:any) {
  requireThat(this.publisher,"POLICY_ADMIN_UNAVAILABLE",503);
  const policy=policySchema.parse(a.draft);requireThat(a.approvedDigest===digest(policy),"DRAFT_APPROVAL_MISMATCH");
  return this.publisher.tx(async c=>{
   const p=(await c.query("SELECT * FROM policy_scopes WHERE id=$1 FOR UPDATE",[scope])).rows[0];
   requireThat(p&&p.owner_id===owner&&p.mode==="POLICY_EDIT"&&p.edit_id===a.editId&&p.active_version===a.baseVersion,"INVALID_EDIT_SESSION");
   const version=p.active_version+1,hash=digest(policy);
   if(this.policyStorage==='file'){
   const dir=path.resolve(this.policyRoot,scope,String(version));await mkdir(dir,{recursive:true});
   // Exclusive create: old published bytes are never overwritten.
   const file=path.join(dir,"policy.json"),bytes=canonical(policy);
   try {await writeFile(file,bytes,{flag:"wx",mode:0o444});}
   catch(e:any){requireThat(e.code==="EEXIST"&&(await readFile(file,"utf8"))===bytes,"POLICY_ARTIFACT_CONFLICT");}
   await this.cache.load(scope,version,hash);
   }
   await c.query("INSERT INTO policy_versions(scope_id,version,digest,policy) VALUES($1,$2,$3,$4)",[scope,version,hash,policy]);
   await c.query("UPDATE policy_scopes SET mode='NORMAL',active_version=$2,edit_id=NULL,edit_base=NULL,edit_owner=NULL WHERE id=$1",[scope,version]);
   return {version,digest:hash};
  });
 }
 async cancelEdit(owner:string,scope:string,editId:string) {
  requireThat(this.publisher,"POLICY_ADMIN_UNAVAILABLE",503);
  const r=await this.publisher.pool.query("UPDATE policy_scopes SET mode='NORMAL',edit_id=NULL,edit_base=NULL,edit_owner=NULL WHERE id=$1 AND owner_id=$2 AND edit_id=$3 AND mode='POLICY_EDIT' RETURNING id",[scope,owner,editId]);
  requireThat(r.rowCount,"INVALID_EDIT_SESSION");return {state:"NORMAL"};
 }
}
// This is the verified source domain, not the marketplace seller's identity.
// Seller-name policy restrictions fail closed until a dedicated seller adapter exists.
export function sourceMerchant(candidate:any):string|null {
 return candidate.verifiedMerchantHost??null;
}
