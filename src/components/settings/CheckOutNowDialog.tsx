"use client";

import { useEffect } from "react";
import { AlertTriangle, LogOut, ShieldAlert, X } from "lucide-react";
import type { Booking } from "@/lib/api";
import { forcedCheckOut, useServerWallClock } from "@/lib/booking";

/**
 * Closing a stay after its booked hour — the PIN-free half of check-out.
 *
 * Before that hour a departure needs the guest's code, and this dialog never
 * appears. From the hour onwards the code has nothing left to protect: the
 * guest owes the property nothing more, and the platform is going to close the
 * stay itself half an hour later regardless. So the host gets one press.
 *
 * It is still a dialog rather than a bare button, and that is the point. This
 * is the one departure nobody witnessed, and the host should see what they are
 * recording — whose stay, that the hour has passed, and how long the clock
 * would have taken to do it for them — before it goes on the record with their
 * name on it rather than the platform's.
 */
export default function CheckOutNowDialog({
  booking,
  onConfirm,
  onClose,
  busy = false,
  error = "",
}: {
  booking: Booking;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  busy?: boolean;
  error?: string;
}) {
  // The server's clock, ticking — the hour belongs to the property, and the
  // browser may sit in another time zone.
  const now = useServerWallClock(booking.serverNow, 1_000);
  const pending = forcedCheckOut(booking, now);

  // Escape closes, as it does everywhere else in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 px-4 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="check-out-now-title"
        className="w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* The same ink the PIN dialog's check-out side carries: a host who
                closed a stay with a code yesterday and without one today should
                recognise the screen as the same last step. */}
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink/[0.07] text-ink">
              <LogOut size={17} aria-hidden />
            </span>
            <div>
              <h2 id="check-out-now-title" className="text-[16px] font-bold text-ink">
                Check out
              </h2>
              <p className="text-[12px] text-muted">{booking.guestName || "Guest"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted transition-colors hover:bg-page hover:text-ink"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <p className="mt-4 text-[13px] leading-5 text-body">
          The booked check-out time has passed, so{" "}
          <span className="font-semibold text-ink">no PIN is needed</span> — the code
          is only there to stop a stay being ended early, and that hour is behind
          us. Closing it now frees the property and records the departure as
          yours.
        </p>

        {/* What happens if they walk away instead. Not a threat — it costs
            nobody anything either way — but the host is choosing between two
            things here, and the other one is on a clock. */}
        {pending && (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2.5 text-[12.5px] font-medium leading-5 text-red-700"
          >
            <AlertTriangle size={15} className="mt-px shrink-0" aria-hidden />
            <span>
              {pending.due ? (
                "The grace period is over — this stay is closing automatically."
              ) : (
                <>
                  Left alone, this stay closes automatically in{" "}
                  <span className="tabular-nums font-bold">{pending.when}</span> and
                  the departure is recorded as the platform&apos;s, not yours.
                </>
              )}
            </span>
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-600"
          >
            <ShieldAlert size={15} className="mt-px shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line px-3.5 py-2.5 text-[13px] font-semibold text-body transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={() => onConfirm()}
            disabled={busy}
            aria-busy={busy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-ink py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-ink/85 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <span className="spinner" aria-hidden /> : "Check out now"}
          </button>
        </div>
      </div>
    </div>
  );
}
