import { Database } from './db.js';
import { requireThat } from './errors.js';

// A claimed audit job is the fence for every durable write. Broadcast may only
// follow a successful saveCheckpoint; an expired/stale worker cannot save.
export class AuditStore {
 constructor(private db:Database,private requestId:string,private fence:number) {}
 async loadCheckpoint(){
  const r=await this.db.pool.query('SELECT checkpoint_text FROM audit_checkpoints WHERE request_id=$1',[this.requestId]);
  return r.rows[0]?.checkpoint_text?JSON.parse(r.rows[0].checkpoint_text):null;
 }
 async hasReport(){
  const r=await this.db.pool.query('SELECT report_text IS NOT NULL AS exists FROM audit_checkpoints WHERE request_id=$1',[this.requestId]);
  return r.rows[0]?.exists===true;
 }
 async saveCheckpoint(value:unknown){await this.write('checkpoint_text',value);}
 async saveReport(value:unknown){await this.write('report_text',value);}
 private async write(column:'checkpoint_text'|'report_text',value:unknown){
  const saved=await this.db.pool.query(`INSERT INTO audit_checkpoints(request_id,${column},fence)
   SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM audit_jobs WHERE request_id=$1 AND fence=$3 AND lease_until>now())
   ON CONFLICT(request_id) DO UPDATE SET ${column}=EXCLUDED.${column},fence=EXCLUDED.fence,updated_at=now()
   WHERE audit_checkpoints.fence<=EXCLUDED.fence RETURNING request_id`,[this.requestId,JSON.stringify(value),this.fence]);
  requireThat(saved.rowCount===1,'AUDIT_CHECKPOINT_STALE');
 }
}
