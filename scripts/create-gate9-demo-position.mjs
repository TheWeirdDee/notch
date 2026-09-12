// Gate 8: creates the ONE real, rule-compliant Sepolia stream used as the frontend's
// money-shot demo position. Deposit = 100,000 (18-decimal NotchDemoAsset), matching the
// PRD's worked example scale -- a deliberate choice distinct from Gate 6/7's micro-scale
// evidence set (see DECISIONS.md, Gate 8 scale decision). cancelable=false,
// transferable=false, zero unlock amounts, a long cliff (48h) so the position stays
// financeable across the whole build/test/demo window.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync, mkdirSync } from "node:fs";
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
console.log(`Sepolia ETH balance: ${formatEther(balance)}`);

const DEPOSIT_HUMAN = 100000n;
const depositAmount = DEPOSIT_HUMAN * 10n ** 18n;

const now = Math.floor(Date.now() / 1000);
const startTime = now;
const cliffTime = now + 30 * 24 * 60 * 60; // 30 days -- comfortably past the Gate 9 submission window, FIX 3
const endTime = cliffTime + 24 * 60 * 60;

console.log(`\n=== Gate 8 demo position: deposit ${DEPOSIT_HUMAN} ===`);

const approveHash = await walletClient.writeContract({
  address: DEMO_ASSET, abi: erc20AbiMinimal, functionName: "approve",
  args: [SABLIER_LOCKUP_SEPOLIA, depositAmount],
});
await publicClient.waitForTransactionReceipt({ hash: approveHash });
console.log("approve tx:", approveHash);

const params = {
  sender: account.address, recipient: account.address, depositAmount, token: DEMO_ASSET,
  cancelable: false, transferable: false, timestamps: { start: startTime, end: endTime }, shape: "",
};
const unlockAmounts = { start: 0n, cliff: 0n };
const granularity = 0;

await publicClient.simulateContract({
  account, address: SABLIER_LOCKUP_SEPOLIA, abi: createWithTimestampsLLAbi,
  functionName: "createWithTimestampsLL", args: [params, unlockAmounts, granularity, cliffTime],
});

const createHash = await walletClient.writeContract({
  account, address: SABLIER_LOCKUP_SEPOLIA, abi: createWithTimestampsLLAbi,
  functionName: "createWithTimestampsLL", args: [params, unlockAmounts, granularity, cliffTime],
});
console.log("create tx:", createHash);
const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
console.log("status:", receipt.status, "block:", receipt.blockNumber);

let streamId;
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: createLockupLinearStreamEventAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "CreateLockupLinearStream") { streamId = decoded.args.streamId; break; }
  } catch { /* skip */ }
}
console.log("stream id:", streamId?.toString());

const evidence = {
  purpose: "Gate 9 FIX 3 replacement demo position (stream 186 expired 2026-09-12 11:16:50 UTC)",
  network: "ethereum-sepolia",
  sourceChainKey: SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT,
  sourceContract: SABLIER_LOCKUP_SEPOLIA,
  createTxHash: createHash,
  blockNumber: receipt.blockNumber.toString(),
  streamId: streamId?.toString(),
  borrower: account.address,
  demoAsset: DEMO_ASSET,
  depositAmount: depositAmount.toString(),
  depositAmountHuman: DEPOSIT_HUMAN.toString(),
  cancelable: false,
  transferable: false,
  unlockAmountsStart: "0",
  unlockAmountsCliff: "0",
  timestampsStart: startTime,
  timestampsEnd: endTime,
  cliffTime,
  recordedAt: new Date().toISOString(),
};

const outDir = fileURLToPath(new URL("../data/gate8", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("./demo-position-fix3.json", `file://${outDir}/`), JSON.stringify(evidence, null, 2));
console.log("\nWritten to data/gate8/demo-position-fix3.json");
