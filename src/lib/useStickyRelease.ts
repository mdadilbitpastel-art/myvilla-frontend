"use client";

import { useEffect, useRef, useState } from "react";

/** Extra daylight left between the released header and the last row. */
const CLEARANCE = 8;

/**
 * How far the header must get to stay pinned before letting it go is worth it,
 * measured from where it pins (not from the top of the page). Below this the
 * release is skipped entirely: the header would be let go the moment it pinned,
 * which on a fast scroll reads as the heading flying off and then coming back.
 */
const MIN_PINNED_TRAVEL = 120;

/**
 * Lets a sticky page header go once only the last row of a grid is left, so
 * those cards scroll in the clear instead of sliding underneath it.
 *
 * A sticky element is bound by its parent's box, so the whole trick is to trim
 * the wrapper's height down to where the last row starts — the browser does
 * the releasing itself, with no scroll handler and nothing to re-pin. The same
 * amount comes back as bottom margin, which keeps the page (and the footer)
 * its true length.
 *
 * Put `wrapRef` on an element containing BOTH the sticky header and the
 * results, `gridRef` on the grid itself, and spread `style` on the wrapper.
 */
export function useStickyRelease(
  /** Re-measure whenever this changes (usually the loaded results). */
  revision: unknown,
  /** The grid's row gap, in px — it is released one gap above the row. */
  gap = 24
) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ height: number; marginBottom: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;

    const measure = () => {
      const grid = gridRef.current;
      const last = grid?.lastElementChild as HTMLElement | null;
      if (!last) {
        setBox(null);
        return;
      }
      // Everything is read straight from the DOM, never from the wrapper's own
      // (already clamped) height — and off the LAST card rather than the first
      // one's height, since cards in a row stretch to the tallest and a late
      // image would leave a stale estimate. That is how a sliver of the last
      // row used to end up under the bar.
      const wrapTop = wrap.getBoundingClientRect().top;
      const rect = last.getBoundingClientRect();
      const lastRowTop = rect.top - wrapTop;
      const contentEnd = rect.bottom - wrapTop;
      // Stop the header one gap above the row, plus a little daylight.
      const height = Math.round(lastRowTop - gap - CLEARANCE);
      // The cut has to be worth making, and something must stay above it. It is
      // measured from the header's own bottom, so the answer doesn't change as
      // the header collapses (it and `height` shrink by the same amount) — the
      // page can't flip in and out of being released while the bar tightens up.
      const header = Array.from(wrap.children).find(
        // `includes`, because older WebKit still reports `-webkit-sticky`.
        (el) => getComputedStyle(el).position.includes("sticky")
      );
      const headerHeight = header?.getBoundingClientRect().height ?? 0;
      if (height - headerHeight < MIN_PINNED_TRAVEL || height >= contentEnd) {
        setBox(null);
        return;
      }
      const next = { height, marginBottom: Math.round(contentEnd - height) };
      // The header's collapse resizes it on every frame of its transition; only
      // a measurement that actually moved is worth a re-render.
      setBox((prev) =>
        prev && prev.height === next.height && prev.marginBottom === next.marginBottom
          ? prev
          : next
      );
    };

    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (gridRef.current) ro.observe(gridRef.current);
    // The header's own children are watched too: when the header collapses it
    // gets shorter, the grid slides up with it, and the release point moves —
    // but the wrapper's height is pinned by us, so nothing else would report
    // it. (A grid moving without resizing fires no observer either.)
    for (const child of Array.from(wrap.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [revision, gap]);

  return { wrapRef, gridRef, style: box ?? undefined };
}
