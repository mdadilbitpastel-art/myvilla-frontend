"use client";

import { AlertTriangle } from "lucide-react";
import type { Booking } from "@/lib/api";

/**
 * What is left on the record once `ForcedCheckOutPill`'s countdown has run out:
 * this stay was closed by the platform, not by the host.
 *
 * The expanded booking panel has always said so on its departure line, but a
 * history row is read collapsed — a list of finished stays where every one of
 * them says "Checked out" and nothing says which of those departures nobody
 * actually witnessed. So the fact travels with the row, not only with the
 * panel: a short tag beside the status for the host scanning their history, and
 * a chip on the guest's own card, which is where they find out at all.
 *
 * Both variants are one nowrap line. The guest's used to be the full sentence,
 * and a sentence is wide enough to use up a card's foot on its own — it pushed
 * the buttons beside it onto a second row, and then off to the left where
 * nothing else on the card sits. So the fact is a chip like every other chip in
 * that run, with the sentence itself on hover and for a screen reader.
 *
 * Renders nothing unless the platform really did close the stay.
 */
export default function AutoCheckOutNote({
  booking,
  variant = "tag",
  className = "",
}: {
  booking: Booking;
  /** "tag" for a status cell or chip row, "note" for the guest's own sentence. */
  variant?: "tag" | "note";
  className?: string;
}) {
  if (!booking.forcedCheckOut) return null;

  // Naive wall-clock, read as digits rather than through `new Date()`: the hour
  // belongs to the property, and a browser in another zone would shift it.
  const at = wallTime(booking.forcedCheckOutAt || booking.checkedOutAt);

  if (variant === "note") {
    const full = `You were checked out automatically${
      at ? ` at ${at}` : ""
    } — your check-out hour had passed with the stay still open.`;
    return (
      <span
        role="status"
        title={full}
        aria-label={full}
        className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-ink/[0.05] px-2.5 py-1.5 text-[12.5px] font-semibold text-body ${className}`}
      >
        <AlertTriangle size={13} className="shrink-0 text-muted" aria-hidden />
        <span aria-hidden>
          Auto check-out
          {at && <span className="font-medium text-muted"> · {at}</span>}
        </span>
      </span>
    );
  }

  return (
    <span
      title={`Nobody closed this stay — the platform did${
        at ? `, at ${at}` : ""
      }, half an hour after the check-out hour.`}
      className={`whitespace-nowrap text-[12px] font-semibold text-muted ${className}`}
    >
      · Auto check-out
    </span>
  );
}

/** "11:30 AM" from a naive wall-clock stamp, or "" when there isn't one. */
function wallTime(value: string): string {
  const m = /[T ](\d{2}):(\d{2})/.exec(value || "");
  if (!m) return "";
  const h24 = Number(m[1]);
  const h = h24 % 12 || 12;
  return `${h}:${m[2]} ${h24 >= 12 ? "PM" : "AM"}`;
}
