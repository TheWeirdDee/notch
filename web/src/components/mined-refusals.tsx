"use client";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { type Hash } from "viem";
import { cc3Testnet } from "@/lib/chains";
import { readMinedRefusals } from "@/lib/mined-refusals";
import { formatDeposit, shortAddress } from "@/lib/format";
import { CC3_EXPLORER_TX } from "@/lib/constants";

export function MinedRefusals({ claimId }: { claimId: string }) {
  const client = usePublicClient({ chainId: cc3Testnet.id });
  const query = useQuery({ queryKey: ["mined-refusals", claimId], queryFn: () => readMinedRefusals(client!, claimId as Hash), enabled: !!client, refetchOnMount: "always", refetchInterval: 30000, retry: 1 });
  return <section className="panel p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-display text-2xl">Reverted transactions</h2><span className="text-xs text-ink-soft">Live receipt verification</span></div>
    {query.isLoading && <p className="mt-5 text-sm text-ink-soft" role="status">Checking mined receipts on Creditcoin…</p>}
    {query.isError && <p role="alert" className="mt-5 text-sm text-cut">Refusal evidence could not be read from chain. No cached refusal is displayed.</p>}
    {!query.isError && query.data?.map(row => <article key={row.tx} className="mt-6 border-t border-line pt-5" data-testid="mined-refusal"><p className="text-sm font-medium text-cut">Draw refused on-chain</p><p className="mt-3 text-sm leading-relaxed">Lender {shortAddress(row.lender)} requested {formatDeposit(row.requested)} ccUSD. Remaining capacity at the mined block: {formatDeposit(row.available)} ccUSD equivalent.</p><dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs text-ink-soft"><div><dt>Status</dt><dd className="mt-1 text-ink">Mined / Reverted</dd></div><div><dt>Contract check</dt><dd className="mt-1 text-ink">{row.reason}</dd></div><div><dt>Block</dt><dd className="mt-1 text-ink">{row.block.toString()}</dd></div></dl><a href={CC3_EXPLORER_TX(row.tx)} target="_blank" rel="noreferrer" className="mt-5 inline-block text-sm underline underline-offset-4">View reverted transaction on Blockscout</a></article>)}
    {!query.isError && query.data?.length === 0 && <p className="mt-5 text-sm text-ink-soft">No indexed mined refusal was found for this claim.</p>}
    <p className="mt-5 text-xs leading-relaxed text-ink-soft">Mined transactions are the evidence. The contract reason is checked separately against historical chain state. This view does not send a transaction.</p>
  </section>;
}
