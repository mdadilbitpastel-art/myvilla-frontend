"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  LogIn,
  LogOut,
  TicketPercent,
  ChevronUp,
  Clock,
  KeyRound,
  Mail,
  Phone,
  Star,
  Lock,
  AlertTriangle,
} from "lucide-react";
import Img from "@/components/ui/Img";
import Avatar from "@/components/ui/Avatar";
import ReviewForm from "@/components/reviews/ReviewForm";
import type { Booking } from "@/lib/api";
import {
  bookingStatus,
  bookingStatusDetail,
  cancellationGate,
  stayAction,
  stayProgress,
  fmtPartMoment,
  checkInGate,
  useServerWallClock,
  usePinCountdown,
  fmtDateTime,
  type BookingStatusTone,
  type StayPartStatus,
} from "@/lib/booking";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

const money = (n: number) => `$${n.toFixed(2)}`;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// "12 Feb → 15 Feb 2026" — the year is stated once when both ends share it.
function fmtRange(fromIso: string, toIso: string): string {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${fromIso} → ${toIso}`;
  const left =
    a.getFullYear() === b.getFullYear()
      ? `${a.getDate()} ${MONTHS[a.getMonth()]}`
      : fmtDate(fromIso);
  return `${left} → ${fmtDate(toIso)}`;
}

// Nights sitting between one part of a split stay and the next.
function nightsBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Where one part of a split stay stands. Deliberately quiet for the parts that
 * need no attention — a finished part is grey, a future one is barely there —
 * so the eye lands on the one under way and on how many are still to come.
 */
const PART_STATUS: Record<StayPartStatus, { label: string; className: string }> = {
  completed: { label: "Done", className: "bg-page text-muted" },
  // "Staying now" is a claim about where the guest IS, so it waits for the
  // check-in PIN — the hour arriving only means they may come in.
  current: { label: "Staying now", className: "bg-primary/15 text-primary" },
  awaiting: { label: "Awaiting check-in", className: "bg-orange-50 text-orange-600" },
  upcoming: { label: "To come", className: "bg-amber-50 text-amber-700" },
  missed: { label: "Missed", className: "bg-red-50 text-red-600" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600" },
};

function PartStatusChip({ status }: { status: StayPartStatus }) {
  const s = PART_STATUS[status];
  return (
    <span
      className={`rounded-full px-1.5 py-[1px] text-[9.5px] font-bold uppercase tracking-wide ${s.className}`}
    >
      {s.label}
    </span>
  );
}

// Soft status pill colours per tone — a filled chip reads as a real-time state.
const PILL_CLASS: Record<BookingStatusTone, string> = {
  green: "bg-green-50 text-green-700",
  blue: "bg-primary/10 text-primary",
  red: "bg-red-50 text-red-600",
  muted: "bg-page text-body",
  orange: "bg-orange-50 text-orange-600",
};

// The same tones as a left-border + tint strip, for the one-line status detail.
const STRIP_CLASS: Record<BookingStatusTone, string> = {
  green: "border-green-500 bg-green-50 text-green-700",
  blue: "border-primary bg-primary/[0.06] text-primary",
  red: "border-red-500 bg-red-50 text-red-600",
  muted: "border-line bg-page text-body",
  orange: "border-orange-500 bg-orange-50 text-orange-700",
};

/**
 * The one stay action a host takes on a booking — check the guest in, then out.
 * Renders nothing once the stay is done/cancelled. Shown in the list row.
 */
export function StayActionButton({
  booking,
  onCheckIn,
  onCheckOut,
  onAllowLate,
  busy,
}: {
  booking: Booking;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  /** Take a no-show guest in anyway. Omit to leave a no-show with no action. */
  onAllowLate?: (id: string) => void;
  busy: boolean;
}) {
  // The server's clock, ticking — never the browser's. The button opens at an
  // exact hour, and the two clocks can be whole time zones apart.
  const now = useServerWallClock(booking.serverNow);
  // Where the "why is this locked" bubble should be drawn, in viewport
  // coordinates. It is positioned fixed on purpose: the list row around this
  // button clips its overflow, so an absolutely placed bubble got cut off at
  // the row's top edge and looked like it slid under the row above.
  const wrapRef = useRef<HTMLSpanElement>(null);
  const [tip, setTip] = useState<{ top: number; left: number; below: boolean } | null>(null);

  // A fixed bubble does not travel with the page, so any scroll dismisses it.
  useEffect(() => {
    if (!tip) return;
    const hide = () => setTip(null);
    window.addEventListener("scroll", hide, { passive: true, capture: true });
    window.addEventListener("resize", hide);
    return () => {
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, [tip]);

  const gate = checkInGate(booking, now);
  const action = stayAction(booking);
  if (action !== "check_in" && action !== "check_out") return null;

  const isIn = action === "check_in";
  // The window has shut with nobody checked in: the ordinary check-in button is
  // gone. The stay is a no-show, and taking the guest in is now a deliberate
  // decision — offered as its own quieter action, never as the default one.
  if (isIn && !gate.visible) {
    // Past the stay's own check-out, there is no arrival left to allow — the
    // server refuses it, so the button would only ever produce an error.
    if (!onAllowLate || gate.stayEnded) return null;
    return (
      <button
        type="button"
        disabled={busy}
        aria-busy={busy}
        title={gate.reason}
        onClick={() => onAllowLate(booking.id)}
        className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e8912a] px-3 py-[5px] text-[12.5px] font-semibold text-[#b26a10] transition-colors hover:bg-[#e8912a]/10 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <span className="spinner" aria-hidden /> : <Clock size={14} aria-hidden />}
        Allow late check-in
      </button>
    );
  }

  // Check-out keeps its one look — blue, the colour its PIN dialog and the
  // guest's departure code carry. Check-in follows the window: grey before the
  // hour, green once it opens, amber through the closing stretch of the grace
  // period — the same three colours the server names in `button_state`.
  const tone = !isIn
    ? "bg-[#1971c2] hover:bg-[#155f9e]"
    : gate.tone === "yellow"
      ? "bg-[#e8912a] hover:bg-[#cf7d1c]"
      : "bg-[#2f9e44] hover:bg-[#268c3b]";

  const locked = isIn && !gate.open;
  const label = isIn ? "Check in" : "Check out";

  const button = (
    <button
      type="button"
      disabled={busy || locked}
      aria-busy={busy}
      // No `title`: the styled bubble below says the same thing straight away,
      // and the two together showed up as a doubled tooltip on hover.
      aria-describedby={locked ? `stay-lock-${booking.id}` : undefined}
      onClick={() => (isIn ? onCheckIn(booking.id) : onCheckOut(booking.id))}
      // A fixed width, not padding: "Check in", "Check out" and the locked
      // state carry different icons and words, and letting each size itself
      // made the actions column jump every time a booking changed state.
      className={`inline-flex w-[118px] items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed ${
        locked ? "bg-muted/60" : `${tone} disabled:opacity-60`
      }`}
    >
      {busy ? (
        <span className="spinner" aria-hidden />
      ) : locked ? (
        <Lock size={14} aria-hidden />
      ) : isIn && gate.tone === "yellow" ? (
        <AlertTriangle size={15} aria-hidden />
      ) : isIn ? (
        <LogIn size={15} aria-hidden />
      ) : (
        <LogOut size={15} aria-hidden />
      )}
      {/* Just the action. How late the guest is — and how long is left — is the
          status pill's job right beside it; the button stays one clean word so
          it never reads as a moving target. */}
      {label}
    </button>
  );

  if (!locked) return button;

  // Locked: the button can't be hovered itself (a disabled button takes no
  // pointer events), so the wrapper listens and places the bubble. Measured on
  // enter and drawn fixed, above the button — or below it when the button sits
  // too close to the top of the viewport for the bubble to fit.
  const showTip = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const below = r.top < 96;
    setTip({ top: below ? r.bottom + 6 : r.top - 6, left: r.right, below });
  };

  return (
    <span
      ref={wrapRef}
      className="inline-flex"
      onMouseEnter={showTip}
      onMouseLeave={() => setTip(null)}
      onFocus={showTip}
      onBlur={() => setTip(null)}
    >
      {button}
      {tip && (
        <span
          id={`stay-lock-${booking.id}`}
          role="tooltip"
          style={{ top: tip.top, left: tip.left }}
          // Fixed + a z above the sticky page chrome: nothing in the table can
          // clip it or paint over it.
          className={`pointer-events-none fixed z-[60] w-max max-w-[240px] -translate-x-full rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] font-medium leading-4 text-white shadow-lg ${
            tip.below ? "" : "-translate-y-full"
          }`}
        >
          {gate.reason}
        </span>
      )}
    </span>
  );
}

/**
 * The stay PIN, on the GUEST's own booking — the arrival code on the way in,
 * the departure code on the way out.
 *
 * This is the only place in the product the digits appear: the host's dashboard
 * shows them nothing but four empty boxes. The countdown is what makes it safe
 * to read out loud — a code overheard a minute later is already dead.
 *
 * Green going in, blue going out, the same two colours the host's dialog uses,
 * so a guest holding out their phone and a host looking at their screen are
 * plainly looking at the same thing.
 */
function StayPinCard({
  pin,
  expiresIn,
  mode,
}: {
  pin: string;
  expiresIn: number;
  mode: "in" | "out";
}) {
  // The same countdown the host is watching, read off the same clock — see
  // `usePinCountdown`. The guest reads the digits out; the host types them in.
  // If the two disagree about how long is left, one of them is wrong at the
  // exact moment it matters.
  const secondsLeft = usePinCountdown(expiresIn);
  const out = mode === "out";
  const what = out ? "check-out" : "check-in";

  // Expired: the host presses the button again and a fresh one lands here.
  // Saying so beats leaving a dead code on screen for the guest to read out.
  if (secondsLeft <= 0) {
    return (
      <div className="rounded-xl border border-line bg-page px-4 py-3 text-[12.5px] text-muted">
        Your {what} PIN has expired. Ask the host to start {what} again for a new one.
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${
        out ? "border-[#1971c2]/30 bg-[#1971c2]/[0.05]" : "border-[#2f9e44]/30 bg-[#2f9e44]/[0.05]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className={`flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide ${
              out ? "text-[#1971c2]" : "text-[#2f9e44]"
            }`}
          >
            {out ? <LogOut size={13} aria-hidden /> : <KeyRound size={13} aria-hidden />}
            Your {what} PIN
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-body">
            Read these digits out to the host — only you can see them.
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-[30px] font-bold leading-none tracking-[0.22em] text-ink">
            {pin}
          </p>
          <p
            className={`mt-1.5 text-[12px] font-semibold ${
              secondsLeft <= 15 ? "text-orange-600" : "text-muted"
            }`}
            role="status"
          >
            Expires in <span className="tabular-nums">{secondsLeft}s</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="truncate text-right text-[12.5px] font-medium text-ink">{value}</span>
    </div>
  );
}

// Label on top, value on its own line below — for the longer date-time values
// (a full "12 Feb 2026, 2:00 PM") that would be clipped by the side-by-side Pair.
function StackedPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-[3px]">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-[12.5px] font-medium text-ink">{value}</p>
    </div>
  );
}

/**
 * The full, compact detail panel shown inline when a booking row expands. A
 * guest header (bigger avatar, name, email beneath) with a live status pill,
 * then four balanced columns so no space is left vacant.
 */
export default function BookingDetails({
  booking,
  onCollapse,
  onCheckIn,
  onCheckOut,
  onAllowLate,
  working = false,
  onCancel,
  cancelling = false,
  onReview,
  reviewBusy = false,
}: {
  booking: Booking;
  onCollapse?: () => void;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  onAllowLate?: (id: string) => void;
  working?: boolean;
  // Guest side: cancel this booking. Rendered at the foot of the expanded
  // panel when provided — never in its header.
  onCancel?: () => void;
  cancelling?: boolean;
  // Guest side: leave/update a review for a completed stay.
  onReview?: (rating: number, comment: string) => void | Promise<void>;
  reviewBusy?: boolean;
}) {
  const [editingReview, setEditingReview] = useState(false);
  // Same ticking server clock the row uses, so the pill here and the label in
  // the collapsed row above can never disagree about how late a guest is.
  const now = useServerWallClock(booking.serverNow);
  const status = bookingStatus(booking, now);
  const place = [booking.villaCity, booking.villaCountry].filter(Boolean).join(", ");
  // The panel is shared: the host sees it with check-in/out handlers, the guest
  // with a cancel handler. That tells us which side is reading, so the status
  // line and the contact column can be phrased/aimed for the right person.
  const role: "owner" | "guest" = onCheckIn || onCheckOut ? "owner" : "guest";
  const detail = bookingStatusDetail(booking, role);
  const cancelled = booking.status === "cancelled";

  // The cancellation policy as it stands right now — used only to tell the
  // guest what cancelling would COST them, while cancelling is still something
  // they can do. A closed window used to get its own red strip here; it has
  // gone. By then the guest is checking in or already staying, they aren't
  // trying to cancel, and "refund 0%" is a penalty notice for a decision
  // nobody is making — it read as a warning about the stay itself.
  const cancelGate = cancellationGate(booking, now);

  // The runs this stay is really made of. Older payloads carry none, in which
  // case the booking's own two dates ARE the single run — the same fallback the
  // server's `stay_segments()` applies.
  // Where this stay has got to, part by part, on the SERVER's ticking clock —
  // a part ends because its check-out hour arrived, not because anyone pressed
  // a button, so it is read off the clock and stays honest between refetches.
  const progress = stayProgress(booking, now);
  const segments = progress.parts;

  // The other party's contact: the host sees the guest, the guest sees the host.
  const contactName = role === "owner" ? booking.guestName : booking.hostName;
  const contactEmail = role === "owner" ? booking.guestEmail : booking.hostEmail;
  const contactPhone = role === "owner" ? booking.guestPhone : booking.hostPhone;
  const contactAvatar = role === "owner" ? booking.guestAvatar : booking.hostAvatar;
  // The guest's own gender isn't exposed to the host, so only the host side
  // gets a gender-based placeholder; the guest column falls back to neutral.
  const contactGender = role === "owner" ? undefined : booking.hostGender;

  return (
    <div className="space-y-3.5">
      {/* Property header — the villa's title & location, and on the right the
          status, the stay action, and the collapse control. The photo used to
          lead this line; it has moved down beside the contact column, where
          there was space going spare — a row that opens is tall enough as it
          is without 68px of picture at the top of it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-4">
          <div className="min-w-0">
            {/* The booking id sits ON the heading line, beside the villa's
                name — it is what either side quotes when they get in touch
                about this stay, so it belongs with the title rather than in a
                column of its own further down. `items-baseline` keeps the mono
                digits on the name's baseline instead of riding high. */}
            <div className="flex min-w-0 items-baseline gap-2">
              <Link
                href={`/villa/${booking.villaId}`}
                className="truncate text-[16px] font-bold text-ink hover:text-primary"
              >
                {booking.villaTitle}
              </Link>
              <span
                className="shrink-0 font-mono text-[12px] tracking-wide text-muted"
                title="Booking ID"
              >
                #{booking.id}
              </span>
            </div>
            {place && (
              <p className="mt-0.5 truncate text-[12.5px] text-muted">{place}</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Real-time status: upcoming / staying now / checked in-out / cancelled */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${PILL_CLASS[status.tone]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {status.label}
          </span>

          {onCheckIn && onCheckOut && (
            <StayActionButton
              booking={booking}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              onAllowLate={onAllowLate}
              busy={working}
            />
          )}

          {/* Cancelling sits with the status it would change, not at the foot
              of the panel: the guest reads "Confirmed" and the way to undo it
              is right there. Outlined rather than filled — it belongs beside
              the pill without shouting over it. */}
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              aria-busy={cancelling}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e5484d]/40 px-3.5 py-[5px] text-[12.5px] font-semibold text-[#e5484d] transition-colors hover:bg-[#e5484d] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? (
                <>
                  <span className="spinner" aria-hidden /> Cancelling…
                </>
              ) : (
                "Cancel booking"
              )}
            </button>
          )}

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide booking details"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/5 px-3 py-[5px] text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <span className="w-[30px] text-center">Hide</span>
              <ChevronUp size={15} className="shrink-0" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Live status line — "2 hrs late — not checked in yet", "Guest didn't
          arrive", "You're checked in", etc. Phrased for whoever's reading. */}
      {detail && (
        <div
          className={`flex items-start gap-2 rounded-lg border-l-4 px-3.5 py-2.5 text-[13px] font-medium ${STRIP_CLASS[detail.tone]}`}
          role="status"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          <span>{detail.text}</span>
        </div>
      )}

      {/* The guest's stay PIN — arrival or departure, whichever is live (never
          both: a booking has one code at a time). Sent to the guest and to
          nobody else, which is what makes a check-in evidence that the guest was
          actually at the property, and a check-out evidence they were there to
          leave. */}
      {role === "guest" && booking.checkinPin && (
        <StayPinCard
          mode="in"
          pin={booking.checkinPin}
          expiresIn={booking.checkinPinExpiresIn}
        />
      )}
      {role === "guest" && booking.checkoutPin && (
        <StayPinCard
          mode="out"
          pin={booking.checkoutPin}
          expiresIn={booking.checkoutPinExpiresIn}
        />
      )}

      {/* Left early. The guest is told plainly what it cost and what it gave
          back — no refund, and the nights they didn't use are on sale again —
          because both are surprises otherwise: they paid for those nights, and
          they will see the property bookable on the dates they had held. The
          host reads the same fact from their own side. */}
      {booking.earlyCheckOut && (
        <div
          className={`flex items-start gap-2 rounded-lg border-l-4 px-3.5 py-2.5 text-[13px] font-medium ${STRIP_CLASS.orange}`}
          role="status"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          <span>
            {role === "guest" ? (
              <>
                You checked out {plural(booking.releasedNights, "night")} early
                {booking.checkedOutAt ? ` on ${fmtDateTime(booking.checkedOutAt)}` : ""}.
                Nothing is refunded for the{" "}
                {booking.releasedNights === 1 ? "unused night" : "unused nights"} — the
                stay was paid for in full — and{" "}
                {booking.releasedNights === 1 ? "that night is" : "those nights are"} now
                open for other guests.
              </>
            ) : (
              <>
                Guest left {plural(booking.releasedNights, "night")} early
                {booking.checkedOutAt ? ` on ${fmtDateTime(booking.checkedOutAt)}` : ""}.
                No refund is due, and{" "}
                {booking.releasedNights === 1 ? "that night is" : "those nights are"} back
                on your calendar for other guests to book.
              </>
            )}
          </span>
        </div>
      )}

      {/* Cancellation policy, guest side — but only when there is money to warn
          about AND a button to warn about it beside. Free cancellation is not
          news the guest needs delivered on a coloured strip every time they
          open a booking; if they ever go to cancel, the confirm dialog states
          it right where the decision is made. A banner saying "this costs you
          nothing" earns nothing — and so does one saying "you can no longer do
          the thing you weren't doing". */}
      {role === "guest" && !cancelled && onCancel && cancelGate.penaltyPercentage > 0 && (
        <div
          className={`flex items-start gap-2 rounded-lg border-l-4 px-3.5 py-2.5 text-[13px] font-medium ${STRIP_CLASS.orange}`}
          role="status"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          <span>{cancelGate.message}</span>
        </div>
      )}

      {/* Cancelled: what the late-cancellation fine took, and what's refunded. */}
      {cancelled && (booking.cancellationFee > 0 || booking.refundAmount > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-page px-3.5 py-2.5 text-[12.5px]">
          <span className="text-muted">
            Cancellation fee:{" "}
            <span className="font-semibold text-red-600">{money(booking.cancellationFee)}</span>
          </span>
          <span className="text-muted">
            Refunded:{" "}
            <span className="font-semibold text-green-600">{money(booking.refundAmount)}</span>
          </span>
        </div>
      )}

      {/* Four columns. Stay and Arrival & departure share their space equally
          (50/50), with Guest and Payment on the outside — and on a split stay
          those two middle columns merge into one wide block (below). */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1.2fr_1fr]">
        {/* The villa's photo, then the contact under it — the guest (to the
            host) or the host (to the guest): avatar, name, tappable email +
            phone, and the booking reference. The photo came down out of the
            header, where it was costing every opened row 68px before a single
            fact was read; here it heads the shortest of the four columns and
            takes up the slack instead. It sits outside the group rather than
            inside it: it's the property, not the person the group is about. */}
        <div className="flex min-w-0 flex-col">
          {/* The villa, down from the header and leading this column. */}
          <Link
            href={`/villa/${booking.villaId}`}
            title={booking.villaTitle}
            className="img-frame group mb-3 block aspect-[16/9] w-full overflow-hidden rounded-xl"
          >
            <Img
              src={booking.villaCover}
              alt={booking.villaTitle}
              fallback={PLACEHOLDER_IMG}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]"
            />
          </Link>

          <Group title={role === "owner" ? "Guest" : "Host"}>
            <div className="flex items-center gap-2.5">
              <Avatar src={contactAvatar} name={contactName} gender={contactGender} size={38} />
              <div className="min-w-0 space-y-0.5">
                <p
                  className="truncate text-[13.5px] font-semibold text-ink"
                  title={contactName}
                >
                  {contactName || (role === "owner" ? "Guest" : "Host")}
                </p>
                {contactEmail ? (
                  <a
                    href={`mailto:${contactEmail}`}
                    className="flex items-center gap-1 truncate text-[12px] text-muted hover:text-primary"
                  >
                    <Mail size={12} className="shrink-0" aria-hidden />
                    <span className="truncate">{contactEmail}</span>
                  </a>
                ) : (
                  <span className="block text-[12px] text-muted">No contact email</span>
                )}
                {contactPhone && (
                  <a
                    href={`tel:${contactPhone}`}
                    className="flex items-center gap-1 truncate text-[12px] text-muted hover:text-primary"
                  >
                    <Phone size={12} className="shrink-0" aria-hidden />
                    <span className="truncate">{contactPhone}</span>
                  </a>
                )}
              </div>
            </div>
          </Group>
        </div>

        {/* A stay booked around nights somebody else holds. Its two outer dates
            would read as one continuous stay through nights this guest never
            had, so the parts themselves become the column: the two middle
            columns merge into one block wide enough to list a part per row —
            however many there are — with the arrival/departure facts spread
            underneath. No callout box hangs off the bottom, and the width the
            two columns had is fully used either way. */}
        {segments.length > 1 ? (
          <div className="sm:col-span-2 lg:col-span-2">
            <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
                Stay &amp; arrival
              </p>
              <span className="rounded-full bg-primary/10 px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide text-primary">
                Split · {segments.length} parts · {plural(booking.nights, "night")}
              </span>
              {/* How far through the stay we are, in words. Derived from the
                  clock, so it moves on its own as each part's check-out hour
                  passes — nobody has to press anything for it to be right. */}
              <span className="text-[11px] font-semibold text-body">{progress.label}</span>
            </div>

            {/* One row per part, stacked — a stay cut into six pieces just
                grows downward instead of squeezing six columns into the width
                each. Each row keeps the same lanes: which part and where it
                stands, its arrival and departure MOMENTS, and how many nights.
                Every part carries its own clock: on a stay you have to vacate
                and come back to, "when do I get back in?" is the whole point. */}
            <div className="divide-y divide-line overflow-hidden rounded-lg border border-line">
              {segments.map((s, i) => {
                const last = i === segments.length - 1;
                const gap = last ? 0 : nightsBetween(s.checkOut, segments[i + 1].checkIn);
                const done = s.status === "completed";
                return (
                  <Fragment key={s.checkIn}>
                    <div
                      className={`flex items-baseline gap-2.5 px-2.5 py-[7px] ${
                        s.status === "current"
                          ? "bg-primary/[0.06]"
                          : s.status === "awaiting"
                            ? "bg-orange-50/60"
                            : ""
                      }`}
                    >
                      <span className="w-[42px] shrink-0 text-[10px] font-bold uppercase tracking-wide text-muted">
                        Part {s.index}
                      </span>
                      <span
                        className={`min-w-0 flex-1 text-[12.5px] font-semibold ${
                          done ? "text-muted line-through decoration-muted/40" : "text-ink"
                        }`}
                      >
                        {fmtRange(s.checkIn, s.checkOut)}
                        <span className="block text-[11px] font-normal text-muted no-underline">
                          In {fmtPartMoment(s.checkInAt) || "—"} · Out{" "}
                          {fmtPartMoment(s.checkOutAt) || "—"}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <PartStatusChip status={s.status} />
                        <span className="text-[11px] font-medium text-body">
                          {plural(s.nights, "night")}
                        </span>
                      </span>
                    </div>

                    {gap > 0 && (
                      <div className="flex items-center gap-2.5 bg-page/70 px-2.5 py-1">
                        <span className="w-[42px] shrink-0 text-center text-[13px] leading-3 text-muted/60">
                          ⋮
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[11px] text-muted">
                          {plural(gap, "night")} in between belong to another booking —
                          not yours, not charged
                        </span>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>

            {/* The same facts the two columns carry when the stay is one run —
                laid across the merged width instead of stacked in a column. */}
            <div className="mt-2.5 grid grid-cols-2 gap-x-5 border-t border-line pt-1.5 sm:grid-cols-4">
              <StackedPair
                label="Arrival"
                value={
                  booking.checkedInAt ? (
                    <span className="text-green-600">{fmtDateTime(booking.checkedInAt)}</span>
                  ) : (
                    <span className="text-muted">Not yet</span>
                  )
                }
              />
              <StackedPair
                label="Departure"
                value={
                  booking.checkedOutAt ? (
                    <span className="text-primary">{fmtDateTime(booking.checkedOutAt)}</span>
                  ) : (
                    <span className="text-muted">Not yet</span>
                  )
                }
              />
              <StackedPair label="Guests" value={plural(booking.guests, "guest")} />
              <StackedPair label="Booked on" value={fmtDate(booking.createdAt)} />
            </div>
          </div>
        ) : (
          <>
            {/* Stay — the scheduled check-in/out moments (the "original" times
                the arrival beside it is measured against). Falls back to the
                date alone on older payloads with no scheduled datetime. */}
            <Group title="Stay">
              <StackedPair label="Check-in" value={fmtDateTime(booking.checkInAt) || fmtDate(booking.checkIn)} />
              <StackedPair label="Check-out" value={fmtDateTime(booking.checkOutAt) || fmtDate(booking.checkOut)} />
              <Pair label="Duration" value={plural(booking.nights, "night")} />
              <Pair label="Guests" value={plural(booking.guests, "guest")} />
            </Group>

            {/* Arrival & departure — when the guest actually turned up and left. */}
            <Group title="Arrival &amp; departure">
              <StackedPair
                label="Arrival"
                value={
                  booking.checkedInAt ? (
                    <span className="text-green-600">{fmtDateTime(booking.checkedInAt)}</span>
                  ) : (
                    <span className="text-muted">Not yet</span>
                  )
                }
              />
              <StackedPair
                label="Departure"
                value={
                  booking.checkedOutAt ? (
                    <span className="text-primary">{fmtDateTime(booking.checkedOutAt)}</span>
                  ) : (
                    <span className="text-muted">Not yet</span>
                  )
                }
              />
              <Pair label="Booked on" value={fmtDate(booking.createdAt)} />
            </Group>
          </>
        )}

        {/* Payment */}
        {/* Payment — written as a column of its own rather than a plain Group,
            so it can use the full height of the row: the line items sit under
            the heading, and the total (with how it was paid) is pushed to the
            very bottom by `mt-auto`. However tall the stay block beside it
            grows, the money column ends level with it instead of stopping
            short and leaving a hole in the bottom-right corner. */}
        <div className="flex min-w-0 flex-col">
          <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">
            Payment
          </p>
          <div className="flex flex-1 flex-col space-y-0.5">
            <Pair label={`${money(booking.pricePerNight)} × ${booking.nights}`} value={money(booking.subtotal)} />
            {booking.discount > 0 && (
              <Pair label="Discount" value={<span className="text-green-600">−{money(booking.discount)}</span>} />
            )}
            <Pair label="Service fee" value={money(booking.serviceFee)} />
            <Pair label="Tax" value={money(booking.tax)} />
            {booking.extraServices?.map((s) => (
              <div key={s.name} className="flex items-baseline justify-between gap-3 py-[3px]">
                <span className="min-w-0 truncate text-[12px] text-muted">
                  {s.name}
                  <span className="text-muted/70"> ({money(s.price)} × {booking.nights})</span>
                </span>
                <span className="shrink-0 text-[12.5px] font-medium text-ink">
                  {money(s.price * booking.nights)}
                </span>
              </div>
            ))}
            <div className="mt-auto flex items-center justify-between border-t border-line pt-1.5">
              <span className="text-[12.5px] font-bold text-ink">Total paid</span>
              <span className="text-[14px] font-bold text-ink">{money(booking.total)}</span>
            </div>
            {/* How it was paid, and the coupon that took something off it. Both
                used to be a full-width strip of their own at the very bottom of
                the panel; they belong to the money, and down here they close
                the column off along its bottom edge. */}
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-1 text-[11.5px] text-muted">
              <span className="truncate">
                Paid with{" "}
                <span className="font-medium text-ink">{booking.paymentMethod || "Card"}</span>
                {booking.cardLast4 ? ` · ${booking.cardLast4}` : ""}
              </span>
              {booking.couponCode && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#ff2d2d]/30 bg-[#ff2d2d]/5 px-1.5 py-0.5"
                  title={`Coupon ${booking.couponCode} — ${money(booking.discount)} off`}
                >
                  <TicketPercent size={11} className="text-[#ff2d2d]" aria-hidden />
                  <span className="font-mono font-bold tracking-wide text-ink">
                    {booking.couponCode}
                  </span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Review — a guest can rate a stay once it's completed. Always visible
          for a completed booking (never hidden): a form to leave one, or their
          existing review with an Edit control. */}
      {role === "guest" && onReview && (booking.canReview || booking.reviewRating > 0) && (
        <div className="rounded-xl border border-line bg-page/50 p-3">
          {booking.reviewRating > 0 && !editingReview ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                {/* Title, then the score as a small pill. A leading star icon
                    followed by a five-star strip read as two competing star
                    rows; one number states the same thing more calmly. */}
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-ink">Your review</span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-star/10 px-2 py-0.5 text-[12.5px] font-semibold text-[#b8860b]">
                    <Star size={12} className="fill-star text-star" aria-hidden />
                    {booking.reviewRating.toFixed(1)} / 5
                  </span>
                </div>
                {/* Editing closes a day after posting, and the control goes
                    with it — a review the host has already been judged on
                    shouldn't be quietly rewritten. The server enforces the
                    same window; this is just the button obeying it. */}
                {booking.canEditReview && (
                  <button
                    type="button"
                    onClick={() => setEditingReview(true)}
                    className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    Edit
                  </button>
                )}
              </div>
              {/* Two lines, then it stops — the full text is one click away in
                  Edit (and on the villa's own page). A ten-line review of a
                  stay that ended weeks ago shouldn't be what makes an opened
                  row too tall to read the rest of. Hovering shows all of it. */}
              {booking.reviewComment && (
                <p
                  className="mt-2 line-clamp-2 text-[13px] leading-5 text-body"
                  title={booking.reviewComment}
                >
                  {booking.reviewComment}
                </p>
              )}
              {booking.reviewCreatedAt && (
                <p className="mt-1.5 text-[11.5px] text-muted">
                  Posted {fmtDateTime(booking.reviewCreatedAt)}
                  {booking.canEditReview
                    ? ` · editable until ${fmtDateTime(booking.reviewEditableUntil)}`
                    : " · this review can no longer be edited"}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-1.5 text-[12.5px] font-bold text-ink">
                {booking.reviewRating > 0 ? "Edit your review" : "How was your stay?"}
              </p>
              <ReviewForm
                initialRating={booking.reviewRating}
                initialComment={booking.reviewComment}
                // Two rows and one line of controls, not the form's usual six
                // rows and three stacked blocks: this one is folded into an
                // expanded booking row, and the row has to stay a row.
                rows={2}
                compact
                busy={reviewBusy}
                submitLabel={booking.reviewRating > 0 ? "Update review" : "Submit review"}
                onCancel={booking.reviewRating > 0 ? () => setEditingReview(false) : undefined}
                onSubmit={async (rating, comment) => {
                  await onReview(rating, comment);
                  setEditingReview(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* The host sees the guest's review here too (read-only) once it's left —
          it shows up in their rent-request history. */}
      {role === "owner" && booking.reviewRating > 0 && (
        <div className="rounded-xl border border-line bg-page/50 p-4">
          {/* Same treatment as the guest's own view above: one score pill. */}
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-ink">Guest&apos;s review</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-star/10 px-2 py-0.5 text-[12.5px] font-semibold text-[#b8860b]">
              <Star size={12} className="fill-star text-star" aria-hidden />
              {booking.reviewRating.toFixed(1)} / 5
            </span>
          </div>
          {/* Clamped to two lines here as well, for the same reason. */}
          {booking.reviewComment && (
            <p
              className="mt-2 line-clamp-2 text-[13px] leading-5 text-body"
              title={booking.reviewComment}
            >
              {booking.reviewComment}
            </p>
          )}
          {/* Dated for the host too: a review is a statement made at a moment,
              and the host is entitled to see which moment — the more so now
              that it stops being editable a day after it. */}
          {booking.reviewCreatedAt && (
            <p className="mt-1.5 text-[11.5px] text-muted">
              Posted {fmtDateTime(booking.reviewCreatedAt)}
              {booking.canEditReview && " · the guest can still edit this"}
            </p>
          )}
        </div>
      )}

      {/* Nothing closes the panel off any more: the coupon and how it was paid
          are facts about the money and now sit under the Payment column, and
          cancelling is back beside the status it undoes, up in the header.
          Two full-width rows of height recovered for four short lines. */}
    </div>
  );
}
