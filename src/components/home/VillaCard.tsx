"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, BadgePercent } from "lucide-react";
import type { VillaCardData } from "@/lib/home";
import { useFavorites } from "@/lib/favorites";
import Img from "@/components/ui/Img";

/** How long each photo is held before the hover slideshow moves on. */
const FRAME_MS = 800;

export default function VillaCard({
  data,
  variant = "overlay",
}: {
  data: VillaCardData;
  variant?: "overlay" | "card";
}) {
  const { isSaved, toggle } = useFavorites();
  const liked = data.id ? isSaved(data.id) : false;

  const isCard = variant === "card";
  const unavailable = data.unavailable;

  // Hover slideshow: the photos step forward one every FRAME_MS and stop on the
  // last one — it's a peek at the villa, not a loop that keeps moving under the
  // pointer. Leaving the card puts the cover back, so the next hover replays it.
  const gallery = useMemo(
    () => (data.images?.length ? data.images : [data.image]),
    [data.images, data.image]
  );
  const [hovering, setHovering] = useState(false);
  const [frame, setFrame] = useState(0);
  // The extra photos are only fetched once the card has been hovered, so a page
  // of cards doesn't pull every gallery upfront. What has arrived stays known:
  // the second hover plays from cache with no gaps.
  const [primed, setPrimed] = useState(false);
  const [ready, setReady] = useState<number[]>([0]);

  // Fetch the rest of the gallery on first hover. A photo only joins `ready`
  // once it has actually decoded, which is what keeps the swap below from ever
  // revealing an empty frame. One that fails to load simply never joins, so the
  // slideshow stops on the last good photo rather than flashing a blank card.
  useEffect(() => {
    if (!primed) return;
    let cancelled = false;
    const pending: HTMLImageElement[] = [];
    gallery.forEach((src, i) => {
      if (i === 0 || !src) return;
      const img = new window.Image();
      const done = () => {
        if (!cancelled) setReady((r) => (r.includes(i) ? r : [...r, i]));
      };
      img.onload = done;
      img.src = src;
      // A cached photo can already be complete here; defer so this never sets
      // state while the effect itself is still running.
      if (img.complete && img.naturalWidth > 0) queueMicrotask(done);
      pending.push(img);
    });
    return () => {
      cancelled = true;
      for (const img of pending) img.onload = null;
    };
  }, [primed, gallery]);

  useEffect(() => {
    const next = frame + 1;
    if (!hovering || next >= gallery.length) return;
    // Not loaded yet → hold this frame. The effect re-runs the moment it lands.
    if (!ready.includes(next)) return;
    const t = setTimeout(() => setFrame(next), FRAME_MS);
    return () => clearTimeout(t);
  }, [hovering, frame, ready, gallery.length]);

  const enter = () => {
    setHovering(true);
    setPrimed(true);
  };
  const leave = () => {
    setHovering(false);
    setFrame(0);
  };

  const location = [data.city, data.country].filter(Boolean);
  // Never produce a dangling ", " when one half of the location is missing.
  const label = data.title || location.join(", ") || "Villa";

  // One stack of photos, shared by both variants — only the box around it
  // differs. `unavailable` dims the whole stack rather than a single frame.
  const photos = gallery.map((src, i) =>
    ready.includes(i) ? (
      <span
        key={`${i}-${src}`}
        aria-hidden={i !== frame}
        className="absolute inset-0 transition-opacity duration-300"
        style={{ opacity: (i === frame ? 1 : 0) * (unavailable ? 0.45 : 1) }}
      >
        <Img
          src={src}
          alt={i === 0 ? label : ""}
          className={`h-full w-full object-cover ${unavailable ? "grayscale" : ""}`}
        />
      </span>
    ) : null
  );

  const meta = data.title ? (
    // Title-first layout (used by search results): villa name is the heading.
    <>
      <p className="truncate text-[14px] font-semibold text-ink">{data.title}</p>
      {/* Always a line, even with no location — otherwise the price row sits
          higher on some cards than on their neighbours. */}
      <p className="mt-0.5 truncate text-[12px] text-muted">
        {location.length > 0 ? location.join(", ") : " "}
      </p>
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-muted">
        <span>{data.distance}</span>
        <span className="font-semibold text-ink">${data.price}/night</span>
      </div>
    </>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[14px] font-semibold ${isCard ? "text-ink" : ""}`}>
          {data.city}, <span className="text-primary">{data.country}</span>
        </p>
        <p className={`shrink-0 text-[13px] font-medium ${isCard ? "text-muted" : ""}`}>
          ${data.price}/night
        </p>
      </div>
      <div
        className={`mt-0.5 flex items-center justify-between text-[12px] ${
          isCard ? "text-muted" : "opacity-80"
        }`}
      >
        <span>{data.distance}</span>
        <span>{data.dates}</span>
      </div>
    </>
  );

  return (
    <Link
      href={data.id ? `/villa/${data.id}` : "/villa"}
      onMouseEnter={enter}
      onMouseLeave={leave}
      // Keyboard users get the same walk-through when the card takes focus.
      onFocus={enter}
      onBlur={leave}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      {/* Unavailable villas stay on the page — a guest who searched by name
          should find their villa and be told why they can't book it, not be
          shown an empty result. The photo dims; the text stays legible. */}
      {unavailable && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
          Not available
        </span>
      )}

      {/* Offer badge — an active coupon on this villa. Hidden when it can't be
          booked anyway, so the two never fight for the same corner. */}
      {!unavailable && data.offer && (
        <span
          className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-[#ff2d2d] px-2.5 py-1 text-[11px] font-bold text-white shadow"
          title={`Use code ${data.offer.code}`}
        >
          <BadgePercent size={12} aria-hidden />
          {data.offer.label}
        </span>
      )}

      {/* Like button */}
      <button
        type="button"
        aria-label={liked ? `Remove ${label} from saved` : `Save ${label}`}
        aria-pressed={liked}
        onClick={(e) => {
          // Don't let the tap fall through to the card's <Link>.
          e.preventDefault();
          e.stopPropagation();
          if (data.id) toggle(data.id);
        }}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow transition-transform hover:scale-110 active:scale-95"
      >
        <Heart
          size={16}
          className={liked ? "fill-red-500 text-red-500" : "text-muted"}
        />
      </button>

      {variant === "overlay" ? (
        <div className="img-frame relative aspect-[4/5]">
          {photos}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">{meta}</div>
        </div>
      ) : (
        <>
          {/* The photo keeps its ratio; only the text block below absorbs the
              height difference, so a row of cards lines up exactly. */}
          <div className="img-frame relative aspect-[4/3] shrink-0">{photos}</div>
          <div className="flex flex-1 flex-col p-4 text-ink">
            {meta}
            {unavailable && (
              <p className="mt-2 text-[12px] font-medium text-red-600">{unavailable}</p>
            )}
          </div>
        </>
      )}
    </Link>
  );
}
