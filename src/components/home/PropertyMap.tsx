"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Users, Star, BadgePercent } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { fetchVillas, fetchPublicOffers, type Villa, type Offer } from "@/lib/api";
import { villaGallery } from "@/lib/home";
import { geocode } from "@/lib/geocode";
import Img from "@/components/ui/Img";
import SectionHeading from "./SectionHeading";
import Reveal from "@/components/ui/Reveal";
import "leaflet/dist/leaflet.css";

/** The written place a listing sits at, best detail first. */
function placeOf(v: Villa): string {
  return [v.address, v.city, v.country].map((s) => (s || "").trim()).filter(Boolean).join(", ");
}

const money = (n: number) => `$${Math.round(n)}`;

/**
 * The marker: a plain red location pin. Written as inline HTML rather than a
 * React element, because Leaflet builds the icon node itself.
 *
 * The nightly rate is deliberately NOT on the pin — a map of price pills turns
 * unreadable the moment two listings sit near each other. The price is on the
 * hover card instead, over the photo, where it has the room to be legible.
 */
const PIN_SVG = `<svg width="27" height="36" viewBox="0 0 24 32" fill="none" aria-hidden><path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 10.35 18.9 11.29 19.83a1 1 0 0 0 1.42 0C13.65 30.9 24 20.5 24 12 24 5.373 18.627 0 12 0Z" fill="currentColor"/><circle cx="12" cy="11.5" r="4.4" fill="#fff"/></svg>`;

const CARD_W = 278;
/** How far the notch sticks out of the card, and how far its point sits from
 *  the card's near edge. The gap between card and pin is exactly the notch's
 *  length, so the point lands ON the pin's edge rather than near it. */
const NOTCH_L = 18;
const PIN_INSET = 20;
const GAP = NOTCH_L;

/** How much the pin grows while its card is open. */
const PIN_SCALE = 1.12;
/** Where the pin's head sits, as a fraction of its height from the top. The
 *  marker is a teardrop: the round head is its widest part (and the only part
 *  that reaches the full width), so that — not the tapering tail below it — is
 *  the edge the notch has to meet. Matches `cy` in PIN_SVG's viewBox. */
const PIN_HEAD = 12 / 32;

/** How long each photo is held before the card's slideshow moves on. Matched
 *  to the landing-page villa cards, so both peeks run at the same beat. */
const FRAME_MS = 800;

/** How long each pin holds the floor during the automatic tour — long enough to
 *  read the card and watch a couple of photos turn over, rather than flicking
 *  past. Includes the handover below. */
const TOUR_MS = 5600;
/** The beat between one card leaving and the next arriving. The card fades in
 *  over 0.9s (`animate-fade-in`) and the pin eases up under it, so the change
 *  reads as a hand-off instead of a cut. */
const HANDOVER_MS = 420;

/** The hovered pin, measured in the map box's own coordinates — its two side
 *  edges and its head, which is what the notch points at — plus the box's own
 *  size at that moment, which decides which way the card opens. */
type Hover = {
  villa: Villa;
  left: number;
  right: number;
  midY: number;
  boxW: number;
  boxH: number;
};

/**
 * The card's photo, stepping through the villa's gallery and stopping on the
 * last shot — the same walk-through the landing-page cards give on hover.
 *
 * There's no hover state to track: the card only exists while the pointer is on
 * the pin or on the card, so being mounted *is* being hovered. Mount it with
 * the villa's id as `key` and each pin replays from its cover.
 */
function CardPhotos({ villa }: { villa: Villa }) {
  const gallery = useMemo(() => villaGallery(villa, villa.coverImage), [villa]);
  const [frame, setFrame] = useState(0);
  // A photo joins `ready` only once it has decoded, so the swap below can never
  // reveal an empty frame; one that fails to load simply never joins and the
  // slideshow rests on the last good shot.
  const [ready, setReady] = useState<number[]>([0]);

  useEffect(() => {
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
  }, [gallery]);

  useEffect(() => {
    const next = frame + 1;
    // Not loaded yet → hold this frame. The effect re-runs the moment it lands.
    if (next >= gallery.length || !ready.includes(next)) return;
    const t = setTimeout(() => setFrame(next), FRAME_MS);
    return () => clearTimeout(t);
  }, [frame, ready, gallery.length]);

  return (
    <>
      {gallery.map((src, i) =>
        ready.includes(i) ? (
          <span
            key={`${i}-${src}`}
            aria-hidden={i !== frame}
            className="absolute inset-0 transition-opacity duration-300"
            style={{ opacity: i === frame ? 1 : 0 }}
          >
            <Img src={src} alt="" className="h-full w-full object-cover" />
          </span>
        ) : null
      )}
    </>
  );
}

