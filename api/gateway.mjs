import {cloudRuntime} from '../backend/dist/cloud.js';
let runtime;let active=0;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(active>=2){res.statusCode=429;return res.end(JSON.stringify({error:'RATE_LIMITED'}));}
 active++;
 try{
  const url=new URL(req.url,'https://localhost');
  const path=url.searchParams.get('path')??url.pathname.replace(/^\/api\//,'');
  if(!/^[a-zA-Z0-9_/-]{1,300}$/.test(path)||path==='setup'||path.startsWith('policy-edit-sessions')){res.statusCode=404;return res.end('{}');}
  if(!runtime)runtime=cloudRuntime(false).catch(e=>{runtime=null;throw e;});
  const result=await(await runtime).inject({method:req.method,url:'/api/'+path,headers:{authorization:req.headers.authorization??'','content-type':'application/json'},...(req.method==='GET'||req.method==='HEAD'?{}:{payload:req.body??{}})});
  res.statusCode=result.statusCode;
  for(const [k,v]of Object.entries(result.headers))if(v!==undefined)res.setHeader(k,v);
  res.end(result.body);
 }catch{res.statusCode=503;res.end(JSON.stringify({error:'BACKEND_UNAVAILABLE'}));}
 finally{active--;}
}
