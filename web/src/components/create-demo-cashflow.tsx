"use client";

import { useState } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useAccount, useChainId, useConnect, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import { sepolia } from "wagmi/chains";
import { decodeEventLog } from "viem";
import { createWithTimestampsLLAbi, createLockupLinearStreamEventAbi, demoAssetAbi } from "@/lib/abi/sablier";
import { SABLIER_LOCKUP_SEPOLIA, SEPOLIA_DEMO_ASSET, DEMO_STREAM_DEPOSIT_HUMAN, DEMO_STREAM_CLIFF_SECONDS, DEMO_STREAM_END_BUFFER_SECONDS, DEPOSIT_ASSET_DECIMALS, SEPOLIA_EXPLORER_TX } from "@/lib/constants";
import { shortErrorMessage } from "@/lib/format";

const DEPOSIT_AMOUNT = DEMO_STREAM_DEPOSIT_HUMAN * 10n ** BigInt(DEPOSIT_ASSET_DECIMALS);

interface Props {
  onCreated: (txHash: string, streamId: string) => void;
  disabled?: boolean;
}

// Path 2: creates a fresh, rule-compliant Sablier stream on Ethereum Sepolia directly
// from the connected wallet, so a judge never has to visit app.sablier.com or hunt an
// event log by hand. Every parameter that matters for the registry's source-shape
// check is hardcoded here, not chosen by the user (cancelable=false,
// transferable=false, zero unlock amounts, a 30-day cliff). Signing is wagmi-only --
// this component never touches a private key; every write is the user's own wallet.
export function CreateDemoCashflow({ onCreated, disabled }: Props) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending: connecting } = useConnect();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const sepoliaClient = usePublicClient({ chainId: sepolia.id });
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ tx: string; streamId: string } | null>(null);

  const onSepolia = isConnected && chainId === sepolia.id;

  async function run() {
    if (!address || !sepoliaClient) return;
    setError(null); setResult(null); setBusy(true);
    try {
      setStatus("Checking your Notch Demo Asset balance on Sepolia.");
      const balance = await sepoliaClient.readContract({ address: SEPOLIA_DEMO_ASSET, abi: demoAssetAbi, functionName: "balanceOf", args: [address] });
      if (balance < DEPOSIT_AMOUNT) {
        setStatus("Minting test tokens. Notch Demo Asset is an open-mint, testnet-only token made for exactly this.");
        const mintHash = await writeContractAsync({ chainId: sepolia.id, address: SEPOLIA_DEMO_ASSET, abi: demoAssetAbi, functionName: "mint", args: [address, DEPOSIT_AMOUNT] });
        const mintReceipt = await sepoliaClient.waitForTransactionReceipt({ hash: mintHash });
        if (mintReceipt.status !== "success") throw new Error("Minting test tokens reverted. No stream was created.");
      }

      setStatus("Checking your token approval for the Sablier contract.");
      const allowance = await sepoliaClient.readContract({ address: SEPOLIA_DEMO_ASSET, abi: demoAssetAbi, functionName: "allowance", args: [address, SABLIER_LOCKUP_SEPOLIA] });
      if (allowance < DEPOSIT_AMOUNT) {
        setStatus("Approving Sablier to lock your deposit. Confirm in your wallet.");
        const approveHash = await writeContractAsync({ chainId: sepolia.id, address: SEPOLIA_DEMO_ASSET, abi: demoAssetAbi, functionName: "approve", args: [SABLIER_LOCKUP_SEPOLIA, DEPOSIT_AMOUNT] });
        const approveReceipt = await sepoliaClient.waitForTransactionReceipt({ hash: approveHash });
        if (approveReceipt.status !== "success") throw new Error("Token approval reverted. No stream was created.");
      }

      const now = Math.floor(Date.now() / 1000);
      const cliffTime = now + DEMO_STREAM_CLIFF_SECONDS;
      const endTime = cliffTime + DEMO_STREAM_END_BUFFER_SECONDS;
      const params = {
        sender: address, recipient: address, depositAmount: DEPOSIT_AMOUNT, token: SEPOLIA_DEMO_ASSET,
        cancelable: false, transferable: false, timestamps: { start: now, end: endTime }, shape: "",
      };
      const unlockAmounts = { start: 0n, cliff: 0n };
      const granularity = 0;

      setStatus("Checking the create call against the live Sablier contract.");
      await sepoliaClient.simulateContract({
        account: address, address: SABLIER_LOCKUP_SEPOLIA, abi: createWithTimestampsLLAbi,
        functionName: "createWithTimestampsLL", args: [params, unlockAmounts, granularity, cliffTime],
      });

      setStatus("Creating your Sablier stream. Confirm in your wallet.");
      const createHash = await writeContractAsync({
        chainId: sepolia.id, address: SABLIER_LOCKUP_SEPOLIA, abi: createWithTimestampsLLAbi,
        functionName: "createWithTimestampsLL", args: [params, unlockAmounts, granularity, cliffTime],
      });
      setStatus("Waiting for Ethereum Sepolia to confirm the stream.");
      const receipt = await sepoliaClient.waitForTransactionReceipt({ hash: createHash });
      if (receipt.status !== "success") throw new Error("The create transaction reverted. No stream was created.");

      let streamId: bigint | undefined;
      for (const log of receipt.logs) {
        try {
          const decoded = decodeEventLog({ abi: createLockupLinearStreamEventAbi, data: log.data, topics: log.topics });
          if (decoded.eventName === "CreateLockupLinearStream") { streamId = decoded.args.streamId; break; }
        } catch { /* not this event -- keep scanning */ }
      }
      if (streamId === undefined) {
        throw new Error(`Stream created (tx ${createHash}) but its stream id could not be read from the receipt. Use the advanced panel below to paste it in once you find it on Etherscan.`);
      }

      setResult({ tx: createHash, streamId: streamId.toString() });
      setStatus(`Stream #${streamId} created on Sepolia. Starting verification.`);
      onCreated(createHash, streamId.toString());
    } catch (err) {
      setError(shortErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const label = !isConnected ? "Connect wallet to create a demo cashflow"
    : !onSepolia ? "Switch to Sepolia to create a demo cashflow"
    : busy ? "Creating…" : "Create a demo cashflow";

  function handleClick() {
    if (!isConnected) { if (connectors[0]) connect({ connector: connectors[0] }); return; }
    if (!onSepolia) { switchChainAsync({ chainId: sepolia.id }).catch((err) => setError(shortErrorMessage(err))); return; }
    run();
  }

  const working = busy || connecting || switching;

  return (
    <div className="border border-line p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Sparkles size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-cut" />
        <div className="min-w-0">
          <p className="text-sm font-medium">Don&rsquo;t have a stream to test with?</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">Creates a real, compliant Sablier stream on Sepolia from your own wallet -- no Sablier app, no manual tx-hash lookup.</p>
        </div>
      </div>
      <button onClick={handleClick} disabled={disabled || working} className="mt-4 flex w-full items-center justify-center gap-2 border border-ink px-4 py-2.5 text-sm disabled:opacity-50">
        {working && <LoaderCircle size={16} className="animate-spin" />}
        {label}
      </button>
      {status && <p role="status" aria-live="polite" className="mt-3 text-xs leading-relaxed text-ink-soft">{status}</p>}
      {error && <p role="alert" className="mt-3 text-xs leading-relaxed text-cut">{error}</p>}
      {result && <a href={SEPOLIA_EXPLORER_TX(result.tx)} target="_blank" rel="noreferrer" className="mt-3 block text-xs underline underline-offset-4">View create transaction on Sepolia</a>}
    </div>
  );
}
