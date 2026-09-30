// Isolated visual simulation: local PostgreSQL and fixed merchant evidence fixtures.
// Never points at production data or claims an on-chain transaction.
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import {Database} from '../src/db.js';
import {Workflow} from '../src/workflow.js';
import {PolicyCache,canonical,digest} from '../src/policy.js';
import {PythonEvaluator} from '../src/python.js';
import {SearchService} from '../src/search.js';
import {Agent} from '../src/agent.js';
import {createApp} from '../src/server.js';
import {PurchaseWorker} from '../src/purchaseWorker.js';
import {KilnClient} from '../src/kiln.js';
import {parse} from 'dotenv';

const root=path.resolve(import.meta.dirname,'../..'),base=path.join(root,'.test-state');
await mkdir(base,{recursive:true});const dir=await mkdtemp(path.join(base,'project-demo-'));
const password=randomBytes(24).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'db'),user:'postgres',password,port:55445,persistent:true,
 postgresFlags:['-h','127.0.0.1'],initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
await pg.initialise();await pg.start();await pg.createDatabase('projectdemo');
const db=new Database(`postgresql://postgres:${password}@127.0.0.1:55445/projectdemo`);
await db.pool.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN');
for(const file of ['001_initial.sql','002_roles.sql','004_runtime_limits.sql','009_projects.sql'])await db.pool.query(await readFile(path.join(root,'backend/src/db',file),'utf8'));
const policy={currency:'KRW',minorDigits:0,maxBudget:'300000',maxPerTransaction:'120000',minimumRemaining:'0',validUntil:'2099-01-01T00:00:00Z',allowedMerchants:[],blockedMerchants:[],blockedBrands:[],minimumReviewScore:null,preferLowerPrice:true,preferHigherReviewScore:false};
const bundles=path.join(dir,'policies');await mkdir(path.join(bundles,'demo-scope','1'),{recursive:true});
await writeFile(path.join(bundles,'demo-scope','1','policy.json'),canonical(policy));
await db.pool.query("INSERT INTO policy_scopes(id,owner_id,active_version) VALUES('demo-scope','project-demo',1)");
await db.pool.query('INSERT INTO policy_versions(scope_id,version,digest,policy) VALUES($1,1,$2,$3)',['demo-scope',digest(policy),policy]);
await db.pool.query("INSERT INTO balances(owner_id,scope_id,currency,balance) VALUES('project-demo','demo-scope','KRW',300000)");
await db.pool.query("INSERT INTO service_health(name,state) VALUES('audit','VERIFIED'),('audit-relayer','VERIFIED')");
const token=randomBytes(32).toString('base64url');await writeFile(path.join(base,'project-demo-session.json'),JSON.stringify({token}),{mode:0o600});
const flow=new Workflow(db,new PolicyCache(bundles),new PythonEvaluator(process.env.PYTHON_BIN??'python',root),new SearchService(undefined,new Set()),bundles,null);
const fixtures=[
 {name:'USB microphone',searchQuery:'USB microphone for podcasting',rationale:'Captures clear spoken audio',quantity:1,price:'89000'},
 {name:'Closed-back headphones',searchQuery:'closed-back studio headphones',rationale:'Monitors recording without speaker bleed',quantity:1,price:'79000'},
 {name:'Microphone boom arm',searchQuery:'desktop microphone boom arm',rationale:'Keeps the microphone in position',quantity:1,price:'39000'}
];
const livePlan=process.env.DEMO_LIVE_PLAN==='true';
const kiln=livePlan?new KilnClient({...process.env,...parse(await readFile(path.join(root,'.env'),'utf8'))}):
 {createChatModel:()=>({invoke:async()=>({content:JSON.stringify({items:fixtures.map(({price,...item})=>item),assemblySteps:['Mount the microphone on the boom arm.','Connect the microphone and headphones to the computer.','Record a short sample and adjust levels.']})})}),generate:async()=>{throw Error('DEMO_MODEL_STAGE_UNEXPECTED');}} as unknown as KilnClient;
const agent=new Agent(flow,kiln);const originalResume=agent.resume.bind(agent);
agent.resume=async(owner,runId)=>{
 const run=await flow.run(owner,runId),fixture=fixtures.find(f=>f.searchQuery===run.input.query);
 const linked=(await db.pool.query('SELECT name,allocation,quantity FROM project_items WHERE run_id=$1',[runId])).rows[0];
 if(linked&&!run.candidates.length){
  const price=livePlan?String(BigInt(linked.allocation)/(BigInt(linked.quantity)*3n)):fixture?.price??'10000';
  const itemName=livePlan?linked.name:fixture?.name??linked.name;
  const candidate={id:randomUUID(),name:itemName,url:'https://example.com/fixture/'+encodeURIComponent(itemName),sourceId:randomUUID(),fetchedAt:new Date().toISOString(),evidenceType:'HTML_OBSERVATION',contentHash:'a'.repeat(64),verifiedMerchantHost:'example.com',fields:{name:itemName,observedPrice:price,currency:'KRW',observedShipping:'0',shippingCurrency:'KRW'}};
  await db.pool.query('INSERT INTO candidates(id,run_id,data) VALUES($1,$2,$3)',[candidate.id,runId,candidate]);
 }
 return originalResume(owner,runId);
};
const env={AUTH_TOKEN_HASHES:JSON.stringify({'project-demo':createHash('sha256').update(token).digest('hex')})};
const app=createApp(flow,agent,env);
const worker=new PurchaseWorker(flow);let working=false;
const pulse=setInterval(async()=>{if(working)return;working=true;try{await db.pool.query("UPDATE service_health SET checked_at=now() WHERE name IN ('audit','audit-relayer')");await worker.tick();}catch{}finally{working=false;}},700);
await app.listen({host:'127.0.0.1',port:4176});
console.log('Isolated project simulation ready at http://127.0.0.1:4176');
async function stop(){clearInterval(pulse);await app.close();await db.close();
 if(process.platform==='win32')await promisify(execFile)(path.join(root,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),['-D',path.join(dir,'db'),'-m','fast','-w','stop'],{windowsHide:true});else await pg.stop();process.exit(0);}
process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
