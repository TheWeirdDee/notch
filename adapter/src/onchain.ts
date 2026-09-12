// Real on-chain verify + decode calls, granular and individually catchable -- unlike
// routing through a single probe/registry contract, a revert in one step here doesn't
// hide the facts from the steps before it. Each function returns a plain result object
// instead of throwing, so callers can assemble a full Proof even when a step fails.
import { BaseError, ContractFunctionRevertedError, createPublicClient, http, decodeEventLog, type Address, type PublicClient } from "viem";
import { CC3_BLOCK_PROVER_PRECOMPILE, CC3_DECODER_CONTRACT, CC3_RPC } from "./constants.js";
import { nativeQueryVerifierAbi, evmV1DecoderAbi } from "./attestcoin-abi.js";
import { createLockupLinearStreamEventAbi, CREATE_LOCKUP_LINEAR_STREAM_TOPIC0 } from "./sablier-abi.js";
import type { MerkleProofEntry } from "./proof-builder-client.js";

export function makePublicClient(rpcUrl: string = CC3_RPC): PublicClient {
  return createPublicClient({ transport: http(rpcUrl) }) as PublicClient;
}

export interface VerifyResult {
  precompileAvailable: boolean;
  proofVerified: boolean;
  errorMessage?: string;
}

/** Calls BlockProver.verifyAndEmit via a free simulate (no gas, no state change). */
export async function verifyOnChain(
  client: PublicClient,
  account: Address,
  params: {
    chainKey: bigint;
    height: bigint;
    encodedTransaction: string;
    merkleRoot: string;
    siblings: MerkleProofEntry[];
    lowerEndpointDigest: string;
    continuityRoots: string[];
  }
): Promise<VerifyResult> {
  try {
    const { result } = await client.simulateContract({
      account,
      address: CC3_BLOCK_PROVER_PRECOMPILE,
      abi: nativeQueryVerifierAbi,
      functionName: "verifyAndEmit",
      args: [
        params.chainKey,
        params.height,
        params.encodedTransaction as `0x${string}`,
        { root: params.merkleRoot as `0x${string}`, siblings: params.siblings.map((s) => ({ hash: s.hash as `0x${string}`, isLeft: s.isLeft })) },
        { lowerEndpointDigest: params.lowerEndpointDigest as `0x${string}`, roots: params.continuityRoots as `0x${string}`[] },
      ],
    });
    return { precompileAvailable: true, proofVerified: result === true };
  } catch (err) {
    // Only an explicit EVM revert is definitive rejection. Timeouts, rate limits,
    // malformed RPC responses and transport failures must remain retryable errors.
    if (!(err instanceof BaseError) || !(err.walk(e => e instanceof ContractFunctionRevertedError) instanceof ContractFunctionRevertedError)) throw err;
    const message = err instanceof Error ? err.message : String(err);
    return { precompileAvailable: true, proofVerified: false, errorMessage: message };
  }
}

export interface DecodedReceipt {
  receiptStatus: 0 | 1;
  logs: { address: string; topics: string[]; data: string }[];
}

export async function decodeReceiptOnChain(client: PublicClient, txBytes: string): Promise<DecodedReceipt | null> {
  try {
    const txType = await client.readContract({
      address: CC3_DECODER_CONTRACT,
      abi: evmV1DecoderAbi,
      functionName: "getTransactionType",
      args: [txBytes as `0x${string}`],
    });
    const isValid = await client.readContract({
      address: CC3_DECODER_CONTRACT,
      abi: evmV1DecoderAbi,
      functionName: "isValidTransactionType",
      args: [txType],
    });
    if (!isValid) return null;

    const receipt = await client.readContract({
      address: CC3_DECODER_CONTRACT,
      abi: evmV1DecoderAbi,
      functionName: "decodeReceiptFields",
      args: [txBytes as `0x${string}`],
    });

    return {
      receiptStatus: receipt.receiptStatus as 0 | 1,
      logs: receipt.receiptLogs.map((l) => ({ address: l.address_, topics: [...l.topics], data: l.data })),
    };
  } catch (err) {
    throw err;
  }
}

export interface DecodedStreamEvent {
  transferable: boolean;
  sourceContract: string;
  streamId: string;
  recipient: string;
  token: string;
  depositAmount: string;
  cancelable: boolean;
  unlockAmountsStart: string;
  unlockAmountsCliff: string;
  cliffTime: number;
  endTime: number;
}

/** Mirrors AttestedCashflowRegistry's on-chain search loop, but in TypeScript. */
export function findAndDecodeStreamEvent(logs: DecodedReceipt["logs"], requestedStreamId?: string): DecodedStreamEvent | null {
  for (const log of logs) {
    if (log.topics.length !== 2) continue;
    if (log.topics[0]?.toLowerCase() !== CREATE_LOCKUP_LINEAR_STREAM_TOPIC0.toLowerCase()) continue;
    if (requestedStreamId !== undefined && BigInt(log.topics[1]!) !== BigInt(requestedStreamId)) continue;
    try {
      const decoded = decodeEventLog({
        abi: createLockupLinearStreamEventAbi,
        data: log.data as `0x${string}`,
        topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      });
      if (decoded.eventName !== "CreateLockupLinearStream") continue;
      const { streamId, commonParams, cliffTime, unlockAmounts } = decoded.args;
      return {
        sourceContract: log.address,
        streamId: streamId.toString(),
        recipient: commonParams.recipient,
        token: commonParams.token,
        depositAmount: commonParams.depositAmount.toString(),
        cancelable: commonParams.cancelable,
        transferable: commonParams.transferable,
        unlockAmountsStart: unlockAmounts.start.toString(),
        unlockAmountsCliff: unlockAmounts.cliff.toString(),
        cliffTime,
        endTime: commonParams.timestamps.end,
      };
    } catch (error) {
      throw error; // match Solidity abi.decode: malformed selected log is not skipped
    }
  }
  return null;
}
