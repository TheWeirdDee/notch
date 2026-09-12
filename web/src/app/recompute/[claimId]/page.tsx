"use client";

import { use } from "react";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { cc3Testnet } from "@/lib/chains";
import { registryAbi } from "@/lib/abi";
import { REGISTRY_ADDRESS } from "@/lib/constants";
import { formatDeposit } from "@/lib/format";
import type { PublicClient } from "viem";

interface RawState {
  originalCapacity: bigint;
  financedCapacity: bigint;
  available: bigint;
}

async function loadRaw(cc3Client: PublicClient, claimId: string): Promise<RawState> {
  const c = (await cc3Client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "claims",
    args: [claimId as `0x${string}`],
  })) as unknown as [string, number, string, string, bigint, string, string, bigint, bigint, number, boolean];
  const available = (await cc3Client.readContract({
    address: REGISTRY_ADDRESS,
    abi: registryAbi,
    functionName: "available",
    args: [claimId as `0x${string}`],
  })) as bigint;
  return { originalCapacity: c[7], financedCapacity: c[8], available };
}

/**
 * Independent recompute: reads registry.claims(claimId) and registry.available(claimId)
 * directly, with no app-side arithmetic in between -- the same two eth_call reads shown
 * in the recipe below, runnable with any RPC client, not just this app.
 */
export default function RecomputePage({ params }: { params: Promise<{ claimId: string }> }) {
  const { claimId } = use(params);
  const cc3Client = usePublicClient({ chainId: cc3Testnet.id });

  const rawQuery = useQuery({
    queryKey: ["recompute", claimId],
    queryFn: () => loadRaw(cc3Client!, claimId),
    enabled: !!cc3Client,
  });

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="font-display text-2xl font-medium">Independent recompute</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Two read-only calls against the registry at <code className="font-mono">{REGISTRY_ADDRESS}</code> on Creditcoin CC3 testnet. No app trust required.
      </p>

      <pre className="mt-6 overflow-x-auto rounded-sm border border-line bg-white/40 p-4 text-xs font-mono">
{`cast call ${REGISTRY_ADDRESS} \\
  "claims(bytes32)" ${claimId} \\
  --rpc-url https://rpc.cc3-testnet.creditcoin.network

cast call ${REGISTRY_ADDRESS} \\
  "available(bytes32)(uint128)" ${claimId} \\
  --rpc-url https://rpc.cc3-testnet.creditcoin.network`}
      </pre>

      {rawQuery.isError && <p className="mt-6 text-sm text-cut">{String(rawQuery.error)}</p>}

      {rawQuery.data && (
        <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
          <Row label="originalCapacity (raw)" value={rawQuery.data.originalCapacity.toString()} />
          <Row label="financedCapacity (raw)" value={rawQuery.data.financedCapacity.toString()} />
          <Row label="available() (raw, from the contract itself)" value={rawQuery.data.available.toString()} />
          <Row label="available, human" value={formatDeposit(rawQuery.data.available)} />
          <Row label="originalCapacity - financedCapacity, human" value={formatDeposit(rawQuery.data.originalCapacity - rawQuery.data.financedCapacity)} />
        </dl>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums font-mono">{value}</dd>
    </div>
  );
}
