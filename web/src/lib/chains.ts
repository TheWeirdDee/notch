import { defineChain } from "viem";

// Chain id confirmed live via eth_chainId against the real RPC (0x18e8f = 102031), not
// assumed -- same discipline as the source chain key confirmation in Gate 1 (D6).
// Explorer confirmed real by cross-checking a known Gate 7 tx hash and block number
// against this exact indexer before using it (not guessed from domain-name similarity).
export const cc3Testnet = defineChain({
  id: 102031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "tCTC", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] },
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});
