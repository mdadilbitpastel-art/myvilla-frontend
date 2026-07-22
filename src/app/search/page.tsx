"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, CircleUserRound, Search as SearchIcon } from "lucide-react";
import VillaCard from "@/components/home/VillaCard";
import { useCollapseOnScroll } from "@/lib/useCollapseOnScroll";
import { searchVillas, type Villa, type VillaFilters } from "@/lib/api";
import type { VillaCardData } from "@/lib/home";

const CATEGORIES = [
  "All",
  "Villa Living",
  "Hotel",
  "Bungalow",
  "Combinative Villa",
  "Others",
];

const GUEST_OPTIONS = [
  { label: "Any guests", value: 0 },
  { label: "1+ guests", value: 1 },
  { label: "2+ guests", value: 2 },
  { label: "4+ guests", value: 4 },
  { label: "6+ guests", value: 6 },
  { label: "8+ guests", value: 8 },
];

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

function toCard(v: Villa): VillaCardData {
  return {
    id: v.id,
    title: v.title, // show the villa's main title as the card heading
    image: v.photos[0]?.url || v.coverImage || FALLBACK_IMG,
    city: v.city,
    country: v.country,
    price: v.pricePerNight,
    distance: v.propertyType || "Villa",
    dates: `${v.bedrooms} BR · ${v.guests} guests`,
  };
}

type State = {
  q: string;
  guests: number;
  category: string;
};

// `useSearchParams` makes this subtree client-rendered, so it needs a boundary.
export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageContent />
    </Suspense>
  );
}

