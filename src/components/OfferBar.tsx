"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgePercent, ArrowRight, PartyPopper } from "lucide-react";
import { fetchPublicOffers, type Offer } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useWelcomeOffer } from "@/lib/welcome";

/** What one night of this coupon is actually worth, so the best one can win. */
function savingOf(o: Offer): number {
  return o.discountType === "percent"
    ? (o.pricePerNight * o.discountValue) / 100
    : o.discountValue;
}

/**
 * The announcement strip above the header. It carries two kinds of news:
 *
 *  - the first-booking welcome gift, shown to signed-out visitors only — the
 *    same rule the placard follows, so the site never offers a "welcome" to
 *    someone already here;
 *  - one real, currently-active coupon a host has set up — never a made-up
 *    offer. The strongest few are ranked by what they save and one is picked at
 *    random per visit, so the bar always carries a genuinely good deal without
 *    showing the same villa every time.
 *
 * When both apply the strip alternates between them rather than picking a
 * winner: a signed-out visitor should hear about the welcome gift, but that
 * shouldn't cost the hosts their only slot in the header.
 *
 * Nothing is rendered until there is something true to say, so the page never
 * reserves space for an empty promise.
 */
/** The strip's own height — animated from 0 so the page doesn't jolt. */
const BAR_H = 30;
/** How long each message holds the strip before the other takes a turn. */
const ROTATE_MS = 7_000;

export default function OfferBar() {
  const { user, ready } = useAuth();
  const { offer: welcome, available: welcomeAvailable } = useWelcomeOffer();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [open, setOpen] = useState(false);
  const [turn, setTurn] = useState(0);

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

  // Wait for auth to settle before claiming anything: a restored session lands
  // a beat after mount, and "your first stay" flashing at a signed-in guest is
  // exactly the thing this rule exists to prevent.
  const showWelcome = ready && !user && welcomeAvailable && !!welcome;
  // Welcome first — it's the one addressed to someone who has just arrived.
  const slides: Array<"welcome" | "coupon"> = [
    ...(showWelcome ? (["welcome"] as const) : []),
    ...(offer ? (["coupon"] as const) : []),
  ];

  // Alternate only when there are two things to say; a single message stays put
  // rather than re-animating on a timer for no reason.
  useEffect(() => {
    if (slides.length < 2) return;
    const timer = setInterval(() => setTurn((t) => t + 1), ROTATE_MS);
    return () => clearInterval(timer);
  }, [slides.length]);

  // The offers arrive after the page has painted, so the strip eases itself
  // open on the next frame instead of appearing mid-scroll out of nowhere.
  const hasNews = slides.length > 0;
  useEffect(() => {
    if (!hasNews) return;
    const raf = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(raf);
  }, [hasNews]);

  if (!hasNews) return null;

  const showing = slides[turn % slides.length];

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
      {/* Keyed on which message is up, so swapping one for the other replays
          the fade instead of silently changing the words under the reader. */}
      <div
        key={showing + (turn % slides.length)}
        className="animate-fade-in h-full"
        style={{
          // The text settles down into the band as it opens — a small move, so
          // it reads as arriving rather than sliding.
          transform: open ? "translateY(0)" : "translateY(-6px)",
          transition: "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {showing === "welcome" && welcome ? (
          <WelcomeMessage percent={Math.round(welcome.percentOff)} />
        ) : offer ? (
          <CouponMessage offer={offer} />
        ) : null}
      </div>
    </div>
  );
}

/** Shared geometry, so the two messages occupy the strip identically. */
const ROW =
  "group relative mx-auto flex h-[30px] w-full max-w-[1320px] items-center justify-center gap-2.5 px-5 text-[12.5px] lg:px-7";

function WelcomeMessage({ percent }: { percent: number }) {
  const { openAuth } = useAuth();
  return (
    <button type="button" onClick={() => openAuth("register")} className={ROW}>
      <PartyPopper size={14} className="shrink-0 opacity-90" aria-hidden />
      <span className="font-semibold">Welcome gift — {percent}% off your first stay</span>
      <span className="hidden min-w-0 truncate text-white/80 sm:inline">
        for new guests
      </span>
      <span className="shrink-0 rounded-full border border-dashed border-white/45 bg-white/10 px-2 py-[1px] font-mono text-[11.5px] font-bold tracking-wider">
        NO CODE
      </span>
      <span className="hidden shrink-0 items-center gap-1 font-semibold underline-offset-2 group-hover:underline sm:inline-flex">
        Sign up to claim
        <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </button>
  );
}

function CouponMessage({ offer }: { offer: Offer }) {
  return (
    <Link
      href={`/villa/${offer.villaId}?coupon=${encodeURIComponent(offer.code)}`}
      className={ROW}
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
  );
}
