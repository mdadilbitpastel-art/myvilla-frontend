"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ignore further toggles for this long after one. Must outlast the CSS
 * transitions the toggle starts, so the reflow they cause can't trigger the
 * next toggle.
 */
const SETTLE_MS = 420;

/**
 * Drives the collapsed (shorter) state of a sticky page header.
 *
 * Direction-aware: scrolling down past `collapseAt` collapses it, and it stays
 * collapsed until the user scrolls back *up* past the point where it collapsed
 * (and above `expandAt`). Anchoring to that point is what stops the flicker —
 * collapsing shortens the document, which can pull the scroll position back
 * below `expandAt` on its own; without the anchor that re-expands the header a
 * moment later, only for the next downward pixel to collapse it again.
 *
 * Two more stoppers keep it from shuddering:
 *
 * 1. Expanding needs actual upward movement, never position alone.
 * 2. A settle window. Toggling reflows the page (and can clamp the scroll
 *    position when the document shrinks), which fires more scroll events;
 *    those are ignored until the layout has come to rest, and the anchor
 *    follows the clamp so the user never has to scroll up further than the
 *    header actually moved.
 */
export function useCollapseOnScroll(
  collapseAt = 160,
  expandAt = 24,
  expandBy = 64,
  collapseBy = 60
): boolean {
  const [collapsed, setCollapsed] = useState(false);
  // Mirrors the state so the scroll handler can read it without re-subscribing.
  const collapsedRef = useRef(false);

  useEffect(() => {
    let lastY = window.scrollY;
    // How far the user has scrolled in one go, each reset by the other.
    let upBy = 0;
    let downBy = 0;
    let lockedUntil = 0;
    // Where the header collapsed. It only re-expands above this line.
    let anchorY = Infinity;

    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY;
      lastY = y;

      const now = performance.now();
      if (now < lockedUntil) {
        // Movement during the reflow is the layout settling, not a gesture.
        // A shrinking document can clamp the scroll position upward; the
        // anchor follows it down so it stays reachable.
        if (y < anchorY) anchorY = y;
        upBy = 0;
        downBy = 0;
        return;
      }

      if (dy > 0) {
        downBy += dy;
        upBy = 0;
      } else if (dy < 0) {
        upBy += -dy;
        downBy = 0;
      }

      const prev = collapsedRef.current;
      let next = prev;
      // Both directions need a deliberate push. Without `collapseBy`, re-opening
      // it halfway down the page would re-collapse on the very next pixel of
      // scroll, since `y` is already past the threshold.
      if (!prev && y > collapseAt && downBy > collapseBy) next = true;
      // Expanding takes an upward gesture that carries the page back above the
      // collapse point — position alone (a clamp, a nudge) is not enough.
      else if (prev && upBy > 0 && (upBy > expandBy || y < Math.min(anchorY, expandAt)))
        next = false;
      // A jump to the very top always shows the full header.
      if (y <= 2) next = false;
      if (next === prev) return;

      upBy = 0;
      downBy = 0;
      anchorY = next ? y : Infinity;
      collapsedRef.current = next;
      lockedUntil = now + SETTLE_MS;
      setCollapsed(next);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    // Sync once for a restored scroll position (back-navigation, deep link).
    // Deferred a frame so it isn't a setState inside the effect body.
    const raf = requestAnimationFrame(onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [collapseAt, expandAt, expandBy, collapseBy]);

  return collapsed;
}
