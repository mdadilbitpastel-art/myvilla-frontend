"use client";

import { useEffect, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import type { Booking } from "@/lib/api";
import { bookingClosed, forcedCheckOut, useServerWallClock } from "@/lib/booking";

/**
 * The half hour a stay has left to be closed by hand before the platform closes
 * it — "Auto check-out in 24:08", counting down in red.
 *
 * The warning is the point. A forced check-out is not a punishment and costs
 * nobody anything, but it IS the platform ending something on the host's behalf,
 * and neither side should meet that as a surprise: the host gets half an hour in
 * which closing the stay is still their own act, with their name on the record,
 * and the guest can see exactly when it stops being open.
 *
 * No PIN is involved in that half hour — the code only ever existed to stop a
 * stay being ended EARLY (see `checkOutPinRequired`), and this countdown starts
 * at the very hour that stops being possible.
 *
 * Ticks every second off the SERVER's wall clock — the hour belongs to the
 * property, and the browser may sit in another time zone. When the clock runs
 * out it calls `onDue` ONCE: the close itself happens server-side on the next
 * read of this booking, so the page refetches rather than waiting up to a
 * poll's length to notice a stay it is already displaying as over.
 *
 * Renders nothing unless a stay is actually overrunning.
 */
export default function ForcedCheckOutPill({
  booking,
  onDue,
  className = "",
  variant = "text",
}: {
  booking: Booking;
  /** Called once when the countdown reaches zero — refetch here. */
  onDue?: () => void;
  className?: string;
  /** "text" for a status column, "banner" for the detail panel's own strip. */
  variant?: "text" | "banner";
}) {
  const now = useServerWallClock(booking.serverNow, 1_000);
  // A stay that has already been checked out or cancelled cannot be overrunning
  // — there is nothing left for the platform to close. Guarded here as well as
  // on the server's own flag so a history row can never sit there counting down
  // (and asking the page to refetch) against a booking that is already over.
  const state = bookingClosed(booking) ? null : forcedCheckOut(booking, now);
  // One call, not one per tick: the countdown sits at zero until the refetch
  // lands, and a refresh fired every second in that gap is a small flood.
  const fired = useRef(false);

  useEffect(() => {
    if (!state?.due || fired.current) return;
    fired.current = true;
    onDue?.();
  }, [state?.due, onDue]);

  // A fresh countdown (the guest checked into the next part of a split stay,
  // and that part is now overrunning too) gets its own single call.
  useEffect(() => {
    if (state && !state.due) fired.current = false;
  }, [state]);

  if (!state) return null;

  const label = state.due
    ? "Closing this stay…"
    : `Auto check-out in ${state.when}`;

  if (variant === "banner") {
    return (
      <p
        role="status"
        className={`flex items-start gap-2 rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium leading-5 text-red-700 ${className}`}
      >
        <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
        <span>
          {state.due ? (
            "The check-out grace period is over — this stay is being closed automatically."
          ) : (
            <>
              Check-out is overdue, so no PIN is needed any more — the host can
              close this stay in one press. Left alone it closes automatically in{" "}
              <span className="tabular-nums font-bold">{state.when}</span>, and the
              departure is recorded as the platform&apos;s.
            </>
          )}
        </span>
      </p>
    );
  }

  return (
    <span
      title="The booked check-out hour has passed — the stay closes itself when this runs out"
      className={`inline-flex items-center gap-1 whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-red-600 ${className}`}
    >
      <AlertTriangle size={12} className="shrink-0" aria-hidden />
      {label}
    </span>
  );
}
