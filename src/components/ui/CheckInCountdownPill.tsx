"use client";

import { CalendarClock } from "lucide-react";
import type { CheckInCountdown } from "@/lib/booking";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * When a confirmed stay starts — "Check-in in 4 days", "Check-in tomorrow".
 *
 * Named, not just counted. "In 4 days" on its own is an answer with the
 * question thrown away: four days until what? It sat in a Status column between
 * "Checked in" and "No show", every one of which says what it is about, and was
 * the only one that didn't. The word carries no cost — it is drawn quiet and
 * small, and the days stay the loud part.
 *
 * The SAME reading on both sides of the booking: the guest counting down to
 * their trip and the host counting down to a guest turning up are asking one
 * question, and answering it two different ways only invites the two of them to
 * disagree about when the stay begins. What differs is the tooltip, which names
 * whose arrival it is.
 *
 * Amber throughout, deepening as the date closes in. Green read as "fine,
 * nothing to do here" — but a stay ahead of you is precisely the one thing on
 * the page still to be prepared for, and the colour should say so from the day
 * it is booked rather than the night before.
 */
export default function CheckInCountdownPill({
  countdown,
  checkIn,
  role,
  className = "",
  variant = "pill",
}: {
  countdown: CheckInCountdown | null;
  /** The stay's check-in date, for the tooltip. */
  checkIn: string;
  role: "owner" | "guest";
  className?: string;
  /**
   * `pill` — a tinted chip, for a row of buttons and codes where it has to hold
   * its own.
   *
   * `text` — the same words in the same colours with the chip taken off, for
   * the Status column, where it stands in for a status LABEL. A chip's own
   * padding pushed its text ten pixels right of every plain label above and
   * below it, so a column that should read as one straight edge zig-zagged
   * between "Checked in" and "Check-in in 2 days".
   */
  variant?: "pill" | "text";
}) {
  if (!countdown) return null;
  // Two ambers, not amber and green: today and tomorrow burn a shade darker so
  // the last two rows of a list stand out from the ones months away.
  const tone = countdown.imminent ? "text-[#94560c]" : "text-[#b26a10]";
  return (
    <span
      title={
        role === "owner"
          ? `Guest arrives ${fmtFull(checkIn)}`
          : `Check-in ${fmtFull(checkIn)}`
      }
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${
        variant === "text"
          ? `text-[13px] ${tone}`
          : `rounded-lg px-2.5 py-1 text-[12px] ${tone} ${
              countdown.imminent ? "bg-[#e8912a]/[0.18]" : "bg-[#e8912a]/[0.1]"
            }`
      } ${className}`}
    >
      {/* No icon in `text`, and that is the whole point of the variant: in the
          Status column this is a status LABEL, and it sits directly above and
          below "Checked in", "No show", "Cancelled" — none of which carry one.
          A 13px calendar glyph pushed the words nineteen pixels right of every
          plain label in the column, which is the same crooked edge the chip's
          padding used to make. The chip keeps its icon: there it sits among
          buttons and codes, where it needs to look like a thing, not a line. */}
      {variant === "pill" && (
        <CalendarClock size={13} className="shrink-0 opacity-70" aria-hidden />
      )}
      {/* "Check-in" is the label and "in 4 days" is the answer, so they are not
          weighted the same: the noun sits back at normal weight and slightly
          faded, the days come forward in bold. One glance down the column reads
          the numbers; a second reading picks up what they are numbers of. */}
      <span className="min-w-0">
        <span className="font-normal opacity-75">Check-in </span>
        <span className="font-bold">{countdown.when}</span>
      </span>
    </span>
  );
}
