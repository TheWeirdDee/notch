import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 6: the real Gate 1 stream cannot be reused under the fixed registry -- it was
// created with transferable=true, before AttestedCashflowRegistry required
// transferable=false (D23, collateral-integrity: a transferable Sablier NFT could
// change hands independent of who Notch's registry believes the borrower is). Streams
// are immutable once created, so a fresh, rule-compliant real stream is needed. Sized
// small on purpose -- this is the micro-loans gate.
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

// Micro-loan sized: 1,000 units of the 18-decimal deposit asset (vs. 100,000 in Gate 1).
const depositAmount = 1_000n * 10n ** 18n;

const now = Math.floor(Date.now() / 1000);
const startTime = now;
const cliffTime = now + 60 * 60; // 1 hour out -- short-lived micro position, still safely future
const endTime = cliffTime + 24 * 60 * 60;

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
  recipient: account.address, // borrower == this wallet, same as Gate 1
  depositAmount,
  token: DEMO_ASSET,
  cancelable: false,
  transferable: false, // <-- the field the original Gate 1 stream got wrong for this rule
  timestamps: { start: startTime, end: endTime },
  shape: "",
};
const unlockAmounts = { start: 0n, cliff: 0n };
const granularity = 0;

console.log("Simulating createWithTimestampsLL (transferable=false, micro-sized)...");
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

const outDir = fileURLToPath(new URL("../data/gate6", import.meta.url));
mkdirSync(outDir, { recursive: true });
const evidence = {
  network: "ethereum-sepolia",
  sourceChainKey: SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT,
  sourceContract: SABLIER_LOCKUP_SEPOLIA,
  createTxHash: createHash,
  blockNumber: receipt.blockNumber.toString(),
  streamId: streamId?.toString(),
  borrower: account.address,
  demoAsset: DEMO_ASSET,
  depositAmount: depositAmount.toString(),
  cancelable: false,
  transferable: false,
  unlockAmountsStart: "0",
  unlockAmountsCliff: "0",
  timestampsStart: startTime,
  timestampsEnd: endTime,
  cliffTime,
  recordedAt: new Date().toISOString(),
};
writeFileSync(new URL("./stream-creation.json", `file://${outDir}/`), JSON.stringify(evidence, null, 2));
console.log("\nWritten to data/gate6/stream-creation.json");
