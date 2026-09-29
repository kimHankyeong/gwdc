import assert from 'node:assert/strict';
import vm from 'node:vm';
import {writeFile} from 'node:fs/promises';
const origin='https://gwdc-team11.vercel.app';
const read=async path=>{const r=await fetch(origin+path,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,path);return r;};
const manifest=await (await read('/manifest.webmanifest')).json();
assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'/');
for(const icon of manifest.icons){const bytes=Buffer.from(await (await read(icon.src)).arrayBuffer());assert.equal(bytes.readUInt32BE(16),Number(icon.sizes.split('x')[0]));assert.equal(bytes.readUInt32BE(20),Number(icon.sizes.split('x')[1]));}
const handlers={},cached=[];
const worker=await (await read('/sw.js')).text();
const fallback=await (await read('/offline.html')).text();assert.ok(fallback.includes('주문이 전송되지 않습니다'));
vm.runInNewContext(worker,{URL,self:{location:{origin},clients:{claim:async()=>{}},addEventListener:(name,fn)=>{handlers[name]=fn;}},caches:{open:async()=>({add:async path=>cached.push(path)}),keys:async()=>[],match:async path=>path,delete:async()=>true},fetch:async()=>{throw Error('offline');}});
let wait;handlers.install({waitUntil:p=>wait=p});await wait;assert.deepEqual(cached,['/offline.html']);
for(const [method,path,mode] of [['POST','/api/agent/runs','cors'],['GET','/api/scopes','navigate'],['GET','/login','navigate']]){
 let response;handlers.fetch({request:{method,url:origin+path,mode},respondWith:p=>{response=p;}});
 if(path==='/login')assert.equal(await response,'/offline.html');else assert.equal(response,undefined);
}
const result={at:new Date().toISOString(),origin,manifest:'PASS',pngIcons:'PASS',offlineFallback:'PASS',privateDataCaching:'NONE',writeReplay:'NONE',deviceInstallation:'NOT_TESTED'};
await writeFile(new URL('../docs/qa/pwa-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(result);
