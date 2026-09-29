// Runs the real launcher against isolated DB roles/ports, never production data.
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {randomBytes,createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import assert from 'node:assert/strict';
import EmbeddedPostgres from 'embedded-postgres';
import {Database} from '../src/db.js';
const root=path.resolve(import.meta.dirname,'../..');await mkdir(path.join(root,'.test-state'),{recursive:true});
const dir=await mkdtemp(path.join(root,'.test-state/turnkey-')),password=randomBytes(24).toString('hex');
const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'db'),user:'postgres',password,port:55442,persistent:true,createPostgresUser:false,initdbFlags:['--encoding=UTF8','--locale=C'],postgresFlags:['-h','127.0.0.1'],onLog:()=>{},onError:()=>{}});
let db:Database|undefined,child:ReturnType<typeof spawn>|undefined,started=false,pass=false;
try{
 await pg.initialise();await pg.start();started=true;await pg.createDatabase('turnkey');
 db=new Database(`postgresql://postgres:${password}@127.0.0.1:55442/turnkey`);
 for(const file of ['001_initial.sql','002_roles.sql'])await db.pool.query(await readFile(path.join(root,'backend/src/db',file),'utf8'));
 for(const [name,role]of [['qa_agent','team11_agent'],['qa_policy','team11_policy_admin']])await db.pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE ${role}`);
 child=spawn(process.execPath,['scripts/dev-all.mjs'],{cwd:root,windowsHide:true,env:{...process.env,DATABASE_URL:`postgresql://qa_agent:${password}@127.0.0.1:55442/turnkey`,DATABASE_POLICY_URL:`postgresql://qa_policy:${password}@127.0.0.1:55442/turnkey`,DEV_PORT_BASE:'55600',AUTH_TOKEN_HASHES:JSON.stringify({qa:createHash('sha256').update(randomBytes(32)).digest('hex')}),KILN_API_KEY:'qa-no-network-key',KILN_MODEL:'qa-no-network',AUTH_MODE:'',TRACK_CHAIN_PRIVATE_KEY:''},stdio:['ignore','pipe','pipe']});
 await new Promise<void>((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('TURNKEY_TIMEOUT')),60000);child!.stdout!.on('data',b=>{output+=b.toString();if(output.includes('전체 개발 서비스 준비')){clearTimeout(timer);resolve();}});child!.stderr!.resume();child!.on('exit',code=>{clearTimeout(timer);reject(Error('TURNKEY_EXIT_'+code));});child!.on('error',reject);});
 for(const url of ['http://127.0.0.1:55602/health','http://127.0.0.1:55600/api/health','http://127.0.0.1:55601/api/health','http://127.0.0.1:55603','http://127.0.0.1:55603/api/health'])assert.equal((await fetch(url)).status,200,url);
 assert.equal((await fetch('http://127.0.0.1:55603/api/scopes')).status,401);pass=true;
}finally{
 if(child?.pid){if(process.platform==='win32')await promisify(execFile)('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true}).catch(()=>{});else child.kill('SIGTERM');}
 if(db)await db.close();
 if(started){if(process.platform==='win32')await promisify(execFile)(path.join(root,'node_modules/@embedded-postgres/windows-x64/native/bin/pg_ctl.exe'),['-D',path.join(dir,'db'),'-m','fast','-w','stop'],{windowsHide:true});else await pg.stop();}
 await writeFile(path.join(root,'docs/qa/turnkey-results.json'),JSON.stringify({at:new Date().toISOString(),pass,environment:'isolated PostgreSQL 55442; app ports55600-55603',checks:['search/API/policy/UI health','Vite API proxy','unauthenticated request rejected'],kiln:'not called',audit:'not configured'},null,2)+'\n');
}
console.log('Turnkey isolated startup: PASS');
