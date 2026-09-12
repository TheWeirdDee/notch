import { appendReceipt, readLedger } from "../src/ledger.js";
import { ulid } from "ulid";
const source = readLedger()[0]!;
for (let i = 0; i < 12; i++) {
  const receipt = { ...source, receipt_id: ulid(), limitations: "SYNTHETIC concurrent publication fixture" };
  receipt.verify_command = `notch verify ${receipt.receipt_id}`;
  await appendReceipt(receipt, process.argv[2]!);
}
