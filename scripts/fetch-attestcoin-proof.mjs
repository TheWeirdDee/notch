import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 1, step 2: fetch the Attestcoin inclusion proof for the Sepolia stream-creation
// tx from the ProofBuilder HTTP API (fetch only, no SDK, no ethers). Polls
// /api/v1/attested-height until the tx's block is attested (per the Proof leg state
// machine: NEED_ATTESTATION -> ATTESTED -> PROOF_FETCHED), then fetches the proof by
// tx hash. No wallet needed — this is a plain, free HTTP call, safe to re-run.
import "dotenv/config";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CC3_PROOF_BUILDER_API, SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";

const API_BASE = process.env.CC3_PROOF_BUILDER_API ?? CC3_PROOF_BUILDER_API;
const chainKey = SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT; // confirmed live, see DECISIONS.md D6

const evidenceDir = fileURLToPath(new URL("../data/gate1", import.meta.url));
const streamCreationPath = new URL("./stream-creation.json", `file://${evidenceDir}/`);

let streamCreation;
try {
  streamCreation = JSON.parse(readFileSync(streamCreationPath, "utf8"));
} catch {
  console.error("Missing data/gate1/stream-creation.json. Run scripts/create-sablier-stream.mjs first.");
  process.exit(1);
}

const txHash = streamCreation.createTxHash;
console.log(`Fetching Attestcoin proof for chainKey=${chainKey} txHash=${txHash}...`);

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
  throw new Error(`Timed out waiting for block ${targetBlock} to be attested on chainKey ${chainKey}`);
}

await waitUntilAttested(streamCreation.blockNumber);

console.log("Block attested. Fetching proof by tx hash...");

let proofResponse;
for (let attempt = 1; attempt <= 20; attempt++) {
  const { status, body } = await getJson(`${API_BASE}/api/v1/proof-by-tx/${chainKey}/${txHash}`);
  if (status === 200) {
    proofResponse = body;
    break;
  }
  if (status === 422 && body?.retriable) {
    console.log(`  attempt ${attempt}: ${body.code} — ${body.message}. Retrying in 15s...`);
    await new Promise((r) => setTimeout(r, 15_000));
    continue;
  }
  console.error(`proof-by-tx failed: HTTP ${status}`, body);
  process.exit(1);
}

if (!proofResponse) {
  console.error("Exhausted retries fetching proof-by-tx.");
  process.exit(1);
}

console.log("Proof received.");
console.log("  headerNumber:", proofResponse.headerNumber);
console.log("  txIndex:", proofResponse.txIndex);
console.log("  cached:", proofResponse.cached);
console.log("  generatedAt:", proofResponse.generatedAt);
console.log("  txBytes length:", proofResponse.txBytes ? (proofResponse.txBytes.length - 2) / 2 : 0, "bytes");
console.log("  merkleProof.siblings:", proofResponse.merkleProof?.siblings?.length ?? 0);
console.log("  continuityProof.roots:", proofResponse.continuityProof?.roots?.length ?? 0);

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  new URL("./attestcoin-proof.json", `file://${evidenceDir}/`),
  JSON.stringify({ chainKey, txHash, fetchedAt: new Date().toISOString(), response: proofResponse }, null, 2)
);
console.log("\nWritten to data/gate1/attestcoin-proof.json (no secrets — this is a public proof payload).");
