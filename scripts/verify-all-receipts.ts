import { readLedger } from "../adapter/src/ledger.js";
import { verifyRecordedReceipt } from "../cli/src/verify.js";
const outcomes = readLedger().map(verifyRecordedReceipt);
console.log(JSON.stringify({ total: outcomes.length, match: outcomes.filter(r => r.status === "MATCH").length,
  drift: outcomes.filter(r => r.status === "DRIFT") }, null, 2));
if (outcomes.some(r => r.status === "DRIFT")) process.exitCode = 1;
