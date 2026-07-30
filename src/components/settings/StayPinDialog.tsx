"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { KeyRound, LogOut, RefreshCw, ShieldAlert, X } from "lucide-react";
import type { Booking } from "@/lib/api";
import { usePinCountdown } from "@/lib/booking";

/** How long a PIN lives, mirroring CheckInVerification.PIN_TTL_SECONDS. Only
 *  used to draw the countdown — the server is what actually expires it. */
const PIN_TTL_SECONDS = 60;

const CELLS = [0, 1, 2, 3];

/** Which end of the stay this dialog is verifying. */
export type StayPinMode = "in" | "out";

/**
 * Arrival green, departure blue — the one thing that tells the host at a glance
 * which of the two identical-looking dialogs is in front of them. Everything
 * colourable comes from here, so a mode can never be half-themed.
 */
const THEME: Record<
  StayPinMode,
  {
    title: string;
    submit: string;
    press: string;
    accent: string;
    accentHover: string;
    tintBg: string;
    tintText: string;
    barBg: string;
    focusBorder: string;
  }
> = {
  in: {
    title: "Verify check-in",
    submit: "Verify & check in",
    press: "Check in",
    accent: "bg-[#2f9e44]",
    accentHover: "hover:bg-[#268c3b]",
    tintBg: "bg-[#2f9e44]/10",
    tintText: "text-[#2f9e44]",
    barBg: "bg-[#2f9e44]",
    focusBorder: "focus:border-[#2f9e44]",
  },
  out: {
    title: "Verify check-out",
    submit: "Verify & check out",
    press: "Check out",
    accent: "bg-[#1971c2]",
    accentHover: "hover:bg-[#155f9e]",
    tintBg: "bg-[#1971c2]/10",
    tintText: "text-[#1971c2]",
    barBg: "bg-[#1971c2]",
    focusBorder: "focus:border-[#1971c2]",
  },
};

/**
 * The host's side of a verified check-in or check-out.
 *
 * The host never sees the PIN here — the whole point is that they have to ask
 * the guest, who is reading it off their own booking. This dialog is the four
 * boxes they type it into, the countdown until the code dies, and the one
 * button that issues a fresh one.
 *
 * It owns no rules: whether a code is live, how many tries are left and whether
 * the stay is at the point that code is for are all decided by the server.
 * Everything here is either an instruction to the host or a reflection of what
 * the server said — including `notice`, which on the way out is how the host
 * learns they are closing a stay early before they do it.
 */
