// Third repair pass, race-lenderB-250 only: the true on-chain execution order (block
// 5459466, Lender A at tx index 1, Lender B at index 2 -- confirmed by reading both
// receipts) means claim_before for B's leg must reflect state AFTER A's already
// applied (850/1000, available 150), not the client-side submission-time snapshot
// both were fired against (600/1000). This is the exact D23 watch point: real
// execution order, not submission order, is what a receipt must record.
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

const txHash = "0x07e2ef18ba3f90a8beb0a8906bc74c6155f492bf368b3ed1ad97541ee2bdc527" as const;
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
const proofInputs = { chainKey: p.chainKey, headerNumber: p.headerNumber, txHash: streamCreation.createTxHash, rawProofPayloadHash: proofRecord.rawPayloadHash ?? "0x", decodedProof };

// Real execution order: A (tx index 1) applied first -> 850/1000 available 150 -- THAT
// is the true state B's transaction (tx index 2, same block) actually executed against.
const before = claim(850n * UNIT);

const r = buildReceipt({
  mode: "LIVE", action: "finance", claim_id: CLAIM_ID, proof_inputs: proofInputs,
  claim_before: before, claim_after: null,
  capacity_before: available(before).toString(), capacity_after: null,
  lender: LENDER_B, amount: (250n * UNIT).toString(), fill: null,
  refused: true, reason_code: "INSUFFICIENT_CAPACITY",
  limitations: `One leg of a real concurrent two-lender race on the same residual (D23 watch point), fired via Promise.allSettled. Both legs landed in block ${receipt.blockNumber} (A at tx index 1, B at tx index 2, confirmed by reading both receipts) -- this receipt's claim_before reflects the true on-chain state after A's leg already applied (850/1000, available 150), which is why B's 250 request was correctly insufficient even though only 400 was available when both were submitted. Reverted, no disbursement: tx ${txHash}.`,
});
await appendReceipt(r);
console.log("rebuilt race-lenderB-250 (execution-order-correct):", r.receipt_id);
