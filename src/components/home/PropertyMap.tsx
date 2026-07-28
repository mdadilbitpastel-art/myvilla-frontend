"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BedDouble, Users, Star, BadgePercent } from "lucide-react";
import type { Map as LeafletMap, Marker } from "leaflet";
import { fetchVillas, fetchPublicOffers, type Villa, type Offer } from "@/lib/api";
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

/** Escapes the price that goes into the pin, which is set as HTML. */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;"
  );
}

/** The location glyph inside each price pin. Inline, because the pin is built
 *  as HTML for Leaflet rather than rendered by React. */
const PIN_GLYPH = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a7 7 0 0 0-7 7c0 5.05 6.24 12.3 6.5 12.6a.65.65 0 0 0 1 0C12.76 21.3 19 14.05 19 9a7 7 0 0 0-7-7zm0 9.6A2.6 2.6 0 1 1 12 6.4a2.6 2.6 0 0 1 0 5.2z"/></svg>`;

const CARD_W = 214;
/** How far the notch sticks out of the card, and how far its point sits from
 *  the card's near edge. The gap between card and pin is the notch's length
 *  plus a hair, so the point lands exactly on the price pill. */
const NOTCH_L = 18;
const PIN_INSET = 20;
const GAP = NOTCH_L + 2;

/** The hovered price pill, measured in the map box's own coordinates — its two
 *  side edges and the middle of them, which is what the notch points at. */
type Hover = { villa: Villa; left: number; right: number; midY: number };

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

  const hold = () => window.clearTimeout(closer.current);
  const release = () => {
    window.clearTimeout(closer.current);
    closer.current = window.setTimeout(() => setHover(null), 200);
  };

  useEffect(() => {
    let cancelled = false;
    const markers: Marker[] = [];

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
      const map = L.map(boxRef.current, {
        // The page scrolls through this section, so the wheel keeps scrolling
        // the page until the reader actually engages with the map by clicking
        // it — the + / − controls work from the start either way.
        scrollWheelZoom: false,
      }).setView([20, 10], 2);
      map.once("click", () => map.scrollWheelZoom.enable());
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      // A card is pinned to a point on screen, so it can't survive the map
      // moving under it.
      map.on("movestart zoomstart", () => setHover(null));

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
          html: `<span class="villa-pin">${PIN_GLYPH}${esc(money(v.pricePerNight))}</span>`,
          iconSize: [0, 0],
        });
        const marker = L.marker([point.lat, point.lng], { icon, title: v.title }).addTo(map);

        // The card is drawn by React outside the map box rather than as a
        // Leaflet popup: a popup lives *inside* the map, which clips it, and
        // the only way to keep it whole is to shove the map around. This one
        // can hang over the edge, and the map never moves.
        marker.on("mouseover", () => {
          hold();
          const box = boxRef.current;
          if (!box) return;
          const boxRect = box.getBoundingClientRect();
          // Measure the pill itself, not the marker anchor: the pill is drawn
          // offset from its anchor point (it sits above and centred on it), so
          // the anchor is nowhere near the edge the notch has to meet.
          const pill = marker.getElement()?.querySelector(".villa-pin");
          const r = pill?.getBoundingClientRect();
          if (!r) return;
          setHover({
            villa: v,
            left: Math.round(r.left - boxRect.left),
            right: Math.round(r.right - boxRect.left),
            midY: Math.round(r.top - boxRect.top + r.height / 2),
          });
        });
        marker.on("mouseout", release);
        marker.on("click", () => router.push(`/villa/${v.id}`));
        markers.push(marker);

        // Keep every pin found so far in view.
        map.fitBounds(L.featureGroup(markers).getBounds(), {
          padding: [40, 40],
          maxZoom: markers.length === 1 ? 11 : 13,
        });
        setPlaced(markers.length);
      }
      if (!cancelled) setDone(true);
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(closer.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [router]);

  // Which way the card opens: away from whichever edge the pin is nearest, so
  // it never has to be squeezed back inside — and it may overhang the map.
  const box = boxRef.current;
  const toLeft =
    !!box && !!hover && hover.right + GAP + CARD_W > box.clientWidth + CARD_W / 2;
  const above = !!box && !!hover && hover.midY > box.clientHeight / 2;

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
            onMouseEnter={hold}
            onMouseLeave={release}
            style={{
              // Anchored to the side of the pill the card opens away from, and
              // to the pill's vertical middle — so the notch below, which sits
              // PIN_INSET from the card's near edge, points straight at it.
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
                // Sticks out to within 2px of the pill's edge, its point level
                // with the middle of that edge.
                [toLeft ? "right" : "left"]: -NOTCH_L,
                [above ? "bottom" : "top"]: PIN_INSET - 7,
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                [toLeft ? "borderLeft" : "borderRight"]: `${NOTCH_L}px solid #fff`,
                filter: `drop-shadow(${toLeft ? "2px" : "-2px"} 0 2px rgba(20,20,40,0.10))`,
              }}
            />
            <Link href={`/villa/${hover.villa.id}`} className="group block p-[5px]">
              <div className="img-frame relative h-[104px] w-full overflow-hidden rounded-lg">
                <Img src={hover.villa.coverImage} alt="" className="h-full w-full object-cover" />
                {/* A live coupon on this villa, in the site's offer red. */}
                {offers.get(hover.villa.id) && (
                  <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-[#ff2d2d] px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                    <BadgePercent size={11} aria-hidden />
                    {offers.get(hover.villa.id)!.label}
                  </span>
                )}
                <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
                  {money(hover.villa.pricePerNight)}
                  <span className="font-medium opacity-80"> /night</span>
                </span>
              </div>

              <div className="mt-1 flex items-start justify-between gap-1.5">
                <p className="truncate text-[12.5px] font-semibold leading-tight text-ink group-hover:text-primary">
                  {hover.villa.title}
                </p>
                {/* Real rating only — an unrated villa says so rather than
                    showing a hopeful zero. */}
                {hover.villa.rating > 0 ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-star/15 px-1 py-px text-[10.5px] font-bold text-[#b8860b]">
                    <Star size={10} className="fill-star text-star" aria-hidden />
                    {hover.villa.rating.toFixed(1)}
                    <span className="font-medium opacity-70">({hover.villa.reviewsCount})</span>
                  </span>
                ) : (
                  <span className="shrink-0 text-[10.5px] text-muted">New</span>
                )}
              </div>

              <p className="truncate text-[11px] leading-tight text-muted">
                {[hover.villa.city, hover.villa.country].filter(Boolean).join(", ")}
              </p>

              <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-body">
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex items-center gap-1">
                    <BedDouble size={12} className="text-muted" aria-hidden />
                    {hover.villa.bedrooms}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} className="text-muted" aria-hidden />
                    {hover.villa.guests}
                  </span>
                </span>
                <span className="rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-white transition-colors group-hover:bg-primary-dark">
                  View
                </span>
              </div>
            </Link>
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
