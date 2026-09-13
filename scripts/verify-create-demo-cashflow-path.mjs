// Proof that the "Create a demo cashflow" (Path 2) code path actually works end to
// end on the real, deployed Sablier contract -- same ABI, same hardcoded compliance
// params, same balance/allowance/create/event-parse sequence as
// web/src/components/create-demo-cashflow.tsx. Run with a funded wallet because no
// browser/wallet-extension automation tool is available in this environment (D30);
// in the app itself this exact sequence runs from the connected user's own wallet via
// wagmi, never a private key held by the app or a server. This script does NOT
// replace the pre-loaded demo (web/src/lib/demo.ts stays on stream 189) -- it only
// proves the new code path is real, not a UI mockup.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SABLIER_LOCKUP_SEPOLIA } from "./lib/constants.mjs";
import { createWithTimestampsLLAbi, createLockupLinearStreamEventAbi } from "./lib/sablier-abi.mjs";

const demoAssetAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
];

const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY;
const RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const DEMO_ASSET = process.env.SEPOLIA_DEMO_ASSET;

const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: sepolia, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account, chain: sepolia, transport: http(RPC_URL) });

const DEPOSIT_HUMAN = 100000n;
const depositAmount = DEPOSIT_HUMAN * 10n ** 18n;

console.log(`Using wallet ${account.address} (same address/key that created streams 186/189 -- the pre-loaded demo is untouched).`);

const balance = await publicClient.readContract({ address: DEMO_ASSET, abi: demoAssetAbi, functionName: "balanceOf", args: [account.address] });
console.log("Demo asset balance:", balance.toString());
if (balance < depositAmount) {
  console.log("Balance insufficient -- minting (NotchDemoAsset.mint is open, testnet-only, by design).");
  const mintHash = await walletClient.writeContract({ address: DEMO_ASSET, abi: demoAssetAbi, functionName: "mint", args: [account.address, depositAmount] });
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
  console.log("mint tx:", mintHash, "status:", mintReceipt.status);
  if (mintReceipt.status !== "success") throw new Error("mint reverted");
} else {
  console.log("Balance already sufficient -- mint step skipped (same as the UI would skip it).");
}

const allowance = await publicClient.readContract({ address: DEMO_ASSET, abi: demoAssetAbi, functionName: "allowance", args: [account.address, SABLIER_LOCKUP_SEPOLIA] });
console.log("Current allowance to Sablier:", allowance.toString());
if (allowance < depositAmount) {
  const approveHash = await walletClient.writeContract({ address: DEMO_ASSET, abi: demoAssetAbi, functionName: "approve", args: [SABLIER_LOCKUP_SEPOLIA, depositAmount] });
  const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
  console.log("approve tx:", approveHash, "status:", approveReceipt.status);
  if (approveReceipt.status !== "success") throw new Error("approve reverted");
} else {
  console.log("Allowance already sufficient -- approve step skipped (same as the UI would skip it).");
}

const now = Math.floor(Date.now() / 1000);
const startTime = now;
const cliffTime = now + 30 * 24 * 60 * 60; // 30 days, matching DEMO_STREAM_CLIFF_SECONDS
const endTime = cliffTime + 24 * 60 * 60; // matching DEMO_STREAM_END_BUFFER_SECONDS

const params = {
  sender: account.address, recipient: account.address, depositAmount, token: DEMO_ASSET,
  cancelable: false, transferable: false, timestamps: { start: startTime, end: endTime }, shape: "",
};
const unlockAmounts = { start: 0n, cliff: 0n };
const granularity = 0;

console.log("Simulating createWithTimestampsLL against the live contract before sending...");
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
if (receipt.status !== "success") throw new Error("create reverted");

let streamId;
for (const log of receipt.logs) {
  try {
    const decoded = decodeEventLog({ abi: createLockupLinearStreamEventAbi, data: log.data, topics: log.topics });
    if (decoded.eventName === "CreateLockupLinearStream") { streamId = decoded.args.streamId; break; }
  } catch { /* not this event */ }
}
if (streamId === undefined) throw new Error("CreateLockupLinearStream event not found in receipt -- the exact failure mode Path 2's UI is required to surface honestly, never guess/increment a streamId");
console.log("stream id (parsed from the real event, not guessed):", streamId.toString());

const evidence = {
  purpose: "Path 2 (Create a demo cashflow) proof of work -- exercises the exact call sequence web/src/components/create-demo-cashflow.tsx uses, run via a funded key because no browser/wallet automation tool is available (D30). Does not replace the pre-loaded demo (web/src/lib/demo.ts remains stream 189).",
  network: "ethereum-sepolia",
  sourceContract: SABLIER_LOCKUP_SEPOLIA,
  createTxHash: createHash,
  blockNumber: receipt.blockNumber.toString(),
  streamId: streamId.toString(),
  sender: account.address,
  recipient: account.address,
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

const outDir = fileURLToPath(new URL("../data/path2-create-demo-cashflow", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("./proof-of-work.json", `file://${outDir}/`), JSON.stringify(evidence, null, 2));
console.log("\nWritten to data/path2-create-demo-cashflow/proof-of-work.json");
