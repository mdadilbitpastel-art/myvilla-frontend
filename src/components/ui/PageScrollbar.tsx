"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The pill starts flush against the header's bottom border and only keeps a
 *  gap at the foot of the window. */
const BOTTOM_GAP = 10;
const MIN_THUMB = 44;
/** How long the pill stays up after the last scroll. */
const IDLE_MS = 1400;

/** Where the sticky header currently ends — the pill starts below it, so it
 *  never runs up over the nav (the offer strip makes that edge move). */
function headerBottom(): number {
  const el = document.querySelector("header");
  if (!el) return 0;
  return Math.max(0, Math.round(el.getBoundingClientRect().bottom));
}

/**
 * The page's scrollbar, drawn instead of the browser's.
 *
 * The native one is hidden (see globals.css) because it is *laid out*: it
 * carved a strip off the right of every full-bleed section, and reserving that
 * strip permanently was the only way to stop the page jumping when a modal
 * locked scrolling. This pill floats over the page instead — nothing shifts,
 * nothing is cut — and it hugs the right edge from under the header down.
 *
 * Touch devices keep their own overlay bar, which already floats; only pointer
 * devices get this one.
 */
export default function PageScrollbar() {
  const [thumb, setThumb] = useState<{ top: number; size: number; offset: number } | null>(null);
  const [fine, setFine] = useState(false);
  const [awake, setAwake] = useState(false);
  const [dragging, setDragging] = useState(false);
  // The pointer handlers run outside React's render, so they read the live flag
  // rather than the state value captured when they were attached.
  const draggingRef = useRef(false);
  const idle = useRef<number | undefined>(undefined);

  const measure = useCallback(() => {
    const view = window.innerHeight;
    const total = document.documentElement.scrollHeight;
    const top = headerBottom();
    const track = view - top - BOTTOM_GAP;
    // A page that doesn't scroll (or a window too short to hold the pill) gets
    // no scrollbar at all rather than a stub that can't move.
    if (total <= view + 1 || track <= MIN_THUMB) {
      setThumb(null);
      return;
    }
    const size = Math.max(MIN_THUMB, (view / total) * track);
    const progress = Math.min(Math.max(window.scrollY / (total - view), 0), 1);
    setThumb({ top, size, offset: progress * (track - size) });
  }, []);

  useEffect(() => {
    const wake = () => {
      setAwake(true);
      window.clearTimeout(idle.current);
      idle.current = window.setTimeout(() => {
        if (!draggingRef.current) setAwake(false);
      }, IDLE_MS);
    };
    const onScroll = () => {
      measure();
      wake();
    };

    // A frame late, which keeps the first measurement out of the effect body:
    // the header's height (and the page's) is only final once it has painted.
    const raf = requestAnimationFrame(() => {
      setFine(window.matchMedia("(pointer: fine)").matches);
      measure();
    });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    // Content that loads late (photos, an expanding row) changes how far the
    // page scrolls, which changes the pill's length.
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idle.current);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [measure]);

  function startDrag(e: React.PointerEvent<HTMLDivElement>) {
    if (!thumb) return;
    e.preventDefault();
    const startY = e.clientY;
    const startScroll = window.scrollY;
    const view = window.innerHeight;
    const max = document.documentElement.scrollHeight - view;
    const runway = view - thumb.top - BOTTOM_GAP - thumb.size;
    if (runway <= 0 || max <= 0) return;

    draggingRef.current = true;
    setDragging(true);
    setAwake(true);

    const move = (ev: PointerEvent) => {
      window.scrollTo({ top: startScroll + ((ev.clientY - startY) / runway) * max });
    };
    const stop = () => {
      draggingRef.current = false;
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  }

  if (!fine || !thumb) return null;

  const visible = awake || dragging;

  return (
    // Decorative: the page is already scrollable by every native means.
    <div
      aria-hidden
      onMouseEnter={() => setAwake(true)}
      onMouseLeave={() => {
        if (!draggingRef.current) setAwake(false);
      }}
      className="fixed right-0 bottom-0 z-[60] w-4"
      style={{ top: thumb.top }}
    >
      <div
        onPointerDown={startDrag}
        className={`absolute right-0 rounded-full ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          height: thumb.size,
          width: visible ? 7 : 4,
          transform: `translateY(${thumb.offset}px)`,
          // Graphite rather than a brand colour: a scrollbar is chrome, and it
          // sits over photos, white cards and dark heroes alike.
          backgroundColor: visible ? "rgba(43, 43, 52, 0.55)" : "rgba(43, 43, 52, 0.28)",
          transition: "background-color 0.25s ease, width 0.15s ease",
        }}
      />
    </div>
  );
}
