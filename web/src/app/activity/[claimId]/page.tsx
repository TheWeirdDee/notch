"use client";
import { use } from "react";
import Link from "next/link";
import { useLiveLoans } from "@/lib/use-live-position";
import { PositionMetrics } from "@/components/position-metrics";
import { MinedRefusals } from "@/components/mined-refusals";
import { formatDeposit, shortAddress } from "@/lib/format";
import { CC3_EXPLORER_TX } from "@/lib/constants";
export default function ActivityPage({params}:{params:Promise<{claimId:string}>}) {
 const {claimId}=use(params); const query=useLiveLoans(claimId);
 return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-14"><div className="mb-8 flex flex-wrap justify-between gap-5"><div><p className="text-sm text-ink-soft">Creditcoin CC3 Testnet</p><h1 className="mt-3 font-display text-4xl sm:text-5xl">Activity</h1><p className="mt-3 break-all font-mono text-xs text-ink-soft">{claimId}</p></div><Link href={`/position/${claimId}`} className="h-fit border border-line px-4 py-2 text-sm">Open position</Link></div>
 <PositionMetrics claimId={claimId} />
 <section className="panel mt-6 p-5 sm:p-7"><div className="flex flex-wrap justify-between gap-4"><h2 className="font-display text-2xl">Settled loans</h2><button onClick={()=>query.refetch()} disabled={query.isFetching} className="text-xs underline">{query.isFetching ? "Reading event logs…" : "Refresh history"}</button></div><p className="mt-3 text-xs leading-relaxed text-ink-soft">LoanOriginated events read live from the deployed venue, filtered by this claim. The query covers deployment through the latest queried block.</p>
 {query.isLoading && <p role="status" className="mt-6 text-sm text-ink-soft">Loading on-chain history…</p>}
 {query.isError && <p role="alert" className="mt-6 text-sm text-cut">Live history could not be loaded. No saved or browser-local rows are shown.</p>}
 {!query.isError && query.data?.length===0 && <p className="mt-6 text-sm text-ink-soft">No settled loans found for this claim.</p>}
 {!query.isError && <div className="mt-6 divide-y divide-line">{query.data?.slice().reverse().map(row=><article key={row.tx+row.index} data-testid="loan-row" className="grid gap-3 py-5 sm:grid-cols-[1fr_1fr_auto]"><div><p className="text-xs text-settled">Settled on Creditcoin</p><p className="mt-2 font-display text-2xl">{formatDeposit(row.amount)} ccUSD</p></div><div className="text-sm"><p className="text-ink-soft">Lender {shortAddress(row.lender)}</p><p className="mt-2 text-xs text-ink-soft">Block {row.block.toString()}</p></div><a href={CC3_EXPLORER_TX(row.tx)} target="_blank" rel="noreferrer" className="self-center text-sm underline">View transaction</a></article>)}</div>}
 </section><div className="mt-6"><MinedRefusals claimId={claimId} /></div></div>;
}
