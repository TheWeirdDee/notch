import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import { PaperPipeline, receiptKey, type PaperAction, type RecoveryProof } from "../src/recovery.js";
import { readLedger } from "../src/ledger.js";
import { verifyRecordedReceipt, verifyReceipt } from "../../cli/src/verify.js";
import type { Receipt } from "@notch/core";

const root = fileURLToPath(new URL("../../data/gate5/", import.meta.url));
mkdirSync(root, { recursive: true });
const run = mkdtempSync(join(root, "run-"));
writeFileSync(join(root, "latest-run.json"), JSON.stringify({ directory: run, syntheticProofFixtures: true }, null, 2));
// Synthetic recovery fixtures derived from published Gate 4 decoded inputs.
// These tests do not claim to fetch/verify fresh live proofs.
const original = readLedger().filter(r => r.receipt_id.startsWith("01M2368"));
const source = original.find(r => r.action === "instantiate" && !r.refused)!;
const action: PaperAction = { mode: "PAPER", action: "instantiate", chainKey: 1,
  txHash: source.proof_inputs.txHash, streamId: source.proof_inputs.decodedProof.streamId,
  blockNumber: "11666803", intentId: "source" };
const loan: PaperAction = { ...action, action: "finance", intentId: "loan-1", lender: "0x00000000000000000000000000000000000000A2", amount: "100" };
const fresh = async (): Promise<RecoveryProof> => ({ inputs: structuredClone(source.proof_inputs), generatedAt: new Date().toISOString() });
function setup(name: string) {
  const dir = join(run, name); mkdirSync(dir);
  const published = new Map<string, Receipt>();
  const publish = (r: Receipt) => {
    const old = published.get(r.receipt_id); if (old) expect(r).toEqual(old);
    published.set(r.receipt_id, r);
    writeFileSync(join(dir, "receipts.json"), JSON.stringify([...published.values()], null, 2));
  };
  const pipeline = (hooks = {}, fetcher = fresh) => new PaperPipeline(dir, fetcher, hooks, publish);
  const consistent = (p: PaperPipeline, count = 1) => {
    const effects = p.effects().filter(e => e.receipt.action === "finance" && !e.receipt.refused);
    expect(effects).toHaveLength(count);
    expect(effects.at(-1)?.receipt.claim_after?.financedCapacity).toBe(String(count * 100));
    const latest = new Map(p.history().map(e => [e.key, e.status]));
    expect([...latest.values()]).not.toContain("pending");
    for (const e of p.effects()) expect(verifyRecordedReceipt(e.receipt).status).toBe("MATCH");
    expect([...published.values()].filter(r => r.mode === "LIVE")).toHaveLength(0);
  };
  return { pipeline, consistent, published, dir };
}

