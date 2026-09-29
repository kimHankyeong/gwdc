import test from "node:test";
import assert from "node:assert/strict";
import { publicAddress,parseProduct,safeHttp } from "../src/search.js";
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
