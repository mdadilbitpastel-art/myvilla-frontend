"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Star, Share, Heart, Check, Pencil } from "lucide-react";
import { useFavorites } from "@/lib/favorites";

/** One round, bordered button — the shared shape of the three actions. */
const iconBtn =
  "flex items-center justify-center rounded-full border border-line bg-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0";

export default function PropertyHeader({
  title,
  rating,
  reviewsCount,
  villaId,
  isOwner = false,
  compact = false,
}: {
  title: string;
  rating: number;
  reviewsCount: number;
  villaId?: string;
  /**
   * Whether the signed-in viewer owns this villa — as answered by the server
   * (VillaType.isOwner), not by comparing ids in the browser. The edit page
   * and every villa mutation re-check ownership regardless, so this only
   * decides whether the shortcut is worth showing.
   */
  isOwner?: boolean;
  /** Collapsed form used while the page header is stuck to the navbar. */
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { isSaved, toggle } = useFavorites();
  const saved = villaId ? isSaved(villaId) : false;
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Navigating away mid-toast would otherwise set state after unmount.
  useEffect(() => () => clearTimeout(copyTimer.current), []);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 1800);
    } catch {
      /* user cancelled share / clipboard blocked — no-op */
    }
  }

  return (
    <div
      className={`flex transition-all duration-200 ${
        compact
          ? "mb-0 flex-row items-center justify-between gap-4"
          : "mb-6 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      }`}
    >
      <div className={compact ? "flex min-w-0 items-center gap-3" : ""}>
        <h1
          className={`font-bold leading-tight text-ink transition-all duration-200 ${
            compact ? "truncate text-[18px]" : "text-[26px] sm:text-[28px]"
          }`}
        >
          {title}
        </h1>
        <div
          className={`flex shrink-0 items-center gap-3 ${
            compact ? "text-[13px]" : "mt-2 text-[15px]"
          }`}
        >
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Star size={compact ? 15 : 18} className="fill-star text-star" />
            {rating}
          </span>
          <span className="text-muted">·</span>
          {/* "Reviews" is the first thing to go when space is tight. */}
          <span className="whitespace-nowrap text-ink">
            {reviewsCount}
            {compact ? "" : " Reviews"}
          </span>
        </div>
      </div>

      {/* Icon-only actions: three round buttons, each labelled for screen
          readers and with a native tooltip on hover. The words were competing
          with the villa's own title for the eye. */}
      <div className={`flex shrink-0 items-center ${compact ? "gap-1.5" : "gap-2"}`}>
        {isOwner && villaId && (
          <Link
            href={`/settings/property/add?edit=${villaId}`}
            aria-label="Edit this villa"
            title="Edit this villa"
            className={`${iconBtn} text-primary hover:border-primary hover:bg-primary/5 ${
              compact ? "h-9 w-9" : "h-10 w-10"
            }`}
          >
            <Pencil size={compact ? 16 : 18} strokeWidth={2} aria-hidden />
          </Link>
        )}
        <button
          type="button"
          onClick={onShare}
          aria-label={copied ? "Link copied" : "Share this villa"}
          title={copied ? "Link copied" : "Share this villa"}
          className={`${iconBtn} text-ink hover:border-primary hover:text-primary ${
            compact ? "h-9 w-9" : "h-10 w-10"
          }`}
        >
          {copied ? (
            <Check size={compact ? 16 : 18} strokeWidth={2} aria-hidden className="text-primary" />
          ) : (
            <Share size={compact ? 16 : 18} strokeWidth={2} aria-hidden />
          )}
          {/* Announced without taking any room in the row. */}
          {copied && <span role="status" className="sr-only">Link copied</span>}
        </button>
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save this villa"}
          title={saved ? "Remove from saved" : "Save this villa"}
          onClick={() => villaId && toggle(villaId)}
          className={`${iconBtn} text-ink hover:border-red-300 hover:text-red-500 ${
            compact ? "h-9 w-9" : "h-10 w-10"
          }`}
        >
          <Heart
            size={compact ? 16 : 18}
            strokeWidth={2}
            aria-hidden
            className={saved ? "fill-red-500 text-red-500" : ""}
          />
        </button>
      </div>
    </div>
  );
}
