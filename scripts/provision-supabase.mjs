// Explicit, one-time migration using the selected Vercel project's private env.
// Credentials are written only to ignored local deployment state.
import fs from 'node:fs/promises';
import {parse} from 'dotenv';
import {Client} from 'pg';
import {randomBytes} from 'node:crypto';
const env=parse(await fs.readFile('.test-state/vercel-site/.env.production.local','utf8'));
const ca=await fs.readFile('deploy/certs/supabase-ca.crt','utf8');
const base=new URL(env.POSTGRES_URL);base.searchParams.delete('sslmode');
const client=new Client({connectionString:base.href,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
const output='.test-state/supabase-runtime.json';
try{await fs.access(output);throw Error('Already provisioned; do not rotate existing runtime credentials');}catch(e){if(e.code!=='ENOENT')throw e;}
await client.connect();
const credentials={};
try{
 await client.query('BEGIN');
 for(const name of ['001_initial.sql','002_roles.sql','003_supabase.sql','004_runtime_limits.sql'])await client.query(await fs.readFile('backend/src/db/'+name,'utf8'));
 for(const [suffix,key] of [['agent','DATABASE_URL'],['policy_admin','POLICY_DATABASE_URL']]){
  const role='team11_web_'+suffix,password=randomBytes(36).toString('hex');
  await client.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' INHERIT CONNECTION LIMIT 40`);
  await client.query(`GRANT team11_${suffix} TO ${role}`);
  const url=new URL(base);url.username=role+'.'+decodeURIComponent(base.username).split('.').slice(1).join('.');url.password=password;
  credentials[key]=url.href;
 }
 await client.query('COMMIT');
 credentials.INTERNAL_API_SECRET=randomBytes(48).toString('base64url');
 await fs.writeFile(output,JSON.stringify(credentials),{mode:0o600});
 console.log('Supabase schema, immutable triggers, browser isolation and separate runtime roles installed.');
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error({code:e.code,message:e.message});process.exitCode=1;}
finally{await client.end();}
