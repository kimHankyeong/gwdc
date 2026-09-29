import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Wallet, keccak256, parseEther } from 'ethers';
import { CHAIN_ID, hashPayload, validatePayloads, validateCheckpoint, validateSigned, validateCost, acquireLock, atomicJson, pendingStatus, verifyInclusion, retryRpc } from './audit-safety.mjs';

const salt = '0x' + '12'.repeat(32);
const policy = {version:1,maxBudget:1000,reviewRequired:false,reviewMinimum:0,reviewRatingMinimum:0,salt};
const record = {quantity:1,unitPrice:100,shipping:0,total:100,currency:'KRW',salt};

test('payload validation rejects invalid totals, budget, unsafe amounts, unknown fields and unverified reviews', () => {
  validatePayloads(policy,record);
  for (const change of [{total:99},{quantity:-1},{unitPrice:Number.MAX_SAFE_INTEGER+1},{currency:'USD'},{name:'private data'}]) {
    assert.throws(() => validatePayloads(policy,{...record,...change}));
  }
  assert.throws(() => validatePayloads({...policy,maxBudget:99},record));
  assert.throws(() => validatePayloads({...policy,reviewRequired:true},record));
  const reversed = Object.fromEntries(Object.entries(record).reverse());
  assert.equal(hashPayload(validatePayloads(policy,reversed).record),hashPayload(record));
});

test('checkpoint does not silently accept changed payload, request, wallet or code', () => {
  const state = {version:2,chainId:CHAIN_ID.toString(),signer:'signer',requestId:'request',bytecodeHash:'code',purchaseId:salt,policy,record,policyHash:hashPayload(policy),recordHash:hashPayload(record)};
  validateCheckpoint(state,'signer','request','code');
  assert.throws(() => validateCheckpoint({...state,record:{...record,unitPrice:200,total:200}},'signer','request','code'));
  for (const args of [['other','request','code'],['signer','other','code'],['signer','request','other']]) {
    assert.throws(() => validateCheckpoint(state,...args));
  }
});

test('signed transaction rejects foreign signer, chain, destination, data, value, nonce and excessive fees', async () => {
  const wallet = Wallet.createRandom();
  const other = Wallet.createRandom();
  const expected = {to:other.address,data:'0x1234'};
  const transaction = {...expected,chainId:CHAIN_ID,nonce:0,value:0n,gasLimit:50000n,gasPrice:1000000000n,type:0};
  async function saved(changes={},signer=wallet) {
    const raw = await signer.signTransaction({...transaction,...changes});
    return {raw,txHash:keccak256(raw),nonce:0};
  }
  validateSigned(await saved(),expected,wallet.address);
  for (const change of [{chainId:1n},{to:wallet.address},{data:'0xabcd'},{value:1n},{nonce:1},{gasPrice:parseEther('1')}]) {

    const checkpoint = await saved(change);
    assert.throws(() => validateSigned(checkpoint,expected,wallet.address));
  }
  const foreign = await saved({},other);
  assert.throws(() => validateSigned(foreign,expected,wallet.address));
  assert.throws(() => validateCost({gasLimit:21000n,gasPrice:parseEther('1')}));
});

test('200 overlapping lock attempts admit only one; atomic JSON retains a readable backup', async () => {
  const dir = mkdtempSync(path.join(tmpdir(),'audit-test-'));
  try {
    const attempts = await Promise.allSettled(Array.from({length:200},async () => acquireLock('wallet',dir)));
    const winners = attempts.filter(result => result.status === 'fulfilled');
    assert.equal(winners.length,1);
    winners[0].value();
    acquireLock('wallet',dir)();
    const file = path.join(dir,'checkpoint.json');
    atomicJson(file,{version:1});
    atomicJson(file,{version:2});
    assert.deepEqual(JSON.parse(readFileSync(file,'utf8')),{version:2});
    assert.deepEqual(JSON.parse(readFileSync(file+'.bak','utf8')),{version:1});
  } finally { rmSync(dir,{recursive:true,force:true}); }
});

test('pending status identifies consumed nonce and potential replacements without rebroadcast', async () => {
  const tx = {from:'wallet',nonce:1};
  const provider = (latest,pending,known) => ({getTransactionCount:async (_,tag)=>tag==='latest'?latest:pending,getTransaction:async()=>known});
  assert.equal(await pendingStatus(provider(2,2,null),tx,'hash'),'nonce-consumed-or-replaced');
  assert.equal(await pendingStatus(provider(1,2,null),tx,'hash'),'possible-replacement');
  assert.equal(await pendingStatus(provider(1,2,{}),tx,'hash'),'pending');
  assert.equal(await pendingStatus(provider(1,1,null),tx,'hash'),'not-seen');
});

test('receipt distinguishes inclusion from finality and rejects orphaned or reverted receipts', async () => {
  const receipt = {status:1,blockNumber:10,blockHash:'canonical'};
  const provider = (hash,height)=>({getBlock:async tag=>tag==='finalized'?{number:height}:{hash}});
  assert.equal(await verifyInclusion(provider('canonical',9),receipt),'included');
  assert.equal(await verifyInclusion(provider('canonical',10),receipt),'finalized');
  await assert.rejects(verifyInclusion(provider('other',10),receipt));
  await assert.rejects(verifyInclusion(provider('canonical',10),{...receipt,status:0}));
});

test('RPC retry recovers transient failure but does not retry contract rejection', async () => {
  let calls = 0;
  assert.equal(await retryRpc(async () => {if (++calls === 1) throw Object.assign(new Error('offline'),{code:'NETWORK_ERROR'});return 'ok';}),'ok');
  assert.equal(calls,2);
  calls = 0;
  await assert.rejects(retryRpc(async()=>{calls++;throw Object.assign(new Error('reverted'),{code:'CALL_EXCEPTION'});}));
  assert.equal(calls,1);
});
