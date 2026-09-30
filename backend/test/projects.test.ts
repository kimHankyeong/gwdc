import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import {Database} from '../src/db.js';
import {Workflow} from '../src/workflow.js';
import {PolicyCache,canonical,digest} from '../src/policy.js';
import {PythonEvaluator} from '../src/python.js';
import {SearchService} from '../src/search.js';
import {Projects} from '../src/projects.js';
import type {KilnClient} from '../src/kiln.js';

test('topic plan is scoped, budgeted, idempotent and completion requires receipts',async()=>{
 const root=path.resolve(import.meta.dirname,'../..');
 const dir=await mkdtemp(path.join(root,'.test-state/project-test-'));
 const password=randomBytes(24).toString('hex');
 const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'db'),user:'postgres',password,port:55444,persistent:true,
  postgresFlags:['-h','127.0.0.1'],initdbFlags:['--encoding=UTF8','--locale=C'],onLog:()=>{},onError:()=>{}});
 let db:Database|undefined,started=false;
 try{
  await pg.initialise();await pg.start();started=true;await pg.createDatabase('projecttest');
  db=new Database(`postgresql://postgres:${password}@127.0.0.1:55444/projecttest`);
  await db.pool.query('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN');
  for(const file of ['001_initial.sql','002_roles.sql','004_runtime_limits.sql','009_projects.sql'])await db.pool.query(await readFile(path.join(root,'backend/src/db',file),'utf8'));
  const policy={currency:'KRW',minorDigits:0,maxBudget:'400000',maxPerTransaction:'150000',minimumRemaining:'0',validUntil:'2099-01-01T00:00:00Z',allowedMerchants:[],blockedMerchants:[],blockedBrands:[],minimumReviewScore:null,preferLowerPrice:true,preferHigherReviewScore:false};
  const bundle=path.join(dir,'policies');await mkdir(path.join(bundle,'scope','1'),{recursive:true});await writeFile(path.join(bundle,'scope','1','policy.json'),canonical(policy));
  await db.pool.query("INSERT INTO policy_scopes(id,owner_id,active_version) VALUES('scope','alice',1)");
  await db.pool.query('INSERT INTO policy_versions(scope_id,version,digest,policy) VALUES($1,1,$2,$3)',['scope',digest(policy),policy]);
  await db.pool.query("INSERT INTO balances(owner_id,scope_id,currency,balance) VALUES('alice','scope','KRW',400000)");
  const flow=new Workflow(db,new PolicyCache(bundle),new PythonEvaluator('python',root),new SearchService(undefined,new Set()),bundle,null);
  let planCalls=0;
  const kiln={createChatModel:()=>({invoke:async()=>{planCalls++;return {content:JSON.stringify({items:[
   {name:'USB microphone',searchQuery:'USB microphone for podcasting',rationale:'Captures spoken audio',quantity:1},
   {name:'Headphones',searchQuery:'closed back studio headphones',rationale:'Monitors the audio',quantity:1},
   {name:'Boom arm',searchQuery:'desktop microphone boom arm',rationale:'Positions the microphone',quantity:1}
  ],assemblySteps:['Attach the arm and microphone','Connect headphones and check the recording']})};}})} as unknown as KilnClient;
  const projects=new Projects(flow,kiln);
  const input={scopeId:'scope',topic:'Build a home podcast recording setup',budget:'300000',requestKey:'topic-once'};
  const draft=await projects.create('alice',input);
  assert.equal(draft.items.length,3);assert.equal(planCalls,1);
  assert.equal((await projects.create('alice',input)).id,draft.id);assert.equal(planCalls,1);
  await assert.rejects(()=>projects.get('bob',draft.id),/NOT_FOUND/);
  await assert.rejects(()=>projects.approve('alice',draft.id,{allocations:draft.items.map((i:any)=>({itemId:i.id,amount:'150000'}))}),/PROJECT_BUDGET_EXCEEDED/);
  const approved=await projects.approve('alice',draft.id,{allocations:draft.items.map((i:any)=>({itemId:i.id,amount:'100000'}))});
  assert.equal(approved.state,'APPROVED');
  const first=await projects.startItem('alice',draft.id,draft.items[0].id);
  assert.equal((await projects.startItem('alice',draft.id,draft.items[0].id)).runId,first.runId);
  await assert.rejects(()=>projects.startItem('alice',draft.id,draft.items[1].id),/PROJECT_ITEM_BUSY/);
  await assert.rejects(()=>projects.complete('alice',draft.id),/PROJECT_INCOMPLETE/);
  assert.equal((await projects.get('alice',draft.id)).items[0].run_id,first.runId);
 }finally{
  await db?.close();
  if(started){if(process.platform==='win32')await promisify(execFile)(path.join(root,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),['-D',path.join(dir,'db'),'-m','fast','-w','stop'],{windowsHide:true});else await pg.stop();}
 }
});
