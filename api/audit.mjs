import {createHash,timingSafeEqual} from 'node:crypto';
import {cloudAuditRuntime} from '../backend/dist/cloudAudit.js';
let runtime;
function authorized(value,secret){
 if(typeof value!=='string'||typeof secret!=='string'||secret.length<32)return false;
 const a=createHash('sha256').update(value).digest(),b=createHash('sha256').update('Bearer '+secret).digest();
 return timingSafeEqual(a,b);
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const secret=req.method==='GET'?process.env.CRON_SECRET:process.env.AUDIT_TRIGGER_SECRET;
 if(!authorized(req.headers.authorization,secret)){res.statusCode=401;return res.end('{"error":"UNAUTHORIZED"}');}
 if(req.method!=='POST'&&req.method!=='GET'){res.statusCode=405;return res.end('{"error":"METHOD_NOT_ALLOWED"}');}
 const action=req.method==='GET'?'tick':req.body?.action;
 const requestId=req.method==='GET'?undefined:req.body?.requestId;
 if(!['ready','tick'].includes(action)||requestId!==undefined&&(typeof requestId!=='string'||!/^[a-z0-9_-]{1,80}$/.test(requestId))){res.statusCode=400;return res.end('{"error":"INVALID_INPUT"}');}
 try{
  if(!runtime)runtime=cloudAuditRuntime().catch(e=>{runtime=null;throw e;});
  const worker=await runtime;
  const result=action==='ready'?{ready:await worker.ready()}:{processed:await worker.tick(requestId)};
  res.statusCode=200;res.end(JSON.stringify(result));
 }catch{res.statusCode=503;res.end('{"error":"AUDIT_UNAVAILABLE"}');}
}
