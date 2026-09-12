import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Gate 3 parity: negative-path tests that reuse the real Gate 1 proof (already fetched
// fresh for the successful instantiate), run promptly before it can go stale again
// (Gate 3 already found continuity proofs are time-sensitive -- see DECISIONS.md).
//   - replay: same real proof submitted again -> ClaimAlreadyActive
//   - wrong-chainKey: same real proof, chainKey swapped to 3 -> reverts (reason recorded, not assumed)
//   - fake-merkle-proof: same real proof, one sibling hash corrupted -> VerificationFailed
import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

const evidenceDir = fileURLToPath(new URL("../data/gate1", import.meta.url));
function readEvidence(name) {
  return JSON.parse(readFileSync(new URL(`./${name}`, `file://${evidenceDir}/`), "utf8"));
}
const streamCreation = readEvidence("stream-creation.json");
const proofRecord = readEvidence("attestcoin-proof.json");
const proof = proofRecord.response;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, transport: http(RPC_URL) });

const contractPath = fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url));
const { abi } = compileSolidityFile(contractPath);

function baseArgs(overrides = {}) {
  return [
    overrides.chainKey ?? BigInt(proof.chainKey),
    BigInt(proof.headerNumber),
    overrides.txBytes ?? proof.txBytes,
    streamCreation.createTxHash,
    overrides.merkleRoot ?? proof.merkleProof.root,
    overrides.siblings ?? proof.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
    proof.continuityProof.lowerEndpointDigest,
    proof.continuityProof.roots,
  ];
}

async function expectRevert(label, args) {
  try {
    await publicClient.simulateContract({ account, address: REGISTRY_ADDRESS, abi, functionName: "instantiateClaim", args });
    return { label, outcome: "UNEXPECTED_SUCCESS" };
  } catch (err) {
    const reason = err.cause?.reason ?? err.shortMessage ?? err.message;
    console.log(`  ${label}: reverted as expected -- ${reason}`);
    return { label, outcome: "REVERTED", reason: String(reason) };
  }
}

const results = [];

console.log("Test: replay (same real proof again)");
results.push(await expectRevert("replay", baseArgs()));

console.log("Test: wrong-chainKey (chainKey=3 instead of 1, same real proof otherwise)");
results.push(await expectRevert("wrong-chain-key", baseArgs({ chainKey: 3n })));

console.log("Test: fake-merkle-proof (one sibling hash corrupted)");
const corruptedSiblings = proof.merkleProof.siblings.map((s, i) =>
  i === 0 ? { hash: "0x" + "ab".repeat(32), isLeft: s.isLeft } : { hash: s.hash, isLeft: s.isLeft }
);
results.push(await expectRevert("fake-merkle-proof", baseArgs({ siblings: corruptedSiblings })));

console.log("\nSummary:");
for (const r of results) console.log(" ", r.label, "->", r.outcome, r.reason ? `(${r.reason})` : "");

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("./proof-negative-tests.json", `file://${outDir}/`),
  JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2)
);
console.log("\nWritten to data/gate3/proof-negative-tests.json");

const anyUnexpected = results.some((r) => r.outcome !== "REVERTED");
if (anyUnexpected) {
  console.error("\nAt least one test did not revert as expected.");
  process.exit(1);
}
