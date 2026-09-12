// Append-only ledger (Notch-PRD.md section 7.7 / 13). data/ledger.jsonl is the
// authoritative append-only log, one JSON line per receipt; data/receipts/<id>.json is
// a materialized per-receipt copy for fast lookup by notch verify. No silent deletion
// of losing or blocked runs -- every receipt built is appended, refused or not.
import { mkdirSync, writeFileSync, readFileSync, existsSync, openSync, closeSync, fsyncSync } from "node:fs";
import { atomicRename } from "./atomic-rename.js";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ulid } from "ulid";
import { computeReceiptHash, type Receipt, type ReceiptHashInput } from "@notch/core";
import { withStoreLock } from "./store-lock.js";

const DATA_DIR = fileURLToPath(new URL("../../data", import.meta.url));
const LEDGER_PATH = join(DATA_DIR, "ledger.jsonl");
const RECEIPTS_DIR = join(DATA_DIR, "receipts");

export function buildReceipt(input: {
  mode: Receipt["mode"];
  action: Receipt["action"];
  claim_id: string;
  proof_inputs: Receipt["proof_inputs"];
  claim_before: Receipt["claim_before"];
  claim_after: Receipt["claim_after"];
  capacity_before: Receipt["capacity_before"];
  capacity_after: Receipt["capacity_after"];
  lender: Receipt["lender"];
  amount: Receipt["amount"];
  fill: Receipt["fill"];
  refused: boolean;
  reason_code: Receipt["reason_code"];
  limitations: Receipt["limitations"];
}): Receipt {
  const receipt_id = ulid();
  const hashInput: ReceiptHashInput = {
    mode: input.mode,
    action: input.action,
    claim_id: input.claim_id,
    proof_inputs: input.proof_inputs,
    claim_before: input.claim_before,
    claim_after: input.claim_after,
    capacity_before: input.capacity_before,
    capacity_after: input.capacity_after,
    lender: input.lender,
    amount: input.amount,
    refused: input.refused,
    reason_code: input.reason_code,
  };
  return {
    receipt_id,
    mode: input.mode,
    action: input.action,
    claim_id: input.claim_id,
    proof_inputs: input.proof_inputs,
    claim_before: input.claim_before,
    claim_after: input.claim_after,
    capacity_before: input.capacity_before,
    capacity_after: input.capacity_after,
    lender: input.lender,
    amount: input.amount,
    fill: input.fill,
    refused: input.refused,
    reason_code: input.reason_code,
    verify_command: `notch verify ${receipt_id}`,
    limitations: input.limitations,
    recorded_at: new Date().toISOString(),
    receipt_hash: computeReceiptHash(hashInput),
  };
}

export async function appendReceipt(receipt: Receipt, directory = DATA_DIR): Promise<void> {
  const ledgerPath = join(directory, "ledger.jsonl");
  const receiptsDir = join(directory, "receipts");
  if (!/^(?:[0-9A-HJKMNP-TV-Z]{26}|0x[0-9a-f]{64})$/i.test(receipt.receipt_id)) throw new Error("Invalid receipt ID");
  await withStoreLock(directory, async () => {
  mkdirSync(receiptsDir, { recursive: true });
  const prior = readLedger(directory).find(r => r.receipt_id === receipt.receipt_id);
  if (prior && JSON.stringify(prior) !== JSON.stringify(receipt)) throw new Error("Conflicting receipt ID");
  if (!prior) {
    const contents = existsSync(ledgerPath) ? readFileSync(ledgerPath, "utf8") : "";
    const temp = `${ledgerPath}.${process.pid}.tmp`;
    const fd = openSync(temp, "w");
    try { writeFileSync(fd, contents + JSON.stringify(receipt) + "\n"); fsyncSync(fd); }
    finally { closeSync(fd); }
    atomicRename(temp, ledgerPath);
  }
  writeFileSync(join(receiptsDir, `${receipt.receipt_id}.json`), JSON.stringify(receipt, null, 2), "utf8");
  }, true);
}

export function readReceipt(receiptId: string): Receipt {
  if (!/^(?:[0-9A-HJKMNP-TV-Z]{26}|0x[0-9a-f]{64})$/i.test(receiptId)) throw new Error("Invalid receipt ID");
  const recorded = readLedger().find(r => r.receipt_id === receiptId);
  if (recorded) return recorded;
  const path = join(RECEIPTS_DIR, `${receiptId}.json`);
  if (!existsSync(path)) {
    throw new Error(`No receipt found for id ${receiptId} at ${path}`);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Receipt;
}

export function readLedger(directory = DATA_DIR): Receipt[] {
  const ledgerPath = join(directory, "ledger.jsonl");
  if (!existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Receipt);
}

export const paths = { DATA_DIR, LEDGER_PATH, RECEIPTS_DIR };
