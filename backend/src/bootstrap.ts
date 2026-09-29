import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { readFile,mkdir,writeFile } from "node:fs/promises";
import path from "node:path";
import { Database } from "./db.js";
import { policySchema,money,id } from "./schema.js";
import { canonical,digest } from "./policy.js";
const projectRoot=fileURLToPath(new URL("../../",import.meta.url));
config({path:path.join(projectRoot,".env"),quiet:true});
const [owner,scope,policyFile,initialBalance]=process.argv.slice(2);
id.parse(owner);id.parse(scope);money.parse(initialBalance);
if(!policyFile||!process.env.DATABASE_POLICY_URL)throw Error("Provide owner scope policy-json initial-balance; DATABASE_POLICY_URL required");
const policy=policySchema.parse(JSON.parse(await readFile(policyFile,"utf8")));
const root=path.resolve(projectRoot,process.env.POLICY_BUNDLE_ROOT??"policies"),dir=path.join(root,scope,"1");
const db=new Database(process.env.DATABASE_POLICY_URL);
try{
 await db.tx(async c=>{
  await c.query("INSERT INTO policy_scopes(id,owner_id,active_version) VALUES($1,$2,1)",[scope,owner]);
  await mkdir(dir,{recursive:true});await writeFile(path.join(dir,"policy.json"),canonical(policy),{flag:"wx",mode:0o444});
  await c.query("INSERT INTO policy_versions(scope_id,version,digest,policy) VALUES($1,1,$2,$3)",[scope,digest(policy),policy]);
  await c.query("INSERT INTO balances(owner_id,scope_id,currency,balance) VALUES($1,$2,$3,$4)",[owner,scope,policy.currency,initialBalance]);
 });console.log("Policy and SIMULATION balance provisioned.");
}finally{await db.close();}