describe("Gate 5 injected failures (durable PAPER backend)", () => {
  it("kills a real child process after effect; OS releases lease and restart finalizes once", async () => {
    const s = setup("process-killed"); await s.pipeline().run(action);
    const child = spawnSync(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./crash-worker.ts", import.meta.url)), s.dir, JSON.stringify(loan)], { encoding: "utf8", timeout: 15000 });
    expect(child.error).toBeUndefined(); expect(child.status).not.toBe(0);
    expect(s.pipeline().effects().filter(e => e.key === receiptKey(loan))).toHaveLength(1);
    expect(s.pipeline().history().at(-1)?.status).toBe("pending");
    const p = s.pipeline(); await p.boot(); await p.run(loan); s.consistent(p);
    writeFileSync(join(s.dir, "child-outcome.json"), JSON.stringify({ status: child.status, signal: child.signal, stderr: child.stderr }));
  }, 30000); // child startup can exceed Vitest's 5s default on a busy Windows host
  it("receipt publication timeout after write is replayed idempotently", async () => {
    const s = setup("receipt-write-timeout"); await s.pipeline().run(action);
    let fail = true;
    const p = new PaperPipeline(s.dir, fresh, {}, r => {
      s.published.set(r.receipt_id, r);
      if (fail) { fail = false; throw Error("receipt acknowledgement lost"); }
    });
    await expect(p.run(loan)).rejects.toThrow("receipt acknowledgement lost");
    await p.boot(); await p.run(loan); expect(s.published.size).toBe(2); s.consistent(p);
  });
  it("throws after durable finance before receipt write; restart recognizes exactly one effect", async () => {
    const s = setup("crash-after-effect"); await s.pipeline().run(action);
    await expect(s.pipeline({ afterEffect: () => { throw new Error("INJECTED_PROCESS_CRASH"); } }).run(loan)).rejects.toThrow("INJECTED_PROCESS_CRASH");
    expect(s.published.size).toBe(1);
    const restarted = s.pipeline(); await restarted.boot(); await restarted.run(loan);
    expect(s.published.size).toBe(2); s.consistent(restarted);
  });
  it("times out after commit; query-before-retry skips proof and double apply", async () => {
    const s = setup("timeout-after-commit"); await s.pipeline().run(action);
    await expect(s.pipeline({ afterEffect: () => { throw new DOMException("RPC response lost", "TimeoutError"); } }).run(loan)).rejects.toThrow("RPC response lost");
    let queries = 0;
    const p = s.pipeline({ query: () => { queries++; } }, async () => { throw new Error("must not refetch landed action"); });
    await p.run(loan); expect(queries).toBeGreaterThan(0); s.consistent(p);
  });
  it("actually aborts a hanging proof HTTP call; restart marks absent action abandoned then retry succeeds", async () => {
    const s = setup("proof-timeout"); await s.pipeline().run(action);
    const server = createServer(() => {});
    await new Promise<void>(r => server.listen(0, "127.0.0.1", r));
    const address = server.address() as { port: number };
    try {
      await expect(s.pipeline({}, async () => {
        await fetch(`http://127.0.0.1:${address.port}`, { signal: AbortSignal.timeout(30) });
        return fresh();
      }).run(loan)).rejects.toThrow();
    } finally { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); }
    const p = s.pipeline(); await p.boot();
    expect(p.history().some(e => e.key === receiptKey(loan) && e.status === "abandoned")).toBe(true);
    await p.run(loan); s.consistent(p);
  });
  it("two retries preserve the key and create exactly one effect", async () => {
    const s = setup("two-retries"); const p = s.pipeline(); await p.run(action);
    const first = await p.run(loan);
    expect(await p.run(loan)).toEqual(first); expect(await s.pipeline().run(loan)).toEqual(first);
    await expect(p.run({ ...loan, amount: "200" })).rejects.toThrow("Intent ID already bound");
    s.consistent(p);
  });
  it("resolves pending receipt before a different new action is accepted", async () => {
    const s = setup("boot-barrier"); await s.pipeline().run(action);
    await expect(s.pipeline({ afterEffect: () => { throw Error("crash"); } }).run(loan)).rejects.toThrow();
    const p = s.pipeline(); const second = { ...loan, intentId: "loan-2" };
    await p.run(second);
    const events = p.history();
    expect(events.findIndex(e => e.key === receiptKey(loan) && e.status === "finalized"))
      .toBeLessThan(events.findIndex(e => e.key === receiptKey(second)));
    s.consistent(p, 2);
  });
  it("stale proof is refetched under the same key after a pre-effect crash", async () => {
    const s = setup("stale-retry"); await s.pipeline().run(action);
    await expect(s.pipeline({ beforeEffect: () => { throw Error("pre-effect crash"); } }).run(loan)).rejects.toThrow();
    let calls = 0;
    const p = s.pipeline({}, async () => ({ ...await fresh(), generatedAt: ++calls === 1 ? "2000-01-01T00:00:00Z" : new Date().toISOString() }));
    const r = await p.run(loan); expect(calls).toBe(2); expect(r.receipt_id).toBe(receiptKey(loan)); s.consistent(p);
  });
  it("instantiate crash recovers without repeating state change", async () => {
    const s = setup("instantiate-crash");
    await expect(s.pipeline({ afterEffect: () => { throw Error("crash"); } }).run(action)).rejects.toThrow();
    const p = s.pipeline(); await p.boot(); await p.run({ ...action, intentId: "different-source-intent" });
    expect(p.effects()).toHaveLength(1); expect(s.published.size).toBe(1);
  });
  it("ambiguous recovery query blocks new work and preserves pending intent", async () => {
    const s = setup("query-failure"); await s.pipeline().run(action);
    await expect(s.pipeline({ afterEffect: () => { throw Error("crash"); } }).run(loan)).rejects.toThrow();
    await expect(s.pipeline({ query: () => { throw Error("query unavailable"); } }).run({ ...loan, intentId: "new" })).rejects.toThrow("query unavailable");
    expect(s.pipeline().history().at(-1)?.status).toBe("pending");
    const p = s.pipeline(); await p.boot(); s.consistent(p);
  });
  it("rejects a concurrent writer while the first is fetching", async () => {
    const s = setup("concurrent-writer"); await s.pipeline().run(action);
    let release!: () => void; let entered!: () => void;
    const ready = new Promise<void>(r => { entered = r; });
    const wait = new Promise<void>(r => { release = r; });
    const first = s.pipeline({}, async () => { entered(); await wait; return fresh(); }).run(loan);
    await ready;
    try { await expect(s.pipeline().run(loan)).rejects.toThrow(); } finally { release(); }
    await first; const p = s.pipeline(); await p.run(loan); s.consistent(p);
  });
  it("all ten prior Gate 4 receipts still MATCH; independent tampering still DRIFT", () => {
    expect(original).toHaveLength(10);
    const outcomes = original.map(r => verifyReceipt(r.receipt_id));
    expect(outcomes.every(o => o.status === "MATCH")).toBe(true);
    const tampered = structuredClone(original.find(r => r.action === "finance" && !r.refused)!);
    tampered.claim_after!.financedCapacity = "999";
    const drift = verifyRecordedReceipt(tampered);
    expect(drift.checks.find(c => c.name === "receipt_hash")?.ok).toBe(false);
    expect(drift.checks.find(c => c.name === "claim_after")?.ok).toBe(false);
    writeFileSync(join(run, "gate4-verification.json"), JSON.stringify({ outcomes, drift }, null, 2));
  });
});
