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
 * a plain sentence on the guest's own card, which is where they find out at all.
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
    return (
      <span
        role="status"
        className={`inline-flex items-start gap-1.5 rounded-lg bg-ink/[0.05] px-2.5 py-1.5 text-[12.5px] font-medium leading-4 text-body ${className}`}
      >
        <AlertTriangle size={13} className="mt-px shrink-0 text-muted" aria-hidden />
        <span>
          You were checked out automatically{at && ` at ${at}`} — your check-out
          hour had passed with the stay still open.
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
