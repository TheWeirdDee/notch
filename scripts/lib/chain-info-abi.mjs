// ChainInfoContract ABI (subset), transcribed from gluwa/creditcoin3
// precompiles/metadata/precompiles-creditcoin3-testnet.json, the "ChainInfo" entry
// (address 0x0000000000000000000000000000000000000fD3) fetched 2026-09-09. This is the
// project's own published interface for the deployed precompile, not a blog post — but
// PRD v2 still requires confirming it live during Gate 1 before the production decoder
// depends on it. See DECISIONS.md D6.

const chainInfoStructComponents = [
  { name: "chainKey", type: "uint64" },
  { name: "chainId", type: "uint64" },
  { name: "chainName", type: "bytes" },
  { name: "chainEncoding", type: "uint8" },
];

export const chainInfoAbi = [
  {
    type: "function",
    name: "get_supported_chains",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "chains",
        type: "tuple[]",
        components: chainInfoStructComponents,
      },
    ],
  },
  {
    type: "function",
    name: "get_chain_by_key",
    stateMutability: "view",
    inputs: [{ name: "chainKey", type: "uint64" }],
    outputs: [
      {
        name: "result",
        type: "tuple",
        components: [
          { name: "info", type: "tuple", components: chainInfoStructComponents },
          { name: "exists", type: "bool" },
        ],
      },
    ],
  },
];
