import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {Wallet} from 'ethers';
import {requireThat} from './errors.js';

export function walletMasterKey(raw?:string):Buffer {
 requireThat(!!raw&&/^[a-fA-F0-9]{64}$/.test(raw),'WALLET_VAULT_NOT_CONFIGURED');
 return Buffer.from(raw,'hex');
}
export function sealWallet(owner:string,privateKey:string,key:Buffer):string {
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 cipher.setAAD(Buffer.from(owner,'utf8'));
 const encrypted=Buffer.concat([cipher.update(privateKey,'utf8'),cipher.final()]);
 return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}
export function openWallet(owner:string,blob:string,key:Buffer,address:string):string {
 const parts=blob.split('.');requireThat(parts.length===4&&parts[0]==='v1','WALLET_VAULT_INVALID');
 const dec=createDecipheriv('aes-256-gcm',key,Buffer.from(parts[1],'base64url'));
 dec.setAAD(Buffer.from(owner,'utf8'));dec.setAuthTag(Buffer.from(parts[2],'base64url'));
 let privateKey:string;try{privateKey=Buffer.concat([dec.update(Buffer.from(parts[3],'base64url')),dec.final()]).toString('utf8');}
 catch{throw Error('WALLET_VAULT_INVALID');}
 requireThat(new Wallet(privateKey).address.toLowerCase()===address.toLowerCase(),'WALLET_ADDRESS_MISMATCH');
 return privateKey;
}
