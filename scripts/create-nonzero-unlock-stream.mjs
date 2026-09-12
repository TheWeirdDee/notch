import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 3 parity: a real Sablier stream with unlockAmounts.start != 0, so
// instantiateClaim's UnlockAmountsNotZero check can be exercised against a genuinely
// successfully-verified proof. Same pattern as create-bad-shape-stream.mjs.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SABLIER_LOCKUP_SEPOLIA, SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT } from "./lib/constants.mjs";
import { createWithTimestampsLLAbi, createLockupLinearStreamEventAbi, erc20AbiMinimal } from "./lib/sablier-abi.mjs";

const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DEMO_ASSET = process.env.SEPOLIA_DEMO_ASSET;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

const balance = await publicClient.getBalance({ address: account.address });
console.log(`Sepolia balance: ${formatEther(balance)} ETH`);

const depositAmount = 1_000n * 10n ** 18n;
const now = Math.floor(Date.now() / 1000);
const startTime = now;
const cliffTime = now + 7 * 24 * 60 * 60;
const endTime = cliffTime + 30 * 24 * 60 * 60;

console.log("Approving SablierLockup...");
const approveHash = await walletClient.writeContract({
  address: DEMO_ASSET,
  abi: erc20AbiMinimal,
  functionName: "approve",
  args: [SABLIER_LOCKUP_SEPOLIA, depositAmount],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });
console.log("Approve tx:", approveHash);

const params = {
  sender: account.address,
  recipient: account.address,
  depositAmount,
  token: DEMO_ASSET,
  cancelable: false,
  transferable: true,
  timestamps: { start: startTime, end: endTime },
  shape: "",
};
// 100 tokens unlocked immediately at start -- the one bad-shape field under test.
const unlockAmounts = { start: 100n * 10n ** 18n, cliff: 0n };
const granularity = 0;

console.log("Simulating createWithTimestampsLL (unlockAmounts.start != 0)...");
await publicClient.simulateContract({
  account,
  address: SABLIER_LOCKUP_SEPOLIA,
  abi: createWithTimestampsLLAbi,
  functionName: "createWithTimestampsLL",
  args: [params, unlockAmounts, granularity, cliffTime],
});
console.log("Simulation OK. Sending for real...");

const createHash = await walletClient.writeContract({
  address: SABLIER_LOCKUP_SEPOLIA,
  abi: createWithTimestampsLLAbi,
  functionName: "createWithTimestampsLL",
  args: [params, unlockAmounts, granularity, cliffTime],
});
console.log("Create tx:", createHash);
const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
console.log("Status:", receipt.status, "block:", receipt.blockNumber);

let streamId;
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: createLockupLinearStreamEventAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "CreateLockupLinearStream") {
      streamId = decoded.args.streamId;
      break;
    }
  } catch {
    // skip
  }
}
console.log("Stream id:", streamId?.toString());

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
const evidence = {
  purpose: "non-zero-unlock fixture for Gate 3 on-chain parity test",
  network: "ethereum-sepolia",
  sourceChainKey: SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT,
  sourceContract: SABLIER_LOCKUP_SEPOLIA,
  createTxHash: createHash,
  blockNumber: receipt.blockNumber.toString(),
  streamId: streamId?.toString(),
  unlockAmountsStart: (100n * 10n ** 18n).toString(),
  recordedAt: new Date().toISOString(),
};
writeFileSync(new URL("./nonzero-unlock-stream.json", `file://${outDir}/`), JSON.stringify(evidence, null, 2));
console.log("\nWritten to data/gate3/nonzero-unlock-stream.json");
