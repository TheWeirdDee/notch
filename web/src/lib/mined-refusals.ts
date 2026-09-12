import { BaseError, ContractFunctionRevertedError, decodeFunctionData, type Hash, type PublicClient } from "viem";
import { registryAbi, venueAbi } from "./abi";
import { REGISTRY_ADDRESS, VENUE_ADDRESS } from "./constants";

// Discovery pointers only. No displayed claim, amount, lender or status comes from
// this index. Each row must pass live transaction, receipt and historical-state reads.
const transactions: Hash[] = [
  "0xa9b55a55e918a1e8c344ac07d5aac502af10d85b609cc2a37cbce254e6de51ac",
  "0x3c3f167b411d80b9cd05e245ab76fa3870a0bda38e2ddddeb62290c6d67be136",
];
export async function readMinedRefusals(client: PublicClient, claimId: Hash) {
  const rows = await Promise.all(transactions.map(async hash => {
    const tx = await client.getTransaction({ hash });
    if (tx.to?.toLowerCase() !== VENUE_ADDRESS.toLowerCase()) return null;
    const call = decodeFunctionData({ abi: venueAbi, data: tx.input });
    if (call.functionName !== "finance" || call.args[1].toLowerCase() !== claimId.toLowerCase()) return null;
    const receipt = await client.getTransactionReceipt({ hash });
    if (receipt.status !== "reverted") throw new Error("Indexed refusal is not a reverted transaction.");
    const available = await client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [claimId], blockNumber: receipt.blockNumber });
    let reason = "Transaction reverted";
    try {
      await client.simulateContract({ account: tx.from, address: VENUE_ADDRESS, abi: [...venueAbi, ...registryAbi], functionName: "finance", args: call.args, blockNumber: receipt.blockNumber });
    } catch (error) {
      const revert = error instanceof BaseError ? error.walk(e => e instanceof ContractFunctionRevertedError) : null;
      if (!(revert instanceof ContractFunctionRevertedError)) throw error;
      if (revert.data?.errorName === "InsufficientFinancingCapacity") reason = "Insufficient capacity";
    }
    return { tx: hash, lender: tx.from, requested: call.args[2], available, block: receipt.blockNumber, reason };
  }));
  return rows.filter(row => row !== null);
}
