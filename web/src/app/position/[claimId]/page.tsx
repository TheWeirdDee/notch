"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { cc3Testnet } from "@/lib/chains";
import { registryAbi, venueAbi, ccUsdAbi } from "@/lib/abi";
import { REGISTRY_ADDRESS, VENUE_ADDRESS, CCUSD_ADDRESS, CC3_EXPLORER_TX, SEPOLIA_EXPLORER_TX, CCUSD_DECIMALS } from "@/lib/constants";
import { formatDeposit, parseDepositAmount, shortAddress, shortErrorMessage } from "@/lib/format";
import { useCurrentClaim } from "@/lib/use-current-claim";
import { useLivePosition, useLiveLoans, useCapacityBeforeAfter } from "@/lib/use-live-position";
import { PositionMetrics } from "@/components/position-metrics";
import { MinedRefusals } from "@/components/mined-refusals";
import { DEMO } from "@/lib/demo";
export default function PositionPage({params}:{params:Promise<{claimId:string}>}) {
  const { claimId } = use(params);
  const { address, isConnected } = useAccount();
  const cc3Client = usePublicClient({chainId:cc3Testnet.id});
  const {writeContractAsync}=useWriteContract();
  const {switchChainAsync}=useSwitchChain();
  const {setClaimId}=useCurrentClaim();
  const queryClient=useQueryClient();
  const coreQuery=useLivePosition(claimId);
  const loansQuery=useLiveLoans(claimId);
  const [amount,setAmount]=useState("");
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState<string|null>(null);
  const [toast,setToast]=useState<string|null>(null);
  useEffect(()=>{setClaimId(claimId);},[claimId,setClaimId]);

  async function handleFinance() {
    setActionError(null);
    setToast(null);
    if (!isConnected || !address) {
      setActionError("Connect a wallet to act as a lender.");
      return;
    }
    const raw = parseDepositAmount(amount);
    if (raw === null || raw <= 0n) {
      setActionError("Enter a whole-number amount to finance.");
      return;
    }
    if (!cc3Client) return;

    setBusy(true);
    try {
      const actionKeyBytes = new Uint8Array(32);
      crypto.getRandomValues(actionKeyBytes);
      const actionKey = ("0x" + Array.from(actionKeyBytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

      // Capacity refusal is determined directly against the real, already-decoded
      // on-chain `available()` figure this page is already showing -- not by simulating
      // the whole finance() call, which also exercises the internal ccUSD transferFrom
      // and would therefore fail on "insufficient allowance" for any wallet that hasn't
      // approved yet, misreporting an allowance gap as a capacity refusal (DECISIONS.md
      // D27/D34).
      const available = await cc3Client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [claimId as `0x${string}`] });
      if (raw > available) {
        setActionError(`Amount exceeds the current balance. Only ${formatDeposit(available)} of capacity remains against this position. Requested ${formatDeposit(raw)}.`);
        setBusy(false);
        return;
      }

      await switchChainAsync({ chainId: cc3Testnet.id });

      const currentAllowance = (await cc3Client.readContract({
        address: CCUSD_ADDRESS,
        abi: ccUsdAbi,
        functionName: "allowance",
        args: [address, VENUE_ADDRESS],
      })) as bigint;
      const ccUsdNeeded = raw / 10n ** BigInt(18 - CCUSD_DECIMALS);
      if (currentAllowance < ccUsdNeeded) {
        const approveHash = await writeContractAsync({
          chainId: cc3Testnet.id,
          address: CCUSD_ADDRESS,
          abi: ccUsdAbi,
          functionName: "approve",
          args: [VENUE_ADDRESS, ccUsdNeeded],
        });
        const approval = await cc3Client.waitForTransactionReceipt({ hash: approveHash });
        if (approval.status !== "success") throw new Error("Token approval reverted. No loan was issued.");
      }

      const financeHash = await writeContractAsync({
        chainId: cc3Testnet.id,
        address: VENUE_ADDRESS,
        abi: venueAbi,
        functionName: "finance",
        args: [actionKey, claimId as `0x${string}`, raw],
      });
      const settlement = await cc3Client.waitForTransactionReceipt({ hash: financeHash });
      if (settlement.status !== "success") throw new Error("The loan transaction reverted. No funds were disbursed.");
      setToast(`Financed ${formatDeposit(raw)} ccUSD to the borrower`);
      setAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["live-position", claimId] }),
        queryClient.invalidateQueries({ queryKey: ["live-loans", claimId] }),
      ]);
    } catch (err) {
      setActionError(shortErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }


  const claim = !coreQuery.isError ? coreQuery.data : undefined;
  const latestLoan = !loansQuery.isError ? loansQuery.data?.at(-1) : undefined;
  const beforeAfter = useCapacityBeforeAfter(claimId, latestLoan?.block);
  const instantiateTx = claimId === DEMO.claimId ? DEMO.instantiateTx : undefined;
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-14">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-ink-soft">Creditcoin CC3 Testnet</p><h1 className="mt-3 font-display text-4xl sm:text-5xl">Cashflow position</h1><p className="mt-3 break-all font-mono text-xs text-ink-soft">{claimId}</p></div><Link href={`/activity/${claimId}`} className="border border-line px-4 py-2 text-sm">View activity</Link></div>
    <PositionMetrics claimId={claimId} />
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]"><div className="min-w-0 space-y-6">
      <section className="panel p-5 sm:p-7"><h2 className="font-display text-2xl">Source & ownership</h2>{claim ? <dl className="mt-5 divide-y divide-line text-sm"><div className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-ink-soft">Sablier stream</dt><dd>#{claim.streamId.toString()}</dd></div><div className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-ink-soft">Borrower</dt><dd>{shortAddress(claim.borrower)}</dd></div><div className="flex flex-wrap justify-between gap-3 py-3"><dt className="text-ink-soft">Lock expires</dt><dd>{new Date(Number(claim.lockedUntil)*1000).toLocaleString()}</dd></div><div className="pt-4"><a href={SEPOLIA_EXPLORER_TX(claim.sourceTx)} target="_blank" rel="noreferrer" className="underline">View source on Sepolia</a></div>{instantiateTx && <div className="pt-4"><a href={CC3_EXPLORER_TX(instantiateTx)} target="_blank" rel="noreferrer" className="underline">View instantiateClaim() activation on Creditcoin</a></div>}</dl> : <p className="mt-5 text-sm text-ink-soft">Awaiting a live registry read.</p>}</section>
      <section className="panel p-5 sm:p-7"><h2 className="font-display text-2xl">Latest settled loan</h2>{loansQuery.isLoading && <p className="mt-5 text-sm text-ink-soft">Reading LoanOriginated events from deployment onward…</p>}{loansQuery.isError && <p role="alert" className="mt-5 text-sm text-cut">Live loan history is unavailable. No saved history is substituted.</p>}{latestLoan && <div className="mt-5"><p className="font-display text-3xl">{formatDeposit(latestLoan.amount)} ccUSD</p><p className="mt-2 text-sm text-ink-soft">Lender {shortAddress(latestLoan.lender)}</p><p className="mt-3 text-sm text-settled">Settled on Creditcoin, block {latestLoan.block.toString()}</p>{beforeAfter.data && <p className="mt-3 text-xs leading-relaxed text-ink-soft">available() the block before: <strong className="text-ink">{beforeAfter.data.before !== null ? formatDeposit(beforeAfter.data.before) : "unavailable (claim not yet active)"}</strong>; at this block: <strong className="text-ink">{formatDeposit(beforeAfter.data.after)}</strong> — read live, both sides of the exact block this transaction mined in.</p>}<a href={CC3_EXPLORER_TX(latestLoan.tx)} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm underline">View settled transaction</a></div>}{loansQuery.data?.length === 0 && !loansQuery.isError && <p className="mt-5 text-sm text-ink-soft">No settled loans for this claim.</p>}</section>
      <MinedRefusals claimId={claimId} />
    </div><aside className="min-w-0 space-y-6"><section className="panel p-5 sm:p-7"><h2 className="font-display text-2xl">Finance this cashflow</h2><p className="mt-3 text-sm leading-relaxed text-ink-soft">Send test ccUSD to the borrower. The transfer and capacity reduction settle together.</p><label htmlFor="finance-amount" className="mt-6 block text-sm">Amount (ccUSD)</label><input id="finance-amount" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Enter amount" className="mt-2 w-full border border-line bg-bone px-3 py-3 text-sm" disabled={busy} /><button onClick={handleFinance} disabled={busy || !isConnected || !claim || claim.expired || claim.available===0n} className="mt-4 w-full bg-ink px-4 py-3 text-sm text-bone disabled:opacity-40">{busy ? "Awaiting confirmation…" : "Finance cashflow"}</button><p className="mt-3 text-xs leading-relaxed text-ink-soft">{!isConnected ? "Connect a wallet to finance. All position data is available without one." : claim?.expired ? "The lock has expired; new loans are closed." : claim?.available===0n ? "This position has no remaining capacity." : "Requires test ccUSD and Creditcoin gas."}</p>{actionError && <p role="alert" className="mt-4 text-sm text-cut">{actionError}</p>}{toast && <p role="status" className="mt-4 text-sm text-settled">{toast}</p>}</section><Link href={`/recompute/${claimId}`} className="block border border-line p-5 text-sm underline underline-offset-4">Independently check remaining capacity</Link></aside></div>
  </div>;
}

