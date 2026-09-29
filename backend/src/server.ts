import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import path from "node:path";
import { existsSync } from "node:fs";
import { createHash,timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z,ZodError } from "zod";
import { Database } from "./db.js";
import { PolicyCache } from "./policy.js";
import { PythonEvaluator } from "./python.js";
import { SearchService,defaultProductHosts } from "./search.js";
import { Workflow } from "./workflow.js";
import { KilnClient } from "./kiln.js";
import { Agent } from "./agent.js";
import { PurchaseWorker } from "./purchaseWorker.js";
import { AuditWorker } from "./auditWorker.js";
import { AppError,requireThat } from "./errors.js";
import { id,money } from "./schema.js";
import {supabaseOwner} from './auth.js';
import {consumeLimit} from './limits.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
loadEnv({path:path.join(ROOT,".env"),quiet:true});
declare module "fastify" {interface FastifyRequest {owner:string}}
export function createApp(flow:Workflow,agent:Agent,env:NodeJS.ProcessEnv) {
 const app=Fastify({logger:false,bodyLimit:32768,trustProxy:false});
 const cloudPurchase=env.POLICY_SERVERLESS==='1'&&env.SERVICE_ROLE!=='policy-admin'?new PurchaseWorker(flow):null;
 app.register(helmet);app.decorateRequest("owner","");
 const tokens:Record<string,string>=JSON.parse(env.AUTH_TOKEN_HASHES??"{}");
 const windows=new Map<string,{at:number,count:number}>();
 app.addHook("onRequest",async(req,reply)=>{
  if(!req.url.startsWith("/api/")||req.url==="/api/health")return;
  const policyEndpoint=req.url.startsWith("/api/policy-edit-sessions")||req.url==='/api/setup';
  requireThat(env.SERVICE_ROLE!=="audit","NOT_FOUND",404);
  if(env.SERVICE_ROLE==="policy-admin") requireThat(policyEndpoint||req.method==="GET","NOT_FOUND",404);
  else requireThat(!policyEndpoint,"POLICY_ADMIN_UNAVAILABLE",503);
  if(env.AUTH_MODE==='supabase')req.owner=await supabaseOwner(req.headers.authorization,env);
  else {
  requireThat(Object.keys(tokens).length>0,"AUTH_NOT_CONFIGURED",503);
  const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  requireThat(token,"UNAUTHORIZED",401);
  const hash=createHash("sha256").update(token).digest();
  const match=Object.entries(tokens).find(([owner,h])=>/^[\w-]+$/.test(owner)&&/^[a-f0-9]{64}$/.test(h)&&timingSafeEqual(hash,Buffer.from(h,"hex")));
  requireThat(match,"UNAUTHORIZED",401);req.owner=match[0];
  }
  if(env.AUTH_MODE==='supabase')await consumeLimit(flow.db,'api:'+req.owner,120);
  const now=Date.now(),w=windows.get(req.owner);
  if(!w||now-w.at>60000)windows.set(req.owner,{at:now,count:1});
  else requireThat(++w.count<=120,"RATE_LIMITED",429);
  if(windows.size>10000)for(const [k,v]of windows)if(now-v.at>60000)windows.delete(k);
 });
 app.setErrorHandler((error,req,reply)=>{
  if(error instanceof AppError)return reply.code(error.status).send({error:error.code});
  if(error instanceof ZodError)return reply.code(400).send({error:"INVALID_INPUT"});
  reply.code(500).send({error:"INTERNAL_ERROR"});
 });
 app.get("/api/health",async()=>({orderMode:"SIMULATION",chainMode:"SEPOLIA_REAL",gasMode:(await flow.db.pool.query("SELECT 1 FROM service_health WHERE name='audit-relayer' AND state='VERIFIED' AND checked_at>now()-interval '60 seconds'")).rowCount?"RELAYED":await flow.auditReady()?"PERSONAL":"UNAVAILABLE",configured:{
  kiln:!!env.KILN_API_KEY,search:!!env.SEARCH_API_URL,auth:env.AUTH_MODE==='supabase'||Object.keys(tokens).length>0,
  audit:await flow.auditReady()},capabilities:{audit:await flow.auditReady()?"VERIFIED":"UNAVAILABLE",
  policyAdmin:env.POLICY_SERVERLESS==='1'||!!(await flow.db.pool.query("SELECT 1 FROM service_health WHERE name='policy-admin' AND state='CONFIGURED' AND checked_at>now()-interval '60 seconds'")).rowCount},notice:"Configuration is not live verification"}));
 app.get("/api/scopes",async(req)=>(await flow.db.pool.query("SELECT id,mode,active_version FROM policy_scopes WHERE owner_id=$1",[req.owner])).rows);
 app.post('/api/setup',async req=>flow.setup(req.owner,req.body));
 app.get<{Params:{id:string}}>("/api/policies/:id",async req=>{
  const r=(await flow.db.pool.query("SELECT v.policy,v.digest,v.version,s.mode,s.edit_id,s.edit_base,EXISTS(SELECT 1 FROM agent_runs a WHERE a.scope_id=s.id AND a.active) OR EXISTS(SELECT 1 FROM audit_jobs j WHERE j.scope_id=s.id AND j.state<>'FINALIZED') AS busy FROM policy_scopes s JOIN policy_versions v ON v.scope_id=s.id AND v.version=s.active_version WHERE s.id=$1 AND s.owner_id=$2",[req.params.id,req.owner])).rows[0];requireThat(r,"NOT_FOUND",404);
  r.balance=(await flow.db.pool.query("SELECT currency,balance,spent,reserved FROM balances WHERE owner_id=$1 AND scope_id=$2 AND currency=$3",[req.owner,req.params.id,r.policy.currency])).rows[0]??null;return r;});
 app.get("/api/agent/runs",async req=>(await flow.db.pool.query("SELECT id,scope_id,track,state,active,input,created_at FROM agent_runs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50",[req.owner])).rows);
 app.post("/api/agent/runs",async req=>flow.start(req.owner,req.body));
 app.get<{Params:{id:string}}>("/api/agent/runs/:id",async req=>flow.run(req.owner,req.params.id));
 app.post<{Params:{id:string}}>("/api/agent/runs/:id/resume",async req=>{
  const result=await agent.resume(req.owner,req.params.id);
  if(cloudPurchase&&result.state==='PROCESSING'){
   await cloudPurchase.tick(req.owner,req.params.id);
   return flow.run(req.owner,req.params.id);
  }
  return result;
 });
 if(cloudPurchase)app.post<{Params:{id:string}}>("/api/agent/runs/:id/process",async req=>{
  const run=await flow.run(req.owner,req.params.id);
  requireThat(run.active&&run.state==='PROCESSING',"INVALID_STAGE");
  await cloudPurchase.tick(req.owner,req.params.id);
  return flow.run(req.owner,req.params.id);
 });
 const event=z.object({eventId:id,expectedVersion:z.number().int().positive(),type:z.enum(["ANSWER","RETRY","CANCEL"]),
  payload:z.object({query:z.string().min(1).max(600).optional(),maxTotal:money.optional(),quantity:z.number().int().min(1).max(100000).optional(),requiredName:z.string().max(300).optional()}).strict().default({})}).strict();
 app.post<{Params:{id:string}}>("/api/agent/runs/:id/events",async req=>flow.event(req.owner,req.params.id,event.parse(req.body)));
 app.post<{Params:{id:string}}>("/api/agent/runs/:id/constraint-approvals",async req=>flow.approveConstraints(req.owner,req.params.id,z.object({constraintVersion:z.number().int().positive(),policyDigest:z.string().length(64),trackEvidenceIds:z.array(id).min(1).max(20)}).strict().parse(req.body)));
 app.post<{Params:{id:string}}>("/api/purchase-intents/:id/approvals",async req=>flow.approvePurchase(req.owner,req.params.id,z.object({quoteVersion:z.number().int().positive(),expectedGeneration:z.number().int().positive(),mode:z.literal("SIMULATION"),requestKey:id}).strict().parse(req.body)));
 app.post<{Params:{id:string}}>("/api/purchase-intents/:id/refresh",async req=>flow.refreshQuote(req.owner,req.params.id));
 app.get<{Params:{id:string}}>("/api/receipts/:id",async req=>flow.receipt(req.owner,req.params.id));
 app.get<{Params:{id:string}}>("/api/receipts/:id/audit",async req=>flow.receipt(req.owner,req.params.id,true));
 app.get("/api/receipts",async req=>(await flow.db.pool.query("SELECT id,data,created_at FROM receipts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",[req.owner])).rows);
 app.get('/api/audits',async req=>(await flow.db.pool.query("SELECT r.id,r.created_at,r.data->'quote'->>'name' AS name,COALESCE(j.state,'PENDING') AS state,j.report FROM receipts r LEFT JOIN audit_jobs j ON j.receipt_id=r.id WHERE r.owner_id=$1 ORDER BY r.created_at DESC LIMIT 50",[req.owner])).rows);
 app.get('/api/wallet',async req=>{const row=(await flow.db.pool.query("SELECT address,funded_at,funding_checked_at FROM owner_wallets WHERE owner_id=$1",[req.owner])).rows[0];if(row)return {state:'ACTIVE',address:row.address,funded:!!row.funded_at&&new Date(row.funded_at).getTime()>Date.now()-300000,checkedAt:row.funding_checked_at};return {state:(await flow.db.pool.query("SELECT 1 FROM wallet_requests WHERE owner_id=$1",[req.owner])).rowCount?'REQUESTED':'NONE'};});
 app.post('/api/wallet',async req=>{await flow.db.pool.query("INSERT INTO wallet_requests(owner_id) SELECT $1 WHERE NOT EXISTS(SELECT 1 FROM owner_wallets WHERE owner_id=$1) ON CONFLICT(owner_id) DO NOTHING",[req.owner]);return {state:'REQUESTED'};});
 app.post("/api/policy-edit-sessions",async req=>flow.enterPolicyEdit(req.owner,z.object({scopeId:id}).strict().parse(req.body).scopeId));
 app.post<{Params:{id:string}}>("/api/policy-edit-sessions/:id/publish",async req=>{
  const a=z.object({scopeId:id,baseVersion:z.number().int().positive(),draft:z.unknown(),approvedDigest:z.string().length(64)}).strict().parse(req.body);
  return flow.publish(req.owner,a.scopeId,{...a,editId:req.params.id});});
 app.delete<{Params:{id:string}}>("/api/policy-edit-sessions/:id",async req=>flow.cancelEdit(req.owner,z.object({scopeId:id}).strict().parse(req.body).scopeId,req.params.id));
 const web=path.resolve(ROOT,"frontend/dist");if(existsSync(web))app.register(import('@fastify/static'),{root:web});
 return app;
}
export async function runtime(env=process.env){
 requireThat(env.DATABASE_URL,"DATABASE_NOT_CONFIGURED",503);
 const root=ROOT;const db=new Database(env.DATABASE_URL);
 const publisher=env.SERVICE_ROLE==="policy-admin"?new Database(env.DATABASE_URL):null;
 const policyRoot=path.resolve(root,env.POLICY_BUNDLE_ROOT??"policies");
 const flow=new Workflow(db,new PolicyCache(policyRoot,"python-v1:tools-v1:prompt-v1:"+env.KILN_MODEL),new PythonEvaluator(env.PYTHON_BIN??"python",root),
  new SearchService(env.SEARCH_API_URL,new Set((env.SOURCE_ALLOWED_HOSTS??defaultProductHosts).split(",").map(s=>s.trim().toLowerCase()).filter(Boolean))),policyRoot,publisher);
 const agent=new Agent(flow,new KilnClient(env));const app=createApp(flow,agent,env);
 const purchase=new PurchaseWorker(flow),audit=new AuditWorker(db,root,env);let busy=false;
 let healthBusy=false;
 const updateHealth=async()=>{if(healthBusy)return;healthBusy=true;try{
  if(env.SERVICE_ROLE==="audit")await audit.readiness();
  if(env.SERVICE_ROLE==="policy-admin")await db.pool.query("INSERT INTO service_health(name,state) VALUES('policy-admin','CONFIGURED') ON CONFLICT(name) DO UPDATE SET checked_at=now(),state='CONFIGURED'");
 }catch{}finally{healthBusy=false;}};
 await updateHealth();const healthTimer=setInterval(()=>void updateHealth(),20000);healthTimer.unref();
 const timer=["policy-admin","audit"].includes(env.SERVICE_ROLE??"")?null:setInterval(async()=>{if(busy)return;busy=true;try{await purchase.tick();}catch{}finally{busy=false;}},1000);
 const auditTimer=env.SERVICE_ROLE==="audit"?setInterval(()=>{void audit.tick().catch(()=>{});},5000):null;
 timer?.unref();auditTimer?.unref();app.addHook("onClose",async()=>{clearInterval(healthTimer);if(timer)clearInterval(timer);if(auditTimer)clearInterval(auditTimer);await db.close();await publisher?.close();});
 return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await runtime();await app.listen({host:process.env.HOST??"127.0.0.1",port:Number(process.env.PORT??4174)});
}
