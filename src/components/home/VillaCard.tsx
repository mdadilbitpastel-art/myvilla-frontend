"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Heart, BadgePercent, MapPin, ArrowUpRight, Sparkles } from "lucide-react";
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
  /**
   * `overlay` — text over a tall photo.
   * `card` — photo above a plain text block. The workhorse for result grids
   *   (search, wishlist, account), where scanning many at once beats flourish.
   * `showcase` — the landing page's dressed-up version of `card`: the photo
   *   pushes in on hover behind a floating price, and the meta is set out in
   *   two tiers. Kept a separate variant rather than promoted into `card`,
   *   because a wall of 60 search results doesn't want this much furniture.
   * `featured` — the showcase, turned up, and dressed in gold rather than the
   *   brand colour: a gold ring that keeps turning on its own, a flag that
   *   glints, a band of light across the photo on hover, a standing "View
   *   villa" button on the photo, and a deeper lift. Reserved for the one
   *   shelf that is meant to be looked at rather than scanned — four cards,
   *   once, on the landing page. Spend it anywhere else and it stops meaning
   *   anything.
   */
  variant?: "overlay" | "card" | "showcase" | "featured";
}) {
  const { isSaved, toggle } = useFavorites();
  const liked = data.id ? isSaved(data.id) : false;

  const isFeatured = variant === "featured";
  // Featured is the showcase's layout wearing more — everything the showcase
  // arranges (photo box, floating price, two-tier meta) it arranges too.
  const isShowcase = variant === "showcase" || isFeatured;
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

  // The showcase's own meta: a heading, the place under it, and the details
  // ruled off below. The price isn't here at all — it rides on the photo.
  const showcaseMeta = (
    <>
      <p
        className={`truncate text-[15px] font-semibold leading-snug text-ink ${
          isFeatured ? "transition-colors duration-300 group-hover:text-gold-deep" : ""
        }`}
      >
        {data.title || data.city || "Villa"}
      </p>
      {/* Always rendered, blank if there's nowhere to name: an absent line
          would raise this card's rule above its neighbours'. */}
      <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
        <MapPin
          size={13}
          className={`shrink-0 ${isFeatured ? "text-gold-dark" : "text-primary/70"}`}
          aria-hidden
        />
        <span className="truncate">
          {(data.title ? location.join(", ") : data.country) || " "}
        </span>
      </p>
      <div
        className={`mt-auto flex items-center gap-2 border-t pt-3 text-[12px] text-muted ${
          // The featured card rules off in its own colour rather than the
          // page's grey — the ring's gold, carried into the card body.
          isFeatured ? "border-gold/35" : "border-line/70"
        }`}
      >
        <span className="truncate">{data.distance}</span>
        <span
          aria-hidden
          className={`h-[3px] w-[3px] shrink-0 rounded-full ${
            isFeatured ? "bg-gold-dark/60" : "bg-muted/50"
          }`}
        />
        <span className="truncate">{data.dates}</span>
      </div>
    </>
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

  // Everything inside the card. Held as one piece because the featured variant
  // puts a white box around it (the inside of its gradient ring) and the other
  // three don't — the contents themselves are identical either way.
  const inner = (
    <>
      {/* Featured only: what makes this row the featured one. Takes the corner
          on its own; an offer badge on the same card moves down a line. */}
      {isFeatured && (
        <span className="villa-flag absolute left-3 top-3 z-10 inline-flex items-center gap-1 overflow-hidden rounded-full bg-gradient-to-r from-gold-light via-gold to-gold-dark px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wide text-gold-ink shadow-[0_4px_14px_-2px_rgba(160,112,16,0.55)] ring-1 ring-white/50">
          <Sparkles size={11} aria-hidden />
          Featured
        </span>
      )}

      {/* Unavailable villas stay on the page — a guest who searched by name
          should find their villa and be told why they can't book it, not be
          shown an empty result. The photo dims; the text stays legible. */}
      {unavailable && (
        <span
          className={`absolute left-3 z-10 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow ${
            isFeatured ? "top-[42px]" : "top-3"
          }`}
        >
          Not available
        </span>
      )}

      {/* Offer badge — an active coupon on this villa. Hidden when it can't be
          booked anyway, so the two never fight for the same corner. */}
      {!unavailable && data.offer && (
        <span
          className={`absolute left-3 z-10 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold text-white ${
            isFeatured ? "top-[42px]" : "top-3"
          } ${
            isShowcase
              ? "bg-gradient-to-r from-[#ff3b3b] to-[#ff6a3d] shadow-[0_4px_12px_rgba(255,45,45,0.4)] ring-1 ring-white/30"
              : "bg-[#ff2d2d] shadow"
          }`}
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
        className={`absolute right-3 top-3 z-10 flex items-center justify-center rounded-full transition-transform hover:scale-110 active:scale-95 ${
          isShowcase
            ? // Frosted rather than solid white, so it sits *on* the photo
              // instead of punching a hole in it.
              "h-9 w-9 bg-white/85 shadow-[0_2px_8px_rgba(20,20,45,0.18)] ring-1 ring-white/60 backdrop-blur-md"
            : "h-8 w-8 bg-white shadow"
        }`}
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
      ) : isShowcase ? (
        <>
          <div className="img-frame relative aspect-[4/3] shrink-0 overflow-hidden">
            {/* The whole photo stack pushes in together, so the hover
                slideshow keeps stepping through it while it's scaled. The
                featured card pushes in further and takes longer over it. */}
            <div
              className={`absolute inset-0 transition-transform ease-out ${
                isFeatured
                  ? "duration-[1100ms] group-hover:scale-[1.12]"
                  : "duration-[900ms] group-hover:scale-[1.07]"
              }`}
            >
              {photos}
            </div>
            {/* Featured only: a band of light crossing the photo, once, as the
                pointer arrives. Driven entirely from CSS (`.villa-featured:hover`)
                so it costs no state and no re-render. */}
            {isFeatured && (
              <span
                aria-hidden
                className="villa-sheen pointer-events-none absolute inset-y-0 left-0 w-2/5 bg-gradient-to-r from-transparent via-[#fff4d6]/60 to-transparent"
              />
            )}
            {/* Just enough shade at the foot of the photo for the price to
                hold, whatever it happens to be sitting on. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t to-transparent ${
                // The featured card has two things standing on the foot of its
                // photo, one of them pale gold, so it takes the deeper wash —
                // a bright photo has to darken enough for a gold edge to
                // survive against it.
                isFeatured ? "h-1/2 from-black/60 via-black/15" : "h-2/5 from-black/45"
              }`}
            />
            <span
              className={
                isFeatured
                  ? // Dark glass with a gold edge. It was brand-filled, which
                    // put two solid colour chips on one photo once the gold
                    // button arrived; smoked glass lets the button be the only
                    // thing on the photo asking to be pressed, and the price
                    // still holds against any picture behind it.
                    "absolute bottom-3 left-3 rounded-full bg-black/45 px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_6px_18px_-6px_rgba(0,0,0,0.8)] ring-1 ring-gold-light/45 backdrop-blur-md"
                  : "absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-bold text-ink shadow-[0_2px_10px_rgba(20,20,45,0.2)] ring-1 ring-white/60 backdrop-blur-md"
              }
            >
              ${data.price}
              <span className={isFeatured ? "font-medium text-white/70" : "font-medium text-muted"}>
                /night
              </span>
            </span>
            {isFeatured ? (
              // The featured card's call to action, and the only one of these
              // that stands on the photo rather than waiting for the pointer:
              // a shelf meant to be looked at should say what to do with it
              // before it's touched. Gold on a photo, dark text on the gold —
              // white on gold is the one pairing here that wouldn't hold.
              // A <span>, not a <button>: the whole card is already the link.
              !unavailable && (
                <span
                  aria-hidden
                  className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-gold-light via-gold to-gold-dark px-2.5 py-2 text-[12px] font-bold text-gold-ink shadow-[0_8px_20px_-6px_rgba(160,112,16,0.85)] ring-1 ring-white/55 transition-transform duration-300 ease-out group-hover:scale-[1.06] sm:px-3.5"
                >
                  {/* Two cards to a row on a phone leaves no width for the
                      price and a worded button on the same edge, so the label
                      drops and the button keeps only its arrow. */}
                  <span className="hidden sm:inline">View villa</span>
                  <ArrowUpRight
                    size={14}
                    className="transition-transform duration-300 ease-out group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  />
                </span>
              )
            ) : (
              /* Comes out to meet the pointer — the card's one "open me" cue,
                 which the plain variant leaves to the cursor alone. */
              <span
                aria-hidden
                className="absolute bottom-3 right-3 flex h-9 w-9 translate-y-2 items-center justify-center rounded-full bg-primary text-white opacity-0 shadow-[0_6px_16px_rgba(99,91,255,0.5)] transition-all duration-300 ease-out group-hover:translate-y-0 group-hover:opacity-100"
              >
                <ArrowUpRight size={17} />
              </span>
            )}
          </div>
          <div
            className={`flex flex-1 flex-col p-4 ${
              // A wash of brand colour rising into the text block as the card
              // is hovered — the ring's colour, carried into the card body.
              isFeatured
                ? "bg-gradient-to-b from-white to-white transition-colors duration-500 group-hover:to-gold/[0.12]"
                : ""
            }`}
          >
            {showcaseMeta}
            {unavailable && (
              <p className="mt-2 text-[12px] font-medium text-red-600">{unavailable}</p>
            )}
          </div>
        </>
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
      className={
        isFeatured
          ? // No background and no border of its own: the 2px of padding IS the
            // ring, and the turning gradient behind it shows through it. The
            // card proper is the white box inside.
            "villa-featured group relative flex h-full flex-col rounded-[24px] p-[2px] shadow-[0_8px_24px_-12px_rgba(160,112,16,0.45)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-2 hover:shadow-[0_30px_56px_-18px_rgba(160,112,16,0.5)]"
          : isShowcase
            ? // Lifts further and lands on a shadow tinted with the brand purple
              // rather than plain grey, so a row of these reads as a shelf of
              // objects rather than four flat panels.
              "group relative flex h-full flex-col overflow-hidden rounded-[22px] bg-white ring-1 ring-black/[0.05] shadow-[0_2px_10px_rgba(20,20,45,0.05)] transition-[transform,box-shadow] duration-500 ease-out hover:-translate-y-1.5 hover:shadow-[0_22px_44px_-16px_rgba(99,91,255,0.4)]"
            : "group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      }
    >
      {isFeatured ? (
        <div className="relative flex h-full flex-col overflow-hidden rounded-[22px] bg-white">
          {inner}
        </div>
      ) : (
        inner
      )}
    </Link>
  );
}
