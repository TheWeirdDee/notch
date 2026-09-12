"use client";

import { useState } from "react";
import Link from "next/link";
import { LoaderCircle, ScanLine } from "lucide-react";
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { BaseError, ContractFunctionRevertedError, encodePacked, keccak256, type Hash } from "viem";
import { cc3Testnet } from "@/lib/chains";
import { registryAbi } from "@/lib/abi";
import { SOURCE_CHAIN_KEY_SEPOLIA, REGISTRY_ADDRESS, SEPOLIA_EXPLORER_TX, CC3_EXPLORER_TX } from "@/lib/constants";
import { fetchFreshProof, waitUntilAttested } from "@/lib/proof";
import { shortAddress, shortErrorMessage } from "@/lib/format";
import { useCurrentClaim } from "@/lib/use-current-claim";
import { PositionMetrics } from "@/components/position-metrics";
import { useLivePosition } from "@/lib/use-live-position";
import { DEMO } from "@/lib/demo";

interface VerifiedClaim { claimId: Hash; borrower: string; originalCapacity: bigint; lockedUntil: bigint }

export default function VerifyPage() {
  const { address, isConnected } = useAccount();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const cc3Client = usePublicClient({ chainId: cc3Testnet.id });
  const { writeContractAsync } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const { setClaimId } = useCurrentClaim();
  const [txHash, setTxHash] = useState<string>(DEMO.sourceTx);
  const [streamId, setStreamId] = useState<string>(DEMO.streamId);
  const [custom, setCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [claim, setClaim] = useState<VerifiedClaim | null>(null);
  const [instantiateTx, setInstantiateTx] = useState<string | null>(null);
  const [needsActivation, setNeedsActivation] = useState(false);
  const isDemo = txHash.trim().toLowerCase() === DEMO.sourceTx && streamId.trim() === DEMO.streamId;

  function reset() {
    setTxHash(DEMO.sourceTx); setStreamId(DEMO.streamId); setCustom(false);
    setClaim(null); setError(null); setStatus(""); setNeedsActivation(false);
  }
  async function verify() {
    setError(null); setClaim(null); setInstantiateTx(null); setNeedsActivation(false);
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash.trim())) { setError("Enter the full creation transaction hash: 0x followed by 64 characters."); return; }
    if (!/^\d+$/.test(streamId.trim()) || BigInt(streamId.trim()) >= 2n ** 256n) { setError("Enter a valid numeric Sablier stream ID."); return; }
    if (!sepoliaClient || !cc3Client) { setError("The network connection is starting. Try again in a moment."); return; }
    setBusy(true); 
    try {
      setStatus("Finding the creation transaction on Ethereum Sepolia.");
      const receipt = await sepoliaClient.getTransactionReceipt({ hash: txHash.trim() as Hash });
      if (receipt.status !== "success") throw new Error("The source transaction reverted. It cannot back a cashflow.");
      await waitUntilAttested(SOURCE_CHAIN_KEY_SEPOLIA, receipt.blockNumber, {
        timeoutMs: 90_000,
        onPoll: (height) => setStatus(height != null && height < receipt.blockNumber
          ? `Waiting for Attestcoin to reach source block ${receipt.blockNumber}. It has reached ${height}. You can retry safely.`
          : "Source located. Checking attestation availability."),
      });
      setStatus("Fetching a fresh Attestcoin proof of the source transaction.");
      const proof = await fetchFreshProof(SOURCE_CHAIN_KEY_SEPOLIA, txHash.trim(), { maxAttempts: 6 });
      const claimId = keccak256(encodePacked(["uint32", "bytes32", "uint256"], [proof.chainKey, keccak256(proof.txBytes as Hash), BigInt(streamId.trim())]));
      const args = [
        proof.chainKey, BigInt(proof.headerNumber), proof.txBytes as Hash, txHash.trim() as Hash,
        BigInt(streamId.trim()), proof.merkleProof.root as Hash,
        proof.merkleProof.siblings.map(s => ({ hash: s.hash as Hash, isLeft: s.isLeft })),
        proof.continuityProof.lowerEndpointDigest as Hash, proof.continuityProof.roots as Hash[],
      ] as const;
      setStatus("Checking the proof and decoded stream against the live Creditcoin contract.");
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
        setStatus("Connect to Creditcoin and approve cashflow activation in your wallet.");
        await switchChainAsync({ chainId: cc3Testnet.id });
        // Recheck freshness after a network switch before requesting a signature.
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
      setStatus(alreadyActive ? "Fresh proof checked. This cashflow is already active; its existing position was reused." : "Cashflow verified and activated.");
    } catch (err) {
      setError(shortErrorMessage(err));
    } finally { setBusy(false); }
  }


  const selectedClaimId = claim?.claimId ?? (isDemo ? DEMO.claimId : undefined);
  const live = useLivePosition(selectedClaimId);
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-10 sm:py-14">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-ink-soft">Ethereum Sepolia / Creditcoin CC3</p><h1 className="mt-3 font-display text-4xl sm:text-5xl">Cashflow dashboard</h1><p className="mt-3 text-sm text-ink-soft">Source evidence, verified capacity and financing in one place.</p></div><button onClick={reset} disabled={busy} className="border border-line px-4 py-2 text-sm disabled:opacity-50">Use demo cashflow</button></div>
    <PositionMetrics claimId={selectedClaimId} />
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[1.65fr_1fr]">
      <section className="panel min-w-0 p-5 sm:p-7">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="text-xs text-ink-soft">Source cashflow</p><h2 className="mt-2 font-display text-3xl">Sablier stream #{streamId || "—"}</h2></div><span className="h-fit border border-line px-3 py-1 text-xs">Ethereum Sepolia</span></div>
        <p className="mt-4 text-sm leading-relaxed text-ink-soft">A non-cancelable, non-transferable lock. Capacity comes from the proven creation receipt.</p>
        <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
          <div className="py-4"><dt className="text-xs text-ink-soft">Creation transaction</dt><dd className="mt-2 break-all font-mono text-xs">{txHash || "No source selected"}</dd>{/^0x[0-9a-f]{64}$/i.test(txHash.trim()) && <a href={SEPOLIA_EXPLORER_TX(txHash.trim())} className="mt-2 inline-block underline underline-offset-4" target="_blank" rel="noreferrer">View source on Sepolia</a>}</div>
          <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-ink-soft">Recipient</dt><dd>{live.data && !live.isError ? shortAddress(live.data.borrower) : "Awaiting live read"}</dd></div>
          <div className="flex flex-wrap justify-between gap-3 py-4"><dt className="text-ink-soft">Lock expires</dt><dd>{live.data && !live.isError ? new Date(Number(live.data.lockedUntil)*1000).toLocaleString() : "Awaiting live read"}</dd></div>
        </dl>
        <button onClick={() => setCustom(!custom)} disabled={busy} aria-expanded={custom} className="mt-6 text-sm underline underline-offset-4">{custom ? "Close source editor" : "Use your own cashflow"}</button>
        {custom && <div className="mt-5 space-y-5 border-t border-line pt-5"><div><label htmlFor="source-tx" className="text-sm">Creation transaction</label><input id="source-tx" value={txHash} disabled={busy} onChange={e=>{setTxHash(e.target.value);setClaim(null);setStatus("");setError(null);}} className="mt-2 w-full min-w-0 border border-line bg-bone px-3 py-3 font-mono text-xs" /><p className="mt-2 text-xs text-ink-soft">The Sepolia transaction that created the Sablier stream.</p></div><div><label htmlFor="stream-id" className="text-sm">Stream ID</label><input id="stream-id" inputMode="numeric" disabled={busy} value={streamId} onChange={e=>{setStreamId(e.target.value);setClaim(null);setStatus("");setError(null);}} className="mt-2 w-full border border-line bg-bone px-3 py-3 text-sm" /><p className="mt-2 text-xs text-ink-soft">The numeric stream identifier in that creation transaction.</p></div></div>}
      </section>
      <div className="min-w-0 space-y-6"><section className="panel p-5 sm:p-7"><ScanLine size={23} strokeWidth={1.5} className="text-cut" /><h2 className="mt-4 font-display text-2xl">Proof verification</h2><p className="mt-3 text-sm leading-relaxed text-ink-soft">Fetch a fresh Attestcoin proof and check it against the deployed Creditcoin verifier. An existing claim is reused.</p>
        <button onClick={verify} disabled={busy} className="mt-6 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-sm text-bone disabled:opacity-60">{busy && <LoaderCircle size={17} className="animate-spin" />}{busy ? "Verifying…" : needsActivation ? "Verify and activate" : "Verify with Attestcoin"}</button>
        <p className="mt-3 text-xs text-ink-soft">Viewing and verifying an existing claim require no wallet.</p>
        {status && <p role="status" aria-live="polite" className="mt-5 border-t border-line pt-4 text-sm leading-relaxed">{status}</p>}
        {error && <div role="alert" className="mt-5 border-l-2 border-cut pl-4"><p className="text-sm font-medium">Verification paused</p><p className="mt-2 break-words text-sm leading-relaxed text-ink-soft">{error}</p></div>}
        {instantiateTx && <a href={CC3_EXPLORER_TX(instantiateTx)} target="_blank" rel="noreferrer" className="mt-4 block text-sm underline">View activation transaction</a>}
      </section><section className="border border-line p-5 sm:p-7"><h2 className="font-display text-2xl">Position & financing</h2><p className="mt-3 text-sm leading-relaxed text-ink-soft">Read the shared balance, settled loans and mined transaction evidence.</p>{selectedClaimId && live.data && !live.isError ? <Link href={`/position/${selectedClaimId}`} className="mt-5 block border border-ink px-4 py-3 text-center text-sm">Open position</Link> : <p className="mt-5 text-xs text-ink-soft">A verified on-chain claim is needed to open a position.</p>}<Link href="/docs#attestcoin" className="mt-4 inline-block text-xs underline">How verification works</Link></section></div>
    </div>
  </div>;
}

