"use client";

import { useEffect, useState } from "react";
import type { PlaceData } from "@/lib/home";

/** One photo every two seconds, crossfading like the hero carousel. */
const FRAME_MS = 2000;

/** Where each photo drifts to as it zooms — a different corner every cut, so
 *  consecutive frames never push the same way. Percentages of the photo's own
 *  size, kept inside the 8% the resting scale already hides. */
const DRIFTS: Array<[number, number]> = [
  [-3, -3],
  [3, 3],
  [3, -3],
  [-3, 3],
  [0, -3.5],
  [3.5, 0],
];

/**
 * One "unique place" card. At rest it's a single photo; on hover the place's
 * other photos play through on a loop, so the card feels like a short clip
 * rather than a slideshow. Frames only advance onto photos that have actually
 * decoded, so it never cuts to an empty box.
 */
export default function UniqueStayCard({ place }: { place: PlaceData }) {
  const gallery = place.gallery?.length ? place.gallery : [place.image];
  const [hovering, setHovering] = useState(false);
  const [frame, setFrame] = useState(0);
  const [ready, setReady] = useState<number[]>([0]);
  const [primed, setPrimed] = useState(false);

  // The rest of the reel is fetched on first hover — a landing page shouldn't
  // pull eighteen photos nobody has asked to see.
  useEffect(() => {
    if (!primed) return;
    let cancelled = false;
    const pending: HTMLImageElement[] = [];
    gallery.forEach((src, i) => {
      if (i === 0) return;
      const img = new window.Image();
      const done = () => {
        if (!cancelled) setReady((r) => (r.includes(i) ? r : [...r, i]));
      };
      img.onload = done;
      img.src = src;
      if (img.complete && img.naturalWidth > 0) queueMicrotask(done);
      pending.push(img);
    });
    return () => {
      cancelled = true;
      for (const img of pending) img.onload = null;
    };
    // `gallery` is derived from `place`, which is static module data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primed, place]);

  useEffect(() => {
    if (!hovering || ready.length < 2) return;
    const t = setTimeout(() => {
      // Loop, but only over what has loaded — so an unfinished download slows
      // the reel down instead of blanking a frame.
      setFrame((f) => {
        const order = [...ready].sort((a, b) => a - b);
        const at = order.indexOf(f);
        return order[(at + 1) % order.length];
      });
    }, FRAME_MS);
    return () => clearTimeout(t);
  }, [hovering, frame, ready]);

  const enter = () => {
    setHovering(true);
    setPrimed(true);
  };
  const leave = () => {
    setHovering(false);
    setFrame(0);
  };

  return (
    <div
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={enter}
      onBlur={leave}
      tabIndex={0}
      className="group h-full overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="img-frame relative aspect-[4/3] overflow-hidden">
        {gallery.map((src, i) => {
          const showing = i === frame;
          const drift = DRIFTS[i % DRIFTS.length];
          return ready.includes(i) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={src}
              src={src}
              alt={i === 0 ? place.highlight : ""}
              aria-hidden={!showing}
              loading={i === 0 ? undefined : "eager"}
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: showing ? 1 : 0,
                // Each photo pushes in on its own diagonal, so the reel keeps
                // moving in a new direction with every cut. The resting scale
                // is already 1.08, which is the margin the drift travels into
                // — no edge of the photo can come into view.
                transform:
                  showing && hovering
                    ? `scale(1.2) translate(${drift[0]}%, ${drift[1]}%)`
                    : "scale(1.08) translate(0%, 0%)",
                transition:
                  "opacity 900ms ease-in-out, transform 3600ms cubic-bezier(0.22, 0.61, 0.36, 1)",
              }}
            />
          ) : null;
        })}
      </div>
      <div className="p-5">
        <h3 className="text-[16px] font-semibold text-ink">
          {place.title} <span className="text-primary">{place.highlight}</span>
        </h3>
        <p className="mt-2 text-[13px] leading-6 text-muted">{place.description}</p>
      </div>
    </div>
  );
}
