import test from "node:test";
import assert from "node:assert/strict";
import { publicAddress,parseProduct,safeHttp,SearchService } from "../src/search.js";
import {sourceMerchant} from "../src/workflow.js";
test("Seller display names cannot impersonate an allowed merchant",()=>{
 const fields=parseProduct('<script type="application/ld+json">{"@type":"Product","offers":{"seller":{"name":"trusted.example"}}}</script>');
 assert.equal(sourceMerchant({url:'https://attacker.example',fields}),null);
});
test("Malformed search responses fail; a documented empty response remains empty",async()=>{
 const fetchOriginal=globalThis.fetch;
 try {
  globalThis.fetch=async()=>new Response('{}',{status:200});
  await assert.rejects(()=>new SearchService('http://127.0.0.1:4479',new Set()).search('test'),/SEARCH_INVALID_RESPONSE/);
  globalThis.fetch=async()=>new Response(JSON.stringify({provider:'ddgs',backend:'duckduckgo',results:[]}),{status:200});
  assert.deepEqual(await new SearchService('http://127.0.0.1:4479',new Set()).search('test'),[]);
 }finally{globalThis.fetch=fetchOriginal;}
});
import { KilnClient } from "../src/kiln.js";
import { policySchema } from "../src/schema.js";
import { toolDefinitions } from "../src/tools.js";
import { validateAuditPayload } from "../src/auditPayload.js";
test("Original audit validator rejects unsupported or inconsistent inputs before execution",async()=>{
 const salt="0x"+"1".repeat(64);
 const p={version:1,maxBudget:1000,reviewRequired:false,reviewMinimum:0,reviewRatingMinimum:0,salt};
 const r={quantity:2,unitPrice:100,shipping:10,total:210,currency:"KRW",salt};
 const normalized=await validateAuditPayload({policy:p,record:r});
 assert.deepEqual(Object.keys(normalized.record),["quantity","unitPrice","shipping","total","currency","salt"]);
 for(const record of [{...r,total:209},{...r,currency:"USD"},{...r,extra:true},{...r,salt:"0x"+"0".repeat(64)}])
  await assert.rejects(()=>validateAuditPayload({policy:p,record}),/AUDIT_UNSUPPORTED/);
 await assert.rejects(()=>validateAuditPayload({policy:{...p,reviewRequired:true},record:r}),/AUDIT_UNSUPPORTED/);
});
test("SSRF: local, metadata, mapped IPv6 and redirects cannot start as trusted sources",async()=>{
 for(const address of ["127.0.0.1","10.0.0.1","169.254.169.254","::1","::ffff:127.0.0.1","fc00::1","0.0.0.0"])assert.equal(publicAddress(address),false,address);
 assert.equal(publicAddress("8.8.8.8"),true);
 await assert.rejects(()=>safeHttp("file:///etc/passwd",new Set()),/SOURCE_NOT_ALLOWED/);
 await assert.rejects(()=>safeHttp("https://user:secret@example.com",new Set(["example.com"])),/SOURCE_NOT_ALLOWED/);
});
test("HTML extraction does not fabricate missing price, shipping or reviews",()=>{
 assert.equal(parseProduct("<script>document.write('price')</script>"),null);
 const p=parseProduct('<script type="application/ld+json">{"@type":"Product","name":"A"}</script>');
 assert.equal(p?.observedPrice,null);assert.equal(p?.rating,null);
 assert.equal(parseProduct('<script type="application/ld+json">[{"@type":"Product"},{"@type":"Product"}]</script>'),null);
 const priced=parseProduct('<script type="application/ld+json">{"@type":"Product","name":"A","offers":{"price":"12000","priceCurrency":"KRW","shippingDetails":{"shippingRate":{"value":"0","currency":"KRW"}}}}</script>');
 assert.equal(priced?.observedPrice,'12000');assert.equal(priced?.observedShipping,'0');
});
test("General web pages never enter product search results",async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(JSON.stringify({provider:'ddgs',backend:'duckduckgo',results:[{title:'Wikipedia',href:'https://en.wikipedia.org/wiki/Product'}]}));
  assert.deepEqual(await new SearchService('http://127.0.0.1:4479',new Set(['shop.example'])).search('상품'),[]);
 }finally{globalThis.fetch=original;}
});
test("No missing Kiln key or provider cache guarantee falls back to a fake response",async()=>{
 await assert.rejects(()=>new KilnClient({}).generate("policy",[]),/KILN_NOT_CONFIGURED/);
 await assert.rejects(()=>new KilnClient({KILN_API_KEY:"test",KILN_MODEL:"test",REQUIRE_PROVIDER_HIT:"true"}).generate("policy",[]),/UNSUPPORTED_PROVIDER_HIT_GUARANTEE/);
});
test("Only nine declared tools; no policy writer or approval tool",()=>{
 assert.equal(toolDefinitions.length,9);
 for(const d of toolDefinitions)assert.equal(d.function.parameters.additionalProperties,false);
 assert.equal(toolDefinitions.some(t=>/publish|approve|shell|fetch_url/.test(t.function.name)),false);
});
test("Unknown policy rules and invalid currency fail closed",()=>{
 const p={currency:"KRW",minorDigits:0,maxBudget:"1000",maxPerTransaction:"100",minimumRemaining:"0",validUntil:"2099-01-01T00:00:00Z",allowedMerchants:[],blockedMerchants:[],blockedBrands:[],minimumReviewScore:null,preferLowerPrice:true,preferHigherReviewScore:false};
 assert.equal(policySchema.safeParse(p).success,true);
 assert.equal(policySchema.safeParse({...p,currency:"ZZZ"}).success,false);
 assert.equal(policySchema.safeParse({...p,minorDigits:2}).success,false);
 assert.equal(policySchema.safeParse({...p,ignorePolicy:true}).success,false);
});

test("Search cursors bind query and run context",async()=>{
 const original=globalThis.fetch;const offsets:string[]=[];
 try{
  globalThis.fetch=async(_url,init)=>{offsets.push(String(JSON.parse(String(init?.body)).page));return new Response(JSON.stringify({provider:'ddgs',backend:'duckduckgo',results:Array.from({length:10},(_,i)=>({title:'item '+i,href:'https://example.com/'+i}))}));};
  const service=new SearchService('http://127.0.0.1:4479',new Set());const page=await service.searchPage('test','owner:run:1');
  assert.ok(page.nextCursor);
  await assert.rejects(()=>service.searchPage('test','other-run',page.nextCursor!),/SEARCH_CURSOR_INVALID/);
  await assert.rejects(()=>service.searchPage('changed','owner:run:1',page.nextCursor!),/SEARCH_CURSOR_INVALID/);
  await service.searchPage('test','owner:run:1',page.nextCursor!);assert.deepEqual(offsets,['1','2']);
 }finally{globalThis.fetch=original;}
});

test("Search endpoint is loopback-only and provider identity cannot switch to Brave",async()=>{
 await assert.rejects(()=>new SearchService('https://example.com',new Set()).search('test'),/SEARCH_ENDPOINT_INVALID/);
 const original=globalThis.fetch;try{
  globalThis.fetch=async()=>new Response(JSON.stringify({provider:'ddgs',backend:'brave',results:[]}));
  await assert.rejects(()=>new SearchService('http://127.0.0.1:4479',new Set()).search('test'),/SEARCH_INVALID_RESPONSE/);
 }finally{globalThis.fetch=original;}
});
