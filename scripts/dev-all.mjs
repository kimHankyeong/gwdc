// Explicit local development only; never migrates DBs or creates default credentials.
import {spawn,execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createServer} from 'node:net';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const parsed=dotenv.config({path:path.join(root,'.env'),quiet:true});
if(parsed.error){console.error('.env가 없습니다. .env.example을 복사하고 실제 연결값을 설정하세요.');process.exit(1);}
const env={...process.env},missing=['DATABASE_URL','DATABASE_POLICY_URL','KILN_API_KEY','KILN_MODEL'].filter(k=>!env[k]||env[k].includes('SET_PASSWORD'));
if(!env.AUTH_TOKEN_HASHES||env.AUTH_TOKEN_HASHES==='{}')missing.push('AUTH_TOKEN_HASHES');
if(missing.length){console.error('필수 설정 누락: '+missing.join(', '));process.exit(1);}
if(env.DATABASE_URL===env.DATABASE_POLICY_URL){console.error('거래·정책 발행 DB 계정은 분리해야 합니다.');process.exit(1);}
const python=path.join(root,'.venv-search',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!existsSync(python)){console.error('검색 의존성 준비: python -m venv .venv-search 후 해당 Python으로 pip install -r search_service/requirements-lock.txt');process.exit(1);}
const base=env.DEV_PORT_BASE?Number(env.DEV_PORT_BASE):null;
if(base!==null&&(!Number.isSafeInteger(base)||base<1024||base>65531)){console.error('DEV_PORT_BASE 범위: 1024–65531');process.exit(1);}
const ports=base===null?{agent:4174,policy:4175,search:4479,ui:5173}:{agent:base,policy:base+1,search:base+2,ui:base+3};
for(const port of Object.values(ports))await new Promise((resolve,reject)=>{const server=createServer();server.once('error',()=>reject(Error('이미 사용 중인 포트: '+port)));server.listen(port,'127.0.0.1',()=>server.close(resolve));}).catch(error=>{console.error(error.message);process.exit(1);});
if(process.argv.includes('--check')){console.log('로컬 설정·실행 파일·포트 검사 통과. DB 권한/연결은 실행 시 확인합니다.');process.exit(0);}
const children=[];let closing=false;
function stop(code=0){if(closing)return;closing=true;for(const child of children){if(!child.pid)continue;if(process.platform==='win32')execFile('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{});else child.kill('SIGTERM');}process.exitCode=code;}
function launch(name,command,args,extra={},cwd=root){const child=spawn(command,args,{cwd,env:{...env,...extra},stdio:['ignore','inherit','inherit'],windowsHide:true});children.push(child);child.on('error',()=>{console.error(name+' 실행 실패');stop(1);});child.on('exit',code=>{if(!closing){console.error(name+' 종료: '+code);stop(code||1);}});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>stop());
launch('검색',python,['-m','uvicorn','search_service.app:app','--host','127.0.0.1','--port',String(ports.search),'--no-access-log']);
const common={SEARCH_API_URL:'http://127.0.0.1:'+ports.search,HOST:'127.0.0.1'};
launch('거래 API',process.execPath,['--import','tsx','backend/src/server.ts'],{...common,SERVICE_ROLE:'agent',PORT:String(ports.agent)});
launch('정책 API',process.execPath,['--import','tsx','backend/src/server.ts'],{...common,SERVICE_ROLE:'policy-admin',PORT:String(ports.policy),DATABASE_URL:env.DATABASE_POLICY_URL});
launch('화면',process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(ports.ui),'--strictPort'],{DEV_AGENT_PORT:String(ports.agent),DEV_POLICY_PORT:String(ports.policy)},path.join(root,'frontend'));
try{
 const deadline=Date.now()+45000;
 const urls=[`http://127.0.0.1:${ports.search}/health`,`http://127.0.0.1:${ports.agent}/api/health`,`http://127.0.0.1:${ports.policy}/api/health`,`http://127.0.0.1:${ports.ui}`];
 while(!closing){const ready=await Promise.all(urls.map(async url=>{try{return (await fetch(url,{signal:AbortSignal.timeout(1500)})).ok;}catch{return false;}}));if(ready.every(Boolean)){console.log(`전체 개발 서비스 준비: http://127.0.0.1:${ports.ui} — 종료 Ctrl+C. 감사 signer는 별도 보안 호스트에서 실행하세요.`);break;}if(Date.now()>deadline)throw Error('서비스 준비 시간 초과. DB 마이그레이션·연결 설정을 확인하세요.');await new Promise(resolve=>setTimeout(resolve,1000));}
}catch(error){console.error(error.message);stop(1);}
