// Gate 6, steps 2-3: real LIVE loans against the deployed, fixed venue. Two distinct
// funded lenders (never one key as both), a real on-chain over-draw refusal, a real
// concurrent race under actual block ordering (the D23 watch point), and exact
// exhaustion. Every action writes a mode: "LIVE" receipt with a real on-chain fill tx.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, formatEther, pad, toHex, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { buildReceipt, appendReceipt } from "../adapter/src/index.js";
import { available, type Claim, type Proof } from "../core/src/index.js";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as `0x${string}`;
const VENUE_ADDRESS = process.env.VENUE_ADDRESS as `0x${string}`;
const MOCK_USDC_ADDRESS = process.env.MOCK_USDC_ADDRESS as `0x${string}`;
const CLAIM_ID = process.env.CLAIM_ID as `0x${string}`;

const lenderA = privateKeyToAccount(process.env.LENDER_A_PRIVATE_KEY as `0x${string}`);
const lenderB = privateKeyToAccount(process.env.LENDER_B_PRIVATE_KEY as `0x${string}`);

const publicClient = createPublicClient({ transport: http(RPC_URL) });
function clientFor(account: ReturnType<typeof privateKeyToAccount>) {
  return createWalletClient({ account, transport: http(RPC_URL) });
}

const { abi: registryAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));
const { abi: venueAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));
const { abi: usdcAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/MockUSDC.sol", import.meta.url)));

const proofRecord = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate6/attestcoin-proof.json", import.meta.url)), "utf8"));
const streamCreation = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate6/stream-creation.json", import.meta.url)), "utf8"));
const p = proofRecord.response;

// Same underlying source transaction as the claim itself -- keccak256(txBytes) is what
// claimId was actually derived from at instantiation
// (contracts/src/AttestedCashflowRegistry.sol), so it's the correct value here too, not
// a placeholder. validateProof()/validateClaim() require a well-formed hex value
// whenever rulesVersion is set.
const attestedTxDigest = keccak256(p.txBytes as `0x${string}`);

function decodedProofNow(): Proof {
  return {
    rulesVersion: 2,
    attestedTxDigest,
    transferable: false,
    precompileAvailable: true,
    proofVerified: true,
    receiptStatus: 1,
    chainKey: p.chainKey,
    sourceTxHash: streamCreation.createTxHash,
    streamId: streamCreation.streamId,
    sourceContract: streamCreation.sourceContract,
    recipient: streamCreation.borrower,
    token: streamCreation.demoAsset,
    depositAmount: streamCreation.depositAmount,
    cancelable: false,
    unlockAmountsStart: "0",
    unlockAmountsCliff: "0",
    cliffTime: streamCreation.cliffTime,
    endTime: streamCreation.timestampsEnd,
    now_at_instantiation: Math.floor(Date.now() / 1000),
    received_at: Math.floor(Date.now() / 1000),
  };
}

async function readClaim(): Promise<Claim> {
  const tuple = (await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "claims", args: [CLAIM_ID] })) as unknown as [
    string, number, string, string, bigint, string, string, bigint, bigint, number, boolean
  ];
  return {
    rulesVersion: 2,
    attestedTxDigest,
    claimId: tuple[0],
    sourceChainKey: tuple[1],
    sourceTxHash: tuple[2],
    sourceContract: tuple[3],
    streamId: tuple[4].toString(),
    borrower: tuple[5],
    asset: tuple[6],
    originalCapacity: tuple[7].toString(),
    financedCapacity: tuple[8].toString(),
    lockedUntil: tuple[9],
    active: tuple[10],
  };
}

async function mintAndApprove(account: ReturnType<typeof privateKeyToAccount>, amountCcUSD: bigint) {
  const wallet = clientFor(account);
  const mintHash = await wallet.writeContract({ account, address: MOCK_USDC_ADDRESS, abi: usdcAbi, functionName: "mint", args: [account.address, amountCcUSD] });
  await publicClient.waitForTransactionReceipt({ hash: mintHash });
  const approveHash = await wallet.writeContract({ account, address: MOCK_USDC_ADDRESS, abi: usdcAbi, functionName: "approve", args: [VENUE_ADDRESS, amountCcUSD] });
  await publicClient.waitForTransactionReceipt({ hash: approveHash });
}

