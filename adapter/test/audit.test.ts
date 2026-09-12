import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { PublicClient } from "viem";
import { computeReceiptHash, type ReceiptHashInput, type Receipt } from "@notch/core";
import { readLedger } from "../src/ledger.js";
import { PaperPipeline, type PaperAction } from "../src/recovery.js";
import { verifyOnChain, decodeReceiptOnChain } from "../src/onchain.js";
import { fetchFreshProof } from "../src/proof-builder-client.js";
import { verifyRecordedReceipt } from "../../cli/src/verify.js";

const receipts = readLedger();
const source = receipts.find(r => r.action === "instantiate" && !r.refused)!;
const loanReceipt = receipts.find(r => r.action === "finance" && !r.refused)!;
const root = fileURLToPath(new URL("../../data/audit-gates1-5/", import.meta.url));
mkdirSync(root, { recursive: true });
const run = mkdtempSync(join(root, "run-"));
const action: PaperAction = { mode: "PAPER", action: "instantiate", intentId: "source",
  chainKey: 1, txHash: source.proof_inputs.txHash, streamId: "177", blockNumber: "11666803" };
const loan: PaperAction = { ...action, action: "finance", intentId: "audit-loan", lender: loanReceipt.lender!, amount: "100" };
const fresh = async () => ({ inputs: structuredClone(source.proof_inputs), generatedAt: new Date().toISOString() });
function rehash(r: Receipt): Receipt {
  const { mode, action, claim_id, proof_inputs, claim_before, claim_after, capacity_before, capacity_after, lender, amount, refused, reason_code } = r;
  const input: ReceiptHashInput = { mode, action, claim_id, proof_inputs, claim_before, claim_after, capacity_before, capacity_after, lender, amount, refused, reason_code };
  r.receipt_hash = computeReceiptHash(input); return r;
}
afterEach(() => vi.unstubAllGlobals());

describe("Gates 1-5 adversarial audit", () => {
  it("object key reordering does not falsely report math drift", () => {
    const r = structuredClone(loanReceipt);
    r.claim_after = Object.fromEntries(Object.entries(r.claim_after!).reverse()) as Receipt["claim_after"];
    expect(verifyRecordedReceipt(r).status).toBe("MATCH");
  });
  it("self-consistent forged finance capacity still disagrees with decoded deposit", () => {
    const r = structuredClone(loanReceipt);
    r.claim_before!.originalCapacity = "999999999999999999999999";
    r.claim_after!.originalCapacity = r.claim_before!.originalCapacity;
    r.capacity_before = (BigInt(r.claim_before!.originalCapacity) - BigInt(r.claim_before!.financedCapacity)).toString();
    r.capacity_after = (BigInt(r.claim_after!.originalCapacity) - BigInt(r.claim_after!.financedCapacity)).toString();
    expect(verifyRecordedReceipt(rehash(r)).status).toBe("DRIFT");
  });
  it("a rehashed claim with negative financed capacity is invalid", () => {
    const r = structuredClone(loanReceipt);
    r.claim_before!.financedCapacity = "-1";
    r.claim_after!.financedCapacity = (BigInt(r.amount!) - 1n).toString();
    r.capacity_before = (BigInt(r.claim_before!.originalCapacity) + 1n).toString();
    r.capacity_after = (BigInt(r.claim_after!.originalCapacity) - BigInt(r.claim_after!.financedCapacity)).toString();
    expect(verifyRecordedReceipt(rehash(r)).status).toBe("DRIFT");
  });
  it.each(["capacity_before", "claim_id", "reason_code"] as const)("verifier rejects rehashed wrong finance %s", field => {
    const r = structuredClone(loanReceipt); r[field] = field === "capacity_before" ? "999" : "wrong";
    expect(verifyRecordedReceipt(rehash(r)).status).toBe("DRIFT");
  });
  it("verifier rejects rehashed wrong instantiate capacity_after", () => {
    const r = structuredClone(source); r.capacity_after = "999";
    expect(verifyRecordedReceipt(rehash(r)).status).toBe("DRIFT");
  });
  it("verifier rejects rehashed refusal carrying a successful claim_after", () => {
    const r = structuredClone(receipts.find(r => r.action === "finance" && r.refused)!);
    r.claim_after = loanReceipt.claim_after;
    expect(verifyRecordedReceipt(rehash(r)).status).toBe("DRIFT");
  });
  it("verifier returns DRIFT rather than throwing on malformed recorded math", () => {
    const r = structuredClone(loanReceipt); r.amount = "not-an-integer";
    expect(verifyRecordedReceipt(rehash(r)).status).toBe("DRIFT");
  });
  it("RPC timeout propagates instead of becoming definitive proof refusal", async () => {
    const client = { simulateContract: async () => { throw Error("RPC timed out"); } } as unknown as PublicClient;
    await expect(verifyOnChain(client, loan.lender as `0x${string}`, {
      chainKey: 1n, height: 1n, encodedTransaction: "0x", merkleRoot: "0x", siblings: [], lowerEndpointDigest: "0x", continuityRoots: [],
    })).rejects.toThrow("RPC timed out");
  });
  it("decoder timeout propagates instead of becoming missing/failed receipt", async () => {
    const client = { readContract: async () => { throw Error("decoder RPC timed out"); } } as unknown as PublicClient;
    await expect(decodeReceiptOnChain(client, "0x")).rejects.toThrow("decoder RPC timed out");
  });
  it("ProofBuilder response must belong to the requested transaction", async () => {
    const payload = JSON.parse(readFileSync(fileURLToPath(new URL("../../data/gate1/attestcoin-proof.json", import.meta.url)), "utf8"));
    const response = { ...payload.response, generatedAt: new Date().toISOString(), chainKey: 1, txHash: `0x${"aa".repeat(32)}` };
    vi.stubGlobal("fetch", async () => ({ status: 200, json: async () => response }));
    await expect(fetchFreshProof(1, action.txHash, { maxAttempts: 1 })).rejects.toThrow();
  });
  it("finance rejects an unverified fresh proof and can retry after recovery", async () => {
    const dir = join(run, "invalid-finance-proof");
    const published: Receipt[] = [];
    const good = new PaperPipeline(dir, fresh, {}, r => published.push(r)); await good.run(action);
    const bad = new PaperPipeline(dir, async () => {
      const p = await fresh(); p.inputs.decodedProof.proofVerified = false; return p;
    }, {}, r => published.push(r));
    await expect(bad.run(loan)).rejects.toThrow();
    expect(good.effects().filter(e => e.receipt.action === "finance")).toHaveLength(0);
    await good.run(loan); expect(good.effects().filter(e => e.receipt.action === "finance")).toHaveLength(1);
  });
  it("caller mutation during fetch cannot change a loan under an already derived key", async () => {
    const dir = join(run, "mutable-intent"); const good = new PaperPipeline(dir, fresh, {}, () => {}); await good.run(action);
    const mutable = { ...loan };
    const p = new PaperPipeline(dir, async () => { mutable.amount = "200"; return fresh(); }, {}, () => {});
    const r = await p.run(mutable); expect(r.amount).toBe("100");
  });
  it("refuses corrupted durable effects instead of silently spending from altered state", async () => {
    const dir = join(run, "effect-integrity"); const p = new PaperPipeline(dir, fresh, {}, () => {}); await p.run(action);
    const effects = p.effects(); effects[0]!.receipt.claim_after!.originalCapacity = "999999999999999999999999999";
    writeFileSync(join(dir, "effects.json"), JSON.stringify(effects));
    await expect(p.run(loan)).rejects.toThrow();
  });
});
