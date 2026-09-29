import { randomUUID,randomBytes } from "node:crypto";
import { Ajv } from "ajv";
import { toolDefinitions } from "./tools.js";
import { Workflow } from "./workflow.js";
import { KilnClient } from "./kiln.js";
import { constraintsSchema } from "./schema.js";
import { AppError,requireThat } from "./errors.js";
import { digest } from "./policy.js";
import { validateAuditPayload } from "./auditPayload.js";
import { z } from "zod";

const planningStages=["READY","CONSTRAINTS_DRAFT","NEEDS_INPUT","ACTION_REQUIRED"];
const stages:Record<string,string[]>={ask_clarification:planningStages,propose_purchase_constraints:planningStages,
 search_products:planningStages,simulate_policy:["READY","CONSTRAINTS_DRAFT"],evaluate_policy:planningStages,
 prepare_purchase:["READY","NEEDS_APPROVAL"],execute_purchase:["READY","NEEDS_APPROVAL","PROCESSING","AUDIT_PENDING"]};
const outputs:Record<string,z.ZodType>={
 ask_clarification:z.object({questions:z.array(z.string()),questionKey:z.string()}),
 propose_purchase_constraints:z.object({constraintVersion:z.number(),constraints:constraintsSchema}),
 search_products:z.object({candidates:z.array(z.object({id:z.string(),url:z.string(),name:z.string()}))}),
 simulate_policy:z.object({examples:z.array(z.object({id:z.string(),allowed:z.boolean(),total:z.string()}))}),
 evaluate_policy:z.object({evaluations:z.array(z.object({id:z.string(),allowed:z.boolean(),total:z.string()})),permittedOrder:z.array(z.string())}),
 prepare_purchase:z.object({intentId:z.string(),quote:z.object({total:z.string(),mode:z.literal("SIMULATION")}),quoteVersion:z.number(),generation:z.number()}),
 execute_purchase:z.object({intentId:z.string(),state:z.string()}),
 get_receipt:z.object({id:z.string(),mode:z.literal("SIMULATION")}),
 get_audit_status:z.object({sourceMode:z.literal("SIMULATION"),chainMode:z.literal("SEPOLIA_REAL"),state:z.string()})};