export default function StayPinDialog({
  booking,
  mode,
  onVerify,
  onResend,
  onClose,
  notice = "",
  busy = false,
  error = "",
}: {
  booking: Booking;
  mode: StayPinMode;
  /** Submit the typed PIN. Rejects with the server's message when it's wrong. */
  onVerify: (pin: string) => void | Promise<void>;
  /** Issue a new PIN (the old one stops working the moment this returns). */
  onResend: () => void | Promise<void>;
  onClose: () => void;
  /** The server's line about what this action means right now — shown above the
   *  boxes. Used on check-out to warn that the guest is leaving early. */
  notice?: string;
  busy?: boolean;
  error?: string;
}) {
  const theme = THEME[mode];
  const isOut = mode === "out";
  const expiresIn = isOut ? booking.checkoutPinExpiresIn : booking.checkinPinExpiresIn;
  const attemptsLeft = isOut
    ? booking.checkoutPinAttemptsLeft
    : booking.checkinPinAttemptsLeft;

  const [digits, setDigits] = useState<string[]>(["", "", "", ""]);
  // The same countdown the guest is watching, off the same clock — see
  // `usePinCountdown`. It re-anchors on every poll rather than ticking on
  // alone, which is what used to leave this dialog showing ten seconds the
  // guest's card had already spent.
  const secondsLeft = usePinCountdown(expiresIn || 0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const lastExpiry = useRef(expiresIn || 0);

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  // The list behind this dialog polls, and every poll re-states the SAME PIN
  // with a second or two less on it. Only a genuinely new code — one with MORE
  // time on it than the last reading — empties the boxes and takes the cursor
  // back; doing that on each poll would wipe digits mid-typing. (The countdown
  // itself takes every reading, new code or not: that's what keeps it honest.)
  useEffect(() => {
    const incoming = expiresIn || 0;
    if (incoming > lastExpiry.current) {
      setDigits(["", "", "", ""]);
      inputs.current[0]?.focus();
    }
    lastExpiry.current = incoming;
  }, [expiresIn]);

  // Escape closes, as it does everywhere else in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pin = digits.join("");
  const expired = secondsLeft <= 0;
  // A new PIN is a recovery, not a shortcut: while the current one is alive and
  // still has tries left there is nothing to recover from, and re-issuing would
  // only kill the code the guest is reading out at that moment.
  const canResend = expired || attemptsLeft <= 0;

  const submit = useCallback(() => {
    if (pin.length === CELLS.length && !busy && !expired) onVerify(pin);
  }, [pin, busy, expired, onVerify]);

  function setDigit(i: number, value: string) {
    const only = value.replace(/\D/g, "");
    if (!only) {
      setDigits((d) => d.map((x, j) => (j === i ? "" : x)));
      return;
    }
    // A pasted or fast-typed run fills forward from here rather than landing
    // entirely in one box.
    setDigits((d) => {
      const next = [...d];
      for (let k = 0; k < only.length && i + k < CELLS.length; k++) {
        next[i + k] = only[k];
      }
      return next;
    });
    const landed = Math.min(i + only.length, CELLS.length - 1);
    inputs.current[landed]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
    if (e.key === "Enter") submit();
  }

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
        aria-labelledby="stay-pin-title"
        className="w-full max-w-[420px] rounded-2xl bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${theme.tintBg} ${theme.tintText}`}
            >
              {isOut ? (
                <LogOut size={17} aria-hidden />
              ) : (
                <KeyRound size={17} aria-hidden />
              )}
            </span>
            <div>
              <h2 id="stay-pin-title" className="text-[16px] font-bold text-ink">
                {theme.title}
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
          A 4-digit PIN is now showing on{" "}
          <span className="font-semibold text-ink">{booking.guestName || "the guest"}</span>&apos;s
          booking page. Ask them to read it out and type it below — it&apos;s how the
          platform knows they&apos;re really {isOut ? "leaving" : "here"}.
        </p>

        {/* What this check-out costs, in the server's own words — that the guest
            is going a night or more early, that those nights go back on the
            calendar and that nothing is refunded. Shown BEFORE the boxes: it is
            the thing the host should read before verifying, not after. */}
        {notice && (
          <p
            className={`mt-3 rounded-lg border-l-4 px-3 py-2.5 text-[12.5px] font-medium leading-5 ${
              isOut
                ? "border-[#e8912a] bg-orange-50 text-orange-700"
                : `border-current bg-page ${theme.tintText}`
            }`}
          >
            {notice}
          </p>
        )}

        <div className="mt-4 flex items-center justify-center gap-2.5">
          {CELLS.map((i) => (
            <input
              key={i}
              ref={(el) => {
                inputs.current[i] = el;
              }}
              value={digits[i]}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CELLS.length}
              aria-label={`PIN digit ${i + 1}`}
              disabled={busy || expired}
              className={`h-14 w-12 rounded-xl border text-center text-[22px] font-bold text-ink transition-colors focus:outline-none disabled:bg-page disabled:text-muted ${
                error ? "border-red-400 bg-red-50/50" : `border-line ${theme.focusBorder}`
              }`}
            />
          ))}
        </div>

        {/* The code's own clock. Expiry isn't an error — the host presses the
            button again and carries on — so it reads as information, not a
            failure. */}
        <p
          className={`mt-3 text-center text-[12.5px] font-medium ${
            expired ? "text-muted" : secondsLeft <= 15 ? "text-orange-600" : "text-body"
          }`}
          role="status"
        >
          {expired ? (
            "That PIN has expired. Send a new one to continue."
          ) : (
            <>
              Expires in <span className="tabular-nums font-bold">{secondsLeft}s</span>
              <span
                aria-hidden
                className="ml-2 inline-block h-1 w-24 overflow-hidden rounded-full bg-line align-middle"
              >
                <span
                  className={`block h-full rounded-full ${theme.barBg} transition-[width] duration-1000 ease-linear`}
                  style={{ width: `${(secondsLeft / PIN_TTL_SECONDS) * 100}%` }}
                />
              </span>
            </>
          )}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-[12.5px] font-medium text-red-600"
          >
            <ShieldAlert size={15} className="mt-px shrink-0" aria-hidden />
            <span>{error}</span>
          </p>
        )}

        {!error && attemptsLeft < 3 && attemptsLeft > 0 && (
          <p className="mt-3 text-center text-[12px] text-orange-600">
            {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left on this PIN — after
            that it locks and the guest is emailed a security alert.
          </p>
        )}

        <div className="mt-5 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onResend()}
            disabled={busy || !canResend}
            title={
              canResend
                ? "Issue a fresh PIN for the guest"
                : "The current PIN is still valid — it can be replaced once it expires."
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2.5 text-[13px] font-semibold text-body transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} aria-hidden />
            New PIN
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || expired || pin.length < CELLS.length}
            aria-busy={busy}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg ${theme.accent} py-2.5 text-[13px] font-semibold text-white transition-colors ${theme.accentHover} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {busy ? <span className="spinner" aria-hidden /> : theme.submit}
          </button>
        </div>
      </div>
    </div>
  );
}