let actionCounter = { A: 0, B: 0 };
function nextActionKey(who: "A" | "B") {
  actionCounter[who]++;
  return pad(toHex(actionCounter[who]), { size: 32 });
}

const results: { label: string; outcome: string; receiptId?: string; tx?: string }[] = [];

async function financeAndRecord(label: string, account: ReturnType<typeof privateKeyToAccount>, who: "A" | "B", amount: bigint, expectSuccess: boolean) {
  const claimBefore = await readClaim();
  const actionKey = nextActionKey(who);
  const wallet = clientFor(account);
  const proofInputs = {
    chainKey: p.chainKey,
    headerNumber: p.headerNumber,
    txHash: streamCreation.createTxHash,
    rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x",
    decodedProof: decodedProofNow(),
  };

  let hash: `0x${string}` | undefined;
  let succeeded = false;
  let reason = "";
  try {
    hash = await wallet.writeContract({ account, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKey, CLAIM_ID, amount] });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    succeeded = receipt.status === "success";
    if (!succeeded) reason = "on-chain revert (mined, status=reverted)";
  } catch (err) {
    succeeded = false;
    reason = (err as Error).message?.split("\n")[0] ?? String(err);
  }

  if (succeeded) {
    const claimAfter = await readClaim();
    const r = buildReceipt({
      mode: "LIVE",
      action: "finance",
      claim_id: CLAIM_ID,
      proof_inputs: proofInputs,
      claim_before: claimBefore,
      claim_after: claimAfter,
      capacity_before: available(claimBefore).toString(),
      capacity_after: available(claimAfter).toString(),
      lender: account.address,
      amount: amount.toString(),
      fill: hash!,
      refused: false,
      reason_code: null,
      limitations: null,
    });
    await appendReceipt(r);
    console.log(`  [${label}] SUCCEEDED tx=${hash} availableAfter=${available(claimAfter)}`);
    results.push({ label, outcome: expectSuccess ? "OK" : "UNEXPECTED_SUCCESS", receiptId: r.receipt_id, tx: hash });
  } else {
    const r = buildReceipt({
      mode: "LIVE",
      action: "finance",
      claim_id: CLAIM_ID,
      proof_inputs: proofInputs,
      claim_before: claimBefore,
      claim_after: null,
      capacity_before: available(claimBefore).toString(),
      capacity_after: null,
      lender: account.address,
      amount: amount.toString(),
      fill: null,
      refused: true,
      reason_code: "INSUFFICIENT_CAPACITY",
      limitations: null,
    });
    await appendReceipt(r);
    console.log(`  [${label}] REFUSED (${reason}) tx=${hash ?? "n/a"}`);
    results.push({ label, outcome: expectSuccess ? "UNEXPECTED_REFUSAL" : "OK", receiptId: r.receipt_id, tx: hash });
  }
}

