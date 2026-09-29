import {Database} from './db.js';
import {requireThat} from './errors.js';
export async function consumeLimit(db:Database,key:string,limit:number){
 const result=await db.pool.query(`INSERT INTO runtime_limits(key,window_started,count) VALUES($1,date_trunc('minute',now()),1)
 ON CONFLICT(key) DO UPDATE SET window_started=EXCLUDED.window_started,
 count=CASE WHEN runtime_limits.window_started=EXCLUDED.window_started THEN LEAST(runtime_limits.count+1,1000000) ELSE 1 END RETURNING count`,[key]);
 requireThat(result.rows[0].count<=limit,'RATE_LIMITED',429);
}
