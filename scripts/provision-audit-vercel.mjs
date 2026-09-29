// One-time migration and least-privilege session-pooler login. Output is ignored local state.
import fs from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {parse} from 'dotenv';
import {Client} from 'pg';

const output='.test-state/audit-runtime.json';
try{await fs.access(output);throw Error('Audit runtime already provisioned');}catch(error){if(error.code!=='ENOENT')throw error;}
const env=parse(await fs.readFile('.test-state/vercel-site/.env.production.local','utf8'));
const ca=await fs.readFile('deploy/certs/supabase-ca.crt','utf8');
const source=new URL(env.POSTGRES_URL_NON_POOLING);
source.searchParams.delete('sslmode');
if(source.port!=='5432')throw Error('Session pooler port 5432 required');
const admin=new Client({connectionString:source.href,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
const role='team11_web_audit',password=randomBytes(36).toString('hex');
try{
 await admin.connect();await admin.query('BEGIN');
 await admin.query(await fs.readFile('backend/src/db/007_audit_checkpoints.sql','utf8'));
 await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' INHERIT CONNECTION LIMIT 40`);
 await admin.query(`GRANT team11_audit TO ${role}`);
 await admin.query('COMMIT');
 const url=new URL(source);
 url.username=role+'.'+decodeURIComponent(source.username).split('.').slice(1).join('.');url.password=password;
 const check=new Client({connectionString:url.href,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
 try{await check.connect();await check.query('SELECT 1 FROM audit_checkpoints LIMIT 0');await check.query('SELECT pg_try_advisory_lock(110012,1)');await check.query('SELECT pg_advisory_unlock(110012,1)');}finally{await check.end();}
 await fs.writeFile(output,JSON.stringify({AUDIT_DATABASE_URL:url.href,AUDIT_TRIGGER_SECRET:randomBytes(48).toString('base64url'),CRON_SECRET:randomBytes(48).toString('base64url'),WALLET_MASTER_KEY:randomBytes(32).toString('hex')}),{mode:0o600});
 console.log('Audit checkpoint migration, session-pooler role and advisory-lock check passed.');
}catch(error){await admin.query('ROLLBACK').catch(()=>{});console.error('Audit provisioning failed:',error.code??error.message);process.exitCode=1;}
finally{await admin.end().catch(()=>{});}