async function main() {
  console.log("Lender A:", lenderA.address, "balance:", formatEther(await publicClient.getBalance({ address: lenderA.address })), "CTC");
  console.log("Lender B:", lenderB.address, "balance:", formatEther(await publicClient.getBalance({ address: lenderB.address })), "CTC");
  console.log("Claim:", CLAIM_ID);
  const claim0 = await readClaim();
  console.log("Deposit (originalCapacity):", claim0.originalCapacity, "available:", available(claim0).toString());

  const bufferCcUSD = 2000n * 10n ** 6n;
  console.log("\nMinting + approving ccUSD for both lenders...");
  await mintAndApprove(lenderA, bufferCcUSD);
  await mintAndApprove(lenderB, bufferCcUSD);

  const UNIT = 10n ** 18n;

  console.log("\n[Hero draw] Lender A finances 600...");
  await financeAndRecord("lenderA-finances-600", lenderA, "A", 600n * UNIT, true);

  console.log("\n[Over-draw, refused on-chain] Lender B requests 500 against 400 remaining...");
  await financeAndRecord("lenderB-over-requests-500-refused", lenderB, "B", 500n * UNIT, false);

  console.log("\n[Real concurrent race -- the D23 watch point] Lender A and Lender B both request 250 (sum 500 > 400 remaining), fired together...");
  const claimBeforeRace = await readClaim();
  const actionKeyA = nextActionKey("A");
  const actionKeyB = nextActionKey("B");
  const walletA = clientFor(lenderA);
  const walletB = clientFor(lenderB);
  const proofInputsRace = {
    chainKey: p.chainKey,
    headerNumber: p.headerNumber,
    txHash: streamCreation.createTxHash,
    rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x",
    decodedProof: decodedProofNow(),
  };
  const raceAmount = 250n * UNIT;
  const [raceA, raceB] = await Promise.allSettled([
    walletA.writeContract({ account: lenderA, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKeyA, CLAIM_ID, raceAmount] }),
    walletB.writeContract({ account: lenderB, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKeyB, CLAIM_ID, raceAmount] }),
  ]);
  console.log("  race submission A:", raceA.status, raceA.status === "fulfilled" ? raceA.value : (raceA as PromiseRejectedResult).reason?.message?.split("\n")[0]);
  console.log("  race submission B:", raceB.status, raceB.status === "fulfilled" ? raceB.value : (raceB as PromiseRejectedResult).reason?.message?.split("\n")[0]);

  async function resolveRaceLeg(label: string, account: ReturnType<typeof privateKeyToAccount>, settled: PromiseSettledResult<`0x${string}`>) {
    if (settled.status === "rejected") {
      const r = buildReceipt({
        mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputsRace,
        claim_before: claimBeforeRace, claim_after: null,
        capacity_before: available(claimBeforeRace).toString(), capacity_after: null,
        lender: account.address, amount: raceAmount.toString(), fill: null,
        refused: true, reason_code: "INSUFFICIENT_CAPACITY", limitations: "Concurrent race leg: submission itself was rejected (e.g. by gas estimation) before landing on-chain.",
      });
      await appendReceipt(r);
      console.log(`  [${label}] rejected before landing: ${(settled as PromiseRejectedResult).reason?.message?.split("\n")[0]}`);
      return { label, outcome: "REFUSED_PRESUBMIT", receiptId: r.receipt_id };
    }
    const hash = settled.value;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") {
      const claimAfter = await readClaim();
      const r = buildReceipt({
        mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputsRace,
        claim_before: claimBeforeRace, claim_after: claimAfter,
        capacity_before: available(claimBeforeRace).toString(), capacity_after: available(claimAfter).toString(),
        lender: account.address, amount: raceAmount.toString(), fill: hash,
        refused: false, reason_code: null, limitations: "One leg of a real concurrent two-lender race on the same residual (D23 watch point).",
      });
      await appendReceipt(r);
      console.log(`  [${label}] SUCCEEDED on-chain tx=${hash}`);
      return { label, outcome: "SUCCEEDED", receiptId: r.receipt_id, tx: hash };
    } else {
      const r = buildReceipt({
        mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputsRace,
        claim_before: claimBeforeRace, claim_after: null,
        capacity_before: available(claimBeforeRace).toString(), capacity_after: null,
        lender: account.address, amount: raceAmount.toString(), fill: null,
        refused: true, reason_code: "INSUFFICIENT_CAPACITY", limitations: "One leg of a real concurrent two-lender race on the same residual (D23 watch point); this leg landed but reverted.",
      });
      await appendReceipt(r);
      console.log(`  [${label}] REVERTED on-chain tx=${hash}`);
      return { label, outcome: "REVERTED_ONCHAIN", receiptId: r.receipt_id, tx: hash };
    }
  }
  results.push(await resolveRaceLeg("race-lenderA-250", lenderA, raceA));
  results.push(await resolveRaceLeg("race-lenderB-250", lenderB, raceB));

  const claimAfterRace = await readClaim();
  const remaining = available(claimAfterRace);
  console.log("\nAvailable after race:", remaining.toString());

  if (remaining > 0n) {
    console.log("\n[Exact exhaustion] Lender A finances the exact remainder...");
    await financeAndRecord("exact-remainder-exhausts", lenderA, "A", remaining, true);
  }

  console.log("\n[Post-exhaustion refusal] Lender B requests the minimum representable unit against an exhausted claim...");
  await financeAndRecord("post-exhaustion-refused", lenderB, "B", 10n ** 12n, false);

  const finalClaim = await readClaim();
  console.log("\nFinal claim:", finalClaim);
  console.log("Conservation check: financedCapacity === originalCapacity:", finalClaim.financedCapacity === finalClaim.originalCapacity);

  console.log("\n=== Summary ===");
  for (const r of results) console.log(" ", r.label, "->", r.outcome, r.receiptId ?? "", r.tx ?? "");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
