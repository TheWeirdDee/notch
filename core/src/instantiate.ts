import type { Claim, InstantiateResult, Proof } from "./types.js";
import { computeClaimId } from "./claim-id.js";
import { validateProof, validateClaim } from "./validate.js";
import { ALLOWLISTED_SABLIER_LOCKUP, APPROVED_DEMO_ASSET, EXPECTED_CHAIN_KEY } from "./constants.js";

function eq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * instantiate(proof, priorClaim) -> Claim
 *
 * `priorClaim` is the claim currently stored at this claimId, if any — the pure-model
 * equivalent of the contract's `claims[claimId]` storage read. Passing it explicitly
 * (rather than hiding it as module state) keeps the function pure: same inputs, same
 * output, always, matching PRD v2 section 16's determinism rules.
 *
 * Order of checks mirrors AttestedCashflowRegistry.instantiateClaim (Gate 3) exactly,
 * with two additions the Gate 2 fixture pack requires and neither Appendix C's
 * pseudocode comment nor the Gate 3 brief spelled out — recorded in DECISIONS.md:
 *   - precompileAvailable, checked before proofVerified (models the precompile call
 *     itself being unreachable, distinct from it executing and returning false).
 *   - chainKey === EXPECTED_CHAIN_KEY, checked as part of shape validation (PRD v2
 *     Appendix D: "confirm against ChainInfo... do not assume it" — the same contract
 *     that is deployed at the allowlisted Sablier address on Sepolia could in principle
 *     be deployed at the same address on another chain via CREATE2; this check is what
 *     stops a proof of that transaction from being accepted as if it were Sepolia's).
 * sourceContract is checked before chainKey (not the reverse, as this model originally
 * had it) — reordered in Gate 3 to match the contract's explicit numbered steps
 * (DECISIONS.md D11). No fixture flips both fields at once, so no golden file changed.
 */
export function instantiate(proof: Proof, priorClaim: Claim | null = null): InstantiateResult {
  validateProof(proof);
  if (priorClaim) validateClaim(priorClaim);
  if (!proof.precompileAvailable) {
    return { ok: false, reason: "PRECOMPILE_UNAVAILABLE" };
  }
  if (!proof.proofVerified) {
    return { ok: false, reason: "PROOF_NOT_VERIFIED" };
  }
  if (proof.receiptStatus !== 1) {
    return { ok: false, reason: "RECEIPT_NOT_SUCCESS" };
  }
  if (!eq(proof.sourceContract, ALLOWLISTED_SABLIER_LOCKUP)) {
    return { ok: false, reason: "SOURCE_CONTRACT_NOT_ALLOWLISTED" };
  }
  if (proof.chainKey !== EXPECTED_CHAIN_KEY) {
    return { ok: false, reason: "CHAIN_KEY_MISMATCH" };
  }
  if (proof.cancelable !== false) {
    return { ok: false, reason: "CANCELABLE_NOT_ALLOWED" };
  }
  if (proof.rulesVersion === 2 && proof.transferable !== false) return { ok: false, reason: "TRANSFERABLE_NOT_ALLOWED" };
  if (BigInt(proof.depositAmount) <= 0n) {
    return { ok: false, reason: "DEPOSIT_NOT_POSITIVE" };
  }
  if (!eq(proof.token, APPROVED_DEMO_ASSET)) {
    return { ok: false, reason: "TOKEN_NOT_APPROVED" };
  }
  if (BigInt(proof.unlockAmountsStart) !== 0n || BigInt(proof.unlockAmountsCliff) !== 0n) {
    return { ok: false, reason: "UNLOCK_AMOUNTS_NOT_ZERO" };
  }
  if (proof.cliffTime <= proof.now_at_instantiation) {
    return { ok: false, reason: "CLIFF_NOT_FUTURE" };
  }

  const claimId = computeClaimId(proof.chainKey, proof.attestedTxDigest ?? proof.sourceTxHash, proof.streamId);

  if (priorClaim && priorClaim.active) {
    return { ok: false, reason: "CLAIM_ALREADY_ACTIVE" };
  }

  const claim: Claim = {
    ...(proof.rulesVersion === 2 ? { rulesVersion: 2 as const, attestedTxDigest: proof.attestedTxDigest! } : {}),
    claimId,
    sourceChainKey: proof.chainKey,
    sourceTxHash: proof.sourceTxHash,
    sourceContract: proof.sourceContract,
    streamId: proof.streamId,
    borrower: proof.recipient,
    asset: proof.token,
    originalCapacity: proof.depositAmount, // decoded event deposit, never totalAmount
    financedCapacity: "0",
    lockedUntil: proof.cliffTime,
    active: true,
  };

  return { ok: true, claim };
}
