import { verifyReceipt } from "./verify.js";
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PaperPipeline, paths, assembleFreshProof, makePublicClient, checkDeployment, type PaperAction } from "@notch/adapter";

const [, , command, ...rest] = process.argv;

function usage(): never {
  console.error("usage: notch verify <receipt_id> | recover | paper <action.json> | deployment-check [manifest.json]");
  process.exit(2);
}

switch (command) {
  case "deployment-check": {
    const manifest = JSON.parse(readFileSync(rest[0] ?? join(paths.DATA_DIR, "deployments", "current.json"), "utf8"));
    await checkDeployment(makePublicClient(process.env.CC3_RPC_URL), manifest);
    console.log("MATCH: registry, venue, token and settlement decimals match the deployment manifest.");
    break;
  }
  case "recover":
  case "paper": {
    const pipeline = new PaperPipeline(join(paths.DATA_DIR, "paper"), async (a) => {
      const account = process.env.LENDER_A_ADDRESS as `0x${string}`;
      if (!account) throw new Error("LENDER_A_ADDRESS is required for proof verification calls");
      const { proof, fetched } = await assembleFreshProof(
        makePublicClient(process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network"),
        account, a.chainKey, a.txHash, a.blockNumber, { streamId: a.streamId });
      return { generatedAt: fetched.response.generatedAt, inputs: {
        chainKey: a.chainKey, txHash: a.txHash, headerNumber: fetched.response.headerNumber,
        rawProofPayloadHash: fetched.rawPayloadHash, decodedProof: proof } };
    });
    await pipeline.boot();
    if (command === "paper") {
      if (!rest[0]) usage();
      console.log(JSON.stringify(await pipeline.run(JSON.parse(readFileSync(rest[0], "utf8")) as PaperAction), null, 2));
    } else console.log("PAPER recovery complete; no open receipts.");
    break;
  }
  case "verify": {
    const receiptId = rest[0];
    if (!receiptId) usage();
    const outcome = verifyReceipt(receiptId);
    console.log(`receipt ${outcome.receiptId}`);
    for (const check of outcome.checks) {
      console.log(`  [${check.ok ? "ok  " : "FAIL"}] ${check.name}`);
      if (!check.ok) {
        console.log(`        expected: ${JSON.stringify(check.expected)}`);
        console.log(`        actual:   ${JSON.stringify(check.actual)}`);
      }
    }
    console.log(outcome.status);
    process.exit(outcome.status === "MATCH" ? 0 : 1);
    break;
  }
  default:
    usage();
}
