// Orchestrates: fetch a FRESH proof -> verify on-chain -> decode receipt -> decode the
// CreateLockupLinearStream event -> assemble a core.Proof object. This is the seam
// between "facts gathered from the outside world" and "judged by the pure reference
// model" -- build-proof.ts never decides permit/reject, only gathers what instantiate()
// needs to decide.
import { keccak256, type Address, type PublicClient } from "viem";
import type { Proof } from "@notch/core";
import { fetchFreshProof, waitUntilAttested, type FetchedProof } from "./proof-builder-client.js";
import { verifyOnChain, decodeReceiptOnChain, findAndDecodeStreamEvent } from "./onchain.js";

export interface AssembledProof {
  proof: Proof;
  fetched: FetchedProof;
  streamFound: boolean;
}

/**
 * Fetches a fresh proof for txHash and assembles a core.Proof from it. Always refetches
 * (never reads a cached file) per DECISIONS.md D12. now_at_instantiation defaults to
 * the moment this function runs -- pass it explicitly only for reference-model testing.
 */
export async function assembleFreshProof(
  client: PublicClient,
  account: Address,
  chainKey: number,
  txHash: string,
  blockNumber: string | bigint,
  opts: { streamId?: string; now_at_instantiation?: number; onPoll?: (attestedHeight: bigint | null) => void } = {}
): Promise<AssembledProof> {
  await waitUntilAttested(chainKey, blockNumber, opts.onPoll ? { onPoll: opts.onPoll } : {});
  const fetched = await fetchFreshProof(chainKey, txHash);
  const now = opts.now_at_instantiation ?? Math.floor(Date.now() / 1000);

  const verify = await verifyOnChain(client, account, {
    chainKey: BigInt(chainKey),
    height: BigInt(fetched.response.headerNumber),
    encodedTransaction: fetched.response.txBytes,
    merkleRoot: fetched.response.merkleProof.root,
    siblings: fetched.response.merkleProof.siblings,
    lowerEndpointDigest: fetched.response.continuityProof.lowerEndpointDigest,
    continuityRoots: fetched.response.continuityProof.roots,
  });

  const base: Proof = {
    rulesVersion: 2,
    attestedTxDigest: keccak256(fetched.response.txBytes as `0x${string}`),
    transferable: true,
    precompileAvailable: verify.precompileAvailable,
    proofVerified: verify.proofVerified,
    receiptStatus: 0,
    chainKey,
    sourceTxHash: txHash,
    streamId: opts.streamId ?? "0",
    sourceContract: "0x0000000000000000000000000000000000000000",
    recipient: "0x0000000000000000000000000000000000000000",
    token: "0x0000000000000000000000000000000000000000",
    depositAmount: "0",
    cancelable: true,
    unlockAmountsStart: "0",
    unlockAmountsCliff: "0",
    cliffTime: 0,
    endTime: 0,
    now_at_instantiation: now,
    received_at: now,
  };

  if (!verify.proofVerified) {
    return { proof: base, fetched, streamFound: false };
  }

  const decodedReceipt = await decodeReceiptOnChain(client, fetched.response.txBytes);
  if (!decodedReceipt) {
    return { proof: base, fetched, streamFound: false };
  }
  base.receiptStatus = decodedReceipt.receiptStatus;

  if (decodedReceipt.receiptStatus !== 1) {
    return { proof: base, fetched, streamFound: false };
  }

  const streamEvent = findAndDecodeStreamEvent(decodedReceipt.logs, opts.streamId);
  if (!streamEvent) {
    return { proof: base, fetched, streamFound: false };
  }

  return {
    proof: {
      ...base,
      sourceContract: streamEvent.sourceContract,
      streamId: streamEvent.streamId,
      recipient: streamEvent.recipient,
      token: streamEvent.token,
      depositAmount: streamEvent.depositAmount,
      cancelable: streamEvent.cancelable,
      transferable: streamEvent.transferable,
      unlockAmountsStart: streamEvent.unlockAmountsStart,
      unlockAmountsCliff: streamEvent.unlockAmountsCliff,
      cliffTime: streamEvent.cliffTime,
      endTime: streamEvent.endTime,
    },
    fetched,
    streamFound: true,
  };
}
