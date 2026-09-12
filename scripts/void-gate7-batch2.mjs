// Voids the 10 Gate 7 receipts with construction bugs found by notch verify:
// - 5 real instantiate receipts: claim_after.asset recorded with inconsistent address
//   casing (raw lowercase env-var literal vs viem's checksummed on-chain reads).
// - 5 re-instantiation-attempt receipts: claim_before recorded as null, so instantiate()'s
//   rerun has no prior claim to detect CLAIM_ALREADY_ACTIVE against.
// Same "void, don't delete" discipline as Gate 6 (D24): preserved intact, removed from
// the active ledger. No on-chain transaction is redone -- these are real, correct
// on-chain events; only their off-chain bookkeeping was wrong.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VOID_IDS = new Set([
  "01M257ETS6REXX72E6DFR70QDE", "01M257GARWZPQH8JTHFE5MTCZ2", "01M257HQA31WQGXDG4S1ZSDH20",
  "01M257K28XX671CEQCPDK4CGJ5", "01M257MF9DEAVDM0240WW2QYF2",
  "01M257FRG79EAANK4WYVWCTGTQ", "01M257H7Y7PERZP18A4ATSG3DH", "01M257JHQAD7QBQHK6TVA3V840",
  "01M257KYGS63C9PJDJN7YD7P3W", "01M257N7P6MYEKP6C1S693MWD7",
]);

const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const ledgerPath = `${dataDir}/ledger.jsonl`;
const receiptsDir = `${dataDir}/receipts`;
const voidDir = fileURLToPath(new URL("../data/gate7/void-receipts", import.meta.url));
mkdirSync(voidDir, { recursive: true });

const lines = readFileSync(ledgerPath, "utf8").trimEnd().split("\n");
const kept = [];
for (const line of lines) {
  const r = JSON.parse(line);
  if (VOID_IDS.has(r.receipt_id)) {
    const srcJson = `${receiptsDir}/${r.receipt_id}.json`;
    if (existsSync(srcJson)) {
      copyFileSync(srcJson, `${voidDir}/${r.receipt_id}.json`);
      unlinkSync(srcJson);
    }
    console.log(`voided ${r.receipt_id} (action=${r.action})`);
  } else {
    kept.push(line);
  }
}
writeFileSync(ledgerPath, kept.join("\n") + "\n");
console.log(`\nledger.jsonl: ${lines.length} -> ${kept.length} lines`);
