"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchVilla, fetchVillaReviews, type Villa, type Review } from "@/lib/api";
import { villa as dummy, type Facility } from "@/lib/villa";
import Breadcrumb from "@/components/property/Breadcrumb";
import PropertyHeader from "@/components/property/PropertyHeader";
import Gallery from "@/components/property/Gallery";
import Overview from "@/components/property/Overview";
import Description from "@/components/property/Description";
import BedroomSection from "@/components/property/BedroomSection";
import Facilities from "@/components/property/Facilities";
import ExtraServices from "@/components/property/ExtraServices";
import Reviews from "@/components/property/Reviews";
import LocationMap from "@/components/property/LocationMap";
import HostSection from "@/components/property/HostSection";
import HouseRules from "@/components/property/HouseRules";
import ReservationCard from "@/components/property/ReservationCard";
import { useCollapseOnScroll } from "@/lib/useCollapseOnScroll";
import { splitServices } from "@/lib/services";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Ignore hand-over checks for this long after one, so the swap can animate
// without the reflow it causes triggering the opposite swap.
const SETTLE_MS = 420;

// Height of the site header this page's own header sticks below (see Navbar).
const NAV_HEIGHT = 68;

// Map a real service label to one of the facility icons.
function serviceIcon(s: string): Facility["icon"] {
  const t = s.toLowerCase();
  if (t.includes("wifi")) return "wifi";
  if (t.includes("parking")) return "parking";
  if (t.includes("air") || t === "ac") return "ac";
  if (t.includes("tv")) return "tv";
  if (t.includes("smoke")) return "smoke";
  if (t.includes("long stay")) return "calendar";
  if (t.includes("pool") || t.includes("swim")) return "pool";
  if (t.includes("jacuzzi") || t.includes("jaccuzzi") || t.includes("bath")) return "jacuzzi";
  if (t.includes("bbq") || t.includes("barbe") || t.includes("grill")) return "bbq";
  // A label the host typed in themselves — a neutral tick beats guessing wrong.
  return "other";
}

