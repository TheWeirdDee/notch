// notch verify RECEIPT_ID -- reads recorded inputs, reruns the reference model, prints
// MATCH or DRIFT (Notch-PRD.md section 7.7). Fully offline: no network, no precompile
// call. Recomputes both the capacity math (apply) and, for instantiate receipts, the
// full permit decision (instantiate) -- possible because receipts record the complete
// decodedProof, a deliberate superset of the PRD's minimal proof_inputs (DECISIONS.md).
import { instantiate, apply, available, computeReceiptHash, type Receipt, type ReceiptHashInput } from "@notch/core";
import { readReceipt } from "@notch/adapter";
import { isDeepStrictEqual } from "node:util";

export interface VerifyOutcome {
  receiptId: string;
  status: "MATCH" | "DRIFT";
  checks: { name: string; ok: boolean; expected?: unknown; actual?: unknown }[];
}

function eqJson(a: unknown, b: unknown): boolean {
  return isDeepStrictEqual(a, b);
}

export function verifyReceipt(receiptId: string): VerifyOutcome {
  const receipt: Receipt = readReceipt(receiptId);
  return verifyRecordedReceipt(receipt);
}

export function verifyRecordedReceipt(receipt: Receipt): VerifyOutcome {
  try { return verifyWellFormedReceipt(receipt); }
  catch (error) {
    return { receiptId: receipt?.receipt_id ?? "unknown", status: "DRIFT", checks: [{
      name: "recorded_inputs_valid", ok: false, actual: error instanceof Error ? error.message : String(error),
    }] };
  }
}

