import {requireThat} from './errors.js';
export async function supabaseOwner(header:string|undefined,env:NodeJS.ProcessEnv):Promise<string>{
 const token=header?.match(/^Bearer ([A-Za-z0-9_.-]{40,4096})$/)?.[1];
 requireThat(token,'UNAUTHORIZED',401);
 const origin=new URL(env.SUPABASE_URL!);
 requireThat(origin.protocol==='https:'&&origin.hostname.endsWith('.supabase.co'),'AUTH_NOT_CONFIGURED',503);
 let response:Response;
 try{response=await fetch(new URL('/auth/v1/user',origin),{headers:{apikey:env.SUPABASE_PUBLISHABLE_KEY??env.SUPABASE_ANON_KEY!,Authorization:'Bearer '+token},redirect:'error',signal:AbortSignal.timeout(8000)});}
 catch{requireThat(false,'AUTH_UNAVAILABLE',503);}
 requireThat(response!.ok,'UNAUTHORIZED',401);
 const user=await response!.json() as any;
 requireThat(typeof user.id==='string'&&/^[a-f0-9-]{36}$/.test(user.id)&&user.email_confirmed_at,'UNAUTHORIZED',401);
 return user.id;
}
