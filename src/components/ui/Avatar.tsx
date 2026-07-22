"use client";

import { useState } from "react";

/**
 * A user's profile picture, or a drawn placeholder when they have none.
 *
 * Three things it has to get right:
 *   - A picture the user chose always wins, whatever the gender says.
 *   - A broken picture (a Google account whose photo URL 404s, say) must not
 *     leave a torn-page glyph on the page — it falls back to the placeholder.
 *   - The placeholder follows the gender on the profile: a neutral figure
 *     until one is chosen (and for "Others"), a male or female one after.
 */

type Kind = "neutral" | "male" | "female";

function kindFor(gender?: string | null): Kind {
  const g = (gender || "").trim().toLowerCase();
  if (g === "male") return "male";
  if (g === "female") return "female";
  return "neutral";
}

// Flat silhouettes on a 40×40 grid: a head and a pair of shoulders, with the
// hair line as the only thing that differs. Drawn inline so they cost no
// request and inherit the surrounding colour.
function Silhouette({ kind, size }: { kind: Kind; size: number }) {
  const tint =
    kind === "male" ? "#7c8cf8" : kind === "female" ? "#f08bb4" : "#9aa0ab";
  return (
    <svg
      viewBox="0 0 40 40"
      width={size}
      height={size}
      aria-hidden
      className="block"
    >
      <circle cx="20" cy="20" r="20" fill={`${tint}22`} />
      <g fill={tint}>
        {kind === "female" && (
          // Hair: falls behind the head and past the jaw on both sides.
          <path d="M20 7c-6 0-9.5 4-9.5 9.5 0 3 .6 5.4 1.3 7.2.4 1-.3 1.8-1 2.6h3.2c-1-2.3-1.5-5-1.5-7.6 0-1.3.3-2.4.9-3.2 2.3.9 5 1.3 6.6 1.3s4.3-.4 6.6-1.3c.6.8.9 1.9.9 3.2 0 2.6-.5 5.3-1.5 7.6h3.2c-.7-.8-1.4-1.6-1-2.6.7-1.8 1.3-4.2 1.3-7.2C29.5 11 26 7 20 7z" />
        )}
        {kind === "male" && (
          // Hair: a short, straight fringe sitting on top of the head.
          <path d="M20 7.5c-4.4 0-7.6 2.6-8.2 6.4-.1.7.5 1.2 1.1.9 2-1 4.4-1.5 7.1-1.5s5.1.5 7.1 1.5c.6.3 1.2-.2 1.1-.9-.6-3.8-3.8-6.4-8.2-6.4z" />
        )}
        {/* Head */}
        <circle cx="20" cy="17" r="6.2" />
        {/* Shoulders */}
        <path d="M20 25.4c-5.6 0-10.2 3.4-11.4 8.1a20 20 0 0 0 22.8 0c-1.2-4.7-5.8-8.1-11.4-8.1z" />
      </g>
    </svg>
  );
}

export default function Avatar({
  src,
  name,
  gender,
  size = 40,
  className = "",
}: {
  src?: string | null;
  name?: string;
  /** "Male" / "Female" / anything else — picks the placeholder figure. */
  gender?: string | null;
  /** Rendered box in px — the component is always a circle. */
  size?: number;
  className?: string;
}) {
  // Keyed by URL so a new photo re-arms the check instead of staying "broken".
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const box = { width: size, height: size };
  const usable = !!src && brokenSrc !== src;

  if (!usable) {
    const kind = kindFor(gender);
    return (
      <span
        role="img"
        aria-label={name ? `${name} — no profile picture` : "No profile picture"}
        style={box}
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-page ${className}`}
      >
        <Silhouette kind={kind} size={size} />
      </span>
    );
  }

  return (
    <span style={box} className={`block shrink-0 overflow-hidden rounded-full bg-page ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src as string}
        alt={name || "Profile picture"}
        loading="lazy"
        decoding="async"
        // A photo that won't load is dropped for this render, so the drawn
        // placeholder takes over rather than a broken-image icon.
        onError={() => setBrokenSrc(src as string)}
        className="h-full w-full object-cover"
      />
    </span>
  );
}
