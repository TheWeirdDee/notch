// Notch reference model types. Pure JSON in, pure JSON out (PRD v2 section 16).
// All uint128/uint256/uint40 values are decimal strings, never `number` or `bigint`,
// so fixtures round-trip through JSON without precision loss.

/**
 * Everything instantiate() needs, as facts already established outside the model
 * (by the BlockProver precompile, the Decoder contract, and the adapter). The model
 * never calls a precompile, a decoder, or the clock itself — it only judges these
 * already-decoded facts against the permit rules. This mirrors production exactly:
 * on-chain, `instantiateClaim` calls the precompile and the Decoder *before* running
 * the shape checks; the model receives their outputs as input fields instead.
 */
export interface Proof {
  /** Absent only for historical Gate 2–5 records. */
  rulesVersion?: 2;
  attestedTxDigest?: string;
  transferable?: boolean;
  /** False models the precompile call itself being unreachable (BLOCKED_BY_ATTESTCOIN). */
  precompileAvailable: boolean;
  /** The result of `BlockProver.verify(...)` / `verifyAndEmit(...)`. */
  proofVerified: boolean;
  /** Decoded receipt status from the verified tx. Must be 1 (success). */
  receiptStatus: 0 | 1;

  /** uint32. Caller-claimed chain key for the source transaction. */
  chainKey: number;
  /** bytes32 hex. Sablier creation tx hash on the source chain. */
  sourceTxHash: string;
  /** uint256 decimal string. Sablier stream id. */
  streamId: string;

  // Fields decoded from the verified transaction's CreateLockupLinearStream EVENT
  // (never calldata, never totalAmount — PRD v2 invariant 2).
  /** address. Must equal the allowlisted SablierLockup v4.0 on Sepolia. */
  sourceContract: string;
  /** address. Decoded recipient -> claim.borrower. */
  recipient: string;
  /** address. Decoded token -> claim.asset. */
  token: string;
  /** uint128 decimal string. THE capacity number. Decoded event deposit, after fees. */
  depositAmount: string;
  /**
   * uint128 decimal string, OPTIONAL. Only present in the broker-fee fixture, where it
   * differs from `depositAmount` on purpose. The model must never read this field for
   * anything — its only purpose is to prove that a bigger, wrong number sitting right
   * next to the correct one in the input does not leak into originalCapacity.
   */
  totalAmount?: string;
  cancelable: boolean;
  /** uint128 decimal string. Must be "0". */
  unlockAmountsStart: string;
  /** uint128 decimal string. Must be "0". */
  unlockAmountsCliff: string;
  /** uint40 unix seconds. Must be > now_at_instantiation. */
  cliffTime: number;
  /** uint40 unix seconds. Recorded on the claim as lockedUntil is cliffTime, not this. */
  endTime: number;

  /** unix seconds. The only clock value the model ever sees — supplied, never read. */
  now_at_instantiation: number;
  /** unix seconds. Provenance only; not used in any permit check. */
  received_at: number;
}

export interface Claim {
  rulesVersion?: 2;
  attestedTxDigest?: string;
  /** bytes32 hex. keccak256(packed(chainKey uint32, sourceTxHash bytes32, streamId uint256)). */
  claimId: string;
  /** uint32. */
  sourceChainKey: number;
  /** bytes32 hex. */
  sourceTxHash: string;
  /** address. */
  sourceContract: string;
  /** uint256 decimal string. */
  streamId: string;
  /** address. Decoded recipient. */
  borrower: string;
  /** address. Decoded token. */
  asset: string;
  /** uint128 decimal string. Decoded event depositAmount. Never user input, never totalAmount. */
  originalCapacity: string;
  /** uint128 decimal string. Running sum of loans. */
  financedCapacity: string;
  /** uint40. Decoded cliff time. Was > now at instantiation. */
  lockedUntil: number;
  active: boolean;
}

export type InstantiateRejectReason =
  | "PRECOMPILE_UNAVAILABLE"
  | "PROOF_NOT_VERIFIED"
  | "RECEIPT_NOT_SUCCESS"
  | "CHAIN_KEY_MISMATCH"
  | "SOURCE_CONTRACT_NOT_ALLOWLISTED"
  | "CANCELABLE_NOT_ALLOWED"
  | "DEPOSIT_NOT_POSITIVE"
  | "TOKEN_NOT_APPROVED"
  | "UNLOCK_AMOUNTS_NOT_ZERO"
  | "CLIFF_NOT_FUTURE"
  | "CLAIM_ALREADY_ACTIVE"
  | "TRANSFERABLE_NOT_ALLOWED";

export type InstantiateResult =
  | { ok: true; claim: Claim }
  | { ok: false; reason: InstantiateRejectReason };

/**
 * Everything apply() needs to judge one financing attempt against a claim. Represents
 * the whole CashflowLendingVenue.finance() flow (consume-then-transfer, one atomic
 * step) collapsed into a single pure transition.
 */
export interface Loan {
  nowAt?: number;
  /** address. Who is financing. Any address is allowed — not a permission check. */
  lender: string;
  /** uint128 decimal string. Amount to finance. */
  amount: string;
  /** Models the `onlyVenue` modifier on registry.consume(): was this call routed through the one authorized CashflowLendingVenue contract? */
  viaAuthorizedVenue: boolean;
  /** Models whether ccUSD.transferFrom(lender, borrower, amount) would succeed. Consume-then-transfer is atomic: if this is false, financedCapacity does not change. */
  transferWouldSucceed: boolean;
}

export type ApplyRejectReason =
  | "UNAUTHORIZED_CALLER"
  | "CLAIM_INACTIVE"
  | "AMOUNT_NOT_POSITIVE"
  | "INSUFFICIENT_CAPACITY"
  | "TRANSFER_WOULD_FAIL"
  | "CLAIM_EXPIRED"
  | "AMOUNT_NOT_REPRESENTABLE";

export type ApplyResult =
  | { ok: true; claim: Claim }
  | { ok: false; reason: ApplyRejectReason };
