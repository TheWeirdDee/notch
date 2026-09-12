// Fetches fresh Attestcoin proofs for all 5 Gate 7 positions, concurrently.
import "dotenv/config";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CC3_PROOF_BUILDER_API, SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";

const chainKey = SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT;
const API_BASE = process.env.CC3_PROOF_BUILDER_API ?? CC3_PROOF_BUILDER_API;

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function waitUntilAttested(targetBlock, label) {
  const start = Date.now();
  while (Date.now() - start < 20 * 60_000) {
    const { status, body } = await getJson(`${API_BASE}/api/v1/attested-height/${chainKey}`);
    if (status === 200 && body?.attestedHeight != null) {
      const attested = BigInt(body.attestedHeight);
      if (attested >= BigInt(targetBlock)) return;
      console.log(`  [${label}] attested: ${attested} need >= ${targetBlock}`);
    }
    await new Promise((r) => setTimeout(r, 15_000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function fetchProof(position) {
  const label = `position-${position.positionIndex}`;
  await waitUntilAttested(position.blockNumber, label);
  let response;
  for (let attempt = 1; attempt <= 20; attempt++) {
    const { status, body } = await getJson(`${API_BASE}/api/v1/proof-by-tx/${chainKey}/${position.createTxHash}`);
    if (status === 200) {
      response = body;
      break;
    }
    if (status === 422 && body?.retriable) {
      await new Promise((r) => setTimeout(r, 15_000));
      continue;
    }
    throw new Error(`[${label}] proof-by-tx failed: HTTP ${status} ${JSON.stringify(body)}`);
  }
  if (!response) throw new Error(`[${label}] exhausted retries`);

  const { keccak256, stringToBytes } = await import("viem");
  const rawPayloadHash = keccak256(stringToBytes(JSON.stringify(response)));
  console.log(`  [${label}] proof received, generatedAt: ${response.generatedAt}`);
  return { chainKey, txHash: position.createTxHash, fetchedAt: new Date().toISOString(), response, rawPayloadHash };
}

const positions = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate7/positions/all-positions.json", import.meta.url)), "utf8"));

console.log("Fetching proofs for all 5 positions concurrently...");
const proofs = await Promise.all(positions.map(fetchProof));

for (let i = 0; i < proofs.length; i++) {
  writeFileSync(fileURLToPath(new URL(`../data/gate7/positions/proof-${i + 1}.json`, import.meta.url)), JSON.stringify(proofs[i], null, 2));
}
console.log("\nAll 5 proofs fetched and written.");
