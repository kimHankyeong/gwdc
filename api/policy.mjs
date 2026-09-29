import {cloudRuntime} from '../backend/dist/cloud.js';
let runtime;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const url=new URL(req.url,'https://localhost');
  const path=(url.searchParams.get('path')??'').replace(/\/$/,'');
  if(!(path==='setup'||/^policy-edit-sessions(?:\/[a-zA-Z0-9_-]+(?:\/publish)?)?$/.test(path))){res.statusCode=404;return res.end();}
  if(!runtime)runtime=cloudRuntime(true).catch(e=>{runtime=null;throw e;});
  const result=await(await runtime).inject({method:req.method,url:'/api/'+path,headers:{authorization:req.headers.authorization??'','content-type':'application/json'},...(req.method==='GET'?{}:{payload:req.body??{}})});
  res.statusCode=result.statusCode;
  for(const [k,v]of Object.entries(result.headers))if(v!==undefined)res.setHeader(k,v);
  res.end(result.body);
 }catch{res.statusCode=503;res.end(JSON.stringify({error:'POLICY_ADMIN_UNAVAILABLE'}));}
}
