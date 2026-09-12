import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 6, step 1 (continued): instantiate the real Gate 1 claim against the NEW,
// fixed registry, using a freshly-fetched proof (never replay a saved one, D12/D18).
// instantiateClaim's signature gained requestedStreamId since Gate 3 (D23, explicit
// stream selection).
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;

const evidenceDir = fileURLToPath(new URL("../data/gate6", import.meta.url));
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

const { abi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));

const chainKey = BigInt(proof.chainKey);
const headerNumber = BigInt(proof.headerNumber);
const encodedTransaction = proof.txBytes;
const realSourceTxHash = streamCreation.createTxHash;
const requestedStreamId = BigInt(streamCreation.streamId); // 177
const merkleRoot = proof.merkleProof.root;
const siblings = proof.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft }));
const lowerEndpointDigest = proof.continuityProof.lowerEndpointDigest;
const continuityRoots = proof.continuityProof.roots;

const args = [chainKey, headerNumber, encodedTransaction, realSourceTxHash, requestedStreamId, merkleRoot, siblings, lowerEndpointDigest, continuityRoots];

console.log("Simulating instantiateClaim (real Gate 1 stream, new registry) first...");
await publicClient.simulateContract({ account, address: REGISTRY_ADDRESS, abi, functionName: "instantiateClaim", args });
console.log("Simulation succeeded. Sending for real...");

const hash = await walletClient.writeContract({ account, address: REGISTRY_ADDRESS, abi, functionName: "instantiateClaim", args });
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

// Note: this is a DIFFERENT real position from Gate 3's (stream 180, not 177 -- the
// original Gate 1/3 stream has transferable=true and can never satisfy the new
// registry's TransferableNotAllowed check, since Sablier streams are immutable once
// created). A different claimId here is expected and correct, not a regression.
console.log("\nGate 3 (old registry, stream 177) claimId:", process.env.GATE3_CLAIM_ID);
console.log("Gate 6 (new registry, stream 180) claimId:", claimId);

const outDir = fileURLToPath(new URL("../data/gate6", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(
  new URL("./real-claim.json", `file://${outDir}/`),
  JSON.stringify(
    {
      instantiateTx: hash,
      claimId,
      note: "New position (stream 180), not a re-instantiation of Gate 3's stream 177 -- see script header comment.",
      blockNumber: receipt.blockNumber.toString(),
      recordedAt: new Date().toISOString(),
    },
    null,
    2
  )
);
console.log("\nWritten to data/gate6/real-claim.json");
console.log(`\nAdd to .env:\nCLAIM_ID=${claimId}`);