export default function VillaDetailPage() {
  const params = useParams();
  const id = String(params.id);
  // A coupon carried in from a home-page offer (?coupon=CODE) — forwarded to
  // checkout via the reservation card so it's already applied at payment.
  const [coupon, setCoupon] = useState("");
  useEffect(() => {
    setCoupon(new URLSearchParams(window.location.search).get("coupon") || "");
  }, []);
  // undefined = loading, null = not found, Villa = loaded
  const [v, setV] = useState<Villa | null | undefined>(undefined);
  // Real reviews for this villa, fetched alongside it.
  const [reviews, setReviews] = useState<Review[]>([]);
  // Tracked separately: a network blip is not the same as a deleted listing,
  // and telling a user their villa "may have been removed" is alarming.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Two stages. The text rows collapse at 120px and come back at 100px — i.e.
  // essentially the same spot they went away at, rather than on any scroll-up
  // gesture. Passing Infinity for the gesture distance is what disables that.
  const collapsed = useCollapseOnScroll(120, 100, Infinity, 0);

  // The photo strip is a second, independent stage, and it watches one thing
  // only: the hero gallery. It shows exactly while no part of that gallery is
  // on screen — nothing further down the page can influence it.
  const headerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);
  const heroInnerRef = useRef<HTMLDivElement>(null);
  const [galleryCollapsed, setGalleryCollapsed] = useState(false);
  const galleryCollapsedRef = useRef(false);
  // Live height of that header, so the reservation card can park below it.
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    let active = true;
    setV(undefined);
    setFailed(false);
    fetchVilla(id)
      .then((villa) => {
        if (active) setV(villa);
      })
      .catch(() => {
        // A newer request for a different id has already superseded this one.
        if (!active) return;
        setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [id, attempt]);

  // Load the villa's reviews once it exists. A failure here is silent — the
  // reviews section just shows its empty state rather than blocking the page.
  useEffect(() => {
    if (!v) {
      setReviews([]);
      return;
    }
    let active = true;
    fetchVillaReviews(id)
      .then((rs) => {
        if (active) setReviews(rs);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [v, id]);

  // The hand-over is measured once, then remembered — never re-measured while
  // the strip is up.
  //
  // Measuring in both directions is what made it flicker: the strip is part of
  // the header, so showing it makes the header taller, which moves the very
  // edges the test compares. Test → toggle → the test's own inputs move → test
  // again. Hence the two or three flips per scroll.
  //
  // So: while the photos are on screen, geometry decides when they leave (the
  // hero gallery's bottom edge reaching the bottom of the pinned header — the
  // moment the last of it goes out of view). At that instant the scroll
  // position is recorded, and the strip stays up until the page is scrolled
  // back above it, which is exactly where the photos start showing again.
  // Nothing the toggle changes can feed back into that.
  useEffect(() => {
    let lockedUntil = 0;
    let handOverY = 0;

    const check = () => {
      const header = headerRef.current;
      const hero = heroRef.current;
      const heroInner = heroInnerRef.current;
      if (!header || !hero || !heroInner) return;

      const now = performance.now();
      const y = window.scrollY;
      const prev = galleryCollapsedRef.current;

      if (now < lockedUntil) {
        // Collapsing shortens the page, which can pull the scroll position
        // down with it. Absorb that so it doesn't read as a scroll up.
        if (prev) handOverY = Math.min(handOverY, y);
        return;
      }

      let next = prev;
      if (!prev) {
        const headerBottom = header.getBoundingClientRect().bottom;
        const heroBottom = hero.getBoundingClientRect().top + heroInner.offsetHeight;
        if (heroBottom <= headerBottom) {
          handOverY = y;
          next = true;
        }
      } else if (y < handOverY - 8) {
        next = false;
      }
      if (next === prev) return;

      galleryCollapsedRef.current = next;
      lockedUntil = now + SETTLE_MS;
      setGalleryCollapsed(next);
    };

    window.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    // A frame late: the images decide the height, and it keeps the setState
    // out of the effect body.
    const raf = requestAnimationFrame(check);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [v]);

  // Track the header's height for the reservation card's sticky offset.
  // Rounded to 8px, and committed only once the header has stopped resizing:
  // following its collapse animation frame by frame made the card chase it in
  // little steps, which reads as a shudder. One settled value, one eased move.
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    let first = true;
    const ro = new ResizeObserver(([entry]) => {
      const h = Math.ceil(entry.contentRect.height / 8) * 8;
      // The first measurement is the resting height — take it straight away.
      if (first) {
        first = false;
        setHeaderHeight(h);
        return;
      }
      clearTimeout(timer);
      timer = window.setTimeout(() => setHeaderHeight(h), 180);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [v]);

  if (failed) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1320px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">Couldn&apos;t load this property</h1>
        <p className="mt-2 text-[14px] text-body">
          Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Try again
        </button>
      </div>
    );
  }

  if (v === undefined) {
    // Mirror the loaded layout so the page fills in rather than snapping in.
    return (
      <div
        className="mx-auto max-w-[1320px] px-5 pb-20 pt-5 lg:px-7"
        aria-busy="true"
        aria-label="Loading villa"
      >
        {/* Same rhythm as the real header: breadcrumb, then the 30px title. */}
        <div className="skeleton h-4 w-64" />
        <div className="skeleton mt-2 h-8 w-2/3 max-w-[420px]" />
        <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="skeleton aspect-[4/3] rounded-2xl md:aspect-auto md:h-[420px]" />
          <div className="grid grid-cols-2 gap-3 md:h-[420px]">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton aspect-square rounded-2xl md:aspect-auto" />
            ))}
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-x-12 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">
            <div className="skeleton h-5 w-1/2" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
          </div>
          <div className="skeleton mt-6 h-[420px] rounded-2xl lg:mt-0" />
        </div>
      </div>
    );
  }

  if (v === null) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1320px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">Villa not found</h1>
        <p className="mt-2 text-[14px] text-body">This listing may have been removed.</p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // --- Build the display data from real fields (+ dummy where noted) ---
  const photoUrls =
    v.photos.length > 0
      ? v.photos.map((p) => p.url)
      : v.coverImage
        ? [v.coverImage]
        : [dummy.images.hero];
  const hero = photoUrls[0];
  const thumbs = photoUrls.slice(1);

  // What the host stated: capacity, room count, and how those rooms are
  // furnished. The bed lines only appear when the host filled them in.
  const overview = [
    plural(v.guests, "guest"),
    plural(v.bedrooms, "Bedroom"),
    ...(v.singleBedRooms ? [plural(v.singleBedRooms, "Single bed")] : []),
    ...(v.doubleBedRooms ? [plural(v.doubleBedRooms, "Double bed")] : []),
  ];

  const location = [v.city, v.country].filter(Boolean).join(", ");
  const subtitle = `${v.propertyType || "Villa"}${location ? " in " + location : ""} hosted by ${v.hostName || "your host"}`;

  // Facilities come from the free-form `services` list; the optional extra
  // services (with their per-night prices) are their own list on the villa.
  const { facilities: facilityLabels } = splitServices(v.services);
  const facilities: Facility[] = facilityLabels.map((s) => ({
    label: s,
    icon: serviceIcon(s),
  }));

  const descriptionParts = [
    v.description,
    v.buildUpArea ? `Total build-up area: ${v.buildUpArea}.` : "",
    v.address ? `Address: ${v.address}.` : "",
  ].filter(Boolean);
  const description = descriptionParts.join(" ") || dummy.description;

  // Pricing: real price/guests, keep the dummy breakdown template.
  const pricing = {
    ...dummy.pricing,
    price: v.pricePerNight,
    period: "night",
    guests: plural(v.guests, "guest"),
  };

  const breadcrumb = ["Home", "Villas", v.country || "Listing", v.title];

  return (
    <div className="pb-20">
      {/* Sticky page header — breadcrumb, title and Share/Save, in the same bar
          as every other page (see PageHeader): full-viewport background, text on
          the content grid, transparent→line border and the pb-4/pt-5 → py-2.5
          rhythm. It collapses in two stages of its own: the text rows tighten
          early, and the photo strip only appears once the gallery below has
          scrolled past. */}
      <div
        ref={headerRef}
        className={`sticky top-[68px] z-30 border-b bg-page transition-all duration-200 ease-out ${
          collapsed ? "border-line py-2.5" : "border-transparent pb-4 pt-5"
        }`}
      >
        <div className="mx-auto w-full max-w-[1320px] px-5 lg:px-7">
          <Breadcrumb items={breadcrumb} compact={collapsed} />
          <PropertyHeader
            title={v.title}
            rating={v.rating}
            reviewsCount={v.reviewsCount}
            villaId={v.id}
            isOwner={v.isOwner}
            compact={collapsed}
          />
          {/* The thumbnail strip only joins the pinned header once the real
              gallery below has scrolled past it. */}
          <div
            className={`overflow-hidden transition-[max-height,margin,opacity] duration-300 ease-out ${
              galleryCollapsed ? "mt-2 max-h-[60px] opacity-100" : "mt-0 max-h-0 opacity-0"
            }`}
          >
            <Gallery hero={hero} thumbs={thumbs} compact />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1320px] px-5 pt-4 lg:px-7">
      {/* The full gallery stays in normal flow so it scrolls away like any
          other content; its height eases to zero as the strip takes over — same
          duration and easing, so the two read as one movement. */}
      <div
        ref={heroRef}
        className={`overflow-hidden transition-[max-height,opacity] duration-300 ease-out ${
          galleryCollapsed ? "max-h-0 opacity-0" : "max-h-[900px] opacity-100"
        }`}
      >
        {/* Inner element: keeps its natural height whatever the wrapper's
            max-height is doing, which is what the hand-over test reads. */}
        <div ref={heroInnerRef}>
          <Gallery hero={hero} thumbs={thumbs} />
        </div>
      </div>

      {/* Full-width overview under the gallery */}
      <div className="mt-8">
        <Overview subtitle={subtitle} items={overview} />
      </div>

      {/* Two-column: details (left) + sticky reservation (right) */}
      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[1fr_360px]">
        <div>
          <Description text={description} />
          <BedroomSection
            image={thumbs[0] || hero}
            title="Bedroom"
            detail={plural(v.bedrooms, "bed")}
          />
          <Facilities facilities={facilities} />
          <ExtraServices services={v.extraServices} />
          <Reviews reviews={reviews} rating={v.rating} reviewsCount={v.reviewsCount} />
          <LocationMap location={[v.address, v.city, v.country].filter(Boolean).join(", ")} />
          <HostSection
            name={v.hostName}
            avatar={v.hostAvatar}
            gender={v.hostGender}
            email={v.hostEmail}
            phone={v.hostPhone}
          />
          {/* The host's own rules — check-in/out times and what's allowed. */}
          <HouseRules rules={v.houseRules} additional={v.additionalRules} />
        </div>

        {/* Reservation sidebar */}
        <aside className="lg:col-start-2 lg:row-start-1">
          {/* Parks below the pinned page header instead of under it — at the
              old fixed offset the card's price and rating were clipped. The
              offset follows the header, which changes height as it collapses
              and as the photo strip comes and goes. */}
          <div
            // The offset follows the collapsing header, so ease it there —
            // a bare `top` swap makes the card jump as the header settles.
            // z-40 puts the card ABOVE that header (which is z-30): where the
            // two meet, the card is the one that stays whole.
            className="relative z-40 pt-6 transition-[top] duration-300 ease-out lg:sticky lg:top-[43px]"
            style={headerHeight ? { top: NAV_HEIGHT + headerHeight - 33 } : undefined}
          >
            <ReservationCard
              pricing={pricing}
              rating={v.rating}
              villaId={v.id}
              ownerId={v.ownerId}
              maxGuests={v.guests}
              checkInTime={v.checkInTime}
              coupon={coupon}
            />
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}
