// ABI fragments for SablierLockup v4.0, transcribed verbatim from
// sablier-labs/evm-monorepo, lockup/src/interfaces/ISablierLockupLinear.sol and
// lockup/src/types/{Lockup.sol,LockupLinear.sol} (fetched 2026-09-09). Struct field
// order and types matter for calldata layout, so this is the ground truth for both
// creating the stream (Gate 1) and decoding it back out of proven txBytes.

const timestampsComponent = {
  name: "timestamps",
  type: "tuple",
  components: [
    { name: "start", type: "uint40" },
    { name: "end", type: "uint40" },
  ],
};

const createWithTimestampsParamsComponent = {
  name: "params",
  type: "tuple",
  components: [
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "depositAmount", type: "uint128" },
    { name: "token", type: "address" },
    { name: "cancelable", type: "bool" },
    { name: "transferable", type: "bool" },
    timestampsComponent,
    { name: "shape", type: "string" },
  ],
};

const unlockAmountsComponent = {
  name: "unlockAmounts",
  type: "tuple",
  components: [
    { name: "start", type: "uint128" },
    { name: "cliff", type: "uint128" },
  ],
};

export const createWithTimestampsLLAbi = [
  {
    type: "function",
    name: "createWithTimestampsLL",
    stateMutability: "payable",
    inputs: [
      createWithTimestampsParamsComponent,
      unlockAmountsComponent,
      { name: "granularity", type: "uint40" },
      { name: "cliffTime", type: "uint40" },
    ],
    outputs: [{ name: "streamId", type: "uint256" }],
  },
];

// Lockup.CreateEventCommon, as emitted in CreateLockupLinearStream.
const createEventCommonComponent = {
  name: "commonParams",
  type: "tuple",
  components: [
    { name: "funder", type: "address" },
    { name: "sender", type: "address" },
    { name: "recipient", type: "address" },
    { name: "depositAmount", type: "uint128" },
    { name: "token", type: "address" },
    { name: "cancelable", type: "bool" },
    { name: "transferable", type: "bool" },
    timestampsComponent,
    { name: "shape", type: "string" },
  ],
};

export const createLockupLinearStreamEventAbi = [
  {
    type: "event",
    name: "CreateLockupLinearStream",
    inputs: [
      { name: "streamId", type: "uint256", indexed: true },
      createEventCommonComponent,
      { name: "cliffTime", type: "uint40", indexed: false },
      { name: "granularity", type: "uint40", indexed: false },
      unlockAmountsComponent,
    ],
    anonymous: false,
  },
];

export const erc20AbiMinimal = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
];
