export const NOTCH_CORE_VERSION = "0.3.0-gate4";

export { instantiate } from "./instantiate.js";
export { apply, available } from "./apply.js";
export { computeClaimId } from "./claim-id.js";
export { validateProof, validateClaim, validateLoan, uint } from "./validate.js";
export { computeReceiptHash, receiptHashInput } from "./receipt.js";
export { ALLOWLISTED_SABLIER_LOCKUP, APPROVED_DEMO_ASSET, EXPECTED_CHAIN_KEY } from "./constants.js";
export type {
  Proof,
  Claim,
  Loan,
  InstantiateResult,
  InstantiateRejectReason,
  ApplyResult,
  ApplyRejectReason,
} from "./types.js";
export type { Receipt, ReceiptAction, ReceiptProofInputs, ReceiptHashInput } from "./receipt.js";
