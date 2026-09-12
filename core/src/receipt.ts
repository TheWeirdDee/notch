import { keccak256, stringToBytes } from "viem";
import type { Claim, Proof } from "./types.js";

export type ReceiptAction = "instantiate" | "finance";

/**
 * Enrichment beyond Notch-PRD.md section 9's minimal `proof_inputs` (which lists only
 * chainKey, headerNumber, txHash, and a hash of the raw proof payload). `decodedProof`
 * is included too so `notch verify` can rerun instantiate() in full, not only apply() --
 * a strict superset of the schema, nothing removed. Recorded in DECISIONS.md.
 */
export interface ReceiptProofInputs {
  chainKey: number;
  headerNumber: string;
  txHash: string;
  rawProofPayloadHash: string;
  decodedProof: Proof;
}

/**
 * One receipt per action (instantiate or finance), successful or refused -- covers both
 * PRD J1-style finance receipts and J3-style refused-instantiate receipts under one
 * shape, per Notch-PRD.md section 9 plus the discriminator this gate's journeys need.
 */
export interface Receipt {
  receipt_id: string;
  mode: "PAPER" | "LIVE";
  action: ReceiptAction;
  claim_id: string;
  proof_inputs: ReceiptProofInputs;
  claim_before: Claim | null;
  claim_after: Claim | null;
  capacity_before: string | null;
  capacity_after: string | null;
  lender: string | null;
  amount: string | null;
  fill: string | null;
  refused: boolean;
  reason_code: string | null;
  verify_command: string;
  limitations: string | null;
  recorded_at: string;
  receipt_hash: string;
}

/** The exact fields the hash covers -- proof inputs and capacity math, never prose. */
export interface ReceiptHashInput {
  mode: Receipt["mode"];
  action: Receipt["action"];
  claim_id: string;
  proof_inputs: ReceiptProofInputs;
  claim_before: Claim | null;
  claim_after: Claim | null;
  capacity_before: string | null;
  capacity_after: string | null;
  lender: string | null;
  amount: string | null;
  refused: boolean;
  reason_code: string | null;
}

/** Explicit projection: never accidentally hash metadata added to the receipt. */
export function receiptHashInput(receipt: Receipt): ReceiptHashInput {
  const { mode, action, claim_id, proof_inputs, claim_before, claim_after,
    capacity_before, capacity_after, lender, amount, refused, reason_code } = receipt;
  return { mode, action, claim_id, proof_inputs, claim_before, claim_after,
    capacity_before, capacity_after, lender, amount, refused, reason_code };
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/**
 * Canonical hash over proof inputs and capacity math only (invariant 9). `fill`,
 * `verify_command`, `limitations`, `recorded_at`, and `receipt_id` are deliberately
 * excluded -- settlement metadata, prose, and identifiers, not the math itself.
 */
export function computeReceiptHash(input: ReceiptHashInput): string {
  const canonical = JSON.stringify(sortKeysDeep(input));
  return keccak256(stringToBytes(canonical));
}
