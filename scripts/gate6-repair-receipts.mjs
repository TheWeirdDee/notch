import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Repair: the first live-finance run's receipt-building code left Claim.attestedTxDigest
// undefined (a bug in the SCRIPT, not the on-chain outcome -- validateClaim() correctly
// rejected it, which is why every one of the 6 receipts read DRIFT). The six real
// on-chain transactions themselves are untouched and correct; only their off-chain
// receipt records were malformed. Moves the 6 bad records to data/gate6/void-receipts/
// (preserved, not deleted -- DECISIONS.md documents this) and removes them from the
// active ledger so corrected receipts can be appended fresh under new IDs.
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync, copyFileSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";

const badIds = [
  "01M23TT97GYGEJYBWY12XKC6N1",
  "01M23TTD9H2VWW2XPPM26F6RRX",
  "01M23TTTVG0VDC9ZYZ26AQ11TE",
  "01M23TTV530EPPVBZ08H5S286K",
  "01M23TVBBTEBD7AT3JGBBN3FDE",
  "01M23TVFBN1DV87EAKBZ5WAQ8K",
];

const dataDir = fileURLToPath(new URL("../data", import.meta.url));
const ledgerPath = `${dataDir}/ledger.jsonl`;
const receiptsDir = `${dataDir}/receipts`;
const voidDir = fileURLToPath(new URL("../data/gate6/void-receipts", import.meta.url));
mkdirSync(voidDir, { recursive: true });

for (const id of badIds) {
  copyFileSync(`${receiptsDir}/${id}.json`, `${voidDir}/${id}.json`);
  unlinkSync(`${receiptsDir}/${id}.json`);
}

const lines = readFileSync(ledgerPath, "utf8").trim().split("\n");
const kept = lines.filter((l) => !badIds.includes(JSON.parse(l).receipt_id));
console.log(`Ledger: ${lines.length} lines -> ${kept.length} lines (removed ${lines.length - kept.length})`);
writeFileSync(ledgerPath, kept.join("\n") + "\n");

console.log("Voided receipts preserved at data/gate6/void-receipts/:");
for (const id of badIds) console.log(" ", id);
