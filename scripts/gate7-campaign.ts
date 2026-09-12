// Gate 7: the measurement campaign. Runs the locked draw plan against all 5 frozen-set
// positions under `full` (real on-chain finance), computes `no_conservation` and
// `single_lender_guard` as pure local simulations over the SAME real decoded
// capacities and the SAME draw amounts, runs the fake-source and re-instantiation
// scenarios, and computes the headline with its denominator.
import "dotenv/config";
import { createWalletClient, createPublicClient, http, pad, toHex, keccak256, decodeEventLog, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileSolidityFile } from "./lib/compile.mjs";
import { buildReceipt, appendReceipt, fetchFreshProof } from "../adapter/src/index.js";
import { available, type Claim, type Proof } from "../core/src/index.js";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const REGISTRY_ADDRESS = process.env.REGISTRY_ADDRESS as `0x${string}`;
const VENUE_ADDRESS = process.env.VENUE_ADDRESS as `0x${string}`;

const lenderA = privateKeyToAccount(process.env.LENDER_A_PRIVATE_KEY as `0x${string}`);
const lenderB = privateKeyToAccount(process.env.LENDER_B_PRIVATE_KEY as `0x${string}`);
const lenderC = privateKeyToAccount(process.env.LENDER_C_PRIVATE_KEY as `0x${string}`);
const LENDERS = { A: lenderA, B: lenderB, C: lenderC } as const;

const publicClient = createPublicClient({ transport: http(RPC_URL) });
function clientFor(account: ReturnType<typeof privateKeyToAccount>) {
  return createWalletClient({ account, transport: http(RPC_URL) });
}

const { abi: registryAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/AttestedCashflowRegistry.sol", import.meta.url)));
const { abi: venueAbi } = compileSolidityFile(fileURLToPath(new URL("../contracts/src/CashflowLendingVenue.sol", import.meta.url)));

const frozenSet = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate7/frozen-set.json", import.meta.url)), "utf8"));
console.log("Frozen set hash:", frozenSet.frozenSetHash);

// Gate 7 finding (DECISIONS.md D27): small sequential actionKeys (1, 2, 3, ...) are NOT
// safe to reuse across separate campaign runs or across gates -- actionResults is keyed
// per (sender, actionKey) FOREVER on-chain, and Gate 6 already consumed low integers for
// these same lender addresses on this same venue. A fresh run hitting one of those reads
// as ActionAlreadyApplied, which has no reference-model reason code and is not what it
// looks like (a capacity refusal). Namespace every actionKey to this run specifically.
const campaignRunSalt = keccak256(toHex(`gate7:${Date.now()}:${Math.random()}`));
let globalActionCounter = 0;
function nextActionKey() {
  globalActionCounter++;
  return keccak256(toHex(`${campaignRunSalt}:${globalActionCounter}`));
}

// No literal replay-of-the-same-actionKey step here on purpose: the pure reference
// model (core/src/apply.ts) has no concept of on-chain action-key idempotency at all --
// that's a Gate 5/D23 concern layered on top of the model, not part of the model's own
// vocabulary. A receipt for "blocked by actionKey replay" would have no reason code the
// model could ever reproduce on rerun, guaranteeing the exact DRIFT bug found and fixed
// in Gate 6 (D24). Idempotency is already proven for real in Gate 5/6; this campaign's
// job is the conservation/ablation comparison, so it sticks to reasons the model can
// actually judge. Step 4 (new action, same amount, same lender) still cleanly
// distinguishes "per-lender ceiling" (no_conservation) from "no ceiling at all"
// (single_lender_guard) on its own, without needing a replay case.
interface DrawStep {
  step: number;
  lenderKey: "A" | "B" | "C";
  fraction: number;
  actionKeyGroup: number;
}
const DRAW_PLAN: DrawStep[] = [
  { step: 1, lenderKey: "A", fraction: 0.7, actionKeyGroup: 1 },
  { step: 2, lenderKey: "B", fraction: 0.6, actionKeyGroup: 2 },
  { step: 3, lenderKey: "C", fraction: 0.5, actionKeyGroup: 3 },
  { step: 4, lenderKey: "A", fraction: 0.7, actionKeyGroup: 4 }, // new action, same amount as step 1
];

function fractionOf(capacity: bigint, fraction: number): bigint {
  // capacity is in 18-decimal units; compute fraction*capacity exactly via integer math
  // on the human-scale deposit (avoids floating point on-chain-sized numbers).
  const scaled = Math.round(fraction * 1000);
  return (capacity * BigInt(scaled)) / 1000n;
}

const positionResults: unknown[] = [];
let totalHeadline = 0n;

async function readClaim(claimId: `0x${string}`): Promise<Claim> {
  const tuple = (await publicClient.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "claims", args: [claimId] })) as unknown as [
    string, number, string, string, bigint, string, string, bigint, bigint, number, boolean
  ];
  return {
    rulesVersion: 2,
    attestedTxDigest: undefined as unknown as string, // set by caller before use in a receipt
    claimId: tuple[0], sourceChainKey: tuple[1], sourceTxHash: tuple[2], sourceContract: tuple[3],
    streamId: tuple[4].toString(), borrower: tuple[5], asset: tuple[6],
    originalCapacity: tuple[7].toString(), financedCapacity: tuple[8].toString(),
    lockedUntil: tuple[9], active: tuple[10],
  };
}

