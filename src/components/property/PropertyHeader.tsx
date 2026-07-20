"use client";

import { useEffect, useRef, useState } from "react";
import { Star, Share, Heart, Check } from "lucide-react";
import { useFavorites } from "@/lib/favorites";

export default function PropertyHeader({
  title,
  rating,
  reviewsCount,
  villaId,
}: {
  title: string;
  rating: number;
  reviewsCount: number;
  villaId?: string;
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
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-ink sm:text-[28px]">
          {title}
        </h1>
        <div className="mt-2 flex items-center gap-3 text-[15px]">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Star size={18} className="fill-primary text-primary" />
            {rating}
          </span>
          <span className="text-muted">·</span>
          <span className="text-ink">{reviewsCount} Reviews</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={onShare}
          className="flex items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-primary"
        >
          {copied ? (
            <Check size={18} strokeWidth={2} aria-hidden className="text-primary" />
          ) : (
            <Share size={18} strokeWidth={2} aria-hidden />
          )}
          <span role={copied ? "status" : undefined}>
            {copied ? "Link copied" : "Share"}
          </span>
        </button>
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => villaId && toggle(villaId)}
          className="flex items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-primary"
        >
          <Heart
            size={18}
            strokeWidth={2}
            aria-hidden
            className={saved ? "fill-red-500 text-red-500" : ""}
          />
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
