// ABI fragments for SablierLockup v4.0, transcribed from sablier-labs/evm-monorepo
// (lockup/src/interfaces/ISablierLockupLinear.sol and
// lockup/src/types/{Lockup.sol,LockupLinear.sol}) -- the same source
// `scripts/lib/sablier-abi.mjs` already transcribes. Struct field order and types
// matter for calldata layout. Not a blog ABI: this exact struct/event layout is
// already confirmed against the real deployed contract -- it created the live streams
// this app points at (186, 189; see GATES.md Gate 1 / Phase 1 FIX 3) via
// `scripts/create-gate9-demo-position.mjs`. Kept as a second, hand-transcribed copy
// (not imported from scripts/) because web/ never reaches outside its own directory
// for source -- see web/src/lib/constants.ts's own note on the same boundary.

const timestampsComponent = {
  name: "timestamps",
  type: "tuple",
  components: [
    { name: "start", type: "uint40" },
    { name: "end", type: "uint40" },
  ],
} as const;

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
} as const;

const unlockAmountsComponent = {
  name: "unlockAmounts",
  type: "tuple",
  components: [
    { name: "start", type: "uint128" },
    { name: "cliff", type: "uint128" },
  ],
} as const;

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
] as const;

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
} as const;

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
] as const;

// NotchDemoAsset (contracts/src/NotchDemoAsset.sol) is the ERC-20 Sablier locks for
// every demo stream this app has ever pointed at. It is an intentionally open-mint
// testnet token -- mint() has no access control, by design (see the contract's own
// doc comment), specifically so a judge's own wallet can get test balance without a
// faucet. balanceOf/allowance/approve are the standard ERC-20 surface Sablier's
// createWithTimestampsLL needs (it pulls depositAmount via transferFrom internally).
export const demoAssetAbi = [
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "allowance", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "approve", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "mint", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [],
  },
] as const;
