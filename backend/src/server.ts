import { config as loadEnv } from "dotenv";
import Fastify from "fastify";
import helmet from "@fastify/helmet";
import staticFiles from "@fastify/static";
import path from "node:path";
import { existsSync } from "node:fs";
import { createHash,timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { z,ZodError } from "zod";
import { Database } from "./db.js";
import { PolicyCache } from "./policy.js";
import { PythonEvaluator } from "./python.js";
import { SearchService } from "./search.js";
import { Workflow } from "./workflow.js";
import { KilnClient } from "./kiln.js";
import { Agent } from "./agent.js";
import { PurchaseWorker } from "./purchaseWorker.js";
import { AuditWorker } from "./auditWorker.js";
import { AppError,requireThat } from "./errors.js";
import { id,money } from "./schema.js";
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"../..");
loadEnv({path:path.join(ROOT,".env"),quiet:true});
declare module "fastify" {interface FastifyRequest {owner:string}}
export function createApp(flow:Workflow,agent:Agent,env:NodeJS.ProcessEnv) {
 const app=Fastify({logger:false,bodyLimit:32768,trustProxy:false});
 app.register(helmet);app.decorateRequest("owner","");
 const tokens:Record<string,string>=JSON.parse(env.AUTH_TOKEN_HASHES??"{}");
 const windows=new Map<string,{at:number,count:number}>();
 app.addHook("onRequest",async(req,reply)=>{
  if(!req.url.startsWith("/api/")||req.url==="/api/health")return;
  const policyEndpoint=req.url.startsWith("/api/policy-edit-sessions");
  requireThat(env.SERVICE_ROLE!=="audit","NOT_FOUND",404);
  if(env.SERVICE_ROLE==="policy-admin") requireThat(policyEndpoint||req.method==="GET","NOT_FOUND",404);
  else requireThat(!policyEndpoint,"POLICY_ADMIN_UNAVAILABLE",503);
  requireThat(Object.keys(tokens).length>0,"AUTH_NOT_CONFIGURED",503);
  const token=req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
  requireThat(token,"UNAUTHORIZED",401);
  const hash=createHash("sha256").update(token).digest();
  const match=Object.entries(tokens).find(([owner,h])=>/^[\w-]+$/.test(owner)&&/^[a-f0-9]{64}$/.test(h)&&timingSafeEqual(hash,Buffer.from(h,"hex")));
  requireThat(match,"UNAUTHORIZED",401);req.owner=match[0];
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
 app.get("/api/health",()=>({orderMode:"SIMULATION",chainMode:"SEPOLIA_REAL",configured:{
  kiln:!!env.KILN_API_KEY,search:!!env.BRAVE_SEARCH_API_KEY,auth:Object.keys(tokens).length>0,
  audit:!!(env.TRACK_RPC_URL&&env.TRACK_VERIFY_RPC_URL&&env.TRACK_CHAIN_PRIVATE_KEY)},notice:"Configuration is not live verification"}));
 app.get("/api/scopes",async(req)=>(await flow.db.pool.query("SELECT id,mode,active_version FROM policy_scopes WHERE owner_id=$1",[req.owner])).rows);
 app.get<{Params:{id:string}}>("/api/policies/:id",async req=>{
  const r=(await flow.db.pool.query("SELECT v.policy,v.digest,v.version,s.mode FROM policy_scopes s JOIN policy_versions v ON v.scope_id=s.id AND v.version=s.active_version WHERE s.id=$1 AND s.owner_id=$2",[req.params.id,req.owner])).rows[0];requireThat(r,"NOT_FOUND",404);return r;});
 app.post("/api/agent/runs",async req=>flow.start(req.owner,req.body));
 app.get<{Params:{id:string}}>("/api/agent/runs/:id",async req=>flow.run(req.owner,req.params.id));
 app.post<{Params:{id:string}}>("/api/agent/runs/:id/resume",async req=>agent.resume(req.owner,req.params.id));
 const simulation=z.object({candidateId:id,unitPrice:money,shipping:money}).strict();
 const event=z.object({eventId:id,expectedVersion:z.number().int().positive(),type:z.enum(["ANSWER","RETRY","CANCEL"]),
  payload:z.object({query:z.string().min(1).max(600).optional(),maxTotal:money.optional(),quantity:z.number().int().min(1).max(100000).optional(),requiredName:z.string().max(300).optional(),simulation:simulation.optional()}).strict().default({})}).strict();
 app.post<{Params:{id:string}}>("/api/agent/runs/:id/events",async req=>flow.event(req.owner,req.params.id,event.parse(req.body)));
 app.post<{Params:{id:string}}>("/api/agent/runs/:id/constraint-approvals",async req=>flow.approveConstraints(req.owner,req.params.id,z.object({constraintVersion:z.number().int().positive(),policyDigest:z.string().length(64),trackEvidenceIds:z.array(id).min(1).max(20)}).strict().parse(req.body)));
 app.post<{Params:{id:string}}>("/api/purchase-intents/:id/approvals",async req=>flow.approvePurchase(req.owner,req.params.id,z.object({quoteVersion:z.number().int().positive(),expectedGeneration:z.number().int().positive(),mode:z.literal("SIMULATION"),requestKey:id}).strict().parse(req.body)));
 app.post<{Params:{id:string}}>("/api/purchase-intents/:id/refresh",async req=>flow.refreshQuote(req.owner,req.params.id));
 app.get<{Params:{id:string}}>("/api/receipts/:id",async req=>flow.receipt(req.owner,req.params.id));
 app.get<{Params:{id:string}}>("/api/receipts/:id/audit",async req=>flow.receipt(req.owner,req.params.id,true));
 app.get("/api/receipts",async req=>(await flow.db.pool.query("SELECT id,data,created_at FROM receipts WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100",[req.owner])).rows);
 app.post("/api/policy-edit-sessions",async req=>flow.enterPolicyEdit(req.owner,z.object({scopeId:id}).strict().parse(req.body).scopeId));
 app.post<{Params:{id:string}}>("/api/policy-edit-sessions/:id/publish",async req=>{
  const a=z.object({scopeId:id,baseVersion:z.number().int().positive(),draft:z.unknown(),approvedDigest:z.string().length(64)}).strict().parse(req.body);
  return flow.publish(req.owner,a.scopeId,{...a,editId:req.params.id});});
 app.delete<{Params:{id:string}}>("/api/policy-edit-sessions/:id",async req=>flow.cancelEdit(req.owner,z.object({scopeId:id}).strict().parse(req.body).scopeId,req.params.id));
 const web=path.resolve(ROOT,"frontend/dist");if(existsSync(web))app.register(staticFiles,{root:web});
 return app;
}
export async function runtime(env=process.env){
 requireThat(env.DATABASE_URL,"DATABASE_NOT_CONFIGURED",503);
 const root=ROOT;const db=new Database(env.DATABASE_URL);
 const publisher=env.SERVICE_ROLE==="policy-admin"?new Database(env.DATABASE_URL):null;
 const policyRoot=path.resolve(root,env.POLICY_BUNDLE_ROOT??"policies");
 const flow=new Workflow(db,new PolicyCache(policyRoot,"python-v1:tools-v1:prompt-v1:"+env.KILN_MODEL),new PythonEvaluator(env.PYTHON_BIN??"python",root),
  new SearchService(env.BRAVE_SEARCH_API_KEY,new Set((env.SOURCE_ALLOWED_HOSTS??"").split(",").filter(Boolean))),policyRoot,publisher);
 const agent=new Agent(flow,new KilnClient(env));const app=createApp(flow,agent,env);
 const purchase=new PurchaseWorker(flow),audit=new AuditWorker(db,root,env);let busy=false;
 const timer=["policy-admin","audit"].includes(env.SERVICE_ROLE??"")?null:setInterval(async()=>{if(busy)return;busy=true;try{await purchase.tick();}catch{}finally{busy=false;}},1000);
 const auditTimer=env.SERVICE_ROLE==="audit"?setInterval(()=>{void audit.tick();},5000):null;
 timer?.unref();auditTimer?.unref();app.addHook("onClose",async()=>{if(timer)clearInterval(timer);if(auditTimer)clearInterval(auditTimer);await db.close();await publisher?.close();});
 return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await runtime();await app.listen({host:process.env.HOST??"127.0.0.1",port:Number(process.env.PORT??4174)});
}
