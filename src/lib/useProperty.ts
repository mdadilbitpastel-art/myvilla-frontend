"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchMyVillasCount } from "@/lib/api";

// Module-level cache so navigating between account tabs doesn't re-fetch the
// count (and doesn't make the host-only sidebar items flicker in each time).
// Keyed by user id, since the count is per-account.
let cache: { userId: string; count: number } | null = null;
const listeners = new Set<() => void>();

function setCount(userId: string, count: number) {
  cache = { userId, count };
  listeners.forEach((fn) => fn());
}

/**
 * How many villas the signed-in user owns, and whether they own any. Drives the
 * host-only account sections (Rent Requests, Coupons): they show only once this
 * is ≥ 1 and hide again when the last property is removed.
 *
 * `count` is `null` until the first load resolves — callers can treat that as
 * "unknown yet" and avoid flashing the sections on before we know.
 */
export function useVillaCount(): { count: number | null; hasProperty: boolean } {
  const { user, ready } = useAuth();
  const userId = user?.id ?? "";
  const [, force] = useState(0);

  useEffect(() => {
    const rerender = () => force((n) => n + 1);
    listeners.add(rerender);
    return () => {
      listeners.delete(rerender);
    };
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    // A different user than the cached one → refetch.
    if (cache && cache.userId === userId) return;
    let cancelled = false;
    fetchMyVillasCount()
      .then((n) => {
        if (!cancelled) setCount(userId, n);
      })
      .catch(() => {
        /* leave the count unknown on failure — sections just stay hidden */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, userId]);

  const count = cache && cache.userId === userId ? cache.count : null;
  return { count, hasProperty: (count ?? 0) > 0 };
}

/**
 * Nudge the cached count after the user adds or removes a property, so the
 * sidebar updates without a full reload. Pass the new absolute count.
 */
export function setVillaCount(userId: string, count: number) {
  if (userId) setCount(userId, count);
}

/** Drop the cache (e.g. on sign-out) so the next user starts clean. */
export function resetVillaCount() {
  cache = null;
  listeners.forEach((fn) => fn());
}
