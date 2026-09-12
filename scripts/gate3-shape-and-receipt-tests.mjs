import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Gate 3 parity: the bad-shape (cancelable=true) and failed-receipt (reverted Sepolia
// tx) fixtures, tested against real, independently-verified proofs -- not tampered
// fields on the good stream's proof.
import "dotenv/config";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ transport: http(RPC_URL) });

const { abi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));

function loadProof(path) {
  return JSON.parse(readFileSync(fileURLToPath(new URL(path, `file://${process.cwd()}/`)), "utf8"));
}

function argsFrom(proofRecord, realSourceTxHash) {
  const p = proofRecord.response;
  return [
    BigInt(p.chainKey),
    BigInt(p.headerNumber),
    p.txBytes,
    realSourceTxHash,
    p.merkleProof.root,
    p.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
    p.continuityProof.lowerEndpointDigest,
    p.continuityProof.roots,
  ];
}

async function expectRevert(label, args) {
  try {
    await publicClient.simulateContract({ account, address: REGISTRY_ADDRESS, abi, functionName: "instantiateClaim", args });
    console.log(`  ${label}: UNEXPECTED SUCCESS`);
    return { label, outcome: "UNEXPECTED_SUCCESS" };
  } catch (err) {
    const errorName = err.cause?.data?.errorName ?? err.cause?.cause?.data?.errorName;
    const reason = errorName ?? err.shortMessage ?? err.message;
    console.log(`  ${label}: reverted as expected -- ${reason}`);
    return { label, outcome: "REVERTED", reason: String(reason) };
  }
}

const results = [];

console.log("Test: cancelable-stream (real, independently-verified bad-shape stream, stream 178)");
const badShapeProof = loadProof("data/gate3/bad-shape-proof.json");
results.push(await expectRevert("cancelable-stream", argsFrom(badShapeProof, "0x6cd2ae6e62c48e6fc971b1ffe0c76f4df6feb8c92c359466e608ef29e1de910d")));

console.log("Test: failed-receipt (real, deliberately-reverted Sepolia tx)");
const revertingProof = loadProof("data/gate3/reverting-tx-proof.json");
results.push(await expectRevert("failed-receipt", argsFrom(revertingProof, "0x7a3e762b3b29178df8627e6152aad089842a4955dae1e8633798845b28dd1077")));

console.log("\nSummary:");
for (const r of results) console.log(" ", r.label, "->", r.outcome, r.reason ? `(${r.reason})` : "");

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("./shape-and-receipt-tests.json", `file://${outDir}/`), JSON.stringify({ recordedAt: new Date().toISOString(), results }, null, 2));
console.log("\nWritten to data/gate3/shape-and-receipt-tests.json");

if (results.some((r) => r.outcome !== "REVERTED")) process.exit(1);
