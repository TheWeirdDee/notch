import { it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { keccak256 } from "viem";
import { readLedger, appendReceipt } from "../src/ledger.js";
import { PaperPipeline, type PaperAction } from "../src/recovery.js";
import { verifyRecordedReceipt } from "../../cli/src/verify.js";
import { instantiate, apply, validateProof, computeClaimId } from "@notch/core";
import { storeProofPayload, readProofPayload } from "../src/proof-store.js";
import { checkDeployment } from "../src/deployment.js";
import type { PublicClient } from "viem";
import { writeEvidenceFile } from "../../scripts/lib/evidence.mjs";
const root=fileURLToPath(new URL("../../data/remediation/",import.meta.url));mkdirSync(root,{recursive:true});
const dir=()=>mkdtempSync(join(root,"adapter-"));
const source=readLedger().find(r=>r.action==="instantiate"&&!r.refused)!;
const payload=JSON.parse(readFileSync(new URL("../../data/gate1/attestcoin-proof.json",import.meta.url),"utf8")).response;
const p={...source.proof_inputs.decodedProof,rulesVersion:2 as const,attestedTxDigest:keccak256(payload.txBytes),transferable:false};
const action:PaperAction={mode:"PAPER",action:"instantiate",intentId:"source",chainKey:1,txHash:p.sourceTxHash,streamId:p.streamId,blockNumber:"11666803"};
const loan:PaperAction={...action,action:"finance",intentId:"loan",amount:"1000000000000",lender:p.recipient};
const fresh=async()=>({inputs:{...source.proof_inputs,decodedProof:p},generatedAt:new Date().toISOString()});
it("deployment drift fails closed instead of using a stale venue address",async()=>{
 const registry=p.recipient,venue=p.token;
 const manifest={contracts:{AttestedCashflowRegistry:{address:registry},CashflowLendingVenue:{address:venue},MockUSDC:{address:p.sourceContract}}};
 const client={readContract:async({functionName}:{functionName:string})=>({venue:registry,registry,ccUSD:p.sourceContract,depositAssetDecimals:18,ccUSDDecimals:6})[functionName as "venue"]} as unknown as PublicClient;
 await expect(checkDeployment(client,manifest)).rejects.toThrow("DEPLOYMENT_DRIFT");
});
it("evidence latest-view updates retain both old and new immutable records",()=>{
 const d=dir(),path=join(d,"result.json");writeEvidenceFile(path,JSON.stringify({outcome:"failed"}));writeEvidenceFile(path,JSON.stringify({outcome:"passed"}));
 const history=join(d,"history","result");const values=readdirSync(history).map(f=>JSON.parse(readFileSync(join(history,f),"utf8")));
 expect(values.some(v=>v.outcome==="failed")).toBe(true);expect(values.some(v=>v.outcome==="passed")).toBe(true);
});

it("v2 model uses the historically observed authenticated on-chain ID",()=>{
 const c=instantiate(p,null);expect(c.ok).toBe(true);
 if(c.ok)expect(c.claim.claimId).toBe("0x99161b1e0e9f40613c9f07f522ca412085919df2617831a972139508503cfae9");
});
it("v2 PAPER crash/retry has exact settlement and a MATCH receipt",async()=>{
 const d=dir();const good=new PaperPipeline(d,fresh,{},()=>{});await good.run(action);
 const bad=new PaperPipeline(d,fresh,{afterEffect:()=>{throw Error("crash");}},()=>{});
 await expect(bad.run(loan)).rejects.toThrow("crash");await good.boot();const r=await good.run(loan);
 expect(r.claim_after?.financedCapacity).toBe(loan.amount);expect(good.effects()).toHaveLength(2);
 expect(verifyRecordedReceipt(r).status).toBe("MATCH");
});
it("legacy balance is preserved when a new v2 loan bridges claim identity",async()=>{
 const d=dir();const old=new PaperPipeline(d,async()=>({inputs:source.proof_inputs,generatedAt:new Date().toISOString()}),{},()=>{});
 await old.run(action);await old.run({...loan,intentId:"old"});
 const current=new PaperPipeline(d,fresh,{},()=>{});const r=await current.run(loan);
 expect(r.claim_after?.financedCapacity).toBe("2000000000000");expect(r.claim_id).toBe(computeClaimId(1,p.attestedTxDigest,p.streamId));
 expect(verifyRecordedReceipt(r).status).toBe("MATCH");expect(current.effects()).toHaveLength(3);
});
it("v2 core rejects dust, expired claims and transferable sources",()=>{
 expect(instantiate({...p,transferable:true},null)).toEqual({ok:false,reason:"TRANSFERABLE_NOT_ALLOWED"});
 const c=instantiate(p,null);if(!c.ok)throw Error();
 const l={lender:p.recipient,amount:"1",viaAuthorizedVenue:true,transferWouldSucceed:true,nowAt:p.now_at_instantiation};
 expect(apply(l,c.claim)).toEqual({ok:false,reason:"AMOUNT_NOT_REPRESENTABLE"});
 expect(apply({...l,amount:loan.amount!,nowAt:p.cliffTime},c.claim)).toEqual({ok:false,reason:"CLAIM_EXPIRED"});
});
it("runtime proof validation rejects ABI overflows and malformed fields",()=>{
 for(const delta of [{depositAmount:(2n**128n).toString()},{streamId:"-1"},{cliffTime:NaN},{chainKey:2**32},{attestedTxDigest:"0x123"}])expect(()=>validateProof({...p,...delta})).toThrow();
});
it("raw payload retention verifies exact content and preserves independent variants",()=>{
 const d=dir();const a=storeProofPayload(payload,d);expect(readProofPayload(a,d)).toEqual(payload);
 const variant={...payload,merkleProof:{...payload.merkleProof,root:`0x${"aa".repeat(32)}`}};
 const b=storeProofPayload(variant,d);expect(b).not.toBe(a);expect(readProofPayload(a,d)).toEqual(payload);
});
it("two real concurrent publisher processes lose no receipt lines",async()=>{
 const d=dir();const worker=fileURLToPath(new URL("./publisher-worker.ts",import.meta.url));
 const start=()=>new Promise<void>((resolve,reject)=>{
   const c=spawn(process.execPath,["--import","tsx",worker,d],{stdio:["ignore","ignore","pipe"]});let error="";
   c.stderr.on("data",b=>{error+=b.toString();});c.on("error",reject);c.on("exit",code=>code===0?resolve():reject(Error(error)));
 });
 await Promise.all([start(),start()]);const rows=readLedger(d);expect(rows).toHaveLength(24);expect(new Set(rows.map(r=>r.receipt_id)).size).toBe(24);
 await appendReceipt(rows[0]!,d);expect(readLedger(d)).toHaveLength(24);
},30000);
