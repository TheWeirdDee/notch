import { describe, it, before, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import solc from "solc";
import ganache from "ganache";
import { createPublicClient, createWalletClient, custom, encodeAbiParameters, parseAbiParameters, keccak256, toHex, pad, BaseError, ContractFunctionRevertedError, decodeErrorResult } from "viem";
import { instantiate, apply } from "../../core/src/index.ts";
import { findAndDecodeStreamEvent } from "../../adapter/src/onchain.ts";
import { writeEvidenceFile } from "../../scripts/lib/evidence.mjs";

const contractsDir = fileURLToPath(new URL("../src/", import.meta.url));
const outDir = fileURLToPath(new URL("../../data/remediation/", import.meta.url));
const stub = `pragma solidity ^0.8.28;
contract TestVerifier {
 struct Entry { bytes32 hash; bool isLeft; } struct Merkle {bytes32 root; Entry[] siblings;} struct Continuity {bytes32 digest; bytes32[] roots;}
 function verifyAndEmit(uint64 chain, uint64, bytes calldata, Merkle calldata m, Continuity calldata) external pure returns(bool) {return chain == 1 && m.root != bytes32(0);}
}
contract TestDecoder {
 struct LogEntry {address address_; bytes32[] topics; bytes data;}
 struct ReceiptFields {uint8 receiptStatus; uint64 receiptGasUsed; LogEntry[] receiptLogs; bytes receiptLogsBloom;}
 uint8 status = 1; LogEntry[] logs;
 function set(uint8 s, LogEntry[] calldata l) external {status=s; delete logs; for(uint i=0;i<l.length;i++){logs.push(); logs[i].address_=l[i].address_; logs[i].data=l[i].data; for(uint j=0;j<l[i].topics.length;j++)logs[i].topics.push(l[i].topics[j]);}}
 function getTransactionType(bytes calldata) external pure returns(uint8){return 2;}
 function isValidTransactionType(uint8) external pure returns(bool){return true;}
 function decodeReceiptFields(bytes calldata) external view returns(ReceiptFields memory){return ReceiptFields(status,0,logs,hex"");}
}`;
let artifacts, provider, client, wallet, accounts, decoder, registry, venue, token, snapshot, now;
const bytes = "0x1234";
const zero = `0x${"00".repeat(32)}`;
const root = `0x${"11".repeat(32)}`;
const topic = "0xbc42cec3f2bd75ce97894dacc83ec6c4b682220d349b5a52d5743e7b46eba2d0";
const seed = JSON.parse(readFileSync(new URL("../../core/fixtures/broker-fee-total-amount.json", import.meta.url), "utf8")).proof;
const evidence = [];
function artifact(name) { return Object.values(artifacts).map(file => file[name]).find(Boolean); }
// A cross-contract call's revert (e.g. venue.finance() reverting with a registry-defined
// error like ClaimNotActive, bubbled up through registry.consume()) can't be decoded
// against only the directly-called contract's ABI -- that ABI has no idea the error
// selector even exists. Decode against every error this whole test knows about instead.
function allErrorsAbi() {
  const seen = new Set();
  const out = [];
  for (const file of Object.values(artifacts)) {
    for (const c of Object.values(file)) {
      for (const item of c.abi ?? []) {
        if (item.type !== "error") continue;
        const sig = `${item.name}(${(item.inputs ?? []).map((i) => i.type).join(",")})`;
        if (seen.has(sig)) continue;
        seen.add(sig);
        out.push(item);
      }
    }
  }
  return out;
}
async function send(address, name, fn, args=[], account=accounts[0]) {
 const hash = await wallet.writeContract({ account, chain:null, address, abi: artifact(name).abi, functionName:fn, args, gas:2000000n });
 const r=await client.waitForTransactionReceipt({hash}); assert.equal(r.status,"success"); return r;
}
async function deploy(name,args=[]) {
 const a=artifact(name); const hash=await wallet.deployContract({account:accounts[0],chain:null,abi:a.abi,bytecode:`0x${a.evm.bytecode.object}`,args,gas:10000000n});
 const r=await client.waitForTransactionReceipt({hash}); assert.equal(r.status,"success"); return r.contractAddress;
}
async function read(address,name,fn,args=[]) {return client.readContract({address,abi:artifact(name).abi,functionName:fn,args});}
function proof(overrides={}) {return {...seed,rulesVersion:2,attestedTxDigest:keccak256(bytes),transferable:false,cliffTime:now+10000,endTime:now+20000,now_at_instantiation:now,received_at:now,...overrides};}
function log(p) {return {address_:p.sourceContract,topics:[topic,pad(toHex(BigInt(p.streamId)),{size:32})],data:encodeAbiParameters(parseAbiParameters('(address,address,address,uint128,address,bool,bool,(uint40,uint40),string),uint40,uint40,(uint128,uint128)'),[[accounts[0],accounts[0],p.recipient,BigInt(p.depositAmount),p.token,p.cancelable,p.transferable,[now,p.endTime],""],p.cliffTime,1,[BigInt(p.unlockAmountsStart),BigInt(p.unlockAmountsCliff)]])};}
function args(p, raw=bytes) {return [p.chainKey,1n,raw,p.sourceTxHash,BigInt(p.streamId),p.proofVerified?root:zero,[],zero,[]];}
async function prepare(p, logs=[log(p)]) {await send(decoder,"TestDecoder","set",[p.receiptStatus,logs]);}
async function create(p=proof()) {await prepare(p); const model=instantiate(p,null); assert.equal(model.ok,true); await send(registry,"AttestedCashflowRegistry","instantiateClaim",args(p)); return model.claim;}
async function reject(address,name,fn,values,expected,account=accounts[0]) {
 await assert.rejects(client.simulateContract({account,address,abi:artifact(name).abi,functionName:fn,args:values,gas:2000000n}),e=>{
   const cause=e instanceof BaseError?e.walk(x=>x instanceof ContractFunctionRevertedError):undefined;
   if(cause?.data?.errorName===expected)return true;
   // Ganache exposes raw revert bytes on the innermost RPC error rather than
   // viem's decoded wrapper. Still require the exact ABI error, never any throw.
   // Decoded against every contract's errors, not just the one directly called --
   // a cross-contract revert (e.g. venue.finance() reverting with a
   // registry-defined error like ClaimNotActive) is otherwise undecodable against
   // the called contract's own ABI alone, which has no idea that selector exists.
   for(let c=e;c;c=c.cause){const data=typeof c.data==='string'?c.data:c.data?.result; if(data?.startsWith('0x')){try{if(decodeErrorResult({abi:allErrorsAbi(),data}).errorName===expected)return true;}catch{}}}
   return false;
 });
 evidence.push({test:expected,outcome:"expected decoded revert",synthetic:true});
}
async function fund(account=accounts[0]) {await send(token,"MockUSDC","mint",[account,200000n*10n**6n]);await send(token,"MockUSDC","approve",[venue,200000n*10n**6n],account);}
function key(n) {return pad(toHex(n),{size:32});}

describe("production contracts on local EVM with explicit synthetic proof/decoder boundary",()=>{
 before(async()=>{
  const sources=Object.fromEntries(readdirSync(contractsDir).filter(n=>n.endsWith('.sol')).map(n=>[n,{content:readFileSync(`${contractsDir}/${n}`,'utf8')}]));
  sources['TestBoundary.sol']={content:stub};
  const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources,settings:{viaIR:true,optimizer:{enabled:true,runs:200},evmVersion:'paris',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}})));
  assert.deepEqual((output.errors??[]).filter(e=>e.severity==='error'),[]); artifacts=output.contracts;
  provider=ganache.provider({logging:{quiet:true},wallet:{totalAccounts:3},chain:{hardfork:'shanghai'}});
  client=createPublicClient({transport:custom(provider)});wallet=createWalletClient({transport:custom(provider)});accounts=await wallet.getAddresses();
  await provider.request({method:'evm_setAccountCode',params:['0x0000000000000000000000000000000000000fd2',`0x${artifact('TestVerifier').evm.deployedBytecode.object}`]});
  decoder=await deploy('TestDecoder');token=await deploy('MockUSDC');registry=await deploy('AttestedCashflowRegistry',[decoder,seed.token,token,18]);venue=await read(registry,'AttestedCashflowRegistry','venue');now=Number((await client.getBlock()).timestamp);
 });
 beforeEach(async()=>{snapshot=await provider.request({method:'evm_snapshot',params:[]});});
 afterEach(async()=>{await provider.request({method:'evm_revert',params:[snapshot]});});
 after(async()=>{mkdirSync(outDir,{recursive:true});writeEvidenceFile(`${outDir}/contract-tests.json`,JSON.stringify({synthetic:true,evidence},null,2));await provider?.disconnect();});
 const cases=[['failed-receipt',{receiptStatus:0},'ReceiptNotSuccess'],['cancelable-stream',{cancelable:true},'CancelableNotAllowed'],['non-zero-unlock',{unlockAmountsStart:'1'},'UnlockAmountsNotZero'],['wrong-source-contract',{sourceContract:'0x0000000000000000000000000000000000000001'},'SourceContractNotAllowlisted'],['fake-merkle-proof',{proofVerified:false},'VerificationFailed'],['transferable',{transferable:true},'TransferableNotAllowed'],['zero-deposit',{depositAmount:'0'},'DepositNotPositive'],['wrong-token',{token:'0x0000000000000000000000000000000000000001'},'TokenNotApproved']];
 for(const [label,delta,error]of cases)it(label,async()=>{const p=proof(delta);await prepare(p);assert.equal(instantiate(p,null).ok,false);await reject(registry,'AttestedCashflowRegistry','instantiateClaim',args(p),error);});
 it('past-cliff',async()=>{const p=proof({cliffTime:now});await prepare(p);assert.equal(instantiate(p,null).ok,false);await reject(registry,'AttestedCashflowRegistry','instantiateClaim',args(p),'CliffNotFuture');});
 it('wrong-chain-key fails proof boundary',async()=>{const p=proof({chainKey:3});await prepare(p);assert.equal(instantiate(p,null).ok,false);await reject(registry,'AttestedCashflowRegistry','instantiateClaim',args(p),'VerificationFailed');});
 it('missing-precompile',async()=>{await prepare(proof());await provider.request({method:'evm_setAccountCode',params:['0x0000000000000000000000000000000000000fd2','0x']});await assert.rejects(client.simulateContract({account:accounts[0],address:registry,abi:artifact('AttestedCashflowRegistry').abi,functionName:'instantiateClaim',args:args(proof())}));});
 it('broker-fee-total-amount and exact model/chain identity',async()=>{const p=proof();const c=await create(p);const stored=await read(registry,'AttestedCashflowRegistry','claims',[c.claimId]);assert.equal(stored[0],c.claimId);assert.equal(stored[7],BigInt(p.depositAmount));assert.notEqual(stored[7],BigInt(p.totalAmount));});
 it('replay including forged display txHash cannot create another claim',async()=>{await create();await reject(registry,'AttestedCashflowRegistry','instantiateClaim',args(proof({sourceTxHash:root})),'ClaimAlreadyActive');});
 it('selects requested second stream in Solidity and adapter',async()=>{const a=proof();const b=proof({streamId:'178',depositAmount:'9000000000000000000'});const logs=[log(a),log(b)];await prepare(b,logs);await send(registry,'AttestedCashflowRegistry','instantiateClaim',args(b));const model=instantiate(b,null);assert.equal(await read(registry,'AttestedCashflowRegistry','available',[model.claim.claimId]),BigInt(b.depositAmount));assert.equal(findAndDecodeStreamEvent(logs.map(l=>({address:l.address_,topics:l.topics,data:l.data})),'178').depositAmount,b.depositAmount);});
 it('zero-amount and zero/inexact settlement both reject without consuming',async()=>{const c=await create();for(const [n,error]of [[0n,'AmountNotPositive'],[1n,'AmountNotRepresentable'],[1000000000001n,'AmountNotRepresentable']]){await reject(venue,'CashflowLendingVenue','finance',[key(n+1n),c.claimId,n],error);assert.equal(await read(registry,'AttestedCashflowRegistry','available',[c.claimId]),BigInt(c.originalCapacity));}});
 it('two-lender-race, remainder-plus-one and exact remainder match model',async()=>{const c=await create();await fund();await fund(accounts[1]);const amount=70000n*10n**18n;await send(venue,'CashflowLendingVenue','finance',[key(1),c.claimId,amount]);const model=apply({lender:accounts[0],amount:String(amount),viaAuthorizedVenue:true,transferWouldSucceed:true,nowAt:now},c);assert.equal(model.ok,true);assert.equal(await read(registry,'AttestedCashflowRegistry','available',[c.claimId]),30000n*10n**18n);for(const n of [50000n*10n**18n,30000n*10n**18n+1n])await reject(venue,'CashflowLendingVenue','finance',[key(2),c.claimId,n],'InsufficientFinancingCapacity',accounts[1]);await send(venue,'CashflowLendingVenue','finance',[key(3),c.claimId,30000n*10n**18n]);assert.equal(await read(registry,'AttestedCashflowRegistry','available',[c.claimId]),0n);assert.equal(await read(token,'MockUSDC','balanceOf',[c.borrower]),100000n*10n**6n);});
 it('inactive-claim',async()=>{await reject(venue,'CashflowLendingVenue','finance',[key(1),zero,1000000000000n],'ClaimNotActive');});
 it('unauthorized-venue and owner replacement cannot consume',async()=>{const c=await create();await reject(registry,'AttestedCashflowRegistry','consume',[c.claimId,1n],'OnlyVenue');await reject(registry,'AttestedCashflowRegistry','setVenue',[accounts[0]],'VenueImmutable');});
 it('failed transfer rolls back capacity AND action key; same key retry succeeds',async()=>{const c=await create();const values=[key(1),c.claimId,1000000000000n];const hash=await wallet.writeContract({account:accounts[0],chain:null,address:venue,abi:artifact('CashflowLendingVenue').abi,functionName:'finance',args:values,gas:300000n});assert.equal((await client.waitForTransactionReceipt({hash})).status,'reverted');assert.equal(await read(registry,'AttestedCashflowRegistry','available',[c.claimId]),BigInt(c.originalCapacity));await fund();await send(venue,'CashflowLendingVenue','finance',values);await reject(venue,'CashflowLendingVenue','finance',values,'ActionAlreadyApplied');});
 it('expired claim refuses a new loan',async()=>{const c=await create();await provider.request({method:'evm_increaseTime',params:[10001]});await provider.request({method:'evm_mine',params:[]});await reject(venue,'CashflowLendingVenue','finance',[key(1),c.claimId,1000000000000n],'ClaimExpired');});
});
