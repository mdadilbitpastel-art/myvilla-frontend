"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, CircleUserRound, Search as SearchIcon } from "lucide-react";
import VillaCard from "@/components/home/VillaCard";
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

function readUrl(): State {
  if (typeof window === "undefined") return { q: "", guests: 0, category: "All" };
  const sp = new URLSearchParams(window.location.search);
  return {
    q: sp.get("q") || sp.get("location") || "",
    guests: parseInt(sp.get("guests") || "0", 10) || 0,
    category: sp.get("category") || "All",
  };
}

export default function SearchPage() {
  const [state, setState] = useState<State>({ q: "", guests: 0, category: "All" });
  // The text field is separate so typing doesn't fire a query on every keystroke.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Villa[] | null>(null);
  const [error, setError] = useState("");

  const run = useCallback((s: State) => {
    setResults(null);
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
      .then(setResults)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Search failed. Try again.")
      );
  }, []);

  // On mount, hydrate from the URL (e.g. arriving from the Hero search).
  useEffect(() => {
    const initial = readUrl();
    setState(initial);
    setQuery(initial.q);
    run(initial);
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
      <h1 className="text-[26px] font-bold text-ink">Search villas</h1>
      <p className="mt-1 text-[14px] text-muted">
        Find your next stay from villas listed around the world.
      </p>

      {/* Search bar */}
      <form
        onSubmit={submitSearch}
        className="mt-6 flex flex-col gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm sm:flex-row sm:items-center"
      >
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-line px-4 py-2.5">
          <MapPin size={18} className="shrink-0 text-primary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by city, country or villa name"
            className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
          />
        </div>

        <div className="relative flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 sm:w-[170px]">
          <CircleUserRound size={18} className="shrink-0 text-primary" />
          <select
            value={state.guests}
            onChange={(e) => pickGuests(parseInt(e.target.value, 10))}
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
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 text-[15px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <SearchIcon size={17} />
          Search
        </button>
      </form>

      {/* Category chips */}
      <div className="mt-5 flex flex-wrap gap-2">
        {CATEGORIES.map((cat) => {
          const active = state.category === cat;
          return (
            <button
              key={cat}
              onClick={() => pickCategory(cat)}
              className={`rounded-full border px-4 py-1.5 text-[13px] transition-colors ${
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

      {/* Results */}
      <div className="mt-8">
        {error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600">
            {error}
          </div>
        ) : results === null ? (
          <p className="py-16 text-center text-[14px] text-muted">Searching…</p>
        ) : count === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-[16px] font-semibold text-ink">No villas found</p>
            <p className="mt-1 text-[14px] text-muted">
              Try a different location, category or guest count.
            </p>
          </div>
        ) : (
          <>
            <p className="mb-4 text-[14px] text-muted">
              {count} villa{count === 1 ? "" : "s"} found
            </p>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((v) => (
                <VillaCard key={v.id} data={toCard(v)} variant="card" />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
