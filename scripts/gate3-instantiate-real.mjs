import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Gate 3: instantiate a claim on AttestedCashflowRegistry from the real Gate 1 Sablier
// stream (tx 0x9d3a4...80cc8, stream 177), reusing the already-fetched Attestcoin
// proof (data/gate1/attestcoin-proof.json). Proves capacity = decoded event deposit,
// not typed, on the deployed contract.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

if (!PRIVATE_KEY || !REGISTRY_ADDRESS) {
  console.error("Missing CC3_PRIVATE_KEY or REGISTRY_ADDRESS in .env.");
  process.exit(1);
}

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

const balance = await publicClient.getBalance({ address: account.address });
console.log(`CC3 balance for ${account.address}: ${formatEther(balance)} CTC`);

const contractPath = fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url));
const { abi } = compileSolidityFile(contractPath);

const chainKey = BigInt(proof.chainKey);
const headerNumber = BigInt(proof.headerNumber);
const encodedTransaction = proof.txBytes;
const realSourceTxHash = streamCreation.createTxHash;
const merkleRoot = proof.merkleProof.root;
const siblings = proof.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft }));
const lowerEndpointDigest = proof.continuityProof.lowerEndpointDigest;
const continuityRoots = proof.continuityProof.roots;

const args = [chainKey, headerNumber, encodedTransaction, realSourceTxHash, merkleRoot, siblings, lowerEndpointDigest, continuityRoots];

console.log("Simulating instantiateClaim (real Gate 1 stream) first...");
await publicClient.simulateContract({
  account,
  address: REGISTRY_ADDRESS,
  abi,
  functionName: "instantiateClaim",
  args,
});
console.log("Simulation succeeded. Sending for real...");

const hash = await walletClient.writeContract({
  account,
  address: REGISTRY_ADDRESS,
  abi,
  functionName: "instantiateClaim",
  args,
});
console.log("Tx:", hash);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
console.log("Status:", receipt.status);

let claimId;
for (const log of receipt.logs) {
  try {
    const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (ev.eventName === "ClaimInstantiated") {
      claimId = ev.args.claimId;
      console.log("ClaimInstantiated:", {
        claimId: ev.args.claimId,
        borrower: ev.args.borrower,
        originalCapacity: ev.args.originalCapacity.toString(),
        lockedUntil: ev.args.lockedUntil,
      });
    }
  } catch {
    // skip
  }
}

if (!claimId) {
  console.error("No ClaimInstantiated event found.");
  process.exit(1);
}

const claim = await publicClient.readContract({ address: REGISTRY_ADDRESS, abi, functionName: "claims", args: [claimId] });
console.log("\nOn-chain claim state:", claim);

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("./real-claim.json", `file://${outDir}/`),
  JSON.stringify(
    {
      instantiateTx: hash,
      claimId,
      blockNumber: receipt.blockNumber.toString(),
      recordedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log("\nWritten to data/gate3/real-claim.json");
console.log("\nAdd to .env:");
console.log(`CLAIM_ID=${claimId}`);
