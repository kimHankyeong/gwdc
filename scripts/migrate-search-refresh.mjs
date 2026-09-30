import fs from 'node:fs/promises';
import {parse} from 'dotenv';
import {Client} from 'pg';

const env=parse(await fs.readFile('.test-state/vercel-site/.env.production.local','utf8'));
const ca=await fs.readFile('deploy/certs/supabase-ca.crt','utf8');
const source=new URL(env.POSTGRES_URL_NON_POOLING);
source.searchParams.delete('sslmode');
const admin=new Client({connectionString:source.href,ssl:{ca,rejectUnauthorized:true},connectionTimeoutMillis:15000});
try{
 await admin.connect();
 await admin.query('BEGIN');
 await admin.query(await fs.readFile('backend/src/db/008_search_refresh.sql','utf8'));
 await admin.query('COMMIT');
 console.log('Search refresh privileges installed.');
}catch(error){
 await admin.query('ROLLBACK').catch(()=>{});
 console.error('Search refresh migration failed:',error.code??error.message);
 process.exitCode=1;
}finally{await admin.end().catch(()=>{});}
