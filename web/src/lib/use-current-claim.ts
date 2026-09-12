"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "notch:current-claim-id";
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function getServerSnapshot(): string | null {
  return null;
}

/** The most recently verified claim, remembered client-side only (no backend) so the
 * Position/Activity nav links know where to go after a Surface A verify. Position and
 * Activity always re-read real on-chain state for whatever claimId is in the URL --
 * this is purely a navigation convenience, never a source of truth for any figure.
 * useSyncExternalStore, not useEffect+useState, so it's SSR-hydration-safe without a
 * synchronous setState inside an effect. */
export function useCurrentClaim() {
  const claimId = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setClaimId = useCallback((id: string) => {
    try {
      localStorage.setItem(KEY, id);
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
  }, []);

  return { claimId, setClaimId };
}
