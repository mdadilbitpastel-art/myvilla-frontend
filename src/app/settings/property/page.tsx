"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Star, X, Pencil, Eye, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import Img from "@/components/ui/Img";
import { fetchMyVillas, deleteVilla, type Villa } from "@/lib/api";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

// A row shape derived from the user's real villas.
type Row = {
  id: string; // enables View / Edit / Remove
  title: string;
  image: string;
  city: string;
  country: string;
  price: number;
  rating: number | null;
  reviews: number;
  posted: string;
  // Live booking status, the same answer a guest browsing today gets: "" when
  // the villa is free right now, otherwise why it isn't.
  unavailable: string;
  rooms: string;
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
    title: v.title,
    image: v.coverImage || PLACEHOLDER_IMG,
    city: v.city || v.title,
    country: v.country || "",
    price: v.pricePerNight,
    // The backend doesn't expose a rating yet, so every listing shows "New".
    // Kept as `number | null` so the rated branch works once it does.
    rating: null,
    reviews: 0,
    posted: timeAgo(v.createdAt),
    unavailable: v.isAvailable ? "" : v.unavailableReason || "Booked",
    rooms: [
      `${v.bedrooms} room${v.bedrooms === 1 ? "" : "s"}`,
      v.singleBedRooms
        ? `${v.singleBedRooms} single bed${v.singleBedRooms === 1 ? "" : "s"}`
        : "",
      v.doubleBedRooms
        ? `${v.doubleBedRooms} double bed${v.doubleBedRooms === 1 ? "" : "s"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export default function MyPropertyPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [villas, setVillas] = useState<Villa[] | null>(null);
  // A failed load is not the same thing as "you have no listings".
  const [loadError, setLoadError] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Delete a villa the user owns, after confirming. On success drop it from the
  // list; the villa's images are removed server-side too.
  async function handleRemove(id: string, label: string) {
    if (removingId) return;
    const ok = await confirm({
      title: "Remove this property?",
      message: `"${label}" will be permanently deleted, along with its photos. This can't be undone.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setRemovingId(id);
    try {
      await deleteVilla(id);
      setVillas((prev) => (prev ? prev.filter((v) => v.id !== id) : prev));
      toast.success("Property removed.");
    } catch {
      setBanner({ kind: "error", text: "Could not remove the property. Please try again." });
    } finally {
      setRemovingId(null);
    }
  }

  // One-time toast after publishing (?added=1) or editing (?updated=1).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("added") === "1") {
      toast.success("Your villa has been published successfully.");
    } else if (params.get("updated") === "1") {
      toast.success("Your villa has been updated successfully.");
    }
    if (params.has("added") || params.has("updated")) {
      // Clean the URL so a refresh doesn't re-show the toast.
      window.history.replaceState({}, "", "/settings/property");
    }
    // Runs once on mount — `toast` is stable, and re-running would double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the user's real villas from the backend.
  const load = useCallback(() => {
    fetchMyVillas()
      .then(setVillas)
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Could not load your properties.")
      );
  }, []);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  function retryLoad() {
    setLoadError("");
    setVillas(null);
    load();
  }

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

  // Only the user's real villas — no dummy fallback. `null` = still loading.
  const rows: Row[] | null = villas ? villas.map(villaToRow) : null;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-9 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — property owned card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {banner && (
            <div
              role={banner.kind === "error" ? "alert" : "status"}
              className={`mb-5 flex items-start justify-between gap-3 rounded-lg px-3.5 py-2.5 text-[13px] font-medium ${
                banner.kind === "error"
                  ? "bg-red-50 text-red-600"
                  : "bg-primary/5 text-primary"
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                aria-label="Dismiss message"
                className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          )}

          {/* Header — sticks flush against the pinned "Manage Account" bar
              (navbar + its collapsed height), NOT lower: any gap between the
              two becomes a slot the scrolling list is visible through. The
              16px that keeps it level with the sidebar's first item is pt-4
              INSIDE the bar, so its white background covers that band instead
              of leaving it open. */}
          <div className="sticky top-[135px] z-20 -mx-6 flex items-center justify-between rounded-t-2xl border-b border-line bg-white px-6 pb-3 pt-4 sm:-mx-8 sm:px-8">
            <h2 className="text-[16px] font-bold text-ink">Property Owned</h2>
            <Link
              href="/settings/property/add"
              className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
            >
              Add Property
            </Link>
          </div>

          {/* Property list */}
          {loadError ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-14 text-center">
              <p className="text-[15px] font-semibold text-ink">
                Couldn&apos;t load your properties
              </p>
              <p className="mt-1 max-w-[320px] text-[13px] text-muted">{loadError}</p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Try again
              </button>
            </div>
          ) : rows === null ? (
            <div className="mt-6 space-y-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="skeleton h-[130px] rounded-xl" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-14 text-center">
              <p className="text-[15px] font-semibold text-ink">
                No properties yet
              </p>
              {/* No call to action here on purpose — "Add Property" already
                  sits in the header right above this panel. */}
              <p className="mt-1 max-w-[320px] text-[13px] text-muted">
                You haven&apos;t listed any villa. Use “Add Property” above to
                list your first one and start hosting.
              </p>
            </div>
          ) : (
          <div className="mt-6 space-y-4">
            {rows.map((p) => {
              const label = `${p.city}${p.country ? ", " + p.country : ""}`;
              return (
              <div
                key={p.id}
                className="flex gap-5 rounded-xl border border-line/70 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                {/* Thumbnail — <Img> rather than next/image so uploaded villa
                    photos (served from the backend/Cloudinary) render directly,
                    without remotePatterns/dev-restart getting in the way. */}
                {/* Square, and stretched to the row's full height so its bottom
                    edge lines up with the status pills and action links
                    opposite it rather than stopping short. */}
                <div className="img-frame relative aspect-square w-[132px] shrink-0 self-stretch overflow-hidden rounded-lg bg-page">
                  <Img
                    src={p.image}
                    alt={`${p.city}, ${p.country}`}
                    fallback={PLACEHOLDER_IMG}
                    className="h-full w-full object-cover"
                  />
                </div>

                {/* Details */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold text-ink" title={p.title}>
                        {p.title}
                      </p>
                      <p className="mt-0.5 truncate text-[13px] text-body">
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
                      <p className="mt-0.5 text-[12px] text-muted">{p.rooms}</p>
                    </div>
                    {/* Rating sits at the top of the card, opposite the title —
                        where a listing normally carries it. */}
                    <span className="flex shrink-0 items-center gap-1 text-[13px]">
                      <Star size={13} className="fill-star text-star" aria-hidden />
                      {p.rating !== null ? (
                        <>
                          <span className="font-semibold text-ink">{p.rating}</span>
                          <span className="text-muted">({p.reviews})</span>
                        </>
                      ) : (
                        <span className="text-muted">New</span>
                      )}
                    </span>
                  </div>

                  {/* Bottom row: posted pill + remove */}
                  <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
                        {p.posted}
                      </span>
                      {/* Booking status, so a host sees at a glance which of
                          their villas is occupied and until when. */}
                      <span
                        className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                          p.unavailable
                            ? "bg-red-50 text-red-600"
                            : "bg-green-50 text-green-700"
                        }`}
                      >
                        {p.unavailable || "Available"}
                      </span>
                    </div>
                    {/* Icon buttons. Three text links on every row read as a
                        paragraph of controls; the icons are the conventional
                        ones for these actions, and each keeps its name for
                        screen readers and as a hover tooltip. */}
                    <div className="flex shrink-0 items-center gap-1">
                      <Link
                        href={`/settings/property/add?edit=${p.id}`}
                        aria-label={`Edit ${label}`}
                        title="Edit"
                        className="rounded-lg p-2 text-ink transition-colors hover:bg-page hover:text-primary"
                      >
                        <Pencil size={17} aria-hidden />
                      </Link>
                      <Link
                        href={`/villa/${p.id}`}
                        aria-label={`View ${label}`}
                        title="View"
                        className="rounded-lg p-2 text-ink transition-colors hover:bg-page hover:text-primary"
                      >
                        <Eye size={17} aria-hidden />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleRemove(p.id, label)}
                        disabled={removingId === p.id}
                        aria-busy={removingId === p.id}
                        aria-label={`Remove ${label}`}
                        title="Remove"
                        className="rounded-lg p-2 text-red-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                      >
                        {removingId === p.id ? (
                          <span className="spinner block" aria-hidden />
                        ) : (
                          <Trash2 size={17} aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
