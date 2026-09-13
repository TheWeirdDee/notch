"use client";
import { useLivePosition } from "@/lib/use-live-position";
import { formatDeposit } from "@/lib/format";
import { CapacityBar } from "./capacity-bar";

export function PositionMetrics({ claimId }: { claimId?: string }) {
  const query = useLivePosition(claimId);
  if (!claimId) return <p className="panel p-6 text-sm text-ink-soft">Verify a source to identify its on-chain position.</p>;
  if (query.isError) return <div role="alert" className="panel p-6"><p>Live capacity unavailable.</p><button onClick={() => query.refetch()} className="mt-2 text-sm underline">Retry chain read</button></div>;
  if (!query.data) return <div className="panel p-6 text-sm text-ink-soft" role="status">Reading capacity from Creditcoin…</div>;
  const p = query.data;
  return <div className="panel @container p-5 sm:p-7" data-testid="live-metrics">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-soft"><span>Live registry / Block {p.block.toString()}</span><button onClick={() => query.refetch()} disabled={query.isFetching} className="underline">{query.isFetching ? "Refreshing…" : "Refresh"}</button></div>
    <dl className="mt-6 grid grid-cols-1 gap-6 @[26rem]:grid-cols-3">{[["Capacity", p.originalCapacity], ["Financed", p.financedCapacity], ["Remaining", p.available]].map(([label, value]) => <div key={String(label)}><dt className="text-sm text-ink-soft">{String(label)}</dt><dd className="mt-2 break-all font-display text-3xl lg:text-4xl" data-metric={String(label)}>{formatDeposit(value as bigint)}</dd><p className="mt-1 text-xs text-ink-soft">ccUSD equivalent</p></div>)}</dl>
    <div className="mt-6"><CapacityBar capacity={p.originalCapacity} draws={[]} financed={p.financedCapacity} /></div>
    <p className="mt-3 text-xs text-ink-soft">{p.expired ? "Lock expired. New financing is closed." : p.available === 0n ? "Fully financed. No further capacity is available." : "One shared limit across all lenders in this registry."}</p>
  </div>;
}
