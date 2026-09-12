// Client-side mirror of adapter/src/proof-builder-client.ts -- same fetch-only, no-cache
// discipline (D12/D26): every verify click fetches a genuinely fresh proof, never reuses
// one held from an earlier click. No SDK, no ethers -- plain fetch + viem, same as the
// adapter and every gate's scripts.
import { CC3_PROOF_BUILDER_API, PROOF_STALENESS_LIMIT_MS, CLOCK_SKEW_TOLERANCE_MS } from "./constants";

export interface MerkleProofEntry {
  hash: string;
  isLeft: boolean;
}

export interface ProofByTxResponse {
  chainKey: number;
  headerNumber: number;
  txIndex: number;
  txHash: string;
  txBytes: string;
  generatedAt: string;
  merkleProof: { root: string; siblings: MerkleProofEntry[] };
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
}

export class StaleProofError extends Error {
  constructor(generatedAt: string, ageMs: number) {
    super(`ProofBuilder returned a proof generated ${Math.round(ageMs / 1000)}s ago (limit ${Math.round(PROOF_STALENESS_LIMIT_MS / 1000)}s) -- refusing to use it. Refetch, don't retry with this payload.`);
  }
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function waitUntilAttested(
  chainKey: number,
  targetBlock: string | bigint,
  opts: { intervalMs?: number; timeoutMs?: number; onPoll?: (attested: bigint | null) => void } = {}
): Promise<void> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const timeoutMs = opts.timeoutMs ?? 20 * 60_000;
  const target = BigInt(targetBlock);
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { status, body } = await getJson(`${CC3_PROOF_BUILDER_API}/api/v1/attested-height/${chainKey}`);
    const attestedHeight = status === 200 ? (body as { attestedHeight?: string | number | null })?.attestedHeight : null;
    if (attestedHeight != null) {
      const attested = BigInt(attestedHeight);
      opts.onPoll?.(attested);
      if (attested >= target) return;
    } else {
      opts.onPoll?.(null);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out waiting for block ${target} to be attested on chainKey ${chainKey}`);
}

export async function fetchFreshProof(chainKey: number, txHash: string, opts: { maxAttempts?: number; retryIntervalMs?: number } = {}): Promise<ProofByTxResponse> {
  const maxAttempts = opts.maxAttempts ?? 20;
  const retryIntervalMs = opts.retryIntervalMs ?? 5_000;

  let response: ProofByTxResponse | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { status, body } = await getJson(`${CC3_PROOF_BUILDER_API}/api/v1/proof-by-tx/${chainKey}/${txHash}`);
    if (status === 200) {
      response = body as ProofByTxResponse;
      break;
    }
    const errBody = body as { code?: string; message?: string; retriable?: boolean } | null;
    if (status === 422 && errBody?.retriable) {
      await new Promise((r) => setTimeout(r, retryIntervalMs));
      continue;
    }
    throw new Error(`proof-by-tx failed: HTTP ${status} ${errBody?.code ?? ""} ${errBody?.message ?? ""}`);
  }
  if (!response) throw new Error(`Exhausted ${maxAttempts} attempts fetching proof for ${txHash}`);
  if (response.chainKey !== chainKey || response.txHash.toLowerCase() !== txHash.toLowerCase())
    throw new Error("ProofBuilder response does not match requested chain/transaction");

  const rawAgeMs = Date.now() - Date.parse(response.generatedAt);
  if (!Number.isFinite(rawAgeMs) || rawAgeMs < -CLOCK_SKEW_TOLERANCE_MS || rawAgeMs > PROOF_STALENESS_LIMIT_MS) {
    throw new StaleProofError(response.generatedAt, rawAgeMs);
  }
  return response;
}