/**
 * Every listed property on one map — real addresses, not decoration.
 *
 * Coordinates aren't stored with a listing, so each address is looked up once
 * and remembered (see lib/geocode). Pins appear as their lookups land rather
 * than all at the end, so the map fills in while you watch.
 */
export default function PropertyMap() {
  const router = useRouter();
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [placed, setPlaced] = useState(0);
  const [done, setDone] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [offers, setOffers] = useState<Map<string, Offer>>(new Map());
  // Closing is deferred so the pointer can travel from pin to card.
  const closer = useRef<number | undefined>(undefined);
  // The pin whose card is open. It stays raised for as long as the card is
  // there — including while the pointer is off the pin and on the card itself,
  // which a CSS :hover can't express.
  const activePin = useRef<Element | null>(null);

  // Every placed pin, in the order they landed — what the tour below walks.
  const pins = useRef<Array<{ villa: Villa; marker: Marker }>>([]);
  // False once the visitor takes over. It never goes back: the tour is an
  // invitation, and having it start talking over someone who is reading a card
  // would be worse than not running at all.
  const [auto, setAuto] = useState(true);
  // The section is on screen. The tour only runs while it is — off-screen it
  // would just be pins flashing at nobody.
  const [onScreen, setOnScreen] = useState(false);
  // Placement calls fitBounds repeatedly, and each call fires `movestart`. That
  // is the map settling itself, not the visitor moving it, so it must not count
  // as taking over.
  const settled = useRef(false);

  const hold = () => window.clearTimeout(closer.current);
  const release = () => {
    window.clearTimeout(closer.current);
    closer.current = window.setTimeout(() => setHover(null), 200);
  };
  // Hovering the card itself is engagement — the tour stops there too.
  const takeOver = () => {
    settled.current = true;
    setAuto(false);
  };

  // Open the card for a pin: raise it and measure where the notch has to point.
  // Shared by the pointer and by the tour, so an automatic step is identical to
  // a real hover rather than a second, nearly-right code path.
  const showFor = useCallback((marker: Marker, villa: Villa) => {
    window.clearTimeout(closer.current);
    const box = boxRef.current;
    if (!box) return;
    const boxRect = box.getBoundingClientRect();
    // Measure the pin itself, not the marker anchor: the pin is drawn offset
    // from its anchor point (it stands above the coordinate), so the anchor is
    // nowhere near the edge the notch has to meet.
    const pin = marker.getElement()?.querySelector(".villa-pin");
    const r = pin?.getBoundingClientRect();
    if (!pin || !r) return;

    // Raising is scale-only about the pin's tip, so the raised geometry can be
    // worked out here exactly rather than read mid-transition. If this pin is
    // already up, `r` is the raised box and must not be scaled twice.
    const grow = pin.classList.contains("is-active") ? 1 : PIN_SCALE;
    if (activePin.current !== pin) {
      activePin.current?.classList.remove("is-active");
      pin.classList.add("is-active");
      activePin.current = pin;
    }

    const tipX = r.left + r.width / 2;
    const w = r.width * grow;
    const h = r.height * grow;
    setHover({
      villa,
      left: Math.round(tipX - w / 2 - boxRect.left),
      right: Math.round(tipX + w / 2 - boxRect.left),
      // The head's centre, which is where the pin is at its full width — so the
      // notch's point meets the edge instead of hanging beside the narrow tail.
      midY: Math.round(r.bottom - h * (1 - PIN_HEAD) - boxRect.top),
      boxW: box.clientWidth,
      boxH: box.clientHeight,
    });
  }, []);

  // The card is gone → let the pin settle back down.
  useEffect(() => {
    if (hover) return;
    activePin.current?.classList.remove("is-active");
    activePin.current = null;
  }, [hover]);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        setOnScreen(e.isIntersecting);
        // Scrolled away → close whatever was open, so coming back starts clean.
        if (!e.isIntersecting) setHover(null);
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The tour: one pin at a time, in the order they were placed, looping for as
  // long as the map is on screen and nobody has taken over.
  useEffect(() => {
    if (!auto || !onScreen || !done || !pins.current.length) return;
    let i = 0;
    let handover: number | undefined;
    // Let the current card go first, then bring the next one up a beat later —
    // the gap is what makes it a fade-out/fade-in rather than the card teleport-
    // ing across the map.
    const step = () => {
      const list = pins.current;
      if (!list.length) return;
      const { marker, villa } = list[i % list.length];
      i += 1;
      setHover(null);
      handover = window.setTimeout(() => showFor(marker, villa), HANDOVER_MS);
    };
    step();
    const t = window.setInterval(step, TOUR_MS);
    return () => {
      window.clearInterval(t);
      window.clearTimeout(handover);
    };
  }, [auto, onScreen, done, showFor]);

  useEffect(() => {
    let cancelled = false;
    const markers: Marker[] = [];
    pins.current = [];
    settled.current = false;

    (async () => {
      const [mod, villas, liveOffers] = await Promise.all([
        import("leaflet"),
        fetchVillas(50).catch(() => [] as Villa[]),
        // Any real coupon on a villa shows on its card, same as everywhere else.
        fetchPublicOffers(20).catch(() => [] as Offer[]),
      ]);
      if (!cancelled) setOffers(new Map(liveOffers.map((o) => [o.villaId, o])));
      // Leaflet ships as UMD: depending on how the bundler interops it, the
      // API is either the namespace itself or hiding under `default`. Reading
      // `L.map` off the wrong one is an immediate "is not a function".
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod;
      if (cancelled || !boxRef.current || !villas.length) {
        if (!cancelled) setDone(true);
        return;
      }

      // Guard against a second run (React's dev double-effect) reusing the node.
      if (mapRef.current) mapRef.current.remove();
      // One world, not an endless reel of copies: `noWrap` stops the tiles
      // repeating sideways, `maxBounds` stops the drag from leaving that single
      // world, and the minimum zoom keeps it wider than the box so there's
      // never a strip of empty map beside it.
      const WORLD = L.latLngBounds([-85.05, -180], [85.05, 180]);
      const map = L.map(boxRef.current, {
        // The page scrolls through this section, so the wheel keeps scrolling
        // the page until the reader actually engages with the map by clicking
        // it — the + / − controls work from the start either way.
        scrollWheelZoom: false,
        minZoom: 3,
        maxBounds: WORLD,
        maxBoundsViscosity: 1,
      }).setView([20, 10], 3);
      map.once("click", () => map.scrollWheelZoom.enable());
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        noWrap: true,
        bounds: WORLD,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // A card is pinned to a point on screen, so it can't survive the map
      // moving under it. Once the pins have settled, a move can only be the
      // visitor's doing — which ends the tour.
      map.on("movestart zoomstart", () => {
        if (settled.current) setAuto(false);
        setHover(null);
      });

      for (const v of villas) {
        if (cancelled) return;
        const place = placeOf(v);
        if (!place) continue;
        // Fall back to just the town when the full address can't be found —
        // a pin in the right city beats no pin at all.
        const point =
          (await geocode(place)) ??
          (await geocode([v.city, v.country].filter(Boolean).join(", ")));
        if (cancelled) return;
        if (!point) continue;

        const icon = L.divIcon({
          className: "",
          html: `<span class="villa-pin">${PIN_SVG}</span>`,
          iconSize: [0, 0],
        });
        const marker = L.marker([point.lat, point.lng], { icon, title: v.title }).addTo(map);

        // The card is drawn by React outside the map box rather than as a
        // Leaflet popup: a popup lives *inside* the map, which clips it, and
        // the only way to keep it whole is to shove the map around. This one
        // can hang over the edge, and the map never moves.
        marker.on("mouseover", () => {
          // A real hover: the visitor is driving now.
          setAuto(false);
          showFor(marker, v);
        });
        marker.on("mouseout", release);
        marker.on("click", () => router.push(`/villa/${v.id}`));
        markers.push(marker);
        pins.current.push({ villa: v, marker });

        // Keep every pin found so far in view.
        map.fitBounds(L.featureGroup(markers).getBounds(), {
          padding: [40, 40],
          maxZoom: markers.length === 1 ? 11 : 13,
        });
        setPlaced(markers.length);
      }
      if (!cancelled) {
        // From here on, any map movement is the visitor's.
        settled.current = true;
        setDone(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(closer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [router, showFor]);

  // Which way the card opens: away from whichever edge the pin is nearest, so
  // it never has to be squeezed back inside — and it may overhang the map. The
  // box's size travels with the measurement rather than being read off the ref
  // here, which would be reading a ref during render.
  const toLeft = !!hover && hover.right + GAP + CARD_W > hover.boxW + CARD_W / 2;
  const above = !!hover && hover.midY > hover.boxH / 2;

  return (
    <Reveal className="mx-auto max-w-[1320px] px-6 py-10">
      <SectionHeading title="Find a stay" highlight="on the map" actionLabel="Browse all" />
      {/* `isolate`: Leaflet's panes sit at z-index 400+, which would otherwise
          paint straight over the sticky header as the page scrolls past. The
          box itself doesn't clip — that's what lets a card overhang it. */}
      <div className="relative isolate">
        <div
          ref={boxRef}
          className="h-[380px] w-full overflow-hidden rounded-2xl border border-line bg-white shadow-sm sm:h-[460px]"
        />

        {hover && (
          <div
            // Keyed by villa: each pin gets a fresh node, so the fade-in replays
            // on every hand-over instead of the card silently jumping.
            key={hover.villa.id}
            onMouseEnter={() => {
              hold();
              takeOver();
            }}
            onMouseLeave={release}
            style={{
              // Anchored to the side of the pin the card opens away from, and
              // to the pin's head — so the notch below, which sits PIN_INSET
              // from the card's near edge, points straight at it.
              left: toLeft ? hover.left : hover.right,
              top: hover.midY,
              width: CARD_W,
              transform: `translate(${toLeft ? `calc(-100% - ${GAP}px)` : `${GAP}px`}, ${
                above ? `calc(-100% + ${PIN_INSET}px)` : `-${PIN_INSET}px`
              })`,
            }}
            className="animate-fade-in absolute z-[900] rounded-xl bg-white shadow-[0_16px_38px_rgba(20,20,40,0.24)] ring-1 ring-black/5"
          >
            {/* The notch — long enough to read as a pointer at this size, and
                on whichever side the pin actually is. */}
            <span
              aria-hidden
              className="absolute"
              style={{
                // Reaches exactly to the pin's edge, its point level with the
                // middle of that edge — PIN_INSET less half the notch's own
                // 16px height is what centres it on the anchor.
                [toLeft ? "right" : "left"]: -NOTCH_L,
                [above ? "bottom" : "top"]: PIN_INSET - 8,
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                [toLeft ? "borderLeft" : "borderRight"]: `${NOTCH_L}px solid #fff`,
                filter: `drop-shadow(${toLeft ? "2px" : "-2px"} 0 2px rgba(20,20,40,0.10))`,
              }}
            />
            {/* The card itself is inert — only "View" navigates, so hovering a
                pin can't turn the whole panel into one big link target. */}
            <div className="block p-[7px]">
              <div className="img-frame relative h-[135px] w-full overflow-hidden rounded-lg">
                <CardPhotos key={hover.villa.id} villa={hover.villa} />
                {/* A live coupon on this villa, in the site's offer red. */}
                {offers.get(hover.villa.id) && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-[#ff2d2d] px-2 py-0.5 text-[13px] font-bold text-white shadow">
                    <BadgePercent size={14} aria-hidden />
                    {offers.get(hover.villa.id)!.label}
                  </span>
                )}
                <span className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[14px] font-bold text-white backdrop-blur-sm">
                  {money(hover.villa.pricePerNight)}
                  <span className="font-medium opacity-80"> /night</span>
                </span>
              </div>

              <div className="mt-1.5 flex items-start justify-between gap-2">
                <p className="truncate text-[16px] font-semibold leading-tight text-ink">
                  {hover.villa.title}
                </p>
                {/* Real rating only — an unrated villa says so rather than
                    showing a hopeful zero. */}
                {hover.villa.rating > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-star/15 px-1.5 py-px text-[13px] font-bold text-[#b8860b]">
                    <Star size={13} className="fill-star text-star" aria-hidden />
                    {hover.villa.rating.toFixed(1)}
                    <span className="font-medium opacity-70">({hover.villa.reviewsCount})</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[13px] text-muted">New</span>
                )}
              </div>

              <p className="mt-0.5 truncate text-[14px] leading-tight text-muted">
                {[hover.villa.city, hover.villa.country].filter(Boolean).join(", ")}
              </p>

              <div className="mt-1.5 flex items-center justify-between gap-2 text-[14px] text-body">
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <BedDouble size={15} className="text-muted" aria-hidden />
                    {hover.villa.bedrooms}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={15} className="text-muted" aria-hidden />
                    {hover.villa.guests}
                  </span>
                </span>
                <Link
                  href={`/villa/${hover.villa.id}`}
                  className="rounded-md bg-primary px-3 py-1.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  View
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Honest status while addresses are still being looked up — the pins
            land one by one, so an empty map shouldn't look broken. */}
        {!done && (
          <span className="pointer-events-none absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[12px] font-medium text-body shadow">
            <span className="spinner" aria-hidden />
            Placing properties{placed ? ` — ${placed} so far` : ""}
          </span>
        )}
        <span className="pointer-events-none absolute bottom-3 left-1/2 z-[500] hidden -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1 text-[11.5px] font-medium text-white backdrop-blur-sm md:block">
          Click the map to zoom with your scroll wheel
        </span>
      </div>
    </Reveal>
  );
}
