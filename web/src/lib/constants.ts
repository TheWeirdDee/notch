// Public testnet contract addresses -- safe to ship client-side; no secret ever lives in
// this app. This directory never reads the monorepo root .env (which holds private
// keys) -- Next.js only loads env files from web/'s own root, and none exist here.
// Values below match GATES.md's recorded Gate 6 deployment exactly (reconciled in this
// gate's pre-gate sweep).

export const REGISTRY_ADDRESS = "0x68952727aa2e684bec378120a651434b1de5e915" as const;
export const VENUE_ADDRESS = "0x5CEB2357eCC2fcA5eA77057ce8D74646E0C76493" as const;
export const CCUSD_ADDRESS = "0x92db42991210a8f5a4c1de2ad36f10ef239f3498" as const;

export const SABLIER_LOCKUP_SEPOLIA = "0xe61cb9153356419bdaD0A8767c059f92d221a3C4" as const;
export const SOURCE_CHAIN_KEY_SEPOLIA = 1;

// NotchDemoAsset (contracts/src/NotchDemoAsset.sol) -- the only ERC-20 the registry's
// source-shape check allowlists as a Sablier deposit token. Same address `.env`'s
// SEPOLIA_DEMO_ASSET already resolves to (confirmed live: this is field 6 read back
// out of the demo claim's own on-chain struct). Public testnet contract, not a secret.
export const SEPOLIA_DEMO_ASSET = "0x7D20609BDB2fA772143905D6aDA079b1515db0b0" as const;

// Hardcoded compliance parameters for the "Create a demo cashflow" flow (Path 2) --
// the user never chooses these; they exist so every stream it creates passes the
// registry's source-shape check by construction. Same deposit scale as the pre-loaded
// demo (100,000, 18-decimal) and the same cliff-horizon pattern already used by
// scripts/create-gate9-demo-position.mjs.
export const DEMO_STREAM_DEPOSIT_HUMAN = 100_000n;
export const DEMO_STREAM_CLIFF_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const DEMO_STREAM_END_BUFFER_SECONDS = 24 * 60 * 60; // 1 day past the cliff

export const CC3_RPC = "https://rpc.cc3-testnet.creditcoin.network";
export const CC3_PROOF_BUILDER_API = "https://proof-gen-api.cc3-testnet.creditcoin.network";

export const SEPOLIA_EXPLORER_TX = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;
export const CC3_EXPLORER_TX = (hash: string) => `https://creditcoin-testnet.blockscout.com/tx/${hash}`;

// D14: capacity/financedCapacity/available() are always in the deposit asset's native
// decimals (18 -- NotchDemoAsset). ccUSD is pinned at 6 decimals (PRD Appendix C).
// Conversion happens only at the ccUSD transfer point inside the venue contract itself;
// the UI only ever needs to know these two scales to LABEL figures correctly, never to
// convert an amount before sending it on-chain.
export const DEPOSIT_ASSET_DECIMALS = 18;
export const CCUSD_DECIMALS = 6;

export const PROOF_STALENESS_LIMIT_MS = 15 * 60 * 1000;
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 1000;
