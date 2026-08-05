"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { fetchAccountCounts, type AccountCounts } from "@/lib/api";

// Module-level cache so navigating between account tabs doesn't re-fetch the
// counts (and doesn't make the host-only sidebar items flicker in each time).
// Keyed by user id, since they are per-account.
//
// All four travel together because they are fetched together — see
// `fetchAccountCounts`. Any of them but `villas` can be null, which means the
// server didn't say, and is a different thing from a user who has none.
type Counts = AccountCounts & { userId: string };
let cache: Counts | null = null;
const listeners = new Set<() => void>();

function publish(next: Counts) {
  cache = next;
  listeners.forEach((fn) => fn());
}

/** The cached counts for the signed-in user, fetching them once if needed, and
 *  re-rendering this component whenever they change. */
function useCounts(): Counts | null {
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
    fetchAccountCounts()
      .then((counts) => {
        if (!cancelled) publish({ userId, ...counts });
      })
      .catch(() => {
        /* leave the counts unknown on failure — the sidebar keeps waiting
           rather than claiming the user owns or has booked nothing */
      });
    return () => {
      cancelled = true;
    };
  }, [ready, user, userId]);

  return cache && cache.userId === userId ? cache : null;
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
  const counts = useCounts();
  const count = counts ? counts.villas : null;
  return { count, hasProperty: (count ?? 0) > 0 };
}

/**
 * Every count at once, plus whether they have arrived at all. The sidebar uses
 * this to draw itself in a single step: skeletons until `ready`, then the whole
 * nav — never a partial list that grows a moment later.
 */
export function useAccountCounts(): {
  villas: number | null;
  bookings: number | null;
  rentRequests: number | null;
  coupons: number | null;
  ready: boolean;
} {
  const c = useCounts();
  return {
    villas: c ? c.villas : null,
    bookings: c ? c.bookings : null,
    rentRequests: c ? c.rentRequests : null,
    coupons: c ? c.coupons : null,
    ready: c !== null,
  };
}

/** Overwrite one count in place, leaving the others as they were. Only ever
 *  called by the page that owns that number and has just seen the real one. */
function patch(userId: string, change: Partial<AccountCounts>) {
  if (!userId) return;
  const prev = cache && cache.userId === userId ? cache : null;
  // Nothing cached yet: a lone count would have to guess at the other three,
  // and guessing `villas` wrong takes the host-only sections out of the nav.
  // The first fetch is already on its way — let it land.
  if (!prev) return;
  publish({ ...prev, ...change });
}

/**
 * Nudge the cached villa count after the user adds or removes a property, so
 * the sidebar updates without a full reload. Pass the new absolute count.
 */
export function setVillaCount(userId: string, count: number) {
  if (!userId) return;
  const prev = cache && cache.userId === userId ? cache : null;
  // Unlike the others this one can seed the cache on its own: it is the count
  // that decides which sections exist, and the property page knows it for
  // certain — it is holding the list.
  publish(
    prev
      ? { ...prev, villas: count }
      : { userId, villas: count, bookings: null, rentRequests: null, coupons: null }
  );
}

/** The same, for the guest's own bookings — published by the bookings page once
 *  it has the real list, so the sidebar's "No bookings yet" mark is right the
 *  moment a stay is booked rather than at the next hard refresh. */
export function setBookingCount(userId: string, count: number) {
  patch(userId, { bookings: count });
}

/** The host's incoming rent requests, from the page that lists them. */
export function setRentRequestCount(userId: string, count: number) {
  patch(userId, { rentRequests: count });
}

/** The host's discount codes, from the page that lists them. */
export function setCouponCount(userId: string, count: number) {
  patch(userId, { coupons: count });
}

/** Drop the cache (e.g. on sign-out) so the next user starts clean. */
export function resetVillaCount() {
  cache = null;
  listeners.forEach((fn) => fn());
}
