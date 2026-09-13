import { type Hash, type PublicClient } from "viem";
import { registryAbi, venueAbi } from "./abi";
import { REGISTRY_ADDRESS, VENUE_ADDRESS } from "./constants";

export async function readPosition(client: PublicClient, claimId: Hash) {
  const block = await client.getBlock({ blockTag: "latest" });
  const [claim, available] = await Promise.all([
    client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "claims", args: [claimId], blockNumber: block.number }),
    client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [claimId], blockNumber: block.number }),
  ]);
  if (!claim[10]) throw new Error("No active claim exists at this address.");
  if (available !== claim[7] - claim[8]) throw new Error("Registry capacity reads disagree.");
  return { claimId, sourceTx: claim[2], streamId: claim[4], borrower: claim[5], asset: claim[6], originalCapacity: claim[7], financedCapacity: claim[8], available, lockedUntil: BigInt(claim[9]), expired: BigInt(claim[9]) <= block.timestamp, active: claim[10], block: block.number };
}

// Proves a specific settled loan actually caused the registry's capacity change --
// not just that a successful transfer exists and the registry separately says some
// number -- by reading available() at the block immediately before the loan's own
// block and at that exact block, straight from chain state. If the immediately-prior
// block predates the claim's own activation, the "before" read legitimately has
// nothing to compare against; that is surfaced honestly, not hidden as a zero.
export async function readCapacityBeforeAfter(client: PublicClient, claimId: Hash, block: bigint) {
  const after = await client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [claimId], blockNumber: block });
  let before: bigint | null = null;
  try {
    before = await client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [claimId], blockNumber: block - 1n });
  } catch { /* claim did not exist yet at block - 1 -- before is honestly unavailable */ }
  return { before, after, block };
}

export async function readLoans(client: PublicClient, claimId: Hash) {
  // Deployment identity is a query bound, never loan data or a history fallback.
  const deployment = await client.getTransactionReceipt({ hash: "0x0fc1bebdc0f6e0f3604a8b7bb064fa8279d5fcb31d4724b2464aaaa2053797e6" });
  const end = await client.getBlockNumber({ cacheTime: 0 });
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let fromBlock = deployment.blockNumber; fromBlock <= end; fromBlock += 3000n)
    ranges.push({ fromBlock, toBlock: fromBlock + 2999n < end ? fromBlock + 2999n : end });
  const entries: { lender: string; amount: bigint; tx: Hash; block: bigint; index: number }[] = [];
  for (let offset = 0; offset < ranges.length; offset += 4) {
    const batches = await Promise.all(ranges.slice(offset, offset + 4).map(range => client.getContractEvents({ address: VENUE_ADDRESS, abi: venueAbi, eventName: "LoanOriginated", args: { claimId }, ...range, strict: true })));
    for (const logs of batches) for (const log of logs) entries.push({ lender: log.args.lender, amount: log.args.amount, tx: log.transactionHash, block: log.blockNumber, index: log.logIndex });
  }
  return entries.sort((a, b) => a.block === b.block ? a.index - b.index : a.block < b.block ? -1 : 1);
}