function SearchPageContent() {
  const searchParams = useSearchParams();
  // Seed from the URL so `/search?q=Bali` is correct on the very first paint
  // instead of rendering an empty box and reconciling in an effect.
  const initial = useRef<State>({
    q: searchParams.get("q") || searchParams.get("location") || "",
    guests: parseInt(searchParams.get("guests") || "0", 10) || 0,
    category: searchParams.get("category") || "All",
  });

  const [state, setState] = useState<State>(initial.current);
  // The text field is separate so typing doesn't fire a query on every keystroke.
  const [query, setQuery] = useState(initial.current.q);
  const [results, setResults] = useState<Villa[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // True once the page is scrolled and the search block is stuck to the navbar.
  //
  // Position-based, not direction-based: it re-expands at the same place it
  // collapsed (160px down), rather than the moment the user nudges upward from
  // anywhere on the page. `Infinity` disables the scroll-up gesture entirely;
  // the 12px between the two thresholds is only there so jitter exactly on the
  // line can't toggle it.
  const collapsed = useCollapseOnScroll(160, 148, Infinity, 0);
  // Only the newest request may commit; chips/guests can be changed faster
  // than the network responds.
  const seq = useRef(0);

  const run = useCallback((s: State) => {
    const id = ++seq.current;
    setLoading(true);
    setError("");
    const filters: VillaFilters = {
      search: s.q || undefined,
      category: s.category !== "All" ? s.category : undefined,
      guests: s.guests || undefined,
      limit: 60,
    };
    // Reflect the search in the URL so it can be shared / bookmarked.
    const sp = new URLSearchParams();
    if (s.q) sp.set("q", s.q);
    if (s.guests) sp.set("guests", String(s.guests));
    if (s.category !== "All") sp.set("category", s.category);
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");

    searchVillas(filters)
      .then((r) => {
        if (id !== seq.current) return;
        setResults(r);
        setLoading(false);
      })
      .catch((e) => {
        if (id !== seq.current) return;
        // Keep the previous results on screen — the error is shown above them.
        setError(e instanceof Error ? e.message : "Search failed. Try again.");
        setLoading(false);
      });
  }, []);

  // Run the URL-seeded search once on mount (e.g. arriving from the Hero search).
  useEffect(() => {
    run(initial.current);
  }, [run]);


  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const next = { ...state, q: query.trim() };
    setState(next);
    run(next);
  }

  function pickCategory(cat: string) {
    const next = { ...state, category: cat };
    setState(next);
    run(next);
  }

  function pickGuests(g: number) {
    const next = { ...state, guests: g };
    setState(next);
    run(next);
  }

  const count = results?.length ?? 0;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-8">
      {/* Sticky search block. Bleeds to the viewport edges (-mx / px) so its
          background covers the full width while the content stays on the
          page's grid. Collapsed, the intro line goes and the heading moves
          beside the bar. */}
      <div
        className={`sticky top-[68px] z-30 -mx-5 bg-page px-5 transition-all duration-200 ${
          collapsed ? "pb-3 pt-3" : "pb-1 pt-0"
        }`}
      >
        <div className={collapsed ? "flex items-center gap-4" : ""}>
          <div className={collapsed ? "shrink-0" : ""}>
            <h1
              className={`font-bold text-ink transition-[font-size] duration-200 ${
                collapsed ? "hidden whitespace-nowrap text-[18px] sm:block" : "text-[26px]"
              }`}
            >
              Search villas
            </h1>
            {/* Dropped entirely when collapsed — it's the line that makes room
                for the bar to sit beside the heading. */}
            {!collapsed && (
              <p className="mt-1 text-[14px] text-muted">
                Find your next stay from villas listed around the world.
              </p>
            )}
          </div>

          {/* Search bar */}
          <form
            onSubmit={submitSearch}
            className={`flex gap-3 rounded-2xl border border-line bg-white sm:flex-row sm:items-center ${
              collapsed ? "min-w-0 flex-1 flex-row items-center p-2" : "mt-6 flex-col p-3"
            }`}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line px-4 py-2.5">
              <MapPin size={18} className="shrink-0 text-primary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search by city, country or villa name"
                placeholder="Search by city, country or villa name"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
              />
            </div>

            <div
              className={`relative items-center gap-2 rounded-xl border border-line px-4 py-2.5 sm:w-[170px] ${
                collapsed ? "hidden sm:flex" : "flex"
              }`}
            >
              <CircleUserRound size={18} className="shrink-0 text-primary" />
              <select
                value={state.guests}
                onChange={(e) => pickGuests(parseInt(e.target.value, 10))}
                aria-label="Number of guests"
                className="w-full appearance-none bg-transparent text-[14px] text-ink outline-none"
              >
                {GUEST_OPTIONS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className={`flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-medium text-white transition-colors hover:bg-primary-dark ${
                collapsed ? "px-5 py-2.5" : "px-8 py-3"
              }`}
            >
              {loading ? <span className="spinner" aria-hidden /> : <SearchIcon size={17} />}
              <span className={collapsed ? "hidden sm:inline" : ""}>Search</span>
            </button>
          </form>
        </div>

        {/* Category chips — part of the sticky block, tightened when collapsed
            so the filters stay reachable without eating the viewport. */}
        <div
          className={`flex flex-wrap gap-2 transition-all duration-200 ${
            collapsed ? "mt-3" : "mt-5"
          }`}
        >
          {CATEGORIES.map((cat) => {
            const active = state.category === cat;
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={active}
                onClick={() => pickCategory(cat)}
                className={`rounded-full border transition-all duration-200 ${
                  collapsed ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"
                } ${
                  active
                    ? "border-primary bg-primary text-white"
                    : "border-line text-body hover:border-primary/40"
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results — held at a minimum height so the footer doesn't jump. */}
      <div className="mt-8 min-h-[420px] space-y-4">
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={() => run(state)}
              className="rounded-full border border-line px-4 py-1.5 text-[13px] text-body transition-colors hover:border-primary/40"
            >
              Try again
            </button>
          </div>
        )}

        {results === null ? (
          /* Only the first load has nothing to keep on screen. */
          error ? null : (
            <p className="py-16 text-center text-[14px] text-muted">Searching…</p>
          )
        ) : count === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-[16px] font-semibold text-ink">No villas found</p>
            <p className="mt-1 text-[14px] text-muted">
              Try a different location, category or guest count.
            </p>
          </div>
        ) : (
          /* Previous results stay mounted while a new search runs, just dimmed. */
          <div
            aria-busy={loading}
            className={`transition-opacity ${loading ? "opacity-60" : ""}`}
          >
            <p className="mb-4 text-[14px] text-muted">
              {count} villa{count === 1 ? "" : "s"} found
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((v) => (
                <VillaCard key={v.id} data={toCard(v)} variant="card" />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