export class Agent {
 private validators=new Map(toolDefinitions.map(t=>[t.function.name,new Ajv({strict:false}).compile(t.function.parameters)]));
 constructor(readonly flow:Workflow,readonly kiln:KilnClient) {}
 async resume(owner:string,runId:string) {
  const lock=await this.flow.db.pool.connect();
  try {
   const acquired=(await lock.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked",["agent:"+runId])).rows[0].locked;
   if(!acquired)throw new AppError("RUN_BUSY",429);
   const initial=await this.flow.run(owner,runId);requireThat(initial.active,"RUN_CLOSED");
   requireThat(['READY','CONSTRAINTS_DRAFT','ACTION_REQUIRED'].includes(initial.state),'INVALID_STAGE');
   await this.flow.db.pool.query("UPDATE agent_runs SET error_code=NULL WHERE id=$1",[runId]);
   const messages:any[]=[{role:"user",content:JSON.stringify({track:initial.track,input:initial.input,state:initial.state,
    constraints:initial.constraints,constraintVersion:initial.constraint_version,inputVersion:initial.input_version,
    candidates:initial.candidates,intents:initial.intents,receipts:initial.receipts,
    constraintApproval:initial.constraint_approval,evaluations:initial.evaluations,question:initial.question})}];
   const seen=new Map<string,string>();let retries=0;const deadline=Date.now()+90000;
   for(let round=0;round<12&&Date.now()<deadline;round++){
    const run=await this.flow.db.tx(async c=>{const r=await this.flow.ownedRun(c,runId,owner);await this.flow.gate(c,r.scope_id);requireThat(r.active,"RUN_CLOSED");return r;});
    const entry=await this.flow.cache.load(run.scope_id,run.policy_version,run.policy_digest);
    const response=await this.kiln.generate(entry.text,messages);messages.push(response);
    const calls=response.tool_calls;
    if(!calls?.length){
     if(retries++<2){messages.push({role:"user",content:"Use the permitted tool for the unfinished step. Do not invent success."});continue;}
     await this.flow.db.pool.query("UPDATE agent_runs SET state='ACTION_REQUIRED',version=version+1 WHERE id=$1 AND active",[runId]);break;
    }
    requireThat(Array.isArray(calls)&&calls.length<=9,"INVALID_LLM_RESPONSE");
    let pause=false;
    for(const call of calls){
     let result:any;
     try {
      requireThat(typeof call.id==="string"&&call.type==="function","INVALID_TOOL_CALL");
      const fingerprint=digest(call.function);
      requireThat(!seen.has(call.id)||seen.get(call.id)===fingerprint,"TOOL_CALL_CONFLICT");seen.set(call.id,fingerprint);
      result=pause?{status:"BLOCKED",reasonCodes:["DEFERRED_WITHOUT_EXECUTION"]}:await this.execute(owner,runId,call.function.name,JSON.parse(call.function.arguments));
     }catch(e){
      const code=e instanceof AppError?e.code:"INVALID_TOOL_ARGUMENTS";
      result={status:"BLOCKED",reasonCodes:[code],retryable:false,...(code==="SEARCH_SCOPE_MISMATCH"?{correction:"Copy input.query exactly, or propose constraints first and copy constraints.query exactly."}:{})};
      if(code!=="SEARCH_SCOPE_MISMATCH"&&/^(SEARCH_|SOURCE_|KILN_|AUDIT_NOT_READY|AUDIT_UNSUPPORTED|COMPUTE_BUSY)/.test(code)){
       await this.flow.db.pool.query("UPDATE agent_runs SET state='ACTION_REQUIRED',error_code=$2,version=version+1 WHERE id=$1 AND active",[runId,code]);pause=true;
      }
     }
     messages.push({role:"tool",tool_call_id:call.id,content:JSON.stringify(result)});
     if(["NEEDS_INPUT","NEEDS_APPROVAL"].includes(result.status)||result.data?.state==="PROCESSING")pause=true;
    }
    if(pause)break;
    if(round===11)await this.flow.db.pool.query("UPDATE agent_runs SET state='ACTION_REQUIRED',version=version+1 WHERE id=$1 AND active",[runId]);
   }
   if(Date.now()>=deadline)await this.flow.db.pool.query("UPDATE agent_runs SET state='ACTION_REQUIRED',version=version+1 WHERE id=$1 AND active AND state NOT IN ('NEEDS_INPUT','PROCESSING')",[runId]);
   return await this.flow.run(owner,runId);
  }catch(e){
   if(!(e instanceof AppError&&["RUN_BUSY","INVALID_STAGE"].includes(e.code)))await this.flow.db.pool.query("UPDATE agent_runs SET state='ACTION_REQUIRED',error_code=$3,version=version+1 WHERE id=$1 AND owner_id=$2 AND active AND state NOT IN ('AUDIT_PENDING','PROCESSING')",[runId,owner,e instanceof AppError?e.code:"AGENT_FAILED"]);
   throw e;
  }finally{
   await lock.query("SELECT pg_advisory_unlock(hashtext($1))",["agent:"+runId]).catch(()=>{});lock.release();
  }
 }
 async execute(owner:string,runId:string,name:string,args:any):Promise<any> {
  const result=await this.dispatch(owner,runId,name,args);
  requireThat(["OK","NEEDS_INPUT","NEEDS_APPROVAL"].includes(result.status)&&!!outputs[name]?.safeParse(result.data).success,"INVALID_TOOL_RESULT");
  return result;
 }
 private async dispatch(owner:string,runId:string,name:string,args:any):Promise<any> {
  const valid=this.validators.get(name);const conforms:boolean=!!valid?.(args);requireThat(conforms,"INVALID_TOOL_ARGUMENTS",400);
  const initial=await this.flow.db.tx(async c=>{
   const r=await this.flow.ownedRun(c,runId,owner);await this.flow.gate(c,r.scope_id);requireThat(r.active,"RUN_CLOSED");
   requireThat(!stages[name]||stages[name].includes(r.state),"INVALID_STAGE");
   await this.flow.cache.load(r.scope_id,r.policy_version,r.policy_digest);return r;
  });
  if(name==="get_receipt"||name==="get_audit_status")return {status:"OK",data:await this.flow.receipt(owner,args.receiptId,name==="get_audit_status")};
  if(name==="search_products"){
   requireThat(args.inputVersion===initial.input_version,"STALE_INPUT");
   requireThat(args.query===initial.input.query||args.query===initial.constraints?.query,"SEARCH_SCOPE_MISMATCH");
   const {candidates,nextCursor}=await this.flow.search.searchPage(args.query,owner+':'+runId+':'+initial.input_version,args.cursor);
   return this.flow.db.tx(async c=>{
    await this.flow.gate(c,initial.scope_id);const r=await this.flow.ownedRun(c,runId,owner,true);
    requireThat(r.active&&r.input_version===initial.input_version,"STALE_INPUT");
    for(const candidate of candidates)await c.query("INSERT INTO candidates VALUES($1,$2,$3)",[candidate.id,runId,candidate]);
    return {status:"OK",data:{candidates,nextCursor}};
   });
  }
  return this.flow.db.tx(async c=>{
   await this.flow.gate(c,initial.scope_id);
   const r=await this.flow.ownedRun(c,runId,owner,true);requireThat(r.active,"RUN_CLOSED");
   requireThat(!stages[name]||stages[name].includes(r.state),"INVALID_STAGE");
   const p=this.flow.cache.require(r.scope_id,r.policy_version,r.policy_digest).policy;
   if(name==="ask_clarification"){
    // Do not show a different-language fallback as if it answered a Korean request.
    if(/[가-힣]/.test(r.input.query)&&args.questions.some((q:string)=>!/[가-힣]/.test(q)))
     args={questionKey:"purchase_details",questions:["구매할 내용과 예산·수량을 아래 입력란에서 확인해 주세요."]};
    // Missing source observations are not a policy merchant denial. Explain the actual next action.
    if(!r.input.simulation&&(await c.query("SELECT 1 FROM candidates WHERE run_id=$1 LIMIT 1",[runId])).rowCount)
     args={questionKey:"simulation_quote",questions:["검색 후보를 선택하고 모의 단가와 배송비를 입력해 주세요. 원문 수집 미허용이나 가격 미확인은 정책상 판매처 차단을 뜻하지 않습니다. 모의 입력 후 별도로 정책을 평가합니다."]};
    await c.query("UPDATE agent_runs SET question=$2,state='NEEDS_INPUT',version=version+1 WHERE id=$1",[runId,args]);
    return {status:"NEEDS_INPUT",data:args};
   }
   if(name==="propose_purchase_constraints"){
    requireThat(r.constraint_version===args.baseVersion,"STALE_CONSTRAINTS");
    requireThat(!(await c.query("SELECT 1 FROM purchase_intents WHERE run_id=$1 AND state NOT IN ('CANCELED','REJECTED')",[runId])).rowCount,"INTENT_ALREADY_EXISTS");
    const constraints=constraintsSchema.parse(args.constraints);
    requireThat(BigInt(constraints.maxTotal)<=BigInt(p.maxPerTransaction),"CONSTRAINT_WEAKENS_POLICY");
    if(r.track==="HardInput")requireThat(constraints.query===r.input.query&&constraints.maxTotal===r.input.maxTotal&&constraints.quantity===r.input.quantity&&constraints.requiredName===r.input.requiredName,"EXACT_INPUT_MISMATCH");
    await c.query("UPDATE agent_runs SET constraints=$2,constraint_version=constraint_version+1,constraint_approval=NULL,state='CONSTRAINTS_DRAFT',version=version+1 WHERE id=$1",[runId,constraints]);
    return {status:"OK",data:{constraintVersion:r.constraint_version+1,constraints}};
   }
   if(["simulate_policy","evaluate_policy","prepare_purchase"].includes(name))requireThat(r.constraints&&args.constraintVersion===r.constraint_version,"STALE_CONSTRAINTS");
   if(name==="simulate_policy"){
    requireThat(r.track==="Plan","INVALID_TRACK");
    const results=[];
    for(const unitPrice of ["1",p.maxPerTransaction]){
     const quote={name:r.constraints.requiredName??"정책 경계 예시",quantity:r.constraints.quantity,unitPrice,shipping:"0",currency:p.currency,merchant:null,brand:null,rating:null};
     const result=await this.flow.evaluate(c,r,quote);const id=randomUUID();
     await c.query("INSERT INTO evaluations VALUES($1,$2,$3,$4,'EXAMPLE',$5,$6)",[id,runId,r.constraint_version,r.policy_digest,result,result.inputDigest]);
     results.push({id,...result,example:true});
    }
    return {status:"NEEDS_APPROVAL",data:{examples:results}};
   }
   if(name==="evaluate_policy"){
    const results=[];
    for(const candidateId of args.candidateIds){
     const quote=await this.flow.quote(c,r,candidateId,r.constraints.quantity);
     const result=await this.flow.evaluate(c,r,quote),id=randomUUID();
     await c.query("INSERT INTO evaluations VALUES($1,$2,$3,$4,'EVALUATION',$5,$6)",[id,runId,r.constraint_version,r.policy_digest,result,result.inputDigest]);
     results.push({id,candidateId,rating:quote.rating,...result});
    }
    const rank=await this.flow.python.evaluate({operation:"rank",policy:p,results,
      policyDigest:r.policy_digest,inputDigest:digest(results)});
    return {status:"OK",data:{evaluations:results,permittedOrder:rank.candidateIds}};
   }
   if(name==="prepare_purchase"){
    requireThat(await this.flow.auditReady(c),"AUDIT_NOT_READY",503);
    requireThat(r.constraint_approval?.version===r.constraint_version,"CONSTRAINT_APPROVAL_REQUIRED");
    requireThat(p.currency==="KRW"&&p.minorDigits===0&&p.minimumReviewScore===null,"AUDIT_UNSUPPORTED");
    const quote=await this.flow.quote(c,r,args.candidateId,args.quantity);
    const result=await this.flow.evaluate(c,r,quote);requireThat(result.allowed,result.reasonCodes[0]??"POLICY_REJECTED");
    quote.total=result.total;
    const key=digest({runId,constraints:r.constraint_version,quote});
    const old=(await c.query("SELECT * FROM purchase_intents WHERE prepare_key=$1",[key])).rows[0];
    if(old)return {status:"NEEDS_APPROVAL",data:{intentId:old.id,quote:old.quote,quoteVersion:old.quote_version,generation:old.generation}};
    requireThat(!(await c.query("SELECT 1 FROM purchase_intents WHERE run_id=$1 AND state NOT IN ('CANCELED','REJECTED')",[runId])).rowCount,"INTENT_ALREADY_EXISTS");
    const salt=()=>"0x"+randomBytes(32).toString("hex");
    const auditInput={policy:{version:1,maxBudget:Number(p.maxBudget),reviewRequired:false,reviewMinimum:0,reviewRatingMinimum:0,salt:salt()},
     record:{quantity:quote.quantity,unitPrice:Number(quote.unitPrice),shipping:Number(quote.shipping),total:Number(quote.total),currency:"KRW",salt:salt()},purchaseId:salt()};
    requireThat(Object.values(auditInput.record).filter(v=>typeof v==="number").every(Number.isSafeInteger)&&Number.isSafeInteger(auditInput.policy.maxBudget),"AUDIT_UNSUPPORTED");
    await validateAuditPayload(auditInput);
    const id=randomUUID();
    await c.query("INSERT INTO purchase_intents(id,run_id,owner_id,scope_id,prepare_key,policy_version,policy_digest,constraint_version,quote,expires_at,state,audit_input) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()+interval '5 minutes','NEEDS_APPROVAL',$10)",[id,runId,owner,r.scope_id,key,r.policy_version,r.policy_digest,r.constraint_version,quote,auditInput]);
    await c.query("UPDATE agent_runs SET state='NEEDS_APPROVAL',version=version+1 WHERE id=$1",[runId]);
    return {status:"NEEDS_APPROVAL",data:{intentId:id,quote,quoteVersion:1,generation:1}};
   }
   if(name==="execute_purchase"){
    const it=(await c.query("SELECT * FROM purchase_intents WHERE id=$1 AND run_id=$2 AND owner_id=$3 FOR UPDATE",[args.intentId,runId,owner])).rows[0];
    requireThat(it,"NOT_FOUND",404);
    if(it.state==="COMMITTED"||it.state==="PROCESSING")return {status:"OK",data:{state:it.state,intentId:it.id}};
    requireThat(await this.flow.auditReady(c),"AUDIT_NOT_READY",503);
    requireThat(it.state==="READY_FOR_TOOL"&&it.approval?.generation===it.generation&&it.approval?.quoteVersion===it.quote_version,"PURCHASE_APPROVAL_REQUIRED");
    if(new Date(it.expires_at).getTime()<=Date.now()){
     await c.query("UPDATE purchase_intents SET state='NEEDS_RECONFIRMATION' WHERE id=$1",[it.id]);
     return {status:"NEEDS_APPROVAL",data:{state:"NEEDS_RECONFIRMATION",intentId:it.id}};
    }
    requireThat(r.constraint_approval?.version===it.constraint_version&&r.policy_digest===it.policy_digest,"STALE_APPROVAL");
    const result=await this.flow.evaluate(c,r,it.quote,it.reserved);requireThat(result.allowed,result.reasonCodes[0]??"POLICY_REJECTED");
    await c.query("UPDATE balances SET reserved=reserved-$1+$2 WHERE owner_id=$3 AND scope_id=$4 AND currency=$5",[it.reserved,result.total,owner,r.scope_id,it.quote.currency]);
    await c.query("UPDATE purchase_intents SET state='PROCESSING',reserved=$2 WHERE id=$1",[it.id,result.total]);
    await c.query("INSERT INTO purchase_jobs(intent_id,generation) VALUES($1,$2) ON CONFLICT DO NOTHING",[it.id,it.generation]);
    await c.query("UPDATE agent_runs SET state='PROCESSING',version=version+1 WHERE id=$1",[runId]);
    return {status:"OK",data:{state:"PROCESSING",intentId:it.id}};
   }
   throw new AppError("TOOL_UNAVAILABLE");
  });
 }
}
