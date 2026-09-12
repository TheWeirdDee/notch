import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 1, step 3: deploy Gate1DecodeProbe on CC3 Testnet, submit the fetched proof to
// verifyAndDecode (which calls the BlockProver precompile, checks receiptStatus == 1,
// and decodes depositAmount/unlockAmounts from the CreateLockupLinearStream event —
// never from user input), and compare the decoded fields against the local Sepolia
// record. This is the pass/fail moment for Gate 1.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, decodeEventLog, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { CC3_DECODER_CONTRACT, SABLIER_LOCKUP_SEPOLIA } from "./lib/constants.mjs";

const PRIVATE_KEY = process.env.CC3_PRIVATE_KEY;
const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";

if (!PRIVATE_KEY) {
  console.error("Missing CC3_PRIVATE_KEY in .env. Run scripts/generate-wallets.mjs first.");
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
if (balance === 0n) {
  console.error("Wallet has no CC3 funds.");
  process.exit(1);
}

const contractPath = fileURLToPath(new URL("../contracts/src/Gate1DecodeProbe.sol", import.meta.url));
console.log("Compiling Gate1DecodeProbe.sol...");
const { abi, bytecode } = compileSolidityFile(contractPath);

console.log("Deploying Gate1DecodeProbe...");
const deployHash = await walletClient.deployContract({
  account,
  abi,
  bytecode,
  args: [CC3_DECODER_CONTRACT, SABLIER_LOCKUP_SEPOLIA],
});
console.log("Deploy tx:", deployHash);
const deployReceipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
const probeAddress = deployReceipt.contractAddress;
console.log("Gate1DecodeProbe deployed at:", probeAddress);

const chainKey = BigInt(proof.chainKey);
const height = BigInt(proof.headerNumber);
const encodedTransaction = proof.txBytes;
const merkleRoot = proof.merkleProof.root;
const siblings = proof.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft }));
const lowerEndpointDigest = proof.continuityProof.lowerEndpointDigest;
const continuityRoots = proof.continuityProof.roots;

console.log("\nSimulating verifyAndDecode first (free) before sending for real...");
try {
  await publicClient.simulateContract({
    account,
    address: probeAddress,
    abi,
    functionName: "verifyAndDecode",
    args: [chainKey, height, encodedTransaction, merkleRoot, siblings, lowerEndpointDigest, continuityRoots],
  });
  console.log("Simulation succeeded.");
} catch (err) {
  console.error("Simulation FAILED. Recording as Gate 1 evidence (this IS the answer, not just an error).");
  console.error(err.shortMessage ?? err.message ?? err);
  mkdirSync(evidenceDir, { recursive: true });
  writeFileSync(
    new URL("./verify-and-decode-result.json", `file://${evidenceDir}/`),
    JSON.stringify(
      {
        outcome: "SIMULATION_FAILED",
        probeAddress,
        error: String(err.shortMessage ?? err.message ?? err),
        recordedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  process.exit(1);
}

console.log("\nSending verifyAndDecode for real...");
const callHash = await walletClient.writeContract({
  account,
  address: probeAddress,
  abi,
  functionName: "verifyAndDecode",
  args: [chainKey, height, encodedTransaction, merkleRoot, siblings, lowerEndpointDigest, continuityRoots],
});
console.log("Tx:", callHash);
const callReceipt = await publicClient.waitForTransactionReceipt({ hash: callHash });
console.log("Status:", callReceipt.status);

let decoded;
for (const log of callReceipt.logs) {
  try {
    const ev = decodeEventLog({ abi, data: log.data, topics: log.topics });
    if (ev.eventName === "Decoded1") {
      decoded = ev.args;
      break;
    }
  } catch {
    // skip
  }
}

if (!decoded) {
  console.error("verifyAndDecode succeeded on-chain but no Decoded1 event found in logs. Unexpected.");
  process.exit(1);
}

console.log("\nDecoded on-chain from the verified transaction:");
console.log("  streamId:", decoded.streamId.toString());
console.log("  recipient:", decoded.recipient);
console.log("  token:", decoded.token);
console.log("  depositAmount:", decoded.depositAmount.toString());
console.log("  cancelable:", decoded.cancelable);
console.log("  unlockAmountsStart:", decoded.unlockAmountsStart.toString());
console.log("  unlockAmountsCliff:", decoded.unlockAmountsCliff.toString());
console.log("  cliffTime:", decoded.cliffTime);
console.log("  endTime:", decoded.endTime);

const checks = [
  ["streamId", decoded.streamId.toString(), streamCreation.streamId],
  ["recipient", decoded.recipient.toLowerCase(), streamCreation.borrower.toLowerCase()],
  ["token", decoded.token.toLowerCase(), streamCreation.demoAsset.toLowerCase()],
  ["depositAmount", decoded.depositAmount.toString(), streamCreation.depositAmount],
  ["cancelable", decoded.cancelable, streamCreation.cancelable],
  ["unlockAmountsStart", decoded.unlockAmountsStart.toString(), streamCreation.unlockAmountsStart],
  ["unlockAmountsCliff", decoded.unlockAmountsCliff.toString(), streamCreation.unlockAmountsCliff],
  ["cliffTime", decoded.cliffTime.toString(), streamCreation.cliffTime.toString()],
  ["endTime", decoded.endTime.toString(), streamCreation.timestampsEnd.toString()],
];

console.log("\nComparing against the locally-recorded Sepolia creation:");
let allMatch = true;
for (const [field, onChain, local] of checks) {
  const match = String(onChain) === String(local);
  if (!match) allMatch = false;
  console.log(`  ${match ? "MATCH" : "DRIFT"}  ${field}: decoded=${onChain} local=${local}`);
}

const result = {
  outcome: allMatch ? "PASS" : "DRIFT",
  probeAddress,
  verifyAndDecodeTx: callHash,
  blockNumber: callReceipt.blockNumber.toString(),
  decoded: {
    streamId: decoded.streamId.toString(),
    recipient: decoded.recipient,
    token: decoded.token,
    depositAmount: decoded.depositAmount.toString(),
    cancelable: decoded.cancelable,
    unlockAmountsStart: decoded.unlockAmountsStart.toString(),
    unlockAmountsCliff: decoded.unlockAmountsCliff.toString(),
    cliffTime: decoded.cliffTime,
    endTime: decoded.endTime,
  },
  checks: checks.map(([field, onChain, local]) => ({ field, onChain: String(onChain), local: String(local), match: String(onChain) === String(local) })),
  recordedAt: new Date().toISOString(),
};

mkdirSync(evidenceDir, { recursive: true });
writeFileSync(
  new URL("./verify-and-decode-result.json", `file://${evidenceDir}/`),
  JSON.stringify(result, null, 2)
);

console.log(`\nGate 1 outcome: ${result.outcome}`);
console.log("Written to data/gate1/verify-and-decode-result.json");
if (!allMatch) process.exit(1);
