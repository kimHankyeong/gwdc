import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {Wallet} from 'ethers';
import {openWallet,sealWallet,walletMasterKey} from '../src/walletVault.js';

test('hot-wallet ciphertext is bound to one owner and address',()=>{
 const key=walletMasterKey(randomBytes(32).toString('hex'));
 const wallet=Wallet.createRandom();
 const sealed=sealWallet('alice',wallet.privateKey,key);
 assert.equal(sealed.includes(wallet.privateKey),false);
 assert.equal(openWallet('alice',sealed,key,wallet.address),wallet.privateKey);
 assert.throws(()=>openWallet('bob',sealed,key,wallet.address));
 assert.throws(()=>openWallet('alice',sealed,key,Wallet.createRandom().address));
});
