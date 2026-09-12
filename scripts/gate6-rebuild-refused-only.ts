// Second repair pass: only the 3 refused receipts had the wrong reason_code naming
// (Solidity error-name style instead of the model's ApplyRejectReason style). The 3
// successful receipts from the first rebuild were already correct -- do not duplicate
// them.
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

const LENDER_B = process.env.LENDER_B_ADDRESS as `0x${string}`;
const UNIT = 10n ** 18n;

function claim(financedCapacity: bigint): Claim {
  return {
    rulesVersion: 2, attestedTxDigest, claimId: CLAIM_ID,
    sourceChainKey: p.chainKey, sourceTxHash: streamCreation.createTxHash,
    sourceContract: streamCreation.sourceContract, streamId: streamCreation.streamId,
    borrower: streamCreation.borrower, asset: streamCreation.demoAsset,
    originalCapacity: streamCreation.depositAmount, financedCapacity: financedCapacity.toString(),
    lockedUntil: streamCreation.cliffTime, active: true,
  };
}

async function proofInputsAt(txHash: `0x${string}`) {
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const decodedProof: Proof = {
    rulesVersion: 2, attestedTxDigest, transferable: false, precompileAvailable: true, proofVerified: true, receiptStatus: 1,
    chainKey: p.chainKey, sourceTxHash: streamCreation.createTxHash, streamId: streamCreation.streamId,
    sourceContract: streamCreation.sourceContract, recipient: streamCreation.borrower, token: streamCreation.demoAsset,
    depositAmount: streamCreation.depositAmount, cancelable: false, unlockAmountsStart: "0", unlockAmountsCliff: "0",
    cliffTime: streamCreation.cliffTime, endTime: streamCreation.timestampsEnd,
    now_at_instantiation: Number(block.timestamp), received_at: Number(block.timestamp),
  };
  return { chainKey: p.chainKey, headerNumber: p.headerNumber, txHash: streamCreation.createTxHash, rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x", decodedProof };
}

function proofInputsNow() {
  const now = Math.floor(Date.now() / 1000);
  const decodedProof: Proof = {
    rulesVersion: 2, attestedTxDigest, transferable: false, precompileAvailable: true, proofVerified: true, receiptStatus: 1,
    chainKey: p.chainKey, sourceTxHash: streamCreation.createTxHash, streamId: streamCreation.streamId,
    sourceContract: streamCreation.sourceContract, recipient: streamCreation.borrower, token: streamCreation.demoAsset,
    depositAmount: streamCreation.depositAmount, cancelable: false, unlockAmountsStart: "0", unlockAmountsCliff: "0",
    cliffTime: streamCreation.cliffTime, endTime: streamCreation.timestampsEnd,
    now_at_instantiation: now, received_at: now,
  };
  return { chainKey: p.chainKey, headerNumber: p.headerNumber, txHash: streamCreation.createTxHash, rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x", decodedProof };
}

async function main() {
  // 2. Lender B requests 500 against 400 remaining -- refused pre-broadcast
  {
    const before = claim(600n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputsNow(),
      claim_before: before, claim_after: null,
      capacity_before: available(before).toString(), capacity_after: null,
      lender: LENDER_B, amount: (500n * UNIT).toString(), fill: null,
      refused: true, reason_code: "INSUFFICIENT_CAPACITY", limitations: null,
    });
    await appendReceipt(r);
    console.log("rebuilt lenderB-over-requests-500-refused:", r.receipt_id);
  }

  // 4. Race leg B: 250 -- landed on-chain, reverted
  {
    const txHash = "0x07e2ef18ba3f90a8beb0a8906bc74c6155f492bf368b3ed1ad97541ee2bdc527" as const;
    const before = claim(600n * UNIT);
    const r = buildReceipt({
      mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: await proofInputsAt(txHash),
      claim_before: before, claim_after: null,
      capacity_before: available(before).toString(), capacity_after: null,
      lender: LENDER_B, amount: (250n * UNIT).toString(), fill: null,
      refused: true, reason_code: "INSUFFICIENT_CAPACITY",
      limitations: `One leg of a real concurrent two-lender race on the same residual (D23 watch point), fired via Promise.allSettled. This leg landed on-chain but reverted (no disbursement): tx ${txHash}.`,
    });
    await appendReceipt(r);
    console.log("rebuilt race-lenderB-250:", r.receipt_id);
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
    await appendReceipt(r);
    console.log("rebuilt post-exhaustion-refused:", r.receipt_id);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