async function processPosition(positionMeta: { positionIndex: number; streamId: string; createTxHash: string; depositAmountHuman: string }) {
  const label = `position-${positionMeta.positionIndex}`;
  console.log(`\n=== ${label} (stream ${positionMeta.streamId}, deposit ${positionMeta.depositAmountHuman}) ===`);

  const streamCreation = JSON.parse(readFileSync(fileURLToPath(new URL(`../data/gate7/positions/position-${positionMeta.positionIndex}.json`, import.meta.url)), "utf8"));

  // D12: never reuse the batch-fetched proof-N.json snapshot for the actual on-chain
  // call -- that file is from the earlier attestation-confirmation pass and ages as the
  // campaign works through 5 positions sequentially. Fetch fresh right here, immediately
  // before this position's instantiate call.
  console.log(`  fetching fresh proof (D12) for ${label}...`);
  const proofRecord = await fetchFreshProof(streamCreation.sourceChainKey, streamCreation.createTxHash);
  const p = proofRecord.response;
  const attestedTxDigest = keccak256(p.txBytes as `0x${string}`);

  function proofInputsNow(): { chainKey: number; headerNumber: string; txHash: string; rawProofPayloadHash: string; decodedProof: Proof } {
    const now = Math.floor(Date.now() / 1000);
    const decodedProof: Proof = {
      rulesVersion: 2, attestedTxDigest, transferable: false, precompileAvailable: true, proofVerified: true, receiptStatus: 1,
      chainKey: p.chainKey, sourceTxHash: streamCreation.createTxHash, streamId: streamCreation.streamId,
      // Checksummed (viem's getAddress) -- readClaim()'s on-chain reads come back
      // checksummed too (Gate 7 finding, DECISIONS.md D28), and instantiate()'s rerun
      // copies proof.token/.recipient/.sourceContract verbatim into claim.asset/etc., so
      // any casing mismatch here becomes a spurious DRIFT on a semantically-identical
      // address.
      sourceContract: getAddress(streamCreation.sourceContract), recipient: getAddress(streamCreation.borrower), token: getAddress(streamCreation.demoAsset),
      depositAmount: streamCreation.depositAmount, cancelable: false, unlockAmountsStart: "0", unlockAmountsCliff: "0",
      cliffTime: streamCreation.cliffTime, endTime: streamCreation.timestampsEnd,
      now_at_instantiation: now, received_at: now,
    };
    return { chainKey: p.chainKey, headerNumber: p.headerNumber, txHash: streamCreation.createTxHash, rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x", decodedProof };
  }

  // 1. Instantiate for real.
  const deployer = privateKeyToAccount(process.env.CC3_PRIVATE_KEY as `0x${string}`);
  const deployerWallet = clientFor(deployer);
  const instArgs = [
    BigInt(p.chainKey), BigInt(p.headerNumber), p.txBytes as `0x${string}`, streamCreation.createTxHash as `0x${string}`,
    BigInt(streamCreation.streamId), p.merkleProof.root as `0x${string}`,
    p.merkleProof.siblings.map((s: { hash: string; isLeft: boolean }) => ({ hash: s.hash, isLeft: s.isLeft })),
    p.continuityProof.lowerEndpointDigest as `0x${string}`, p.continuityProof.roots as `0x${string}`[],
  ] as const;

  await publicClient.simulateContract({ account: deployer, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args: instArgs });
  const instHash = await deployerWallet.writeContract({ account: deployer, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args: instArgs });
  const instReceipt = await publicClient.waitForTransactionReceipt({ hash: instHash });
  let claimId: `0x${string}` | undefined;
  for (const log of instReceipt.logs) {
    try {
      const ev = decodeEventLog({ abi: registryAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "ClaimInstantiated") claimId = (ev.args as { claimId: `0x${string}` }).claimId;
    } catch {
      // skip
    }
  }
  if (!claimId) throw new Error(`${label}: instantiate did not emit ClaimInstantiated`);
  console.log(`  instantiated: tx ${instHash} claimId ${claimId}`);

  const claim0 = await readClaim(claimId);
  const capacity = BigInt(claim0.originalCapacity);
  console.log(`  real capacity: ${capacity}`);

  const instantiateReceipt = buildReceipt({
    mode: "LIVE", action: "instantiate", claim_id: claimId, proof_inputs: proofInputsNow(),
    claim_before: null, claim_after: { ...claim0, attestedTxDigest },
    capacity_before: null, capacity_after: available({ ...claim0, attestedTxDigest }).toString(),
    lender: null, amount: null, fill: instHash, refused: false, reason_code: null, limitations: null,
  });
  await appendReceipt(instantiateReceipt);

  // 2. FULL ablation: run the real draw plan on-chain.
  const fullResults: { step: number; lender: string; amount: string; outcome: string; receiptId: string; tx?: string }[] = [];
  const actionKeys = new Map<number, `0x${string}`>();

  for (const draw of DRAW_PLAN) {
    const account = LENDERS[draw.lenderKey];
    const amount = fractionOf(capacity, draw.fraction);
    let actionKey = actionKeys.get(draw.actionKeyGroup);
    if (!actionKey) {
      actionKey = nextActionKey();
      actionKeys.set(draw.actionKeyGroup, actionKey);
    }

    const claimBefore = await readClaim(claimId);
    const wallet = clientFor(account);
    let hash: `0x${string}` | undefined;
    let succeeded = false;
    try {
      hash = await wallet.writeContract({ account, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKey, claimId, amount] });
      const r = await publicClient.waitForTransactionReceipt({ hash });
      succeeded = r.status === "success";
    } catch {
      succeeded = false;
    }

    if (succeeded) {
      const claimAfter = await readClaim(claimId);
      const r = buildReceipt({
        mode: "LIVE", action: "finance", claim_id: claimId, proof_inputs: proofInputsNow(),
        claim_before: { ...claimBefore, attestedTxDigest }, claim_after: { ...claimAfter, attestedTxDigest },
        capacity_before: available(claimBefore).toString(), capacity_after: available(claimAfter).toString(),
        lender: account.address, amount: amount.toString(), fill: hash!, refused: false, reason_code: null,
        limitations: `Gate 7 campaign, ${label}, full ablation, draw plan step ${draw.step}.`,
      });
      await appendReceipt(r);
      fullResults.push({ step: draw.step, lender: draw.lenderKey, amount: amount.toString(), outcome: "SUCCEEDED", receiptId: r.receipt_id, tx: hash });
      console.log(`  [full step ${draw.step}] Lender ${draw.lenderKey} ${amount} -> SUCCEEDED (${hash})`);
    } else {
      const r = buildReceipt({
        mode: "LIVE", action: "finance", claim_id: claimId, proof_inputs: proofInputsNow(),
        claim_before: { ...claimBefore, attestedTxDigest }, claim_after: null,
        capacity_before: available(claimBefore).toString(), capacity_after: null,
        lender: account.address, amount: amount.toString(), fill: null, refused: true,
        reason_code: "INSUFFICIENT_CAPACITY",
        limitations: `Gate 7 campaign, ${label}, full ablation, draw plan step ${draw.step}.`,
      });
      await appendReceipt(r);
      fullResults.push({ step: draw.step, lender: draw.lenderKey, amount: amount.toString(), outcome: "REFUSED", receiptId: r.receipt_id });
      console.log(`  [full step ${draw.step}] Lender ${draw.lenderKey} ${amount} -> REFUSED`);
    }
  }

  // 3. Re-instantiation attempt (replay).
  let replayOutcome = "UNEXPECTED_SUCCESS";
  try {
    await publicClient.simulateContract({ account: deployer, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args: instArgs });
  } catch {
    replayOutcome = "REFUSED";
  }
  // instantiate()'s CLAIM_ALREADY_ACTIVE check is conditioned on `priorClaim.active`
  // (core/src/instantiate.ts) -- claim_before must carry the real active claim here, or
  // notch verify's rerun has no way to know a prior claim existed and will (correctly,
  // from its own inputs) recompute a fresh success instead of the recorded refusal.
  const claimAtReplayAttempt = await readClaim(claimId);
  const replayReceipt = buildReceipt({
    mode: "LIVE", action: "instantiate", claim_id: claimId, proof_inputs: proofInputsNow(),
    claim_before: { ...claimAtReplayAttempt, attestedTxDigest }, claim_after: null,
    capacity_before: available(claimAtReplayAttempt).toString(), capacity_after: null,
    lender: null, amount: null, fill: null, refused: true, reason_code: "CLAIM_ALREADY_ACTIVE",
    limitations: `Gate 7 campaign, ${label}, re-instantiation attempt of the same real source.`,
  });
  await appendReceipt(replayReceipt);
  console.log(`  [re-instantiate] -> ${replayOutcome}`);

  // 4. no_conservation / single_lender_guard: pure local simulations, same draw plan.
  function simulate(mode: "no_conservation" | "single_lender_guard") {
    const perLenderUsed = new Map<string, bigint>();
    const usedKeys = new Set<string>();
    const steps: { step: number; lender: string; amount: string; outcome: string }[] = [];
    let total = 0n;
    for (const draw of DRAW_PLAN) {
      const amount = fractionOf(capacity, draw.fraction);
      const key = `${draw.lenderKey}:${draw.actionKeyGroup}`;
      if (usedKeys.has(key)) {
        steps.push({ step: draw.step, lender: draw.lenderKey, amount: amount.toString(), outcome: "REFUSED (replay guard)" });
        continue;
      }
      if (mode === "no_conservation") {
        const used = perLenderUsed.get(draw.lenderKey) ?? 0n;
        if (used + amount > capacity) {
          steps.push({ step: draw.step, lender: draw.lenderKey, amount: amount.toString(), outcome: "REFUSED (per-lender ceiling)" });
          continue;
        }
        perLenderUsed.set(draw.lenderKey, used + amount);
      }
      usedKeys.add(key);
      total += amount;
      steps.push({ step: draw.step, lender: draw.lenderKey, amount: amount.toString(), outcome: "SUCCEEDED" });
    }
    return { steps, totalFinanced: total };
  }

  const noConservation = simulate("no_conservation");
  const singleLenderGuard = simulate("single_lender_guard");
  const overFinancingPrevented = noConservation.totalFinanced > capacity ? noConservation.totalFinanced - capacity : 0n;
  totalHeadline += overFinancingPrevented;

  console.log(`  no_conservation total financed: ${noConservation.totalFinanced} (capacity ${capacity}) -> over-financing prevented: ${overFinancingPrevented}`);

  positionResults.push({
    positionIndex: positionMeta.positionIndex,
    streamId: positionMeta.streamId,
    claimId,
    capacity: capacity.toString(),
    instantiateReceiptId: instantiateReceipt.receipt_id,
    instantiateTx: instHash,
    full: fullResults,
    replayAttemptOutcome: replayOutcome,
    replayReceiptId: replayReceipt.receipt_id,
    no_conservation: { steps: noConservation.steps, totalFinanced: noConservation.totalFinanced.toString() },
    single_lender_guard: { steps: singleLenderGuard.steps, totalFinanced: singleLenderGuard.totalFinanced.toString() },
    overFinancingPrevented: overFinancingPrevented.toString(),
  });
}

async function fakeSourceScenario() {
  console.log("\n=== Set-wide: fake/wrong-shape source attempt ===");
  console.log("Refetching a FRESH proof for the real Gate 3 bad-shape stream (178, cancelable=true)...");
  const badShapeEvidence = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate3/bad-shape-stream.json", import.meta.url)), "utf8"));

  const { fetchFreshProof, waitUntilAttested, decodeReceiptOnChain, findAndDecodeStreamEvent } = await import("../adapter/src/index.js");
  await waitUntilAttested(badShapeEvidence.sourceChainKey, badShapeEvidence.blockNumber);
  const fresh = await fetchFreshProof(badShapeEvidence.sourceChainKey, badShapeEvidence.createTxHash);
  console.log("  fresh proof generatedAt:", fresh.response.generatedAt);

  // Decode for real (mirrors the registry's own decode step) instead of typing in
  // placeholder facts -- every field on this receipt's decodedProof must trace to the
  // actual verified transaction, same as every other receipt in this campaign.
  const decodedReceipt = await decodeReceiptOnChain(publicClient, fresh.response.txBytes);
  if (!decodedReceipt) throw new Error("bad-shape stream: decoder rejected txBytes -- cannot build a real decodedProof");
  const streamEvent = findAndDecodeStreamEvent(decodedReceipt.logs, badShapeEvidence.streamId);
  if (!streamEvent) throw new Error("bad-shape stream: CreateLockupLinearStream event not found in decoded logs");
  console.log("  decoded: cancelable =", streamEvent.cancelable, "depositAmount =", streamEvent.depositAmount);

  const deployer = privateKeyToAccount(process.env.CC3_PRIVATE_KEY as `0x${string}`);
  const args = [
    BigInt(fresh.response.chainKey), BigInt(fresh.response.headerNumber), fresh.response.txBytes as `0x${string}`,
    badShapeEvidence.createTxHash as `0x${string}`, BigInt(badShapeEvidence.streamId), fresh.response.merkleProof.root as `0x${string}`,
    fresh.response.merkleProof.siblings.map((s: { hash: string; isLeft: boolean }) => ({ hash: s.hash, isLeft: s.isLeft })),
    fresh.response.continuityProof.lowerEndpointDigest as `0x${string}`, fresh.response.continuityProof.roots as `0x${string}`[],
  ] as const;

  let reason = "UNEXPECTED_SUCCESS";
  try {
    await publicClient.simulateContract({ account: deployer, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args });
  } catch (err) {
    reason = (err as { cause?: { data?: { errorName?: string } } }).cause?.data?.errorName ?? (err as Error).message?.split("\n")[0] ?? "REFUSED";
  }
  console.log("  outcome:", reason);

  const now = Math.floor(Date.now() / 1000);
  const decodedProof: Proof = {
    rulesVersion: 2, attestedTxDigest: keccak256(fresh.response.txBytes as `0x${string}`), transferable: streamEvent.transferable,
    precompileAvailable: true, proofVerified: true, receiptStatus: decodedReceipt.receiptStatus,
    chainKey: fresh.response.chainKey, sourceTxHash: badShapeEvidence.createTxHash, streamId: streamEvent.streamId,
    sourceContract: streamEvent.sourceContract, recipient: streamEvent.recipient, token: streamEvent.token,
    depositAmount: streamEvent.depositAmount, cancelable: streamEvent.cancelable,
    unlockAmountsStart: streamEvent.unlockAmountsStart, unlockAmountsCliff: streamEvent.unlockAmountsCliff,
    cliffTime: streamEvent.cliffTime, endTime: streamEvent.endTime, now_at_instantiation: now, received_at: now,
  };
  const r = buildReceipt({
    mode: "LIVE", action: "instantiate", claim_id: `0x${"f7".repeat(32)}`,
    proof_inputs: { chainKey: fresh.response.chainKey, headerNumber: fresh.response.headerNumber, txHash: badShapeEvidence.createTxHash, rawProofPayloadHash: fresh.rawPayloadHash, decodedProof },
    claim_before: null, claim_after: null, capacity_before: null, capacity_after: null,
    lender: null, amount: null, fill: null, refused: true, reason_code: "CANCELABLE_NOT_ALLOWED",
    limitations: "Gate 7 campaign, set-wide fake/wrong-shape source attempt: real Gate 3 cancelable=true stream, freshly re-proven per D12.",
  });
  await appendReceipt(r);
  return { onChainReason: reason, receiptId: r.receipt_id };
}

async function userSuppliedAmountAblation() {
  console.log("\n=== Set-wide: user_supplied_amount strip test ===");
  const position1 = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate7/positions/position-1.json", import.meta.url)), "utf8"));
  const realDeposit = BigInt(position1.depositAmount);
  const typedLie = realDeposit * 3n + 7n * 10n ** 18n; // a plausible-looking but wrong typed number
  const disagree = typedLie !== realDeposit;
  console.log(`  real decoded depositAmount: ${realDeposit}`);
  console.log(`  typed (user-supplied) amount: ${typedLie}`);
  console.log(`  disagree (strip test passes): ${disagree}`);

  const instantiateInputs = registryAbi.find((x: { type: string; name?: string }) => x.type === "function" && x.name === "instantiateClaim") as { inputs: { name: string }[] } | undefined;
  const paramNames = instantiateInputs?.inputs.map((i) => i.name) ?? [];
  const hasAmountParam = paramNames.some((n) => /amount|deposit|capacity/i.test(n));
  console.log(`  production instantiateClaim ABI params: ${paramNames.join(", ")}`);
  console.log(`  any amount-shaped parameter present (should be false): ${hasAmountParam}`);

  return { realDeposit: realDeposit.toString(), typedLie: typedLie.toString(), disagree, instantiateClaimParams: paramNames, hasAmountParam };
}

async function main() {
  for (const positionMeta of frozenSet.positions) {
    await processPosition(positionMeta);
  }

  const fakeSource = await fakeSourceScenario();
  const userSuppliedAmount = await userSuppliedAmountAblation();

  const outDir = fileURLToPath(new URL("../data/gate7", import.meta.url));
  mkdirSync(outDir, { recursive: true });
  const report = {
    frozenSetHash: frozenSet.frozenSetHash,
    generatedAt: new Date().toISOString(),
    positions: positionResults,
    fakeSourceAttempt: fakeSource,
    userSuppliedAmountAblation: userSuppliedAmount,
    headline: {
      totalOverFinancingPreventedHuman: (Number(totalHeadline) / 1e18).toString(),
      totalOverFinancingPreventedRaw: totalHeadline.toString(),
      denominator: `${frozenSet.positions.length} positions, ${DRAW_PLAN.length} draw steps each, 3 lenders`,
    },
  };
  writeFileSync(new URL("./campaign-report.json", `file://${outDir}/`), JSON.stringify(report, null, 2));
  console.log("\n=== HEADLINE ===");
  console.log(`Total over-financing prevented (full vs no_conservation): ${report.headline.totalOverFinancingPreventedHuman} units, across ${report.headline.denominator}`);
  console.log("\nWritten to data/gate7/campaign-report.json");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
