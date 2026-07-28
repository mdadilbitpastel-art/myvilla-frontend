"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { geocode } from "@/lib/geocode";
import "leaflet/dist/leaflet.css";

/**
 * The same red location pin the landing-page map uses (see PropertyMap), so a
 * villa is marked identically wherever it appears. Written as inline HTML
 * because Leaflet builds the icon node itself.
 */
const PIN_SVG = `<svg width="27" height="36" viewBox="0 0 24 32" fill="none" aria-hidden><path d="M12 0C5.373 0 0 5.373 0 12c0 8.5 10.35 18.9 11.29 19.83a1 1 0 0 0 1.42 0C13.65 30.9 24 20.5 24 12 24 5.373 18.627 0 12 0Z" fill="currentColor"/><circle cx="12" cy="11.5" r="4.4" fill="#fff"/></svg>`;

/**
 * Where the villa is, on a real map.
 *
 * Leaflet rather than a Google embed: the embed wraps the world, so dragging
 * sideways rolled the same continents past again and again, and there was no
 * way to tell it not to. Here `noWrap` + `maxBounds` pin it to one world, and
 * the marker is placed at the villa's own coordinate, so it stays put at every
 * zoom instead of being whatever the embed's search happened to highlight.
 */
export default function LocationMap({ location }: { location?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const place = (location || "").trim();
  // The lookup's outcome, tagged with the address it belongs to. Keeping the
  // address alongside it is what lets a new one read as "looking" during
  // render, with no state to reset when the prop changes.
  const [resolved, setResolved] = useState<{ place: string; found: boolean } | null>(null);
  const state: "looking" | "ready" | "unknown" =
    resolved?.place !== place ? "looking" : resolved.found ? "ready" : "unknown";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [mod, point] = await Promise.all([
        import("leaflet"),
        (async () => {
          if (!place) return null;
          // Fall back to just the town when the full street address can't be
          // found — the right city beats no map at all.
          const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
          return (
            (await geocode(place)) ??
            (parts.length > 1 ? await geocode(parts.slice(1).join(", ")) : null)
          );
        })(),
      ]);
      if (cancelled) return;
      if (!point || !boxRef.current) {
        setResolved({ place, found: false });
        return;
      }

      // Leaflet ships as UMD: depending on how the bundler interops it, the API
      // is either the namespace itself or hiding under `default`.
      const L = (mod as unknown as { default?: typeof mod }).default ?? mod;

      // Guard against a second run (React's dev double-effect) reusing the node.
      if (mapRef.current) mapRef.current.remove();

      // One world, not an endless reel of copies: `noWrap` stops the tiles
      // repeating sideways and `maxBounds` stops the drag from leaving that
      // single world.
      const WORLD = L.latLngBounds([-85.05, -180], [85.05, 180]);
      const map = L.map(boxRef.current, {
        // The page scrolls through this section, so the wheel keeps scrolling
        // the page until the reader engages with the map by clicking it — the
        // + / − controls work from the start either way.
        scrollWheelZoom: false,
        minZoom: 3,
        maxBounds: WORLD,
        maxBoundsViscosity: 1,
      }).setView([point.lat, point.lng], 14);
      map.once("click", () => map.scrollWheelZoom.enable());
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        noWrap: true,
        bounds: WORLD,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      L.marker([point.lat, point.lng], {
        icon: L.divIcon({ className: "", html: `<span class="villa-pin">${PIN_SVG}</span>`, iconSize: [0, 0] }),
        title: place,
        // The pin marks the place, it isn't a control — nothing to click.
        interactive: false,
        keyboard: false,
      }).addTo(map);

      setResolved({ place, found: true });
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [place]);

  return (
    <section className="border-b border-line py-6">
      <h3 className="mb-4 text-[18px] font-semibold text-primary">Location on map</h3>
      {/* `isolate`: Leaflet's panes sit at z-index 400+, which would otherwise
          paint straight over the page's sticky header as it scrolls past. */}
      <div className="relative isolate overflow-hidden rounded-2xl border border-line">
        <div ref={boxRef} className="h-[320px] w-full bg-page sm:h-[380px]" />

        {state !== "ready" && (
          <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center gap-2 bg-page text-center">
            {state === "looking" ? (
              <>
                <span className="spinner" aria-hidden />
                <p className="text-[13px] text-muted">Locating this property…</p>
              </>
            ) : (
              <>
                <p className="text-[14px] font-medium text-ink">
                  {place || "No address given"}
                </p>
                <p className="text-[13px] text-muted">
                  This address couldn&apos;t be placed on the map.
                </p>
                {place && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-primary underline underline-offset-2"
                  >
                    Search it on Google Maps
                  </a>
                )}
              </>
            )}
          </div>
        )}

        {state === "ready" && (
          <span className="pointer-events-none absolute bottom-3 left-1/2 z-[500] hidden -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1 text-[11.5px] font-medium text-white backdrop-blur-sm md:block">
            Click the map to zoom with your scroll wheel
          </span>
        )}
      </div>
    </section>
  );
}
