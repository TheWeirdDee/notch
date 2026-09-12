import { writeEvidenceFile as writeFileSync } from "./lib/evidence.mjs";
// RETIRED: preserved historical evidence runner; incompatible with rulesVersion 2.
throw new Error("Historical runner retired. Run npm test for strict contract fixtures. Use current deployment tools only with explicit authorization.");
// Gate 3: the finance demo (two distinct funded lenders, PRD v2 invariant 12) plus the
// remaining apply-side parity tests against the Gate 2 fixture pack (zero-amount,
// exact-remainder, remainder-plus-one, two-lender-race, inactive-claim,
// unauthorized-venue). All pure CC3 calls -- no Sepolia proof needed, since the claim
// was already instantiated by scripts/gate3-instantiate-real.mjs.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, decodeEventLog } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { writeFileSync as nativeWriteFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS;
const VENUE_ADDRESS = process.env.VENUE_ADDRESS;
const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS;
const CLAIM_ID = process.env.CLAIM_ID;

const deployer = privateKeyToAccount(process.env.CC3_PRIVATE_KEY);
const lenderA = privateKeyToAccount(process.env.LENDER_A_PRIVATE_KEY);
const lenderB = privateKeyToAccount(process.env.LENDER_B_PRIVATE_KEY);

const publicClient = createPublicClient({ transport: http(RPC_URL) });
function clientFor(account) {
  return createWalletClient({ account, transport: http(RPC_URL) });
}

const { abi: registryAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));
const { abi: venueAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));
const { abi: usdcAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/MockUSDC.sol", import.meta.url)));

const results = [];

async function readAvailable() {
  return publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [CLAIM_ID] });
}

async function mintAndApprove(account, amount) {
  const wallet = clientFor(account);
  const mintHash = await wallet.writeContract({ account, address: MOCK_USDC_ADDRESS, abi: usdcAbi, functionName: "mint", args: [account.address, amount] });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  const approveHash = await wallet.writeContract({ account, address: MOCK_USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [VENUE_ADDRESS, amount] });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
}

async function finance(label, account, amount, expectSuccess) {
  const wallet = clientFor(account);
  try {
    await publicClient.simulateContract({ account, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [CLAIM_ID, amount] });
    if (!expectSuccess) {
      console.log(`  ${label}: UNEXPECTED SUCCESS (simulation passed but a revert was expected)`);
      results.push({ label, outcome: "UNEXPECTED_SUCCESS" });
      return;
    }
    const hash = await wallet.writeContract({ account, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [CLAIM_ID, amount] });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const availableAfter = await readAvailable();
    console.log(`  ${label}: SUCCEEDED tx=${hash} availableAfter=${availableAfter}`);
    results.push({ label, outcome: "SUCCEEDED", tx: hash, blockNumber: receipt.blockNumber.toString(), availableAfter: availableAfter.toString() });
  } catch (err) {
    const reason = err.cause?.data?.errorName ?? err.shortMessage ?? err.message;
    if (expectSuccess) {
      console.log(`  ${label}: UNEXPECTED REVERT -- ${reason}`);
      results.push({ label, outcome: "UNEXPECTED_REVERT", reason: String(reason) });
    } else {
      console.log(`  ${label}: reverted as expected -- ${reason}`);
      results.push({ label, outcome: "REVERTED", reason: String(reason) });
    }
  }
}

console.log("Lender A:", lenderA.address);
console.log("Lender B:", lenderB.address);
console.log("Claim:", CLAIM_ID);
console.log("Available before any draw:", (await readAvailable()).toString());

// `finance`'s amount is in the claim's deposit-asset decimals (18, NotchDemoAsset),
// NOT ccUSD's 6 decimals -- the venue converts to ccUSD internally at transfer time
// (see DECISIONS.md, the decimals-mismatch fix). Mint ccUSD headroom is still sized in
// ccUSD's own 6-decimal terms since that's the asset actually being minted/approved.
const bufferAmountCcUSD = 200_000n * 10n ** 6n;
const CAPACITY_DECIMALS = 10n ** 18n;

console.log("\nMinting + approving ccUSD for both lenders...");
await mintAndApprove(lenderA, bufferAmountCcUSD);
await mintAndApprove(lenderB, bufferAmountCcUSD);

console.log("\n[Demo hero] Lender A finances 70,000 (capacity units; venue converts to 70,000.000000 ccUSD)...");
await finance("lenderA-finances-70000", lenderA, 70_000n * CAPACITY_DECIMALS, true);

console.log("\n[remainder-plus-one parity] Lender B requests remainder + 1 raw capacity unit...");
await finance("remainder-plus-one", lenderB, 30_000n * CAPACITY_DECIMALS + 1n, false);

console.log("\n[Demo guardrail, PRD J2] Lender B over-requests 50,000 against the 30,000 remaining...");
await finance("lenderB-over-requests-50000", lenderB, 50_000n * CAPACITY_DECIMALS, false);

console.log("\n[zero-amount parity] Lender B requests 0...");
await finance("zero-amount", lenderB, 0n, false);

console.log("\n[exact-remainder parity] Lender A finances exactly the 30,000 remaining...");
await finance("exact-remainder-exhausts", lenderA, 30_000n * CAPACITY_DECIMALS, true);

console.log("\n[conservation, post-exhaustion] Lender B requests 1 unit against an exhausted claim...");
await finance("post-exhaustion-any-draw-fails", lenderB, 1n, false);

console.log("\n[unauthorized-venue parity] Deployer calls registry.consume() directly, bypassing the venue...");
try {
  await publicClient.simulateContract({ account: deployer, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "consume", args: [CLAIM_ID, 1n] });
  console.log("  UNEXPECTED SUCCESS");
  results.push({ label: "unauthorized-venue", outcome: "UNEXPECTED_SUCCESS" });
} catch (err) {
  const reason = err.cause?.data?.errorName ?? err.shortMessage ?? err.message;
  console.log(`  reverted as expected -- ${reason}`);
  results.push({ label: "unauthorized-venue", outcome: "REVERTED", reason: String(reason) });
}

console.log("\n[inactive-claim parity] Lender A finances a claimId that was never instantiated...");
const fakeClaimId = "0x" + "ee".repeat(32);
try {
  await publicClient.simulateContract({ account: lenderA, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [fakeClaimId, 1n] });
  console.log("  UNEXPECTED SUCCESS");
  results.push({ label: "inactive-claim", outcome: "UNEXPECTED_SUCCESS" });
} catch (err) {
  const reason = err.cause?.data?.errorName ?? err.shortMessage ?? err.message;
  console.log(`  reverted as expected -- ${reason}`);
  results.push({ label: "inactive-claim", outcome: "REVERTED", reason: String(reason) });
}

console.log("\nFinal available:", (await readAvailable()).toString());

const outDir = fileURLToPath(new URL("../data/gate3", import.meta.url));
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL("./finance-and-parity-results.json", `file://${outDir}/`), JSON.stringify({ recordedAt: new Date().toISOString(), claimId: CLAIM_ID, lenderA: lenderA.address, lenderB: lenderB.address, results }, null, 2));
console.log("\nWritten to data/gate3/finance-and-parity-results.json");
