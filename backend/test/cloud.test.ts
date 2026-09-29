import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseOwner} from '../src/auth.js';
import {PolicyCache,digest} from '../src/policy.js';
test('Supabase identity is verified by the configured Auth service, never trusted from JWT text',async()=>{
 const old=globalThis.fetch;
 try{
  const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'public-test-key'};
  let calls=0;
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(String(url),'https://test.supabase.co/auth/v1/user');assert.equal(options?.redirect,'error');return new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111',email_confirmed_at:'2026-01-01'}));};
  assert.equal(await supabaseOwner('Bearer '+'a'.repeat(80),env),'11111111-1111-4111-8111-111111111111');
  await assert.rejects(()=>supabaseOwner('Bearer invalid',env),/UNAUTHORIZED/);assert.equal(calls,1);
  globalThis.fetch=async()=>new Response('{}',{status:401});
  await assert.rejects(()=>supabaseOwner('Bearer '+'a'.repeat(80),env),/UNAUTHORIZED/);
  globalThis.fetch=async()=>new Response(JSON.stringify({id:'11111111-1111-4111-8111-111111111111'}));
  await assert.rejects(()=>supabaseOwner('Bearer '+'a'.repeat(80),env),/UNAUTHORIZED/);
 }finally{globalThis.fetch=old;}
});
test('DB policy reads remain digest verified, cached by version and deeply read-only',async()=>{
 const policy={currency:'KRW',minorDigits:0,maxBudget:'100',maxPerTransaction:'10',minimumRemaining:'0',validUntil:'2099-01-01T00:00:00Z',allowedMerchants:[],blockedMerchants:[],blockedBrands:[],minimumReviewScore:null,preferLowerPrice:true,preferHigherReviewScore:false};
 let reads=0;
 const cache=new PolicyCache('','test',async()=>{reads++;return structuredClone(policy);});
 const a=await cache.load('scope',1,digest(policy));
 assert.equal(a,await cache.load('scope',1,digest(policy)));assert.equal(reads,1);
 assert.throws(()=>a.policy.allowedMerchants.push('attacker'));
 await assert.rejects(()=>cache.load('scope',2,'0'.repeat(64)),/POLICY_NOT_READY/);
});
