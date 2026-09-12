// Voids the 3 Gate 7 finance receipts whose reason_code was wrong (blindly hardcoded
// "INSUFFICIENT_CAPACITY" by the campaign script's catch-all, when the true on-chain
// revert was actually ActionAlreadyApplied or an ERC20 allowance shortfall -- neither of
// which the pure reference model can reproduce, per RULES.md B31). Void, don't delete:
// moved intact to data/gate7/void-receipts/, removed from the active ledger.jsonl and
// data/receipts/.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const VOID_IDS = new Set([
  "01M257EY23VV6KJFHSNBEMK8KD", // position-1 step1 (A,350): actually ActionAlreadyApplied
  "01M257HV21GFPJJBR5H36YSSM6", // position-3 step1 (A,840): actually MockUSDC: allowance
  "01M257MK41D2EABBQNNWPFPWMV", // position-5 step1 (A,700): actually MockUSDC: allowance
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
    console.log(`voided ${r.receipt_id} (was reason_code=${r.reason_code}, lender=${r.lender}, amount=${r.amount})`);
  } else {
    kept.push(line);
  }
}
writeFileSync(ledgerPath, kept.join("\n") + "\n");
console.log(`\nledger.jsonl: ${lines.length} -> ${kept.length} lines`);
