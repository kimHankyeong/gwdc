import test from 'node:test';
import assert from 'node:assert/strict';
import {accountEmail} from '../../frontend/src/account-id.js';
import {activitySteps,transactionLink} from '../../frontend/src/activity.js';
test('test identifiers accept non-email text and preserve existing email accounts',async()=>{
 assert.equal(await accountEmail(' QA사용자 '),await accountEmail('qa사용자'));
 assert.match(await accountEmail('한글 사용자'),/^[a-f0-9]{64}@id\.gwdc\.invalid$/);
 assert.notEqual(await accountEmail('user-a'),await accountEmail('user-b'));
 assert.equal(await accountEmail('Existing@Example.com'),'existing@example.com');
 await assert.rejects(()=>accountEmail('  '));await assert.rejects(()=>accountEmail('bad\nuser'));
});
test('transaction links require a Sepolia chain and a complete hash',()=>{
 const txHash='0x'+'a'.repeat(64);
 assert.equal(transactionLink({chainId:'11155111',txHash}),'https://sepolia.etherscan.io/tx/'+txHash);
 for(const r of [null,{chainId:'1',txHash},{chainId:'11155111',txHash:'javascript:alert(1)'}])assert.equal(transactionLink(r),null);
});
test('activity summaries never invent search, evaluations, or chain success',()=>{
 const steps=activitySteps({policy_version:1},true).join(' ');
 assert.match(steps,/기다리는 중/);assert.doesNotMatch(steps,/검색 후보|검사|확정됨/);
 assert.match(activitySteps({policy_version:1,candidates:[{}],evaluations:[{result:{allowed:false}}],error_code:'SEARCH_UNAVAILABLE'}).join(' '),/허용 0건.*진행 중단/);
});
