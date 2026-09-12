// Configuration constants the reference model judges proofs against. These are the
// same values Gate 3's registry constructor must be deployed with — pinned per
// Notch-PRD.md Appendix F/D and DECISIONS.md D6, not invented here.

/** Sablier Lockup v4.0 on Ethereum Sepolia. Pinned in Notch-PRD.md Appendix F. */
export const ALLOWLISTED_SABLIER_LOCKUP = "0xe61cb9153356419bdaD0A8767c059f92d221a3C4";

/**
 * The Sepolia-side deposit token this deployment allowlists as `approvedDemoAsset`.
 * Real address from Gate 1 (contracts/src/NotchDemoAsset.sol, deployed and used to
 * create the real Sepolia stream — see data/gate1/stream-creation.json).
 */
export const APPROVED_DEMO_ASSET = "0x7d20609bdb2fa772143905d6ada079b1515db0b0";

/**
 * Ethereum Sepolia's chain key on Attestcoin. Confirmed live against the ChainInfo
 * precompile in Gate 1, not assumed from docs — see DECISIONS.md D6 and
 * data/gate1/chain-key.json.
 */
export const EXPECTED_CHAIN_KEY = 1;
