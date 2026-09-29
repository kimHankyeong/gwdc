import {readFileSync} from 'node:fs';
import {Database} from './db.js';
import {PolicyCache} from './policy.js';
import {PythonEvaluator} from './python.js';
import {SearchService} from './search.js';
import {Workflow} from './workflow.js';
import {Agent} from './agent.js';
import {KilnClient} from './kiln.js';
import {createApp} from './server.js';
import {requireThat} from './errors.js';
import {consumeLimit} from './limits.js';
export async function cloudRuntime(policyAdmin=false){
 const env:NodeJS.ProcessEnv={...process.env,AUTH_MODE:'supabase',POLICY_SERVERLESS:'1',SERVICE_ROLE:policyAdmin?'policy-admin':'agent'};
 const url=policyAdmin?env.POLICY_DATABASE_URL:env.DATABASE_URL;
 requireThat(url&&env.SUPABASE_URL&&env.INTERNAL_API_SECRET&&env.PUBLIC_APP_ORIGIN,'BACKEND_NOT_CONFIGURED',503);
 const ca=readFileSync(new URL('../../deploy/certs/supabase-ca.crt',import.meta.url),'utf8');
 const db=new Database(url,ca);
 const compute=new URL('/api/compute',env.PUBLIC_APP_ORIGIN).href;
 env.SEARCH_API_URL=compute;
 const cache=new PolicyCache('', 'python-v1:tools-v1:prompt-v1:'+env.KILN_MODEL,async(scope,version)=>
  (await db.pool.query('SELECT policy FROM policy_versions WHERE scope_id=$1 AND version=$2',[scope,version])).rows[0]?.policy);
 const flow=new Workflow(db,cache,new PythonEvaluator('','',{url:compute,secret:env.INTERNAL_API_SECRET}),new SearchService(compute,new Set((env.SOURCE_ALLOWED_HOSTS??'').split(',').filter(Boolean)),env.INTERNAL_API_SECRET),'',policyAdmin?db:null,'database');
 if(policyAdmin)await db.pool.query("INSERT INTO service_health(name,state) VALUES('policy-admin','CONFIGURED') ON CONFLICT(name) DO UPDATE SET checked_at=now(),state='CONFIGURED'");
 const app=createApp(flow,new Agent(flow,new KilnClient(env,()=>consumeLimit(db,'kiln:global',50))),env);
 await app.ready();return app;
}
