import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {Database} from './db.js';
import {AuditWorker} from './auditWorker.js';
import {requireThat} from './errors.js';

export async function cloudAuditRuntime(){
 const env:NodeJS.ProcessEnv={...process.env,AUDIT_CHECKPOINT_MODE:'database',AUDIT_GAS_MODE:'relayer'};
 requireThat(env.AUDIT_DATABASE_URL&&env.AUDIT_RELAYER_PRIVATE_KEY&&env.WALLET_MASTER_KEY&&env.TRACK_RPC_URL&&env.TRACK_VERIFY_RPC_URL,'AUDIT_NOT_READY',503);
 const url=new URL(env.AUDIT_DATABASE_URL);
 requireThat(['postgres:','postgresql:'].includes(url.protocol)&&url.port==='5432','AUDIT_SESSION_DATABASE_REQUIRED',503);
 const ca=readFileSync(new URL('../../deploy/certs/supabase-ca.crt',import.meta.url),'utf8');
 const db=new Database(env.AUDIT_DATABASE_URL,ca);
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const worker=new AuditWorker(db,root,env);
 return {async ready(){await worker.readiness();return !!(await db.pool.query("SELECT 1 FROM service_health WHERE name='audit-relayer' AND state='VERIFIED' AND checked_at>now()-interval '60 seconds'")).rowCount;},
  async tick(requestId?:string){await worker.readiness();return worker.tick(requestId);}};
}
