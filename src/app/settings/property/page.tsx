"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { ownedProperties } from "@/lib/myProperty";
import { fetchMyVillas, type Villa } from "@/lib/api";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

// A row shape shared by real villas and the mock placeholder list.
type Row = {
  id?: string; // present for real villas (enables Edit); absent for mock rows
  image: string;
  city: string;
  country: string;
  price: number;
  rating: number | null;
  reviews: number;
  posted: string;
};

// "3 weeks ago" style relative time from an ISO string.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Just now";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = secs;
  let unit = "second";
  for (const [size, name] of units) {
    if (value < size) { unit = name; break; }
    value = Math.floor(value / size);
    unit = name;
  }
  if (unit === "second" && value < 30) return "Just now";
  const rounded = Math.max(1, value);
  return `Posted ${rounded} ${unit}${rounded > 1 ? "s" : ""} ago`;
}

function villaToRow(v: Villa): Row {
  return {
    id: v.id,
    image: v.coverImage || PLACEHOLDER_IMG,
    city: v.city || v.title,
    country: v.country || "",
    price: v.pricePerNight,
    rating: null, // brand-new listing → no reviews yet
    reviews: 0,
    posted: timeAgo(v.createdAt),
  };
}

export default function MyPropertyPage() {
  const { user, ready } = useAuth();
  const [villas, setVillas] = useState<Villa[] | null>(null);
  const [banner, setBanner] = useState("");

  // One-time success banner after publishing (?added=1) or editing (?updated=1).
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("added") === "1") {
        setBanner("🎉 Your villa has been published successfully.");
      } else if (params.get("updated") === "1") {
        setBanner("✅ Your villa has been updated successfully.");
      }
      if (params.has("added") || params.has("updated")) {
        // Clean the URL so a refresh doesn't re-show the banner.
        window.history.replaceState({}, "", "/settings/property");
      }
    }
  }, []);

  // Load the user's real villas from the backend.
  useEffect(() => {
    if (ready && user) {
      fetchMyVillas()
        .then(setVillas)
        .catch(() => setVillas([]));
    }
  }, [ready, user]);

  // Guard: only signed-in users can view their properties.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your properties.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // Real villas if the user has any; otherwise the mock placeholder list keeps
  // the page looking populated (matching the original design).
  const rows: Row[] =
    villas && villas.length > 0 ? villas.map(villaToRow) : ownedProperties;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar active="My Property" />
        </aside>

        {/* Right — property owned card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {banner && (
            <p className="mb-5 rounded-lg bg-primary/5 px-3.5 py-2.5 text-[13px] font-medium text-primary">
              {banner}
            </p>
          )}

          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">Property Owned</h2>
            <Link
              href="/settings/property/add"
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Add Property
            </Link>
          </div>

          {/* Property list */}
          <div className="mt-6 space-y-4">
            {rows.map((p, i) => (
              <div
                key={i}
                className="flex gap-5 rounded-xl border border-line/70 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                {/* Thumbnail — plain <img> so uploaded villa photos (served from
                    the backend/Cloudinary) render directly, without the next/image
                    optimizer or remotePatterns/dev-restart getting in the way. */}
                <div className="relative h-[104px] w-[112px] shrink-0 overflow-hidden rounded-lg bg-page">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.image}
                    alt={`${p.city}, ${p.country}`}
                    className="h-full w-full object-cover"
                  />
                </div>

                {/* Details */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[14px] font-bold text-ink">
                        {p.city}
                        {p.country && (
                          <>
                            ,{" "}
                            <span className="text-primary">{p.country}</span>
                          </>
                        )}
                      </p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        ${p.price}/night
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        <Star size={12} className="fill-primary text-primary" />
                        <span className="text-[11px] text-body">
                          {p.rating !== null ? (
                            <>
                              {p.rating}{" "}
                              <span className="text-muted">({p.reviews})</span>
                            </>
                          ) : (
                            <span className="text-muted">New</span>
                          )}
                        </span>
                      </div>
                    </div>
                    {p.id ? (
                      <Link
                        href={`/settings/property/add?edit=${p.id}`}
                        className="shrink-0 text-[13px] font-semibold text-ink underline underline-offset-2 hover:text-primary"
                      >
                        Edit
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className="shrink-0 text-[13px] font-semibold text-ink underline underline-offset-2"
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {/* Bottom row: posted pill + remove */}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    <span className="rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                      {p.posted}
                    </span>
                    <button
                      type="button"
                      className="shrink-0 text-[13px] font-semibold text-red-400 underline underline-offset-2 transition-colors hover:text-red-500"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
