"use client";

import { useEffect, useRef } from "react";

const DEFAULT_INTERVAL_MS = 15_000;

/**
 * Re-runs `refresh` on an interval and whenever the tab comes back into view.
 *
 * Bookings are two-sided: the host responds on their page, the guest cancels on
 * theirs. Neither page would ever learn about the other's action without a
 * manual reload, so both poll while they're on screen. Ticks are skipped while
 * the tab is hidden and fire once immediately when it becomes visible again.
 */
export function useLiveRefresh(
  refresh: () => void,
  enabled: boolean,
  intervalMs: number = DEFAULT_INTERVAL_MS
) {
  const latest = useRef(refresh);

  useEffect(() => {
    latest.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (document.visibilityState === "visible") latest.current();
    };

    const id = window.setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [enabled, intervalMs]);
}
