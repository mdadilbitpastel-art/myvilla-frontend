"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import type { VillaCardData } from "@/lib/home";
import { useFavorites } from "@/lib/favorites";
import Img from "@/components/ui/Img";

export default function VillaCard({
  data,
  variant = "overlay",
}: {
  data: VillaCardData;
  variant?: "overlay" | "card";
}) {
  const { isSaved, toggle } = useFavorites();
  const liked = data.id ? isSaved(data.id) : false;

  const isCard = variant === "card";
  const unavailable = data.unavailable;

  const location = [data.city, data.country].filter(Boolean);
  // Never produce a dangling ", " when one half of the location is missing.
  const label = data.title || location.join(", ") || "Villa";

  const meta = data.title ? (
    // Title-first layout (used by search results): villa name is the heading.
    <>
      <p className="truncate text-[14px] font-semibold text-ink">{data.title}</p>
      {/* Always a line, even with no location — otherwise the price row sits
          higher on some cards than on their neighbours. */}
      <p className="mt-0.5 truncate text-[12px] text-muted">
        {location.length > 0 ? location.join(", ") : " "}
      </p>
      <div className="mt-1.5 flex items-center justify-between text-[12px] text-muted">
        <span>{data.distance}</span>
        <span className="font-semibold text-ink">${data.price}/night</span>
      </div>
    </>
  ) : (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-[14px] font-semibold ${isCard ? "text-ink" : ""}`}>
          {data.city}, <span className="text-primary">{data.country}</span>
        </p>
        <p className={`shrink-0 text-[13px] font-medium ${isCard ? "text-muted" : ""}`}>
          ${data.price}/night
        </p>
      </div>
      <div
        className={`mt-0.5 flex items-center justify-between text-[12px] ${
          isCard ? "text-muted" : "opacity-80"
        }`}
      >
        <span>{data.distance}</span>
        <span>{data.dates}</span>
      </div>
    </>
  );

  return (
    <Link
      href={data.id ? `/villa/${data.id}` : "/villa"}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
    >
      {/* Unavailable villas stay on the page — a guest who searched by name
          should find their villa and be told why they can't book it, not be
          shown an empty result. The photo dims; the text stays legible. */}
      {unavailable && (
        <span className="absolute left-3 top-3 z-10 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
          Not available
        </span>
      )}

      {/* Like button */}
      <button
        type="button"
        aria-label={liked ? `Remove ${label} from saved` : `Save ${label}`}
        aria-pressed={liked}
        onClick={(e) => {
          // Don't let the tap fall through to the card's <Link>.
          e.preventDefault();
          e.stopPropagation();
          if (data.id) toggle(data.id);
        }}
        className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow transition-transform hover:scale-110 active:scale-95"
      >
        <Heart
          size={16}
          className={liked ? "fill-red-500 text-red-500" : "text-muted"}
        />
      </button>

      {variant === "overlay" ? (
        <div className="img-frame relative aspect-[4/5]">
          <Img
            src={data.image}
            alt={label}
            className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
              unavailable ? "opacity-45 grayscale" : ""
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-4 text-white">{meta}</div>
        </div>
      ) : (
        <>
          {/* The photo keeps its ratio; only the text block below absorbs the
              height difference, so a row of cards lines up exactly. */}
          <div className="img-frame relative aspect-[4/3] shrink-0">
            <Img
              src={data.image}
              alt={label}
              className={`absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
                unavailable ? "opacity-45 grayscale" : ""
              }`}
            />
          </div>
          <div className="flex flex-1 flex-col p-4 text-ink">
            {meta}
            {unavailable && (
              <p className="mt-2 text-[12px] font-medium text-red-600">{unavailable}</p>
            )}
          </div>
        </>
      )}
    </Link>
  );
}
