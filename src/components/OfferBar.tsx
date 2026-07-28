"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgePercent, ArrowRight } from "lucide-react";
import { fetchPublicOffers, type Offer } from "@/lib/api";

/** What one night of this coupon is actually worth, so the best one can win. */
function savingOf(o: Offer): number {
  return o.discountType === "percent"
    ? (o.pricePerNight * o.discountValue) / 100
    : o.discountValue;
}

/**
 * The announcement strip above the header: one real, currently-active coupon a
 * host has set up — never a made-up offer. The strongest few are ranked by what
 * they save, and one of those is picked at random per visit, so the bar always
 * carries a genuinely good deal without showing the same villa every time.
 *
 * Nothing is rendered until a real offer arrives (and nothing at all when there
 * are none), so the page never reserves space for an empty promise.
 */
/** The strip's own height — animated from 0 so the page doesn't jolt. */
const BAR_H = 30;

export default function OfferBar() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicOffers(8)
      .then((list) => {
        if (cancelled || !list.length) return;
        const top = [...list].sort((a, b) => savingOf(b) - savingOf(a)).slice(0, 3);
        setOffer(top[Math.floor(Math.random() * top.length)]);
      })
      // A failed fetch just means no strip — it must never break the header.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The offer arrives after the page has painted, so the strip eases itself
  // open on the next frame instead of appearing mid-scroll out of nowhere.
  useEffect(() => {
    if (!offer) return;
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [offer]);

  if (!offer) return null;

  return (
    <div
      className="relative w-full overflow-hidden text-white"
      style={{
        height: open ? BAR_H : 0,
        opacity: open ? 1 : 0,
        transition: "height 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.45s ease",
        // The deeper red of the two: the badges on cards are the bright
        // #ff2d2d, while a full-width band that thin needs the darker tone to
        // sit under the white nav without shouting. Light at both ends, deep
        // through the middle, where the message sits.
        backgroundImage:
          "linear-gradient(90deg, #ef7378 0%, #de5257 26%, #c22f37 50%, #de5257 74%, #ef7378 100%)",
      }}
    >
      <Link
        href={`/villa/${offer.villaId}?coupon=${encodeURIComponent(offer.code)}`}
        className="group relative mx-auto flex h-[30px] max-w-[1320px] items-center justify-center gap-2.5 px-5 text-[12.5px] lg:px-7"
        style={{
          // The text settles down into the band as it opens — a small move, so
          // it reads as arriving rather than sliding.
          transform: open ? "translateY(0)" : "translateY(-6px)",
          transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <BadgePercent size={14} className="shrink-0 opacity-90" aria-hidden />
        <span className="font-semibold">{offer.label}</span>
        {/* The villa's name is the first thing to go on a narrow screen — the
            discount and the code are what the strip is for. */}
        <span className="hidden min-w-0 truncate text-white/80 sm:inline">
          on {offer.title}
        </span>
        <span className="shrink-0 rounded-full border border-dashed border-white/45 bg-white/10 px-2 py-[1px] font-mono text-[11.5px] font-bold tracking-wider">
          {offer.code}
        </span>
        <span className="hidden shrink-0 items-center gap-1 font-semibold underline-offset-2 group-hover:underline sm:inline-flex">
          Book now
          <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </div>
  );
}
