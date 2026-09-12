// ProofBuilder HTTP client -- fetch only, no SDK, no ethers (Notch-PRD.md section 7.1).
// Always live: this module has no cache and no "read a saved proof from disk" path.
// Per Gate 3's finding (DECISIONS.md D12) that proofs go stale within hours, every
// caller must fetch immediately before use, never replay a stored payload.
import { CC3_PROOF_BUILDER_API, PROOF_STALENESS_LIMIT_MS, CLOCK_SKEW_TOLERANCE_MS } from "./constants.js";
import { storeProofPayload } from "./proof-store.js";

export class StaleProofError extends Error {
  constructor(
    public readonly generatedAt: string,
    public readonly ageMs: number
  ) {
    super(`ProofBuilder returned a proof generated ${Math.round(ageMs / 1000)}s ago (limit ${Math.round(PROOF_STALENESS_LIMIT_MS / 1000)}s) -- refusing to use it. Refetch, don't retry with this payload (DECISIONS.md D12).`);
    this.name = "StaleProofError";
  }
}

export interface MerkleProofEntry {
  hash: string;
  isLeft: boolean;
}

export interface SingleContinuityResponse {
  chainKey: number;
  headerNumber: string;
  txIndex: string;
  cached: boolean;
  generatedAt: string;
  txHash: string;
  txBytes: string;
  merkleProof: { root: string; siblings: MerkleProofEntry[] };
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
}

export interface FetchedProof {
  chainKey: number;
  txHash: string;
  fetchedAt: string;
  response: SingleContinuityResponse;
  /** keccak256 of JSON.stringify(response) -- for the receipt's rawProofPayloadHash. */
  rawPayloadHash: string;
}

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function waitUntilAttested(
  chainKey: number,
  targetBlock: string | bigint,
  opts: { intervalMs?: number; timeoutMs?: number; onPoll?: (attestedHeight: bigint | null) => void } = {}
): Promise<void> {
  const intervalMs = opts.intervalMs ?? 15_000;
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

/**
 * Fetches a FRESH proof for txHash -- always a live HTTP call, never a cache read.
 * Retries on 422 BlockNotReady per the API's own retriable flag.
 */
export async function fetchFreshProof(
  chainKey: number,
  txHash: string,
  opts: { maxAttempts?: number; retryIntervalMs?: number } = {}
): Promise<FetchedProof> {
  const maxAttempts = opts.maxAttempts ?? 20;
  const retryIntervalMs = opts.retryIntervalMs ?? 15_000;

  let response: SingleContinuityResponse | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { status, body } = await getJson(`${CC3_PROOF_BUILDER_API}/api/v1/proof-by-tx/${chainKey}/${txHash}`);
    if (status === 200) {
      response = body as SingleContinuityResponse;
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
  if (response.chainKey !== chainKey || typeof response.txHash !== "string" || response.txHash.toLowerCase() !== txHash.toLowerCase())
    throw new Error("ProofBuilder response does not match requested chain/transaction");

  // Fail closed on staleness (DECISIONS.md D12), rather than trusting that "we just
  // fetched it" means it's current -- the API can return a `cached: true` payload whose
  // own generatedAt is already old. Checked against the API's own timestamp, not just
  // our call time, since that's what actually failed on-chain in Gate 3. A small negative
  // age (the API's clock reading slightly ahead of ours) is ordinary skew, not staleness
  // (Gate 7, DECISIONS.md D26) -- only reject if it exceeds the tolerance.
  const rawAgeMs = Date.now() - Date.parse(response.generatedAt);
  if (!Number.isFinite(rawAgeMs) || rawAgeMs < -CLOCK_SKEW_TOLERANCE_MS || rawAgeMs > PROOF_STALENESS_LIMIT_MS) {
    throw new StaleProofError(response.generatedAt, rawAgeMs);
  }

  const { keccak256, stringToBytes } = await import("viem");
  const rawPayloadHash = keccak256(stringToBytes(JSON.stringify(response)));
  if (storeProofPayload(response) !== rawPayloadHash) throw new Error("Proof store hash mismatch");

  return { chainKey, txHash, fetchedAt: new Date().toISOString(), response, rawPayloadHash };
}