function verifyWellFormedReceipt(receipt: Receipt): VerifyOutcome {
  const receiptId = receipt.receipt_id;
  const checks: VerifyOutcome["checks"] = [];
  const check = (name: string, expected: unknown, actual: unknown) =>
    checks.push({ name, ok: eqJson(expected, actual), expected, actual });
  if (receipt.action !== "instantiate" && receipt.action !== "finance") throw new Error("Unknown receipt action");
  if (receipt.mode !== "PAPER" && receipt.mode !== "LIVE") throw new Error("Unknown receipt mode");
  if (typeof receipt.refused !== "boolean") throw new Error("Invalid refused flag");
  check("capacity_before", receipt.claim_before ? available(receipt.claim_before).toString() : null, receipt.capacity_before);
  check("proof_chain_key", receipt.proof_inputs.decodedProof.chainKey, receipt.proof_inputs.chainKey);
  check("proof_source_tx", receipt.proof_inputs.decodedProof.sourceTxHash.toLowerCase(), receipt.proof_inputs.txHash.toLowerCase());
  if (receipt.refused) {
    check("refused_claim_after", null, receipt.claim_after);
    check("refused_capacity_after", null, receipt.capacity_after);
  } else {
    check("success_reason_code", null, receipt.reason_code);
    check("claim_id", receipt.claim_after?.claimId, receipt.claim_id);
    check("capacity_after", receipt.claim_after ? available(receipt.claim_after).toString() : null, receipt.capacity_after);
    check("proof_verified", true, receipt.proof_inputs.decodedProof.proofVerified);
    check("precompile_available", true, receipt.proof_inputs.decodedProof.precompileAvailable);
    check("receipt_status", 1, receipt.proof_inputs.decodedProof.receiptStatus);
  }
  if (receipt.action === "finance" && receipt.claim_before) {
    const proof = receipt.proof_inputs.decodedProof;
    const original = BigInt(receipt.claim_before.originalCapacity);
    const financed = BigInt(receipt.claim_before.financedCapacity);
    if (original <= 0n || original >= 2n ** 128n || financed < 0n || financed > original)
      throw new Error("Claim capacity is outside valid uint128 conservation bounds");
    check("claim_before_id", receipt.claim_before.claimId, receipt.claim_id);
    check("claim_source_tx", receipt.proof_inputs.txHash.toLowerCase(), receipt.claim_before.sourceTxHash.toLowerCase());
    check("claim_source_chain", receipt.proof_inputs.chainKey, receipt.claim_before.sourceChainKey);
    check("claim_stream", receipt.proof_inputs.decodedProof.streamId, receipt.claim_before.streamId);
    check("original_capacity_from_proof", proof.depositAmount, receipt.claim_before.originalCapacity);
    check("borrower_from_proof", proof.recipient.toLowerCase(), receipt.claim_before.borrower.toLowerCase());
    check("asset_from_proof", proof.token.toLowerCase(), receipt.claim_before.asset.toLowerCase());
    check("contract_from_proof", proof.sourceContract.toLowerCase(), receipt.claim_before.sourceContract.toLowerCase());
    check("lock_from_proof", proof.cliffTime, receipt.claim_before.lockedUntil);
  }

  // 1. Integrity: does the recorded hash match a fresh hash of the recorded fields?
  const hashInput: ReceiptHashInput = {
    mode: receipt.mode,
    action: receipt.action,
    claim_id: receipt.claim_id,
    proof_inputs: receipt.proof_inputs,
    claim_before: receipt.claim_before,
    claim_after: receipt.claim_after,
    capacity_before: receipt.capacity_before,
    capacity_after: receipt.capacity_after,
    lender: receipt.lender,
    amount: receipt.amount,
    refused: receipt.refused,
    reason_code: receipt.reason_code,
  };
  const recomputedHash = computeReceiptHash(hashInput);
  checks.push({ name: "receipt_hash", ok: recomputedHash === receipt.receipt_hash, expected: receipt.receipt_hash, actual: recomputedHash });

  // 2. Rerun the reference model.
  if (receipt.action === "instantiate") {
    const result = instantiate(receipt.proof_inputs.decodedProof, receipt.claim_before);
    if (receipt.refused) {
      checks.push({ name: "instantiate_refused", ok: result.ok === false, expected: false, actual: result.ok });
      if (!result.ok) {
        checks.push({ name: "reason_code", ok: result.reason === receipt.reason_code, expected: receipt.reason_code, actual: result.reason });
      }
    } else {
      checks.push({ name: "instantiate_succeeded", ok: result.ok === true, expected: true, actual: result.ok });
      if (result.ok) {
        checks.push({ name: "claim_after", ok: eqJson(result.claim, receipt.claim_after), expected: receipt.claim_after, actual: result.claim });
      }
    }
  } else {
    if (!receipt.claim_before) {
      checks.push({ name: "claim_before_present", ok: false, expected: "non-null claim_before for a finance receipt", actual: null });
    } else {
      const result = apply(
        { lender: receipt.lender ?? "", amount: receipt.amount ?? "0", viaAuthorizedVenue: true, transferWouldSucceed: true,
          nowAt: receipt.proof_inputs.decodedProof.now_at_instantiation },
        receipt.claim_before
      );
      if (receipt.refused) {
        checks.push({ name: "finance_refused", ok: result.ok === false, expected: false, actual: result.ok });
        if (!result.ok) {
          checks.push({ name: "reason_code", ok: result.reason === receipt.reason_code, expected: receipt.reason_code, actual: result.reason });
        }
      } else {
        checks.push({ name: "finance_succeeded", ok: result.ok === true, expected: true, actual: result.ok });
        if (result.ok) {
          checks.push({ name: "claim_after", ok: eqJson(result.claim, receipt.claim_after), expected: receipt.claim_after, actual: result.claim });
          const available = (BigInt(result.claim.originalCapacity) - BigInt(result.claim.financedCapacity)).toString();
          checks.push({ name: "capacity_after", ok: available === receipt.capacity_after, expected: receipt.capacity_after, actual: available });
        }
      }
    }
  }

  const status: VerifyOutcome["status"] = checks.every((c) => c.ok) ? "MATCH" : "DRIFT";
  return { receiptId, status, checks };
}
