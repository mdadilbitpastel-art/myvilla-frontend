"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { useFavorites } from "@/lib/favorites";
import VillaCard from "@/components/home/VillaCard";
import { fetchMyFavorites, type Villa } from "@/lib/api";
import type { VillaCardData } from "@/lib/home";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

function villaToCard(v: Villa): VillaCardData {
  return {
    id: v.id,
    image: v.photos[0]?.url || v.coverImage || FALLBACK_IMG,
    city: v.city || v.title,
    country: v.country || v.propertyType || "",
    price: v.pricePerNight,
    distance: v.propertyType || "Villa",
    dates: `${v.bedrooms} BR · ${v.guests} guests`,
    title: v.title,
  };
}

export default function SavedPage() {
  const { user, ready } = useAuth();
  // Re-render when the saved set changes (e.g. user un-saves from a card here).
  const { ids, ready: favoritesReady } = useFavorites();
  const [villas, setVillas] = useState<Villa[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setVillas(null);
    fetchMyFavorites()
      .then(setVillas)
      // An empty wishlist and a failed request are different things to say.
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">Please sign in to view your saved villas.</p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // Show only villas that are still in the saved set (so un-saving hides them live).
  const shown = (villas ?? []).filter((v) => ids.has(String(v.id)));
  // Both sources feed `shown`; claiming "no saved villas" before either has
  // settled flashes a wrong empty state.
  const loading = !failed && (villas === null || !favoritesReady);
  const gridClass = "mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3 lg:grid-cols-4";

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-10 lg:px-7">
      <h1 className="text-[26px] font-bold text-ink">Saved Villas</h1>
      <p className="mt-1 text-[14px] text-muted">Villas you&apos;ve added to your wishlist.</p>

      {loading ? (
        /* Placeholders sit in the real grid so nothing shifts when data lands. */
        <div className={gridClass}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="skeleton aspect-[4/3] rounded-none" />
              <div className="p-4">
                <div className="skeleton h-[14px] w-3/4" />
                <div className="skeleton mt-2 h-[12px] w-1/2" />
                <div className="skeleton mt-2.5 h-[12px] w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : failed ? (
        <div
          role="alert"
          className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-16 text-center"
        >
          <p className="text-[15px] font-semibold text-ink">Couldn&apos;t load your wishlist</p>
          <p className="mt-1 max-w-[340px] text-[13px] text-muted">
            Something went wrong on the way. Your saved villas are still there.
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Try again
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-16 text-center">
          <p className="text-[15px] font-semibold text-ink">No saved villas yet</p>
          <p className="mt-1 max-w-[340px] text-[13px] text-muted">
            Tap the heart on any villa to save it here for later.
          </p>
          <Link
            href="/search"
            className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Browse villas
          </Link>
        </div>
      ) : (
        <div className={gridClass}>
          {shown.map((v) => (
            <VillaCard key={v.id} data={villaToCard(v)} variant="card" />
          ))}
        </div>
      )}
    </div>
  );
}
