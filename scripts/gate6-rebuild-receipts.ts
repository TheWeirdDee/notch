// Rebuilds the 6 voided Gate 6 receipts correctly, referencing the exact same real
// on-chain transactions (nothing was resubmitted -- the claim was already exhausted by
// the time the bug was found). Uses each tx's real block timestamp for
// now_at_instantiation, not "now", since these are reconstructed after the fact.
import "dotenv/config";
import { createPublicClient, http, keccak256 } from "viem";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildReceipt, appendReceipt } from "../adapter/src/index.js";
import { available, type Claim, type Proof } from "../core/src/index.js";

const RPC_URL = process.env.CC3_RPC_URL ?? "https://rpc.cc3-testnet.creditcoin.network";
const CLAIM_ID = process.env.CLAIM_ID as `0x${string}`;
const client = createPublicClient({ transport: http(RPC_URL) });

const proofRecord = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate6/attestcoin-proof.json", import.meta.url)), "utf8"));
const streamCreation = JSON.parse(readFileSync(fileURLToPath(new URL("../data/gate6/stream-creation.json", import.meta.url)), "utf8"));
const p = proofRecord.response;
const attestedTxDigest = keccak256(p.txBytes as `0x${string}`);

const LENDER_A = process.env.LENDER_A_ADDRESS as `0x${string}`;
const LENDER_B = process.env.LENDER_B_ADDRESS as `0x${string}`;
const UNIT = 10n ** 18n;

function claim(financedCapacity: bigint): Claim {
  return {
    rulesVersion: 2,
    attestedTxDigest,
    claimId: CLAIM_ID,
    sourceChainKey: p.chainKey,
    sourceTxHash: streamCreation.createTxHash,
    sourceContract: streamCreation.sourceContract,
    streamId: streamCreation.streamId,
    borrower: streamCreation.borrower,
    asset: streamCreation.demoAsset,
    originalCapacity: streamCreation.depositAmount,
    financedCapacity: financedCapacity.toString(),
    lockedUntil: streamCreation.cliffTime,
    active: true,
  };
}

async function proofInputsAt(txHash: `0x${string}`) {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const decodedProof: Proof = {
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
    now_at_instantiation: Number(block.timestamp),
    received_at: Number(block.timestamp),
  };
  return {
    chainKey: p.chainKey,
    headerNumber: p.headerNumber,
    txHash: streamCreation.createTxHash,
    rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x",
    decodedProof,
  };
}

// For the two refused legs that never landed on-chain (viem's simulate threw before
// broadcast), there's no real tx to read a timestamp from -- use "now" with a note.
function proofInputsNow() {
  const decodedProof: Proof = {
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
  return {
    chainKey: p.chainKey,
    headerNumber: p.headerNumber,
    txHash: streamCreation.createTxHash,
    rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x",
    decodedProof,
  };
}

async function main() {
  const rebuilt: string[] = [];

  // 1. Lender A finances 600 -- succeeded
  {
    const txHash = "0x8ba86a8f2b4ab82b35f3f61327b42c9782fb4d212d6c774888e5433d9d7ae89b" as const;
    const before = claim(0n);
    const after = claim(600n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: await proofInputsAt(txHash),
      claim_before: before, claim_after: after,
      capacity_before: available(before).toString(), capacity_after: available(after).toString(),
      lender: LENDER_A, amount: (600n * UNIT).toString(), fill: txHash,
      refused: false, reason_code: null, limitations: null,
    });
    await appendReceipt(r); rebuilt.push(r.receipt_id);
    console.log("rebuilt lenderA-finances-600:", r.receipt_id);
  }

  // 2. Lender B requests 500 against 400 remaining -- refused (simulate rejected before broadcast)
  {
    const before = claim(600n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputsNow(),
      claim_before: before, claim_after: null,
      capacity_before: available(before).toString(), capacity_after: null,
      lender: LENDER_B, amount: (500n * UNIT).toString(), fill: null,
      refused: true, reason_code: "INSUFFICIENT_CAPACITY", limitations: null,
    });
    await appendReceipt(r); rebuilt.push(r.receipt_id);
    console.log("rebuilt lenderB-over-requests-500-refused:", r.receipt_id);
  }

  // 3. Race leg A: 250 -- succeeded on-chain
  {
    const txHash = "0xeee4cfc725dd31559409b0f50ea94fc24256df018afef3d14025e09bf683d76e" as const;
    const before = claim(600n * UNIT);
    const after = claim(850n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: await proofInputsAt(txHash),
      claim_before: before, claim_after: after,
      capacity_before: available(before).toString(), capacity_after: available(after).toString(),
      lender: LENDER_A, amount: (250n * UNIT).toString(), fill: txHash,
      refused: false, reason_code: null,
      limitations: "One leg of a real concurrent two-lender race on the same residual (D23 watch point), fired via Promise.allSettled. This leg landed first and succeeded.",
    });
    await appendReceipt(r); rebuilt.push(r.receipt_id);
    console.log("rebuilt race-lenderA-250:", r.receipt_id);
  }

  // 4. Race leg B: 250 -- landed on-chain but reverted (real tx, real revert, no disbursement)
  {
    const txHash = "0x07e2ef18ba3f90a8beb0a8906bc74c6155f492bf368b3ed1ad97541ee2bdc527" as const;
    const before = claim(600n * UNIT); // same starting snapshot as leg A -- fired concurrently
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: await proofInputsAt(txHash),
      claim_before: before, claim_after: null,
      capacity_before: available(before).toString(), capacity_after: null,
      lender: LENDER_B, amount: (250n * UNIT).toString(), fill: null,
      refused: true, reason_code: "INSUFFICIENT_CAPACITY",
      limitations: `One leg of a real concurrent two-lender race on the same residual (D23 watch point), fired via Promise.allSettled. This leg landed on-chain but reverted (no disbursement): tx ${txHash}.`,
    });
    await appendReceipt(r); rebuilt.push(r.receipt_id);
    console.log("rebuilt race-lenderB-250:", r.receipt_id);
  }

  // 5. Exact remainder exhausts -- succeeded
  {
    const txHash = "0x5326b052505ce70322509a9433a69aee7a7da4f68a266530133f45510aa2373f" as const;
    const before = claim(850n * UNIT);
    const after = claim(1000n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: await proofInputsAt(txHash),
      claim_before: before, claim_after: after,
      capacity_before: available(before).toString(), capacity_after: available(after).toString(),
      lender: LENDER_A, amount: (150n * UNIT).toString(), fill: txHash,
      refused: false, reason_code: null, limitations: null,
    });
    await appendReceipt(r); rebuilt.push(r.receipt_id);
    console.log("rebuilt exact-remainder-exhausts:", r.receipt_id);
  }

  // 6. Post-exhaustion refusal
  {
    const before = claim(1000n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputsNow(),
      claim_before: before, claim_after: null,
      capacity_before: available(before).toString(), capacity_after: null,
      lender: LENDER_B, amount: (10n ** 12n).toString(), fill: null,
      refused: true, reason_code: "INSUFFICIENT_CAPACITY", limitations: null,
    });
    await appendReceipt(r); rebuilt.push(r.receipt_id);
    console.log("rebuilt post-exhaustion-refused:", r.receipt_id);
  }

  console.log("\nAll rebuilt receipt IDs:", rebuilt.join(" "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
