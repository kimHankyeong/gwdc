// Explicit local browser verification harness. Never used by npm start.
import {mkdir,mkdtemp,writeFile,readFile} from "node:fs/promises";
import {randomBytes,createHash} from "node:crypto";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import EmbeddedPostgres from "embedded-postgres";
import {Database} from "../src/db.js";
import {Workflow} from "../src/workflow.js";
import {PolicyCache,canonical,digest} from "../src/policy.js";
import {PythonEvaluator} from "../src/python.js";
import {SearchService} from "../src/search.js";
import {Agent} from "../src/agent.js";
import {KilnClient} from "../src/kiln.js";
import {createApp} from "../src/server.js";
import {AuditWorker} from "../src/auditWorker.js";
import {PurchaseWorker} from "../src/purchaseWorker.js";
const root=path.resolve(import.meta.dirname,"../.."),base=path.join(root,".test-state");
await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,"ui-"));
const password=randomBytes(24).toString("hex");
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,"db"),user:"postgres",password,port:55440,persistent:true,
 postgresFlags:["-h","127.0.0.1"],initdbFlags:["--encoding=UTF8","--locale=C"],onLog:()=>{},onError:()=>{}});
await pg.initialise();await pg.start();await pg.createDatabase("uitest");
const db=new Database("postgresql://postgres:"+password+"@127.0.0.1:55440/uitest");
await db.pool.query(await readFile(path.join(root,"backend/src/db/001_initial.sql"),"utf8"));
const p={currency:"KRW",minorDigits:0,maxBudget:"100000",maxPerTransaction:"10000",minimumRemaining:"0",validUntil:"2099-01-01T00:00:00Z",allowedMerchants:[],blockedMerchants:[],blockedBrands:[],minimumReviewScore:null,preferLowerPrice:true,preferHigherReviewScore:false};
const bundles=path.join(dir,"policies");await mkdir(path.join(bundles,"verification","1"),{recursive:true});await writeFile(path.join(bundles,"verification","1","policy.json"),canonical(p));
await db.pool.query("INSERT INTO policy_scopes(id,owner_id,active_version) VALUES('verification','browser-test',1)");
await db.pool.query("INSERT INTO policy_versions(scope_id,version,digest,policy) VALUES('verification',1,$1,$2)",[digest(p),p]);
await db.pool.query("INSERT INTO balances(owner_id,scope_id,currency,balance) VALUES('browser-test','verification','KRW',100000)");
const token=randomBytes(32).toString("base64url");
await writeFile(path.join(base,"ui-session.json"),JSON.stringify({token}),{mode:0o600});
const env={...process.env,AUTH_TOKEN_HASHES:JSON.stringify({"browser-test":createHash("sha256").update(token).digest("hex")})};
const flow=new Workflow(db,new PolicyCache(bundles),new PythonEvaluator(env.PYTHON_BIN??"python",root),new SearchService(env.BRAVE_SEARCH_API_KEY,new Set((env.SOURCE_ALLOWED_HOSTS??" ").split(",").map(s=>s.trim()).filter(Boolean))),bundles,null);
const app=createApp(flow,new Agent(flow,new KilnClient(env)),env);
await app.listen({host:"127.0.0.1",port:4174});
// Separate HTTP surface in the isolated harness; production uses separate OS/DB users.
const adminFlow=new Workflow(db,new PolicyCache(bundles),flow.python,flow.search,bundles,db);
const admin=createApp(adminFlow,new Agent(adminFlow,new KilnClient(env)),{...env,SERVICE_ROLE:'policy-admin'});
await admin.listen({host:'127.0.0.1',port:4175});
const heartbeat=async()=>{await db.pool.query("INSERT INTO service_health(name,state) VALUES('policy-admin','CONFIGURED') ON CONFLICT(name) DO UPDATE SET checked_at=now()");};
await heartbeat();const pulse=setInterval(()=>void heartbeat().catch(()=>{}),20000);pulse.unref();
// Explicit opt-in: uses real Sepolia transactions and configured test-wallet funds.
const auditWorker=process.env.QA_REAL_AUDIT==="true"?new AuditWorker(db,root,env):null;
if(auditWorker)await auditWorker.readiness();
let auditBusy=false;
const auditPulse=setInterval(async()=>{if(!auditWorker||auditBusy)return;auditBusy=true;try{await auditWorker.readiness();await auditWorker.tick();}catch{ /* Unavailable is not success; jobs remain pending. */ }finally{auditBusy=false;}},20000);auditPulse.unref();
const worker=new PurchaseWorker(flow);let workerBusy=false;
const queue=setInterval(async()=>{if(workerBusy)return;workerBusy=true;try{await worker.tick();}catch{ /* Keep QA service available during shutdown. */ }finally{workerBusy=false;}},1000);queue.unref();
console.log("Isolated browser verification API ready at 127.0.0.1:4174. No secrets printed.");
async function stop(){clearInterval(pulse);clearInterval(queue);clearInterval(auditPulse);await app.close();await admin.close();await db.close();
 if(process.platform==="win32")await promisify(execFile)(path.join(root,"node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe"),["-D",path.join(dir,"db"),"-m","fast","-w","stop"],{windowsHide:true});
 else await pg.stop();process.exit(0);
}
process.on("SIGINT",()=>void stop());process.on("SIGTERM",()=>void stop());
