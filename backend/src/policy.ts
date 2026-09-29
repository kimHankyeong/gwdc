import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { policySchema, type Policy } from "./schema.js";
import { AppError, requireThat } from "./errors.js";
export function canonical(value: any): string {
  if (Array.isArray(value)) return "["+value.map(canonical).join(",")+"]";
  if (value && typeof value==="object") return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
  return JSON.stringify(value);
}
export const digest=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
export class PolicyCache {
 private entries=new Map<string,Readonly<{policy:Policy;text:string;digest:string}>>();
 constructor(private root:string,private profile="python-v1:tools-v1:prompt-v1",
  private reader?: (scope:string,version:number)=>Promise<unknown>) {}
 async load(scope:string,version:number,trustedDigest:string) {
  requireThat(/^[\w-]+$/.test(scope)&&Number.isSafeInteger(version),"INVALID_POLICY_REFERENCE");
  const key=this.profile+":"+scope+":"+version+":"+trustedDigest;
  if(this.entries.has(key)) return this.entries.get(key)!;
  const file=path.resolve(this.root,scope,String(version),"policy.json");
  let parsed:Policy;
  try { parsed=policySchema.parse(this.reader?await this.reader(scope,version):JSON.parse(await readFile(file,"utf8"))); }
  catch {throw new AppError("POLICY_NOT_READY");}
  requireThat(digest(parsed)===trustedDigest,"POLICY_NOT_READY");
  const text=canonical(parsed);
  const entry=Object.freeze({policy:deepFreeze(parsed),text,digest:trustedDigest});
  if(this.entries.size>=1024)this.entries.delete(this.entries.keys().next().value!);
  this.entries.set(key,entry);return entry;
 }
 require(scope:string,version:number,hash:string) {
  const entry=this.entries.get(this.profile+":"+scope+":"+version+":"+hash);
  requireThat(entry&&digest(entry.policy)===hash,"POLICY_NOT_READY");return entry;
 }
}
function deepFreeze<T>(o:T):T { if(o&&typeof o==="object"){Object.freeze(o);Object.values(o).forEach(deepFreeze);}return o; }
