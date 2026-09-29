// Test identities still use Supabase password authentication. No mailbox is required.
// Preserve existing email accounts; arbitrary identifiers map to a reserved domain.
export async function accountEmail(input:string):Promise<string>{
 const id=input.normalize('NFKC').trim().toLowerCase();
 if(!id||id.length>254||/[\u0000-\u001f\u007f]/.test(id))throw Error('INVALID_ACCOUNT_ID');
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id))return id;
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(id));
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')+'@id.gwdc.invalid';
}
