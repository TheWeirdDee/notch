// INativeQueryVerifier (BlockProver precompile) and IEvmV1Decoder ABI fragments,
// transcribed from gluwa/creditcoin3 and gluwa/USC-Builder-Examples, confirmed against
// real verified transactions in Gate 1 and Gate 3 (DECISIONS.md D5 item 5, D8).
import type { Abi } from "viem";

const merkleProofEntryComponent = {
  name: "siblings",
  type: "tuple[]",
  components: [
    { name: "hash", type: "bytes32" },
    { name: "isLeft", type: "bool" },
  ],
} as const;

export const nativeQueryVerifierAbi = [
  {
    type: "function",
    name: "verifyAndEmit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "chainKey", type: "uint64" },
      { name: "height", type: "uint64" },
      { name: "encodedTransaction", type: "bytes" },
      {
        name: "merkleProof",
        type: "tuple",
        components: [{ name: "root", type: "bytes32" }, merkleProofEntryComponent],
      },
      {
        name: "continuityProof",
        type: "tuple",
        components: [
          { name: "lowerEndpointDigest", type: "bytes32" },
          { name: "roots", type: "bytes32[]" },
        ],
      },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const satisfies Abi;

const logEntryComponent = {
  type: "tuple",
  components: [
    { name: "address_", type: "address" },
    { name: "topics", type: "bytes32[]" },
    { name: "data", type: "bytes" },
  ],
} as const;

export const evmV1DecoderAbi = [
  {
    type: "function",
    name: "getTransactionType",
    stateMutability: "pure",
    inputs: [{ name: "encodedTx", type: "bytes" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "isValidTransactionType",
    stateMutability: "pure",
    inputs: [{ name: "txType", type: "uint8" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decodeReceiptFields",
    stateMutability: "pure",
    inputs: [{ name: "chunk", type: "bytes" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "receiptStatus", type: "uint8" },
          { name: "receiptGasUsed", type: "uint64" },
          { name: "receiptLogs", type: "tuple[]", components: logEntryComponent.components },
          { name: "receiptLogsBloom", type: "bytes" },
        ],
      },
    ],
  },
] as const satisfies Abi;
