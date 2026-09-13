"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, Info, X } from "lucide-react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { sepolia } from "wagmi/chains";
import { BaseError, ContractFunctionRevertedError, encodePacked, keccak256, type Hash } from "viem";
import { cc3Testnet } from "@/lib/chains";
import { registryAbi, venueAbi, ccUsdAbi } from "@/lib/abi";
import { SOURCE_CHAIN_KEY_SEPOLIA, REGISTRY_ADDRESS, VENUE_ADDRESS, CCUSD_ADDRESS, CCUSD_DECIMALS, SEPOLIA_EXPLORER_TX, CC3_EXPLORER_TX } from "@/lib/constants";
import { fetchFreshProof, waitUntilAttested } from "@/lib/proof";
import { formatDeposit, parseDepositAmount, shortAddress, shortErrorMessage } from "@/lib/format";
import { useCurrentClaim } from "@/lib/use-current-claim";
import { PositionMetrics } from "@/components/position-metrics";
import { MinedRefusals } from "@/components/mined-refusals";
import { useLivePosition, useLiveLoans } from "@/lib/use-live-position";
import { CreateDemoCashflow } from "@/components/create-demo-cashflow";
import { DEMO } from "@/lib/demo";

interface VerifiedClaim { claimId: Hash; borrower: string; originalCapacity: bigint; lockedUntil: bigint }

const TEST_STEPS = [
  "This page is preloaded with a real demo cashflow: Sablier stream #189 on Ethereum Sepolia.",
  "Click \"Verify with Attestcoin\" below. Watch it fetch a fresh proof and check it live against the deployed Creditcoin verifier.",
  "The capacity, financed and remaining figures above this panel are read live from the registry contract, not cached.",
  "Connect a funded Creditcoin CC3 wallet in the finance panel and send a real finance() call to watch remaining capacity drop.",
  "Every transaction linked on this page opens the real explorer receipt — Blockscout or Etherscan, never a screenshot.",
];

