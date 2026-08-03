"use client";

import { fmtPartMoment, stayRemaining, useServerWallClock } from "@/lib/booking";
import type { Booking } from "@/lib/api";

/**
 * When the guest has to be out — "Check-out in 3d 4h", down to
 * "Check-out in 12m 34s" on the way out of the door.
 *
 * The mirror of the arrival countdown, in the same words and the same two
 * weights: "Check-in in 4 days" on one side of a stay, "Check-out in 3d 4h" on
 * the other. It takes over the Status column's second line the moment the stay
 * starts, so both tables answer "where is this booking up to?" from the day it
 * is booked to the hour it ends, and the guest and the host read the identical
 * sentence off their own page.
 *
 * Ticks every second off the SERVER's wall clock, not the browser's — the
 * check-out hour belongs to the property, and a guest reading this from another
 * time zone would otherwise be told they have hours they don't have. The clock
 * lives HERE rather than in the row: only this reading needs a second-by-second
 * re-render, and the row around it re-reads its own clock every thirty.
 *
 * Open text, no chip and no icon. It sits directly under a status label in a
 * column of status labels, and anything with padding or a glyph on its left
 * starts its text somewhere the labels above it don't.
 *
 * Renders nothing unless the stay is actually under way.
 */
export default function StayCountdownPill({
  booking,
  className = "",
}: {
  booking: Booking;
  className?: string;
}) {
  const now = useServerWallClock(booking.serverNow, 1_000);
  const left = stayRemaining(booking, now);
  if (!left) return null;

  // Black, unlike the amber arrival countdown — and deliberately. A stay ahead
  // of you is something to prepare for; a stay under way is simply a fact, and
  // the hour it ends is a time of day, not a warning. Red is kept for the one
  // reading somebody has to act on: the hour gone by with the guest still in.
  const tone = left.overdue ? "text-red-600" : "text-ink";

  return (
    <span
      title={
        left.overdue
          ? "The booked check-out hour has passed — the host closes the stay"
          : `Check-out ${fmtPartMoment(left.endsAtWall) || booking.checkOut}`
      }
      // Deliberately not a live region: the reading changes every second, and
      // announcing it that often would talk over everything else in the row.
      // The digits are plain text, there to be read whenever they're wanted.
      className={`inline-flex items-center whitespace-nowrap text-[12.5px] tabular-nums ${tone} ${className}`}
    >
      {/* Same two weights as the arrival countdown: the noun sits back, the
          clock comes forward. Down a column of rows the numbers are what the
          eye catches, and the word is there for the second look. */}
      <span className="font-normal opacity-60">Check-out&nbsp;</span>
      <span className="font-bold">{left.when}</span>
    </span>
  );
}
