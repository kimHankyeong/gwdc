import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Wallet} from 'ethers';
import {openWallet,sealWallet,walletMasterKey} from '../src/walletVault.js';
import {AuditWorker} from '../src/auditWorker.js';
import type {Database} from '../src/db.js';

test('hot-wallet ciphertext is bound to one owner and address',()=>{
 const key=walletMasterKey(randomBytes(32).toString('hex'));
 const wallet=Wallet.createRandom();
 const sealed=sealWallet('alice',wallet.privateKey,key);
 assert.equal(sealed.includes(wallet.privateKey),false);
 assert.equal(openWallet('alice',sealed,key,wallet.address),wallet.privateKey);
 assert.throws(()=>openWallet('bob',sealed,key,wallet.address));
 assert.throws(()=>openWallet('alice',sealed,key,Wallet.createRandom().address));
});

test('relayer mode fails closed without a key or with an unknown mode',()=>{
 const common={TRACK_RPC_URL:'https://rpc.example',TRACK_VERIFY_RPC_URL:'https://verify.example',WALLET_MASTER_KEY:randomBytes(32).toString('hex')};
 assert.equal(new AuditWorker({} as Database,'.',{...common,AUDIT_GAS_MODE:'relayer'}).configured(),false);
 assert.equal(new AuditWorker({} as Database,'.',{...common,AUDIT_GAS_MODE:'unknown',AUDIT_RELAYER_PRIVATE_KEY:Wallet.createRandom().privateKey}).configured(),false);
 assert.equal(new AuditWorker({} as Database,'.',{...common,AUDIT_GAS_MODE:'relayer',AUDIT_RELAYER_PRIVATE_KEY:Wallet.createRandom().privateKey}).configured(),true);
});
