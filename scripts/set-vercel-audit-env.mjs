// Run with TEST_SIGNER in process memory. Never passes secret values as CLI args.
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
const runtime=JSON.parse(await fs.readFile('.test-state/audit-runtime.json','utf8'));
const network=parse(await fs.readFile('blockchain/.env.sepolia','utf8'));
const values={...runtime,TRACK_RPC_URL:network.TRACK_RPC_URL,TRACK_VERIFY_RPC_URL:network.TRACK_VERIFY_RPC_URL,AUDIT_RELAYER_PRIVATE_KEY:process.env.TEST_SIGNER};
if(Object.values(values).some(value=>!value))throw Error('AUDIT_SECRETS_INCOMPLETE');
for(const [name,value] of Object.entries(values)){
 const result=spawnSync('vercel',['env','add',name,'production','--sensitive','--yes','--cwd','.test-state/vercel-site'],{input:value+'\n',encoding:'utf8',shell:process.platform==='win32',windowsHide:true,timeout:60000});
 if(result.status!==0)throw Error(`VERCEL_ENV_FAILED:${name}:${result.status}`);
 console.log(`${name}: configured`);
}
