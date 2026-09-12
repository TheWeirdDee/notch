"use client";
import { usePublicClient } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { type Hash } from "viem";
import { cc3Testnet } from "./chains";
import { readPosition, readLoans } from "./live-position";

export function useLivePosition(claimId?: string) {
  const client = usePublicClient({ chainId: cc3Testnet.id });
  return useQuery({ queryKey: ["live-position", claimId], queryFn: () => readPosition(client!, claimId as Hash), enabled: !!client && /^0x[0-9a-f]{64}$/i.test(claimId ?? ""), refetchInterval: 15000, refetchOnMount: "always", retry: 1 });
}
export function useLiveLoans(claimId: string) {
  const client = usePublicClient({ chainId: cc3Testnet.id });
  return useQuery({ queryKey: ["live-loans", claimId], queryFn: () => readLoans(client!, claimId as Hash), enabled: !!client && /^0x[0-9a-f]{64}$/i.test(claimId), refetchInterval: 30000, refetchOnMount: "always", retry: 1 });
}
