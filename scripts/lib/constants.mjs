// Pinned addresses and endpoints from Notch-PRD.md Appendix D and Appendix F. Do not
// change these without a DECISIONS.md entry — they are frozen in the PRD.

export const SABLIER_LOCKUP_SEPOLIA = "0xe61cb9153356419bdaD0A8767c059f92d221a3C4";
export const SABLIER_BATCH_LOCKUP_SEPOLIA = "0xd4ddc49F9D03a48293b5c8d89Cc210Af49d03D72";

// PRD v2 (Appendix D) is explicit: "docs and examples use Ethereum Sepolia = 1... confirm
// against the ChainInfo precompile before coding; do not assume it." This constant is the
// documented default ONLY, not a confirmed fact — scripts/confirm-chain-key.mjs must be run
// against ChainInfoContract.get_supported_chains() (0x...0fd3) and the result recorded in
// DECISIONS.md before this value is relied on by the production decoder (Gate 3). See D6.
export const SOURCE_CHAIN_KEY_SEPOLIA_DOCUMENTED_DEFAULT = 1;
export const SEPOLIA_CHAIN_ID = 11155111; // real Ethereum chain id, used to find the right chainKey

export const CC3_BLOCK_PROVER_PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
export const CC3_CHAIN_INFO_PRECOMPILE = "0x0000000000000000000000000000000000000fd3";
export const CC3_DECODER_CONTRACT = "0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f";
export const CC3_PROOF_BUILDER_API = "https://proof-gen-api.cc3-testnet.creditcoin.network";
export const CC3_PROVER_API = "https://prover.cc3-testnet.creditcoin.network";
export const CC3_RPC = "https://rpc.cc3-testnet.creditcoin.network";
