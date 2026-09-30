// Run explicitly before deploying the projects feature.
import fs from 'node:fs/promises';
import {parse} from 'dotenv';
import {Client} from 'pg';

const env=parse(await fs.readFile('.test-state/vercel-site/.env.production.local','utf8'));
const ca=await fs.readFile('deploy/certs/supabase-ca.crt','utf8');
const url=new URL(env.POSTGRES_URL_NON_POOLING);url.searchParams.delete('sslmode');
const client=new Client({connectionString:url.href,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{
 await client.connect();await client.query('BEGIN');
 await client.query(await fs.readFile('backend/src/db/009_projects.sql','utf8'));
 await client.query('COMMIT');console.log('Project schema installed.');
}catch(error){await client.query('ROLLBACK').catch(()=>{});console.error('Project migration failed:',error.code??error.message);process.exitCode=1;}
finally{await client.end().catch(()=>{});}
