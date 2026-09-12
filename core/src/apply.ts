import type { ApplyResult, Claim, Loan } from "./types.js";
import { validateClaim, validateLoan } from "./validate.js";

/**
 * available(c) = c.originalCapacity - c.financedCapacity. Notch-PRD.md section 8.
 */
export function available(claim: Claim): bigint {
  return BigInt(claim.originalCapacity) - BigInt(claim.financedCapacity);
}

/**
 * apply(loan, claim) -> Claim
 *
 * The reference model of CashflowLendingVenue.finance(), Notch-PRD.md Appendix C:
 * consume-then-transfer, one atomic step. Order below matches the real contract's
 * modifier-then-body execution: `onlyVenue` gates entry to consume() before anything
 * else runs, so UNAUTHORIZED_CALLER is checked first, ahead of claim state or amount.
 *
 * `amount > 0` is required even though Appendix C's terse consume() comment doesn't
 * spell it out explicitly — it's required by this gate's own instructions and the
 * "zero amount" fixture; recorded in DECISIONS.md as the reading Gate 3 must match.
 */
export function apply(loan: Loan, claim: Claim): ApplyResult {
  validateClaim(claim); validateLoan(loan, claim);
  if (!loan.viaAuthorizedVenue) {
    return { ok: false, reason: "UNAUTHORIZED_CALLER" };
  }
  if (!claim.active) {
    return { ok: false, reason: "CLAIM_INACTIVE" };
  }
  const amount = BigInt(loan.amount);
  if (amount <= 0n) {
    return { ok: false, reason: "AMOUNT_NOT_POSITIVE" };
  }
  if (amount > available(claim)) {
    return { ok: false, reason: "INSUFFICIENT_CAPACITY" };
  }
  if (claim.rulesVersion === 2) {
    if (loan.nowAt! >= claim.lockedUntil) return { ok: false, reason: "CLAIM_EXPIRED" };
    if (amount % (10n ** 12n) !== 0n) return { ok: false, reason: "AMOUNT_NOT_REPRESENTABLE" };
  }
  if (!loan.transferWouldSucceed) {
    // Consume-then-transfer is one atomic step: a failed transfer means financedCapacity
    // does not change, matching "A failed transfer reverts the capacity change."
    return { ok: false, reason: "TRANSFER_WOULD_FAIL" };
  }

  const financedCapacity = (BigInt(claim.financedCapacity) + amount).toString();

  return { ok: true, claim: { ...claim, financedCapacity } };
}