export default function VerifyPage() {
  const { address, isConnected } = useAccount();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const cc3Client = usePublicClient({ chainId: cc3Testnet.id });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { setClaimId } = useCurrentClaim();
  const queryClient = useQueryClient();
  const [txHash, setTxHash] = useState<string>(DEMO.sourceTx);
  const [streamId, setStreamId] = useState<string>(DEMO.streamId);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<VerifiedClaim | null>(null);
  const [instantiateTx, setInstantiateTx] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [amount, setAmount] = useState("");
  const [financeBusy, setFinanceBusy] = useState(false);
  const [financeError, setFinanceError] = useState<string | null>(null);
  const [financeTx, setFinanceTx] = useState<string | null>(null);
  const isDemo = txHash.trim().toLowerCase() === DEMO.sourceTx && streamId.trim() === DEMO.streamId;

  function reset() {
    setTxHash(DEMO.sourceTx); setStreamId(DEMO.streamId); setCustom(false);
    setClaim(null); setError(null); setStatus(""); setNeedsActivation(false);
    setFinanceError(null); setFinanceTx(null); setAmount("");
  }

  async function verify(overrideTx?: string, overrideStream?: string, attestTimeoutMs = 90_000) {
    const effectiveTx = (overrideTx ?? txHash).trim();
    const effectiveStream = (overrideStream ?? streamId).trim();
    setError(null); setClaim(null); setInstantiateTx(null); setNeedsActivation(false);
    if (!/^0x[0-9a-fA-F]{64}$/.test(effectiveTx)) { setError("Enter the full creation transaction hash: 0x followed by 64 characters."); return; }
    if (!/^\d+$/.test(effectiveStream) || BigInt(effectiveStream) >= 2n ** 256n) { setError("Enter a valid numeric Sablier stream ID."); return; }
    if (!sepoliaClient || !cc3Client) { setError("The network connection is starting. Try again in a moment."); return; }
    setBusy(true);
    try {
      setStatus("Fetching the creation transaction from Ethereum Sepolia.");
      const receipt = await sepoliaClient.getTransactionReceipt({ hash: effectiveTx as Hash });
      if (receipt.status !== "success") throw new Error("The source transaction reverted. It cannot back a cashflow.");
      await waitUntilAttested(SOURCE_CHAIN_KEY_SEPOLIA, receipt.blockNumber, {
        timeoutMs: attestTimeoutMs,
        onPoll: (height) => setStatus(height != null && height < receipt.blockNumber
          ? `Waiting for Attestcoin to attest source block ${receipt.blockNumber}. Currently attested through ${height}. A just-created stream can take a few minutes -- this keeps checking.`
          : `Source block ${receipt.blockNumber} attested. Fetching proof.`),
      });
      setStatus("Fetching a fresh Attestcoin proof of the source transaction.");
      const proof = await fetchFreshProof(SOURCE_CHAIN_KEY_SEPOLIA, effectiveTx, { maxAttempts: 6 });
      const claimId = keccak256(encodePacked(["uint32", "bytes32", "uint256"], [proof.chainKey, keccak256(proof.txBytes as Hash), BigInt(effectiveStream)]));
      const args = [
        proof.chainKey, BigInt(proof.headerNumber), proof.txBytes as Hash, effectiveTx as Hash,
        BigInt(effectiveStream), proof.merkleProof.root as Hash,
        proof.merkleProof.siblings.map(s => ({ hash: s.hash as Hash, isLeft: s.isLeft })),
        proof.continuityProof.lowerEndpointDigest as Hash, proof.continuityProof.roots as Hash[],
      ] as const;
      setStatus("Proof fetched. Checking it against the live Creditcoin verifier.");
      // eth_call executes the real verifier and decoder. ClaimAlreadyActive occurs
      // only AFTER all proof, stream-shape and cliff checks in the deployed registry.
      // An unrelated revert is never accepted as verification.
      let alreadyActive = false;
      try {
        await cc3Client.simulateContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args });
      } catch (err) {
        const revert = err instanceof BaseError ? err.walk(e => e instanceof ContractFunctionRevertedError) : null;
        if (!(revert instanceof ContractFunctionRevertedError) || revert.data?.errorName !== "ClaimAlreadyActive") throw err;
        alreadyActive = true;
      }
      if (!alreadyActive) {
        if (!isConnected || !address) {
          setNeedsActivation(true);
          throw new Error("The proof passed. This is a new cashflow: connect a wallet, then verify again to activate it on Creditcoin. The demo is already activated and needs no wallet.");
        }
        setStatus("Verified. Connect to Creditcoin and approve activation in your wallet.");
        await switchChainAsync({ chainId: cc3Testnet.id });
        if (Date.now() - Date.parse(proof.generatedAt) > 15 * 60_000) throw new Error("The proof expired while waiting. Verify again to fetch a fresh one.");
        const hash = await writeContractAsync({ chainId: cc3Testnet.id, address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "instantiateClaim", args });
        setInstantiateTx(hash); setStatus("Activation sent. Waiting for Creditcoin confirmation.");
        const activation = await cc3Client.waitForTransactionReceipt({ hash });
        if (activation.status !== "success") throw new Error("Activation reverted. Verify again to check whether this cashflow is already active.");
      }
      const c = await cc3Client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "claims", args: [claimId] });
      if (!c[10]) throw new Error("The cashflow is not active on Creditcoin.");
      setClaim({ claimId, borrower: c[5], originalCapacity: c[7], lockedUntil: BigInt(c[9]) });
      setClaimId(claimId);
      setStatus(alreadyActive ? "Verified at the live verifier. This cashflow was already active; its existing position is shown below." : "Verified and activated on Creditcoin.");
    } catch (err) {
      setError(shortErrorMessage(err));
    } finally { setBusy(false); }
  }

  function handleStreamCreated(tx: string, id: string) {
    setTxHash(tx); setStreamId(id); setCustom(false);
    // A just-created stream's block is not attested yet -- give this call a much
    // longer attestation-wait window than the default typed-hash path (Path 2
    // requirement 7), so the honest "waiting for attestation" status has room to
    // resolve instead of timing out on a stream that will be attested in a minute or two.
    verify(tx, id, 15 * 60_000);
  }

  const selectedClaimId = claim?.claimId ?? (isDemo ? DEMO.claimId : undefined);
  const live = useLivePosition(selectedClaimId);
  const loansQuery = useLiveLoans(selectedClaimId);
  const latestLoan = !loansQuery.isError ? loansQuery.data?.at(-1) : undefined;

  async function handleFinance() {
    setFinanceError(null); setFinanceTx(null);
    if (!isConnected || !address) { setFinanceError("Connect a wallet to act as a lender."); return; }
    if (!selectedClaimId) { setFinanceError("Verify a cashflow first."); return; }
    const raw = parseDepositAmount(amount);
    if (raw === null || raw <= 0n) { setFinanceError("Enter a whole-number amount to finance."); return; }
    if (!cc3Client) return;
    setFinanceBusy(true);
    try {
      const actionKeyBytes = new Uint8Array(32);
      crypto.getRandomValues(actionKeyBytes);
      const actionKey = ("0x" + Array.from(actionKeyBytes).map((b) => b.toString(16).padStart(2, "0")).join("")) as `0x${string}`;

      // Capacity refusal is determined directly against the real, already-decoded
      // on-chain available() figure -- not by simulating the whole finance() call,
      // which also exercises ccUSD transferFrom and would misreport an allowance
      // gap as a capacity refusal (DECISIONS.md D27/D34).
      const available = await cc3Client.readContract({ address: REGISTRY_ADDRESS, abi: registryAbi, functionName: "available", args: [selectedClaimId as Hash] });
      if (raw > available) {
        setFinanceError(`Amount exceeds the current balance. Only ${formatDeposit(available)} of capacity remains against this position. Requested ${formatDeposit(raw)}.`);
        setFinanceBusy(false);
        return;
      }

      await switchChainAsync({ chainId: cc3Testnet.id });

      const currentAllowance = (await cc3Client.readContract({ address: CCUSD_ADDRESS, abi: ccUsdAbi, functionName: "allowance", args: [address, VENUE_ADDRESS] })) as bigint;
      const ccUsdNeeded = raw / 10n ** BigInt(18 - CCUSD_DECIMALS);
      if (currentAllowance < ccUsdNeeded) {
        const approveHash = await writeContractAsync({ chainId: cc3Testnet.id, address: CCUSD_ADDRESS, abi: ccUsdAbi, functionName: "approve", args: [VENUE_ADDRESS, ccUsdNeeded] });
        const approval = await cc3Client.waitForTransactionReceipt({ hash: approveHash });
        if (approval.status !== "success") throw new Error("Token approval reverted. No loan was issued.");
      }

      const hash = await writeContractAsync({ chainId: cc3Testnet.id, address: VENUE_ADDRESS, abi: venueAbi, functionName: "finance", args: [actionKey, selectedClaimId as Hash, raw] });
      const settlement = await cc3Client.waitForTransactionReceipt({ hash });
      if (settlement.status !== "success") throw new Error("The loan transaction reverted. No funds were disbursed.");
      setFinanceTx(hash);
      setAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["live-position", selectedClaimId] }),
        queryClient.invalidateQueries({ queryKey: ["live-loans", selectedClaimId] }),
      ]);
    } catch (err) {
      setFinanceError(shortErrorMessage(err));
    } finally { setFinanceBusy(false); }
  }

  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-14">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-sm text-ink-soft">Ethereum Sepolia / Creditcoin CC3</p><h1 className="mt-3 font-display text-4xl sm:text-5xl">Cashflow dashboard</h1></div>
      <div className="flex flex-wrap gap-3"><button onClick={() => setShowHelp(!showHelp)} aria-expanded={showHelp} className="flex items-center gap-2 border border-line px-4 py-2 text-sm"><Info size={16} strokeWidth={1.5} />How to test this</button><button onClick={reset} disabled={busy} className="border border-line px-4 py-2 text-sm disabled:opacity-50">Use demo cashflow</button></div>
    </div>
    {showHelp && <div className="mb-8 border border-cut/40 bg-bone p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><p className="text-sm font-medium">How to test this</p><button onClick={() => setShowHelp(false)} aria-label="Dismiss"><X size={16} strokeWidth={1.5} /></button></div><ol className="mt-4 space-y-2 text-sm leading-relaxed text-ink-soft">{TEST_STEPS.map((step, i) => <li key={i} className="flex gap-3"><span className="text-cut">{i + 1}.</span><span>{step}</span></li>)}</ol></div>}

    <PositionMetrics claimId={selectedClaimId} />

    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.65fr_1fr]">
      <div className="min-w-0 space-y-6">
        <section className="panel min-w-0 p-5 sm:p-7">
          <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-ink-soft">Source cashflow</p><h2 className="mt-2 font-display text-3xl">Sablier stream #{streamId || "—"}</h2></div><span className="h-fit border border-line px-3 py-1 text-xs">Ethereum Sepolia</span></div>
          <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
            <div className="py-4"><dt className="text-xs text-ink-soft">Creation transaction</dt><dd className="mt-2 break-all font-mono text-xs">{txHash || "No source selected"}</dd>{/^0x[0-9a-f]{64}$/i.test(txHash.trim()) && <a href={SEPOLIA_EXPLORER_TX(txHash.trim())} className="mt-2 inline-block underline underline-offset-4" target="_blank" rel="noreferrer">View source on Sepolia</a>}</div>
            <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-ink-soft">Recipient</dt><dd>{live.data && !live.isError ? shortAddress(live.data.borrower) : "Awaiting live read"}</dd></div>
            <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-ink-soft">Lock expires</dt><dd>{live.data && !live.isError ? new Date(Number(live.data.lockedUntil) * 1000).toLocaleString() : "Awaiting live read"}</dd></div>
          </dl>
          <div className="mt-6">
            <CreateDemoCashflow onCreated={handleStreamCreated} disabled={busy} />
          </div>
          <button onClick={() => setCustom(!custom)} disabled={busy} aria-expanded={custom} className="mt-5 text-xs text-ink-soft underline underline-offset-4">{custom ? "Close advanced panel" : "Advanced: paste an existing Sablier stream"}</button>
          {custom && (
            <div className="mt-5 space-y-5 border-t border-line pt-5">
              <div className="bg-[#f7f3eb] p-4 text-xs leading-relaxed text-ink-soft border border-line">
                <p className="font-semibold text-ink">For advanced users who already have a real Sablier stream to prove:</p>
                <p className="mt-1.5">This is not the normal way to use Notch -- most testing should use the pre-loaded demo above, or the &ldquo;Create a demo cashflow&rdquo; button. Use this only if you already created your own compliant stream directly against Sablier.</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4">
                  <li>
                    Go to <a href="https://app.sablier.com/" target="_blank" rel="noreferrer" className="text-ink underline">Sablier V2 App</a> or interact with the Sablier Lockup contract on <strong>Ethereum Sepolia</strong>.
                  </li>
                  <li>
                    Create a <strong>Lockup Linear</strong> stream configured as: <em>non-cancelable, non-transferable, 0% start unlock, and cliff date set in the future</em> (<Link href="/docs#source-rules" className="underline text-ink">view full rules</Link>).
                  </li>
                  <li>
                    Copy the <strong>Creation Transaction Hash</strong> from MetaMask or Etherscan Sepolia and enter the assigned numeric <strong>Stream ID</strong> below.
                  </li>
                </ol>
              </div>

              <div>
                <label htmlFor="source-tx" className="text-sm font-medium">Creation transaction hash</label>
                <input
                  id="source-tx"
                  value={txHash}
                  disabled={busy}
                  placeholder="0x..."
                  onChange={e => { setTxHash(e.target.value); setClaim(null); setStatus(""); setError(null); }}
                  className="mt-2 w-full min-w-0 border border-line bg-bone px-3 py-3 font-mono text-xs"
                />
                <p className="mt-1.5 text-xs text-ink-soft">The Ethereum Sepolia transaction hash where the Sablier stream was created.</p>
              </div>

              <div>
                <label htmlFor="stream-id" className="text-sm font-medium">Stream ID</label>
                <input
                  id="stream-id"
                  inputMode="numeric"
                  disabled={busy}
                  value={streamId}
                  placeholder="e.g. 189"
                  onChange={e => { setStreamId(e.target.value); setClaim(null); setStatus(""); setError(null); }}
                  className="mt-2 w-full border border-line bg-bone px-3 py-3 text-sm"
                />
                <p className="mt-1.5 text-xs text-ink-soft">The numeric Sablier stream identifier generated in that transaction.</p>
              </div>
            </div>
          )}
        </section>

        <section className="panel p-5 sm:p-7"><h2 className="font-display text-2xl">Latest settled loan</h2>{loansQuery.isLoading && <p className="mt-5 text-sm text-ink-soft">Reading LoanOriginated events from deployment onward…</p>}{loansQuery.isError && <p role="alert" className="mt-5 text-sm text-cut">Live loan history is unavailable. No saved history is substituted.</p>}{latestLoan && <div className="mt-5"><p className="font-display text-3xl">{formatDeposit(latestLoan.amount)} ccUSD</p><p className="mt-2 text-sm text-ink-soft">Lender {shortAddress(latestLoan.lender)}</p><p className="mt-3 text-sm text-settled">Settled on Creditcoin</p><a href={CC3_EXPLORER_TX(latestLoan.tx)} target="_blank" rel="noreferrer" className="mt-4 inline-block text-sm underline">View settled transaction</a></div>}{loansQuery.data?.length === 0 && !loansQuery.isError && <p className="mt-5 text-sm text-ink-soft">No settled loans for this claim.</p>}</section>

        {selectedClaimId && <MinedRefusals claimId={selectedClaimId} />}
      </div>

      <div className="min-w-0 space-y-6">
        <section className="panel p-5 sm:p-7">
          <h2 className="font-display text-2xl">Verify with Attestcoin</h2>
          <button onClick={() => verify()} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-sm text-bone disabled:opacity-60">{busy && <LoaderCircle size={17} className="animate-spin" />}{busy ? "Verifying…" : needsActivation ? "Verify and activate" : "Verify with Attestcoin"}</button>
          <p className="mt-3 text-xs text-ink-soft">No wallet needed to view or verify an existing cashflow. One is needed only to activate a new cashflow.</p>
          {status && <p role="status" aria-live="polite" className="mt-5 border-t border-line pt-4 text-sm leading-relaxed">{status}</p>}
          {error && <div role="alert" className="mt-5 border-l-2 border-cut pl-4"><p className="text-sm font-medium">Verification paused</p><p className="mt-2 break-words text-sm leading-relaxed text-ink-soft">{error}</p></div>}
          {instantiateTx && <a href={CC3_EXPLORER_TX(instantiateTx)} target="_blank" rel="noreferrer" className="mt-4 block text-sm underline">View activation transaction</a>}
        </section>

        <section className="panel p-5 sm:p-7">
          <h2 className="font-display text-2xl">Finance this cashflow</h2>
          <label htmlFor="finance-amount" className="mt-5 block text-sm">Amount (ccUSD)</label>
          <input id="finance-amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount" className="mt-2 w-full border border-line bg-bone px-3 py-3 text-sm" disabled={financeBusy} />
          <button onClick={handleFinance} disabled={financeBusy || !isConnected || !live.data || live.isError || !selectedClaimId || live.data.expired || live.data.available === 0n} className="mt-4 w-full bg-ink px-4 py-3 text-sm text-bone disabled:opacity-40">{financeBusy ? "Awaiting confirmation…" : "Finance cashflow"}</button>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">{!selectedClaimId ? "Verify a cashflow to enable financing." : !isConnected ? "Connect a wallet to finance. Position data above is live without one." : live.data?.expired ? "The lock has expired; new loans are closed." : live.data?.available === 0n ? "This position has no remaining capacity." : "Requires test ccUSD and Creditcoin gas."}</p>
          {financeError && <p role="alert" className="mt-4 text-sm text-cut">{financeError}</p>}
          {financeTx && <a href={CC3_EXPLORER_TX(financeTx)} target="_blank" rel="noreferrer" className="mt-4 block text-sm underline">View finance transaction</a>}
        </section>

        {selectedClaimId && <Link href={`/recompute/${selectedClaimId}`} className="block border border-line p-5 text-sm underline underline-offset-4">Independently check remaining capacity</Link>}
        <Link href="/docs#attestcoin" className="block text-xs underline underline-offset-4">Full verification guarantees & boundaries</Link>
      </div>
    </div>
  </div>;
}
