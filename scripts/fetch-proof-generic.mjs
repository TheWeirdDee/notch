import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Generic version of fetch-attestcoin-proof.mjs: fetches the Attestcoin proof for an
// arbitrary already-recorded evidence file (used for the Gate 3 bad-shape and
// reverting-tx fixtures, not just the Gate 1 stream). Usage:
//   node scripts/fetch-proof-generic.mjs data/gate3/bad-shape-stream.json data/gate3/bad-shape-proof.json
import "dotenv/config";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CC3_PROOF_BUILDER_API, SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("usage: node scripts/fetch-proof-generic.mjs <input-evidence.json> <output-proof.json>");
  process.exit(1);
}

const API_BASE = process.env.CC3_PROOF_BUILDER_API ?? CC3_PROOF_BUILDER_API;
const chainKey = SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT;

const evidence = JSON.parse(readFileSync(fileURLToPath(new URL(inputPath, `file://${process.cwd()}/`)), "utf8"));
const txHash = evidence.createTxHash;
if (!txHash) {
  console.error(`No createTxHash field in ${inputPath}`);
  process.exit(1);
}

console.log(`Fetching proof for chainKey=${chainKey} txHash=${txHash}...`);

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function waitUntilAttested(targetBlock, { intervalMs = 15_000, timeoutMs = 20 * 60_000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, body } = await getJson(`${API_BASE}/api/v1/attested-height/${chainKey}`);
    if (status === 200 && body?.attestedHeight != null) {
      const attested = BigInt(body.attestedHeight);
      console.log(`  attested height: ${attested} (need >= ${targetBlock})`);
      if (attested >= BigInt(targetBlock)) return;
    } else {
      console.log(`  attested-height check: HTTP ${status}`, body ?? "");
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for block ${targetBlock} to be attested`);
}

await waitUntilAttested(evidence.blockNumber);
console.log("Block attested. Fetching proof by tx hash...");

let proofResponse;
for (let attempt = 1; attempt <= 20; attempt++) {
  const { status, body } = await getJson(`${API_BASE}/api/v1/proof-by-tx/${chainKey}/${txHash}`);
  if (status === 200) {
    proofResponse = body;
    break;
  }
  if (status === 422 && body?.retriable) {
    console.log(`  attempt ${attempt}: ${body.code} -- ${body.message}. Retrying in 15s...`);
    await new Promise((r) => setTimeout(r, 15_000));
    continue;
  }
  console.error(`proof-by-tx failed: HTTP ${status}`, body);
  process.exit(1);
}

if (!proofResponse) {
  console.error("Exhausted retries.");
  process.exit(1);
}

console.log("Proof received. headerNumber:", proofResponse.headerNumber, "txBytes:", proofResponse.txBytes ? (proofResponse.txBytes.length - 2) / 2 : 0, "bytes");

const outFull = fileURLToPath(new URL(outputPath, `file://${process.cwd()}/`));
mkdirSync(dirname(outFull), { recursive: true });
writeFileSync(outFull, JSON.stringify({ chainKey, txHash, fetchedAt: new Date().toISOString(), response: proofResponse }, null, 2));
console.log(`Written to ${outputPath}`);
