import { existsSync, readFileSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, realpathSync } from "node:fs";
import { atomicRename } from "./atomic-rename.js";
import { createServer } from "node:net";
import { join } from "node:path";
import { keccak256, stringToBytes } from "viem";
import { instantiate, apply, available, computeClaimId, computeReceiptHash, receiptHashInput, type Receipt, type Claim } from "@notch/core";
import { buildReceipt, appendReceipt } from "./ledger.js";
import { PROOF_STALENESS_LIMIT_MS, CLOCK_SKEW_TOLERANCE_MS } from "./constants.js";
import { StaleProofError } from "./proof-builder-client.js";
import { withStoreLock } from "./store-lock.js";

export interface PaperAction {
  mode: "PAPER";
  action: "instantiate" | "finance";
  chainKey: number;
  txHash: string;
  streamId: string;
  blockNumber: string;
  /** Caller persists this business intent ID; a new loan requires a new ID. */
  intentId: string;
  lender?: string;
  amount?: string;
}
export interface RecoveryProof { inputs: Receipt["proof_inputs"]; generatedAt: string }
type Event = { key: string; action: PaperAction; status: "pending" | "finalized" | "abandoned"; reason?: string };
type Effect = { key: string; receipt: Receipt };

export function receiptKey(a: PaperAction): string {
  if (a.mode !== "PAPER") throw new Error("LIVE is disabled before Gate 6");
  if (a.action !== "instantiate" && a.action !== "finance") throw new Error("Unknown action");
  if (!a.intentId.trim()) throw new Error("A persistent intentId is required");
  if (a.action === "finance" && (!/^0x[0-9a-f]{40}$/i.test(a.lender ?? "") || !/^\d+$/.test(a.amount ?? "")))
    throw new Error("Finance requires a lender address and integer amount");
  return keccak256(stringToBytes(JSON.stringify([
    "notch-paper-v1", a.action, a.chainKey, a.txHash.toLowerCase(), BigInt(a.streamId).toString(),
    a.action === "instantiate" ? "claim" : a.intentId,
    a.action === "finance" ? a.lender?.toLowerCase() : null,
    a.action === "finance" ? BigInt(a.amount!).toString() : null,
  ])));
}

/** Replace a file atomically after flushing it. Journal histories are only extended.
 * A killed writer leaves either the old complete history or the new complete history.
 * Scope: process crashes on a local filesystem, not disk loss/power failure.
 */
function save(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  const fd = openSync(tmp, "w");
  try { writeFileSync(fd, JSON.stringify(value)); fsyncSync(fd); } finally { closeSync(fd); }
  atomicRename(tmp, path);
}
function read<T>(path: string): T[] {
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as T[] : [];
}

export class PaperPipeline {
  constructor(readonly directory: string, readonly fetchProof: (a: PaperAction) => Promise<RecoveryProof>,
    readonly hooks: { afterEffect?: () => void; beforeEffect?: () => void; query?: () => void } = {},
    readonly publish: (r: Receipt) => void | Promise<void> = appendReceipt) {}

