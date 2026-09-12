"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

export interface RefusedAttempt {
  claimId: string;
  lender: string;
  requestedRaw: string; // bigint as string
  availableAtAttemptRaw: string;
  reason: string;
  at: string; // ISO timestamp
}

const KEY = "notch:refused-attempts";
const listeners = new Set<() => void>();

// useSyncExternalStore requires getSnapshot to return a referentially STABLE value when
// the underlying data hasn't changed -- re-parsing localStorage.getItem on every call
// (as the original version did) returns a new array reference every time, which React
// treats as "changed," triggering a re-render, which calls getSnapshot again, forever.
// Cache the parsed result behind the raw string it was parsed from; only re-parse (and
// hand back a new array reference) when the raw string actually differs.
let cachedRaw: string | null = null;
let cachedSnapshot: RefusedAttempt[] = [];

function readAll(): RefusedAttempt[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cachedSnapshot;
  }
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  try {
    cachedSnapshot = raw ? JSON.parse(raw) : [];
  } catch {
    cachedSnapshot = [];
  }
  return cachedSnapshot;
}

// Same referential-stability requirement applies to getServerSnapshot -- a fresh []
// literal on every call is exactly the D32 bug again, just on the server-snapshot path
// instead of the client one.
const EMPTY_ATTEMPTS: RefusedAttempt[] = [];
function getServerSnapshot(): RefusedAttempt[] {
  return EMPTY_ATTEMPTS;
}

/** A refused draw leaves no on-chain trace by design -- that's the point of the check
 * succeeding. Activity still has to show it as first-class (RULES F5), so each refusal
 * is recorded client-side at the moment it's discovered via a real simulateContract call
 * against live chain state (never fabricated, never a hardcoded example). Session-local,
 * not a claim of durable/shared history. */
export function useRefusedAttempts(claimId: string | undefined) {
  const all = useSyncExternalStore(subscribe, readAll, getServerSnapshot);
  const attempts = useMemo(() => all.filter((a) => a.claimId === claimId), [all, claimId]);

  const record = useCallback((attempt: RefusedAttempt) => {
    try {
      const current = readAll();
      const next = [...current, attempt];
      const raw = JSON.stringify(next);
      localStorage.setItem(KEY, raw);
      cachedRaw = raw;
      cachedSnapshot = next;
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  }, []);

  return { attempts, record };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
