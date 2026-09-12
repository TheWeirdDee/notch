import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 1, step 1: create a real non-cancellable Sablier Lockup Linear stream on
// Sepolia via createWithTimestampsLL, matching Notch-PRD.md section 20 exactly:
// cancelable=false, unlockAmounts.start=0, unlockAmounts.cliff=0, cliff in the future.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SABLIER_LOCKUP_SEPOLIA, SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";
import {
  createWithTimestampsLLAbi,
  createLockupLinearStreamEventAbi,
  erc20AbiMinimal,
} from "./lib/sablier-abi.mjs";

const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DEMO_ASSET = process.env.SEPOLIA_DEMO_ASSET;

if (!PRIVATE_KEY) {
  console.error("Missing SEPOLIA_PRIVATE_KEY in .env. Run scripts/generate-wallets.mjs first.");
  process.exit(1);
}
if (!DEMO_ASSET) {
  console.error("Missing SEPOLIA_DEMO_ASSET in .env. Run scripts/deploy-test-token.mjs first.");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sepolia balance for ${account.address}: ${formatEther(balance)} ETH`);
if (balance === 0n) {
  console.error("Wallet has no Sepolia ETH. Fund it from a faucet, then re-run.");
  process.exit(1);
}

const depositAmount = 100_000n * 10n ** 18n; // 100,000 NDA — arbitrary demo capacity

const now = Math.floor(Date.now() / 1000);
const startTime = now;
const cliffTime = now + 7 * 24 * 60 * 60; // 7 days out — future cliff, buffer for attestation
const endTime = cliffTime + 30 * 24 * 60 * 60; // 30 days streaming after cliff

console.log("Approving SablierLockup to spend depositAmount...");
const approveHash = await walletClient.writeContract({
  address: DEMO_ASSET,
  abi: erc20AbiMinimal,
  functionName: "approve",
  args: [SABLIER_LOCKUP_SEPOLIA, depositAmount],
});
console.log("Approve tx:", approveHash);
await publicClient.waitForTransactionReceipt({ hash: approveHash });

const params = {
  sender: account.address,
  recipient: account.address, // borrower == this wallet for the Gate 1 spike
  depositAmount,
  token: DEMO_ASSET,
  cancelable: false,
  transferable: true,
  timestamps: { start: startTime, end: endTime },
  shape: "",
};

const unlockAmounts = { start: 0n, cliff: 0n };
const granularity = 0; // sentinel for 1 second

console.log("Simulating createWithTimestampsLL first (free — no gas spent) before sending for real...");
console.log({ params, unlockAmounts, granularity, cliffTime });

// Sepolia ETH here can't be topped up for 2 days, so validate the call via eth_call
// (simulateContract) before broadcasting. If our struct/ABI layout is wrong, this
// throws with the revert reason and no gas is spent.
try {
  await publicClient.simulateContract({
    account,
    address: SABLIER_LOCKUP_SEPOLIA,
    abi: createWithTimestampsLLAbi,
    functionName: "createWithTimestampsLL",
    args: [params, unlockAmounts, granularity, cliffTime],
  });
  console.log("Simulation succeeded. Proceeding to send the real transaction.");
} catch (err) {
  console.error("Simulation FAILED — not sending the real transaction. No gas spent.");
  console.error(err.shortMessage ?? err.message ?? err);
  process.exit(1);
}

const createHash = await walletClient.writeContract({
  address: SABLIER_LOCKUP_SEPOLIA,
  abi: createWithTimestampsLLAbi,
  functionName: "createWithTimestampsLL",
  args: [params, unlockAmounts, granularity, cliffTime],
});
console.log("Create tx:", createHash);

const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
console.log("Status:", receipt.status);
console.log("Block number:", receipt.blockNumber);

let streamId;
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({
      abi: createLockupLinearStreamEventAbi,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName === "CreateLockupLinearStream") {
      streamId = decoded.args.streamId;
      break;
    }
  } catch {
    // not this event, skip
  }
}

if (!streamId) {
  console.error("Could not find CreateLockupLinearStream event in receipt logs.");
  process.exit(1);
}

console.log("Stream id:", streamId.toString());

const evidenceDir = fileURLToPath(new URL("../data/gate1", import.meta.url));
mkdirSync(evidenceDir, { recursive: true });

// Confirmed live against the ChainInfo precompile by scripts/confirm-chain-key.mjs
// (data/gate1/chain-key.json) before this was relied on — see DECISIONS.md D6.
const evidence = {
  network: "ethereum-sepolia",
  sourceChainKey: SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT,
  sourceContract: SABLIER_LOCKUP_SEPOLIA,
  createTxHash: createHash,
  blockNumber: receipt.blockNumber.toString(),
  streamId: streamId.toString(),
  borrower: account.address,
  demoAsset: DEMO_ASSET,
  depositAmount: depositAmount.toString(),
  cancelable: false,
  unlockAmountsStart: "0",
  unlockAmountsCliff: "0",
  timestampsStart: startTime,
  timestampsEnd: endTime,
  cliffTime,
  recordedAt: new Date().toISOString(),
};

writeFileSync(
  new URL("./stream-creation.json", `file://${evidenceDir}/`),
  JSON.stringify(evidence, null, 2)
);

console.log("\nEvidence written to data/gate1/stream-creation.json");
console.log("\nAdd to .env:");
console.log(`SEPOLIA_STREAM_ID=${streamId.toString()}`);
console.log(`SEPOLIA_CREATE_TX_HASH=${createHash}`);
