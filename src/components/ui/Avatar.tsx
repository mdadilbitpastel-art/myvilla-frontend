"use client";

import { UserRound } from "lucide-react";
import Img from "./Img";

/**
 * A user's profile picture, or a neutral placeholder when they have none.
 *
 * The placeholder is deliberately a plain silhouette rather than a stock
 * photo: a new account should *look* like it still needs a picture, not like
 * it already has one.
 */
export default function Avatar({
  src,
  name,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name?: string;
  /** Rendered box in px — the component is always a circle. */
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };

  if (!src) {
    return (
      <span
        role="img"
        aria-label={name ? `${name} — no profile picture` : "No profile picture"}
        style={box}
        className={`flex shrink-0 items-center justify-center rounded-full bg-page text-muted ${className}`}
      >
        <UserRound size={Math.round(size * 0.5)} strokeWidth={1.5} aria-hidden />
      </span>
    );
  }

  return (
    <span style={box} className={`block shrink-0 overflow-hidden rounded-full bg-page ${className}`}>
      <Img src={src} alt={name || "Profile picture"} className="h-full w-full object-cover" />
    </span>
  );
}
