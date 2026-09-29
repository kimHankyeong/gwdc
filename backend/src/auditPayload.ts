import { requireThat } from "./errors.js";
const moduleUrl=new URL("../../blockchain/scripts/audit-safety.mjs",import.meta.url).href;
export async function validateAuditPayload(input:any) {
 const {validatePayloads}=await import(moduleUrl);
 try { return validatePayloads(input.policy,input.record); }
 catch { requireThat(false,"AUDIT_UNSUPPORTED"); }
}
