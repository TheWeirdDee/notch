// Pinned addresses and endpoints from Notch-PRD.md Appendix D and Appendix F, and
// values confirmed live in Gate 1 (DECISIONS.md D6-D7). Mirrors scripts/lib/constants.mjs
// -- kept here too since adapter/ is meant to be the real, reusable module those
// one-off scripts were standing in for.

export const SABLIER_LOCKUP_SEPOLIA = "0xe61cb9153356419bdaD0A8767c059f92d221a3C4" as const;
export const SABLIER_BATCH_LOCKUP_SEPOLIA = "0xd4ddc49F9D03a48293b5c8d89Cc210Af49d03D72" as const;

/** Confirmed live against the ChainInfo precompile in Gate 1 (DECISIONS.md D6). */
export const SOURCE_CHAIN_KEY_SEPOLIA = 1;
export const SEPOLIA_CHAIN_ID = 11155111;

export const CC3_BLOCK_PROVER_PRECOMPILE = "0x0000000000000000000000000000000000000FD2" as const;
export const CC3_CHAIN_INFO_PRECOMPILE = "0x0000000000000000000000000000000000000fd3" as const;
export const CC3_DECODER_CONTRACT = "0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f" as const;
export const CC3_PROOF_BUILDER_API = "https://proof-gen-api.cc3-testnet.creditcoin.network";
export const CC3_RPC = "https://rpc.cc3-testnet.creditcoin.network";

/**
 * Attestcoin proofs go stale within hours (Gate 3, DECISIONS.md D12: a proof fetched at
 * ~08:31 UTC was rejected by the precompile at ~13:00 UTC; refetching produced a
 * materially different continuity proof). Never hold a fetched proof longer than this
 * before using it -- refetch instead. Conservative relative to the ~4.5h window
 * observed once; treat that observation as an upper bound, not a guarantee.
 */
export const PROOF_STALENESS_LIMIT_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Tolerance for the ProofBuilder API's clock reading slightly ahead of ours (Gate 7,
 * DECISIONS.md D26: a real proof came back with generatedAt ~139ms in the future
 * relative to the local clock -- ordinary NTP-level drift between two machines, not
 * proof staleness). Only a negative age *larger* than this still trips StaleProofError;
 * a small one is clamped to zero rather than treated as a defect.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 1000; // 5 seconds
