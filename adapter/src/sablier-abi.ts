// ABI fragments for SablierLockup v4.0's CreateLockupLinearStream event, transcribed
// from sablier-labs/evm-monorepo and confirmed against a real verified transaction in
// Gate 1 (DECISIONS.md D8). Mirrors scripts/lib/sablier-abi.mjs.
import type { Abi } from "viem";

const timestampsComponent = {
  name: "timestamps",
  type: "tuple",
  components: [
    { name: "start", type: "uint40" },
    { name: "end", type: "uint40" },
  ],
} as const;

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

const unlockAmountsComponent = {
  name: "unlockAmounts",
  type: "tuple",
  components: [
    { name: "start", type: "uint128" },
    { name: "cliff", type: "uint128" },
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
] as const satisfies Abi;

/** keccak256 of the canonical event signature -- computed with viem, not typed by hand. */
export const CREATE_LOCKUP_LINEAR_STREAM_TOPIC0 =
  "0xbc42cec3f2bd75ce97894dacc83ec6c4b682220d349b5a52d5743e7b46eba2d0" as const;
