import { encodePacked, keccak256 } from "viem";

/**
 * claimId = keccak256(sourceChainKey, sourceTxHash, streamId), Notch-PRD.md section 8.
 * Encoding pinned here as the spec Gate 3 must match exactly:
 * keccak256(abi.encodePacked(uint32 chainKey, bytes32 sourceTxHash, uint256 streamId)).
 * Pure hashing only — no network call, matches "no network calls inside the model".
 */
export function computeClaimId(chainKey: number, sourceTxHash: string, streamId: string): string {
  return keccak256(
    encodePacked(["uint32", "bytes32", "uint256"], [chainKey, sourceTxHash as `0x${string}`, BigInt(streamId)])
  );
}
