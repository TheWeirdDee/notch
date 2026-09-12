import { PaperPipeline, type PaperAction } from "../src/recovery.js";
import { readLedger } from "../src/ledger.js";
const source = readLedger().find(r => r.receipt_id === "01M2368TRTRFKKB6V4TTCDE23E")!;
const action = JSON.parse(process.argv[3]!) as PaperAction;
const pipeline = new PaperPipeline(process.argv[2]!, async () => ({
  inputs: source.proof_inputs, generatedAt: new Date().toISOString(),
}), { afterEffect: () => { process.kill(process.pid, "SIGKILL"); } }, () => {
  throw new Error("Worker must die before publishing");
});
await pipeline.run(action);