  private async locked<T>(work: () => Promise<T>): Promise<T> {
    mkdirSync(this.directory, { recursive: true });
    // OS-owned local lease is released even on SIGKILL; no stale PID lock race.
    // Port collisions fail closed. All writers for this store must use this pipeline.
    const identity = realpathSync(this.directory).toLowerCase();
    const port = 20000 + Number(BigInt(keccak256(stringToBytes(identity))) % 30000n);
    const lease = createServer();
    await new Promise<void>((resolve, reject) => {
      lease.once("error", reject); lease.listen({ host: "127.0.0.1", port, exclusive: true }, resolve);
    });
    try { return await work(); }
    finally { await new Promise<void>((resolve, reject) => lease.close(e => e ? reject(e) : resolve())); }
  }
  history(): Event[] { return read<Event>(join(this.directory, "ledger.json")); }
  effects(): Effect[] {
    const effects = read<Effect>(join(this.directory, "effects.json"));
    const keys = new Set<string>();
    for (const effect of effects) {
      if (keys.has(effect.key) || effect.key !== effect.receipt.receipt_id || effect.receipt.mode !== "PAPER" ||
        computeReceiptHash(receiptHashInput(effect.receipt)) !== effect.receipt.receipt_hash)
        throw new Error("Corrupt PAPER effect store; recovery blocked");
      keys.add(effect.key);
    }
    return effects;
  }
  private event(event: Event): void { save(join(this.directory, "ledger.json"), [...this.history(), event]); }
  private query(key: string): Effect | undefined { this.hooks.query?.(); return this.effects().find(e => e.key === key); }
  private async finalize(event: Event, effect: Effect): Promise<Receipt> {
    await this.publish(effect.receipt);
    this.event({ ...event, status: "finalized" });
    return effect.receipt;
  }
  private latest(): Event[] { return [...new Map(this.history().map(e => [e.key, e])).values()]; }
  private async resolve(): Promise<void> {
    for (const event of this.latest().filter(e => e.status === "pending")) {
      // A failed/ambiguous query throws: no abandonment and no new work.
      const effect = this.query(event.key);
      if (effect) await this.finalize(event, effect);
      else this.event({ ...event, status: "abandoned", reason: "Durable PAPER effect store confirms no effect; safe to retry same key" });
    }
  }
  async boot(): Promise<void> { await this.locked(() => this.resolve()); }
  async run(action: PaperAction): Promise<Receipt> {
    action = structuredClone(action); // capture intent before the first await
    const key = receiptKey(action); // independent of proof generation time and randomness
    return this.locked(async () => {
      await this.resolve(); // startup barrier, including retries on the same instance
      if (action.action === "finance" && this.history().some(e => e.action.action === "finance" &&
        e.action.intentId === action.intentId && e.key !== key))
        throw new Error("Intent ID already bound to different loan parameters");
      const landed = this.query(key);
      if (landed) return landed.receipt;
      const event: Event = { key, action, status: "pending" };
      this.event(event); // intent durable before fetching or changing state
      let fresh: RecoveryProof | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          fresh = await this.fetchProof(action);
          const age = Date.now() - Date.parse(fresh.generatedAt);
          if (!Number.isFinite(age) || age < -CLOCK_SKEW_TOLERANCE_MS || age > PROOF_STALENESS_LIMIT_MS)
            throw new StaleProofError(fresh.generatedAt, age);
          break;
        } catch (e) { if (!(e instanceof StaleProofError) || attempt === 1) throw e; }
      }
      const proof = fresh!.inputs.decodedProof;
      if (action.action === "finance" && (!proof.precompileAvailable || !proof.proofVerified || proof.receiptStatus !== 1))
        throw new Error("Finance proof is not verified; no effect applied");
      const claimId = computeClaimId(action.chainKey, proof.attestedTxDigest ?? action.txHash, action.streamId);
      if (proof.chainKey !== action.chainKey || proof.sourceTxHash.toLowerCase() !== action.txHash.toLowerCase() || proof.streamId !== BigInt(action.streamId).toString())
        throw new Error("Proof does not belong to the intended claim");
      const already = this.query(key); // query immediately before effect, too
      if (already) return this.finalize(event, already);
      const effects = this.effects();
      let before: Claim | null = effects.filter(e => e.receipt.claim_id === claimId && !e.receipt.refused)
        .at(-1)?.receipt.claim_after ?? null;
      if (!before && proof.rulesVersion === 2) {
        // Additive identity bridge for an existing legacy PAPER balance. Capacity
        // is preserved, never reinstantiated/reset; original receipts stay intact.
        const legacy = effects.filter(e => !e.receipt.refused && e.receipt.claim_after?.sourceChainKey === action.chainKey &&
          e.receipt.claim_after.sourceTxHash.toLowerCase() === action.txHash.toLowerCase() &&
          e.receipt.claim_after.streamId === proof.streamId).at(-1)?.receipt.claim_after;
        if (legacy) before = { ...legacy, claimId, rulesVersion: 2, attestedTxDigest: proof.attestedTxDigest! };
      }
      if (action.action === "finance" && !before) throw new Error("Instantiate the PAPER claim before financing");
      if (before && proof.rulesVersion === 2) {
        if (before.originalCapacity !== proof.depositAmount || before.borrower.toLowerCase() !== proof.recipient.toLowerCase() ||
          before.asset.toLowerCase() !== proof.token.toLowerCase() || before.lockedUntil !== proof.cliffTime || proof.transferable !== false)
          throw new Error("Fresh proof disagrees with immutable claim facts");
      }
      const result = action.action === "instantiate" ? instantiate(proof, before) :
        apply({ lender: action.lender!, amount: action.amount!, viaAuthorizedVenue: true, transferWouldSucceed: true, nowAt: proof.now_at_instantiation }, before!);
      const receipt = buildReceipt({ mode: "PAPER", action: action.action, claim_id: claimId,
        proof_inputs: fresh!.inputs, claim_before: before, claim_after: result.ok ? result.claim : null,
        capacity_before: before ? available(before).toString() : null,
        capacity_after: result.ok ? available(result.claim).toString() : null,
        lender: action.lender ?? null, amount: action.amount ?? null, fill: null,
        refused: !result.ok, reason_code: result.ok ? null : result.reason,
        limitations: "PAPER: disbursement is simulated and excluded from LIVE totals." });
      receipt.receipt_id = key; receipt.verify_command = `notch verify ${key}`;
      this.hooks.beforeEffect?.();
      // Claim transition and simulated disbursement are ONE durable transaction.
      save(join(this.directory, "effects.json"), [...effects, { key, receipt }]);
      this.hooks.afterEffect?.(); // real injected throw after durable effect, before receipt publication
      return this.finalize(event, { key, receipt });
    });
  }
}
