import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// Gate 3 parity: a real Sepolia transaction that gets INCLUDED in a block but REVERTS
// (receiptStatus=0), so instantiateClaim's ReceiptNotSuccess check can be exercised for
// real -- the precompile proves inclusion, not success (PRD known boundary). Deliberately
// violates Sablier's own requirement that unlockAmounts.start + unlockAmounts.cliff <=
// depositAmount, guaranteeing a revert inside createWithTimestampsLL.
//
// Gas estimation would normally refuse to broadcast a call that's certain to revert, so
// this passes an explicit gas limit to force it onto the chain instead of failing
// client-side before broadcast -- the whole point here is a REAL included-but-reverted
// transaction, not a simulated one.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { SABLIER_LOCKUP_SEPOLIA } from "./lib/constants.mjs";
import { createWithTimestampsLLAbi, erc20AbiMinimal } from "./lib/sablier-abi.mjs";

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

console.log("Approving SablierLockup (harmless, this tx itself succeeds)...");
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
// unlockAmounts.start alone exceeds depositAmount -- Sablier requires
// start + cliff <= depositAmount, so this must revert inside the Sablier contract.
const unlockAmounts = { start: depositAmount * 2n, cliff: 0n };
const granularity = 0;

console.log("Confirming this reverts (informational simulate, not a gate)...");
try {
  await publicClient.simulateContract({
    account,
    address: SABLIER_LOCKUP_SEPOLIA,
    abi: createWithTimestampsLLAbi,
    functionName: "createWithTimestampsLL",
    args: [params, unlockAmounts, granularity, cliffTime],
  });
  console.error("UNEXPECTED: simulation succeeded. This fixture requires a revert -- aborting, not sending.");
  process.exit(1);
} catch (err) {
  console.log("Confirmed revert (as intended):", err.shortMessage ?? err.message);
}

console.log("Sending for real with an explicit gas limit (bypassing gas estimation)...");
const createHash = await walletClient.writeContract({
  address: SABLIER_LOCKUP_SEPOLIA,
  abi: createWithTimestampsLLAbi,
  functionName: "createWithTimestampsLL",
  args: [params, unlockAmounts, granularity, cliffTime],
  gas: 500_000n,
});
console.log("Create tx (expected to revert on-chain):", createHash);
const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
console.log("Status:", receipt.status, "(expect 'reverted') block:", receipt.blockNumber);

if (receipt.status !== "reverted") {
  console.error("Expected a reverted receipt but got:", receipt.status);
  process.exit(1);
}

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
const evidence = {
  purpose: "failed-receipt fixture for Gate 3 on-chain parity test -- deliberately reverted on Sepolia",
  network: "ethereum-sepolia",
  createTxHash: createHash,
  blockNumber: receipt.blockNumber.toString(),
  status: receipt.status,
  recordedAt: new Date().toISOString(),
};
writeFileSync(new URL("./reverting-tx.json", `file://${outDir}/`), JSON.stringify(evidence, null, 2));
console.log("\nWritten to data/gate3/reverting-tx.json");
