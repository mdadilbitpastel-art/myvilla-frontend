"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPin, CircleUserRound, Search as SearchIcon, CalendarCheck } from "lucide-react";
import VillaCard from "@/components/home/VillaCard";
import DateField from "@/components/ui/DateField";
import { useCollapseOnScroll } from "@/lib/useCollapseOnScroll";
import { useStickyRelease } from "@/lib/useStickyRelease";
import {
  SEARCH_CATEGORIES,
  ALL_CATEGORY,
  OTHERS_CATEGORY,
  PROPERTY_TYPES,
  matchesCategories,
} from "@/lib/categories";
import { searchVillas, type Villa, type VillaFilters } from "@/lib/api";
import type { VillaCardData } from "@/lib/home";

/** Tailwind `gap-6` between result rows, needed to measure one row's height. */
const GRID_GAP = 24;

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
    dates: `${v.bedrooms} BR · sleeps ${v.guests}`,
    unavailable: v.isAvailable ? undefined : v.unavailableReason || "Not available",
  };
}

// `?category=Hotel,Bungalow` → the chips to light up. Unknown names are
// dropped rather than shown as a filter nothing can match.
function parseCategories(raw: string | null): string[] {
  const picked = (raw || "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => SEARCH_CATEGORIES.includes(c) && c !== ALL_CATEGORY);
  if (!picked.length) return [ALL_CATEGORY];
  // The exclusive chip wins if a hand-written URL mixes it with types.
  return picked.includes(OTHERS_CATEGORY) ? [OTHERS_CATEGORY] : picked;
}

// Today as a local YYYY-MM-DD (toISOString would shift it a day in some zones).
function todayStr(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type State = {
  q: string;
  guests: number;
  /**
   * Any mix of the property-type chips, or exactly one of the two exclusive
   * ones ("All" / "Others"). Never empty — clearing the last type falls back
   * to "All".
   */
  categories: string[];
  // The nights being asked about. They don't remove villas from the results —
  // they decide which come back marked "Not available".
  checkIn: string;
  checkOut: string;
  /** Hide the listings that came back marked unavailable. */
  availableOnly: boolean;
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
    categories: parseCategories(searchParams.get("category")),
    // Carried straight over from the landing page's hero search.
    checkIn: searchParams.get("checkIn") || "",
    checkOut: searchParams.get("checkOut") || "",
    availableOnly: searchParams.get("available") === "1",
  });

  const [state, setState] = useState<State>(initial.current);
  // The text field is separate so typing doesn't fire a query on every keystroke.
  const [query, setQuery] = useState(initial.current.q);
  const [results, setResults] = useState<Villa[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // True once the page is scrolled and the search block is stuck to the navbar.
  //
  // Anchored, not gesture-based: once collapsed (160px down) it stays that way
  // until an upward scroll carries the page back above the point it collapsed
  // at, rather than the moment the user nudges upward from anywhere on the
  // page. `Infinity` disables the scroll-up-by-N shortcut entirely; the 12px
  // between the two thresholds keeps jitter on the line from toggling it.
  const collapsed = useCollapseOnScroll(160, 148, Infinity, 0);
  // The filter block lets go of the navbar once only the last row of results
  // is left, so those cards scroll in the clear (see the hook).
  const {
    wrapRef: stickyWrapRef,
    gridRef,
    style: wrapStyle,
  } = useStickyRelease(results, GRID_GAP);
  // Only the newest request may commit; chips/guests can be changed faster
  // than the network responds.
  const seq = useRef(0);


  // Reflect the search in the URL so it can be shared / bookmarked.
  const syncUrl = useCallback((s: State) => {
    const sp = new URLSearchParams();
    if (s.q) sp.set("q", s.q);
    if (s.guests) sp.set("guests", String(s.guests));
    if (!s.categories.includes(ALL_CATEGORY)) sp.set("category", s.categories.join(","));
    if (s.checkIn) sp.set("checkIn", s.checkIn);
    if (s.checkOut) sp.set("checkOut", s.checkOut);
    if (s.availableOnly) sp.set("available", "1");
    const qs = sp.toString();
    window.history.replaceState(null, "", qs ? `/search?${qs}` : "/search");
  }, []);

  const run = useCallback(
    (s: State) => {
    const id = ++seq.current;
    setLoading(true);
    setError("");
    // One known type can be filtered server-side. A combination — or "Others",
    // which is a category no listing literally stores — is narrowed here
    // instead, from the full result set.
    const only = s.categories.length === 1 ? s.categories[0] : "";
    const filters: VillaFilters = {
      search: s.q || undefined,
      category: (PROPERTY_TYPES as readonly string[]).includes(only) ? only : undefined,
      guests: s.guests || undefined,
      checkIn: s.checkIn || undefined,
      checkOut: s.checkOut || undefined,
      limit: 60,
    };
    syncUrl(s);

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
    },
    [syncUrl]
  );

  // Run the URL-seeded search once on mount (e.g. arriving from the Hero search).
  useEffect(() => {
    run(initial.current);
  }, [run]);


  // Search as the user types, once they pause. Matching is by substring on the
  // backend, so a half-typed word already narrows the list — waiting for the
  // Search button would hide that. The button still works, and `seq` in `run`
  // means a slow response can never overwrite a newer one.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const term = query.trim();
    if (term === state.q) return;
    const id = setTimeout(() => {
      const next = { ...state, q: term };
      setState(next);
      run(next);
    }, 400);
    return () => clearTimeout(id);
  }, [query, state, run]);


  function submitSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const next = { ...state, q: query.trim() };
    setState(next);
    run(next);
  }

  // "All" and "Others" stand alone; the property types combine freely, and
  // picking one of them drops whichever exclusive chip was on.
  function pickCategory(cat: string) {
    const cur = state.categories;
    let picked: string[];
    if (cat === ALL_CATEGORY) {
      picked = [ALL_CATEGORY];
    } else if (cat === OTHERS_CATEGORY) {
      picked = cur.includes(OTHERS_CATEGORY) ? [ALL_CATEGORY] : [OTHERS_CATEGORY];
    } else {
      const types = cur.filter((c) => c !== ALL_CATEGORY && c !== OTHERS_CATEGORY);
      picked = types.includes(cat) ? types.filter((c) => c !== cat) : [...types, cat];
      // Turning the last type off means "no filter", not "nothing matches".
      if (!picked.length) picked = [ALL_CATEGORY];
    }
    const next = { ...state, categories: picked };
    setState(next);
    run(next);
  }

  function pickGuests(g: number) {
    const next = { ...state, guests: g };
    setState(next);
    run(next);
  }

  function pickDate(which: "checkIn" | "checkOut", value: string) {
    const next = { ...state, [which]: value };
    // A check-out on or before the new check-in can't describe a stay.
    if (which === "checkIn" && next.checkOut && next.checkOut <= value) {
      next.checkOut = "";
    }
    setState(next);
    run(next);
  }

  // The availability filter is applied here rather than sent to the backend:
  // every result already carries the answer for the dates being asked about.
  function toggleAvailableOnly() {
    const next = { ...state, availableOnly: !state.availableOnly };
    setState(next);
    syncUrl(next);
  }

  // Category narrowing runs on every result, whether or not the backend also
  // filtered — one pass that covers single, multi and "Others" alike.
  const matched =
    results?.filter((v) => matchesCategories(v.propertyType, state.categories)) ?? null;
  const availableCount = matched?.filter((v) => v.isAvailable).length ?? 0;
  const shown = matched && state.availableOnly ? matched.filter((v) => v.isAvailable) : matched;
  const count = shown?.length ?? 0;

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-8">
      <div
        ref={stickyWrapRef}
        className="relative"
        style={wrapStyle}
      >
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

            {/* Dates. Optional — leave them off and availability is answered
                for tonight; fill them in and it's answered for that stay. */}
            <DateField
              label="Check in"
              value={state.checkIn}
              min={todayStr()}
              onChange={(v) => pickDate("checkIn", v)}
              className={`sm:w-[165px] ${collapsed ? "hidden lg:flex" : "flex"}`}
            />
            <DateField
              label="Check out"
              value={state.checkOut}
              min={state.checkIn || todayStr()}
              onChange={(v) => pickDate("checkOut", v)}
              className={`sm:w-[165px] ${collapsed ? "hidden lg:flex" : "flex"}`}
            />

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
          {SEARCH_CATEGORIES.map((cat) => {
            const active = state.categories.includes(cat);
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

          {/* Availability — separated from the type chips, since it filters on
              the dates above rather than on what kind of place it is. */}
          <span className="mx-1 w-px self-stretch bg-line" aria-hidden />
          <button
            type="button"
            aria-pressed={state.availableOnly}
            onClick={toggleAvailableOnly}
            className={`flex items-center gap-1.5 rounded-full border transition-all duration-200 ${
              collapsed ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[13px]"
            } ${
              state.availableOnly
                ? "border-primary bg-primary text-white"
                : "border-line text-body hover:border-primary/40"
            }`}
          >
            <CalendarCheck size={collapsed ? 13 : 15} aria-hidden />
            Available only
          </button>
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

        {shown === null ? (
          /* Only the first load has nothing to keep on screen. */
          error ? null : (
            <p className="py-16 text-center text-[14px] text-muted">Searching…</p>
          )
        ) : count === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <p className="text-[16px] font-semibold text-ink">No villas found</p>
            <p className="mt-1 text-[14px] text-muted">
              {state.availableOnly && (matched?.length ?? 0) > 0
                ? "None of the matches are free for these dates. Try other dates, or turn off “Available only”."
                : "Try a different location, category or guest count."}
            </p>
          </div>
        ) : (
          /* Previous results stay mounted while a new search runs, just dimmed. */
          <div
            aria-busy={loading}
            className={`transition-opacity ${loading ? "opacity-60" : ""}`}
          >
            <p className="mb-4 text-[14px] text-muted">
              {count} villa{count === 1 ? "" : "s"}{" "}
              {state.availableOnly ? "available" : "found"}
              {!state.availableOnly && availableCount < count && (
                <>
                  {" — "}
                  <span className="font-medium text-ink">
                    {availableCount} available
                  </span>
                  {state.checkIn && state.checkOut
                    ? " for these dates"
                    : " right now"}
                </>
              )}
            </p>
            <div
              ref={gridRef}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            >
              {shown.map((v) => (
                <VillaCard key={v.id} data={toCard(v)} variant="card" />
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
