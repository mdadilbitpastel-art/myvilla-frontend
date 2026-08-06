"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
  Plus,
  Users,
} from "lucide-react";
import Img from "@/components/ui/Img";
import Avatar from "@/components/ui/Avatar";
import CheckInCountdownPill from "@/components/ui/CheckInCountdownPill";
import StayCountdownPill from "@/components/ui/StayCountdownPill";
import ForcedCheckOutPill from "@/components/ui/ForcedCheckOutPill";
import ReviewForm from "@/components/reviews/ReviewForm";
import {
  PropertyLink,
  RemovedNote,
  REMOVED_IMG,
} from "@/components/settings/RemovedProperty";
import { useToast } from "@/lib/toast";
import type { Booking } from "@/lib/api";
import {
  bookingClosed,
  bookingStatus,
  cancellationGate,
  checkInCountdown,
  lastCheckInStarted,
  stayAction,
  stayProgress,
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

// "12 Aug" — a date in a ledger row, where the year is never in question and
// four more characters are a column of width the row can't spare.
function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * A set of nights as the shortest true thing you can say about them:
 * "11–13 Aug", "5 Aug, 11–12 Aug, 14 Aug", "30 Jul – 2 Aug".
 *
 * Consecutive dates collapse into a run, gaps stay gaps — which matters, since
 * a stay trimmed in two places gave up two stretches, not one. Written out
 * rather than counted: "3 nights cancelled" tells a guest how many, and the
 * only question they actually have is WHICH.
 */
function fmtNights(nights: string[]): string {
  const days = [...nights].filter(Boolean).sort();
  if (!days.length) return "";
  const runs: string[][] = [];
  for (const day of days) {
    const run = runs[runs.length - 1];
    const next = run
      ? (() => {
          const d = new Date(`${run[run.length - 1]}T00:00:00`);
          d.setDate(d.getDate() + 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
            d.getDate()
          ).padStart(2, "0")}`;
        })()
      : "";
    if (run && day === next) run.push(day);
    else runs.push([day]);
  }
  return runs
    .map((run) => {
      const a = new Date(`${run[0]}T00:00:00`);
      const b = new Date(`${run[run.length - 1]}T00:00:00`);
      if (run.length === 1) return `${a.getDate()} ${MONTHS[a.getMonth()]}`;
      return a.getMonth() === b.getMonth()
        ? `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`
        : `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}`;
    })
    .join(", ");
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

/**
 * The hour out of a scheduled wall-clock moment — "2:00 PM" from
 * "2026-02-12T14:00:00".
 *
 * Read as the PROPERTY's hour, not a moment in the reader's time zone: these
 * strings are naive on purpose (see `Booking.checkInAt`), so they are split by
 * hand rather than passed through `new Date`, which would shift them by the
 * browser's offset and show the villa opening at a time it doesn't.
 */
function fmtWallTime(wall: string): string {
  const time = (wall || "").split("T")[1];
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const suffix = h < 12 ? "AM" : "PM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
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
  // check-in PIN — the hour arriving only means they may come in. Green, the
  // same green a stay under way wears on the booking's own status pill.
  current: { label: "Staying now", className: "bg-green-100 text-green-700" },
  awaiting: { label: "Awaiting check-in", className: "bg-orange-50 text-orange-600" },
  upcoming: { label: "To come", className: "bg-amber-50 text-amber-700" },
  missed: { label: "Missed", className: "bg-red-50 text-red-600" },
  cancelled: { label: "Cancelled", className: "bg-red-50 text-red-600" },
};

/**
 * The card colour per state — the same reading as the chip, in the one thing
 * the eye takes in before any text: green for the part being lived in, grey for
 * the ones behind it, amber for the ones still to come, orange for one whose
 * hour has come with nobody arrived, red for one that never happened.
 */
/** The ring the focused part wears — same colour family as its card. */
const PART_RING: Record<StayPartStatus, string> = {
  completed: "ring-line",
  current: "ring-green-400/70",
  awaiting: "ring-orange-300",
  upcoming: "ring-amber-300",
  missed: "ring-red-300",
  cancelled: "ring-red-300",
};

const PART_CARD: Record<StayPartStatus, string> = {
  completed: "border-line bg-page/70",
  current: "border-green-300 bg-green-50/70",
  awaiting: "border-orange-200 bg-orange-50/60",
  upcoming: "border-amber-200 bg-amber-50/40",
  missed: "border-red-200 bg-red-50/50",
  cancelled: "border-red-200 bg-red-50/50",
};

/** One thing that happened to a stay after it was paid for, as the row that
 *  says so — see `changes` in BookingDetails, which builds these. */
type StayChange = {
  id: string;
  at: string;
  kind: "cancel" | "add";
  label: string;
  /** Which nights it was — "11–12 Aug, 14 Aug". The line under the label. */
  dates: string;
  detail: string;
  value: string;
  tone: string;
};

/**
 * What has been done to a stay since it was booked — nights given up, nights
 * and services bought — one slim row each, in the order it happened.
 *
 * These sit with the STAY and not with the money, because that is what they
 * are: changes to the trip. The money column already carries their effect in
 * its line items and its total; what this list adds is which change, when, and
 * what it cost or handed back.
 *
 * A row per event and never a paragraph: a stay can be trimmed twice and
 * extended once, and three sentences of prose where three rows would do is how
 * the old block ended up taller than the parts it was describing. Red is a
 * night the stay lost, the brand colour a night or a service it gained, and
 * everything a row has no width for — which dates, the cancellation charge,
 * what it was paid with — is on its tooltip.
 */
function StayChanges({ changes }: { changes: StayChange[] }) {
  if (!changes.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
        Changes
      </p>
      <ol className="mt-1 space-y-1">
        {changes.map((c) => (
          <li
            key={c.id}
            title={c.detail}
            className={`rounded-md border px-2.5 py-1 ${
              c.kind === "cancel"
                ? "border-red-200 bg-red-50/70"
                : "border-primary/25 bg-primary/[0.05]"
            }`}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-[11.5px] font-medium text-ink">
                {c.label}
              </span>
              <span className={`shrink-0 text-[11.5px] font-semibold ${c.tone}`}>
                {c.value}
              </span>
            </div>
            {/* The dates themselves, then when it was done. Two facts the row
                above can't hold and the guest asks for first: which nights, and
                when did I do this. */}
            <p className="truncate text-[10.5px] leading-[15px] text-muted">
              {c.dates}
              {c.dates && " · "}
              on {fmtShortDate(c.at)}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PartStatusChip({
  status,
  leftEarly = false,
}: {
  status: StayPartStatus;
  /** This part ended with the guest walking out before its check-out hour. It
   *  replaces "Done" rather than sitting beside it: the part IS done, and what
   *  is worth knowing a month later is that it didn't run its course. */
  leftEarly?: boolean;
}) {
  const s = leftEarly
    ? { label: "Left early", className: "bg-red-50 text-red-600" }
    : PART_STATUS[status];
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
  // Ink, not the brand purple — see STATUS_TONE_CLASS.blue. The row's label and
  // this chip name the same state and must not disagree about how loud it is.
  blue: "bg-ink/[0.07] text-ink",
  red: "bg-red-50 text-red-600",
  muted: "bg-page text-body",
  orange: "bg-orange-50 text-orange-600",
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

  // Over and done with — checked out or cancelled. There is no arrival left to
  // take and no departure left to close, so this renders nothing at all: not the
  // green button, and not the "Allow late check-in" one below it either.
  if (bookingClosed(booking)) return null;

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

  // Check-out keeps its one look — black, the colour its PIN dialog and the
  // guest's departure code carry. Blue put it in the same family as every link
  // and primary action on the site, when it is neither: it is the last button
  // of a stay, and it should read as final rather than as inviting. Check-in
  // follows the window: grey before the hour, green once it opens, amber
  // through the closing stretch of the grace period — the same three colours
  // the server names in `button_state`.
  const tone = !isIn
    ? "bg-ink hover:bg-ink/85"
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
  notice = "",
}: {
  pin: string;
  expiresIn: number;
  mode: "in" | "out";
  /** What reading this code out is about to cost — shown only when there IS a
   *  cost. An ordinary departure on the booked day gets nothing: a warning
   *  printed on every check-out is a warning nobody reads on the one that
   *  matters. Empty otherwise. */
  notice?: string;
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
        out ? "border-ink/25 bg-ink/[0.04]" : "border-[#2f9e44]/30 bg-[#2f9e44]/[0.05]"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className={`flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide ${
              out ? "text-ink" : "text-[#2f9e44]"
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

      {/* The one warning that belongs beside a code rather than at the top of
          the panel: reading these digits out is the act that ends the stay, and
          leaving early is not undoable. It sits INSIDE the card, under the
          digits, so it cannot be scrolled past on the way to them. */}
      {notice && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border-l-4 border-red-500 bg-red-50 px-3 py-2 text-[12.5px] font-medium leading-5 text-red-600">
          <AlertTriangle size={14} className="mt-[2px] shrink-0" aria-hidden />
          <span>{notice}</span>
        </p>
      )}
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

/**
 * How many people the host actually counted through the door, recorded when
 * they verified the arrival PIN.
 *
 * The one figure worth showing: the booked party size was a guess made at
 * checkout, and once someone has stood at the door and counted, that count is
 * simply who is in the property. Setting the two side by side only invited the
 * reader to work out a difference that changes nothing.
 */
function ArrivedGuests({ booking }: { booking: Booking }) {
  // A stay checked in before the host was ever ASKED for a headcount has an
  // arrival on record and no number against it — every check-in taken before
  // this existed, and on a split stay that is most of them. "Not yet" would be
  // plainly wrong there: somebody did walk in. The party the booking was made
  // for is the best answer anyone has for those, and it is the figure that
  // stay has always reported, so it stands in.
  const arrived =
    !!booking.checkedInAt || (booking.segments || []).some((s) => s.checkedInAt);
  const count = booking.checkedInGuests || (arrived ? booking.guests : 0);
  if (!count) {
    return <span className="text-muted">Not yet</span>;
  }
  return <span className="text-green-600">{plural(count, "guest")}</span>;
}

/**
 * One end of one part of a split stay: when the guest ACTUALLY arrived, or
 * actually left.
 *
 * Only the real stamp. The hours a part was due to open and close are the
 * property's, identical on every part, and are stated once beside the villa
 * instead of repeated down the list. What differs part by part — and what the
 * booking's own two stamps can never tell you, being just the first arrival and
 * the last departure of the whole stay — is this.
 */
function PartMoment({
  icon,
  label,
  actual,
  pending,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  /** When it actually happened — "" while it hasn't. */
  actual: string;
  /** What to say instead while there is no stamp yet. */
  pending: string;
  tone: "green" | "primary" | "red";
}) {
  const toneClass =
    tone === "red" ? "text-red-600" : tone === "green" ? "text-green-600" : "text-primary";
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-muted">
        <span className="shrink-0 text-muted/70">{icon}</span>
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-[11.5px] font-semibold ${
          actual ? toneClass : "text-muted"
        }`}
        title={actual || undefined}
      >
        {actual || pending}
      </p>
    </div>
  );
}

// Label on top, value on its own line below — for the longer date-time values
// (a full "12 Feb 2026, 2:00 PM") that would be clipped by the side-by-side Pair.
function StackedPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 py-[3px]">
      <p className="truncate text-[11px] text-muted" title={label}>
        {label}
      </p>
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
  onEdit,
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
  // Guest side: add extra services or nights to this stay. Rendered beside
  // Cancel — the two are the same decision from opposite ends — and only when
  // there is genuinely something to add (see Booking.canAddServices /
  // canAddNights), so the button never opens onto an empty screen.
  onEdit?: () => void;
  // Guest side: leave/update a review for a completed stay.
  onReview?: (rating: number, comment: string) => void | Promise<void>;
  reviewBusy?: boolean;
}) {
  const [editingReview, setEditingReview] = useState(false);
  const toast = useToast();
  // Same ticking server clock the row uses, so the pill here and the label in
  // the collapsed row above can never disagree about how late a guest is.
  const now = useServerWallClock(booking.serverNow);
  const status = bookingStatus(booking, now);
  const place = [booking.villaCity, booking.villaCountry].filter(Boolean).join(", ");
  // The panel is shared: the host sees it with check-in/out handlers, the guest
  // with a cancel handler. That tells us which side is reading, so the wording
  // and the contact column can be aimed at the right person.
  const role: "owner" | "guest" = onCheckIn || onCheckOut ? "owner" : "guest";
  // How long until the guest arrives — null once the stay is under way, over,
  // cancelled or missed, which is precisely when the status pill has something
  // of its own to say.
  const countdown = checkInCountdown(booking, now);
  const cancelled = booking.status === "cancelled";
  // Checked out or cancelled: the panel is a record of a stay, not a place to
  // do anything to it. Every action the header can hold is gated on this, so a
  // booking sitting in Booking History cannot show one whatever the flags on it
  // say. Only Hide — and the review, which is what these bookings are for.
  const closed = bookingClosed(booking);

  // The runs this stay is really made of. Older payloads carry none, in which
  // case the booking's own two dates ARE the single run — the same fallback the
  // server's `stay_segments()` applies.
  // Where this stay has got to, part by part, on the SERVER's ticking clock —
  // a part ends because its check-out hour arrived, not because anyone pressed
  // a button, so it is read off the clock and stays honest between refetches.
  const progress = stayProgress(booking, now);
  const segments = progress.parts;
  // A split stay spends the two middle columns on its list of parts, which
  // leaves the outer two short. The facts that used to sit under that list are
  // moved into them instead — see where each lands below.
  const splitStay = segments.length > 1;
  // Which part the panel points at: the one being lived in (or whose door is
  // open and unanswered), and once that is behind us, the next one the guest is
  // due back for. Keyed by its check-in date, which is unique within a stay.
  const focusKey =
    segments.find((s) => s.status === "current" || s.status === "awaiting")?.checkIn ??
    segments.find((s) => s.status === "upcoming")?.checkIn ??
    "";

  // What leaving early actually did — no refund for the nights they didn't use,
  // and those nights back on the calendar for someone else. Both are surprises
  // otherwise: the guest paid for them, and they will see the property bookable
  // on dates they had held.
  //
  // Written once and shown where the departure IS, not on a strip at the top of
  // the panel: on the part it happened in, or on the departure line of a stay
  // that only had one part. A stay that ran its course says none of this.
  const earlyNote = !booking.earlyCheckOut
    ? ""
    : role === "guest"
      ? `You left ${plural(booking.releasedNights, "night")} early. Nothing is refunded — the stay was paid for in full — and ${
          booking.releasedNights === 1 ? "that night is" : "those nights are"
        } open for other guests again.`
      : `Guest left ${plural(booking.releasedNights, "night")} early. No refund is due, and ${
          booking.releasedNights === 1 ? "that night is" : "those nights are"
        } back on your calendar for other guests to book.`;

  // And the other way a part can end without being stayed in: nobody ever
  // arrived, and its hour to be vacated came round anyway. "Missed" on the chip
  // says it happened; it does not say what it COST, and that is the half a guest
  // reads the panel for — the nights were paid for, the window to claim them has
  // shut, and nothing comes back. Left unsaid, a red chip reads like a booking
  // that quietly refunded itself.
  const missedNote = (nights: number) =>
    role === "guest"
      ? `No-show — nobody checked in before the check-in window closed, so ${plural(
          nights,
          "night"
        )} went unstayed. Nothing is refunded for ${
          nights === 1 ? "it" : "them"
        }; the stay was paid for in full.`
      : `No-show — the guest never checked in before the window closed, so ${plural(
          nights,
          "night"
        )} went unstayed. No refund is due to them.`;

  // Every change made to this booking after it was paid for, oldest first —
  // nights given up on one side, services and nights bought on the other. They
  // are one list because they are one story: what this stay has cost so far and
  // what came back, in the order the guest decided it. Each carries the words
  // for its own row and the detail its tooltip holds (see the Payment column).
  // How long the stay actually is now. A booking that was trimmed still carries
  // the night count it was PRICED over (that's what every per-night figure is
  // worked out against), but the nights the guest is coming for are the ones
  // still held — and a stay that has since been extended holds more of them
  // than it was booked with. One number, not a comparison: the ledger below
  // says what was given up and what was added, so this doesn't have to.
  const stayNights = cancelled ? booking.nights : booking.activeNights || booking.nights;

  // --- What this stay has actually cost, once everything since is counted ---
  //
  // `total` is the price of the stay as it now stands: extending it raised the
  // subtotal, fee, tax and extras, and buying a service raised the extras, so
  // the line items in the Payment column already carry every addition. What
  // they cannot carry is a REFUND — cancelling leaves `total` untouched on
  // purpose (it is what every per-night figure is worked out against) — so the
  // money that went back is subtracted here, and the figure at the foot of the
  // column is what the guest is genuinely out of pocket.
  const refunded = booking.refundedTotal || 0;
  const keptFee = booking.cancellationFee || 0;
  const netPaid = Math.max(0, (booking.total || 0) - refunded);
  // Counted off the server's own lists, not by adding the receipts up: a night
  // cancelled and later bought back is no longer a cancelled night (see
  // Booking.cancelled_nights), and it must not be counted as one here either.
  const cancelledNights = booking.cancelledNights?.length ?? 0;
  const addedTotal = booking.additionsTotal || 0;
  const addedNights = (booking.additions || [])
    .filter((a) => a.kind === "nights")
    .reduce((n, a) => n + a.nightsCount, 0);

  const changes = [
    ...(booking.cancellations || []).map((c) => ({
      id: `cancel-${c.id}`,
      at: c.createdAt,
      kind: "cancel" as const,
      // A services row is not a night going: the stay is untouched and what was
      // given back is named, because "0 nights cancelled" is not what happened.
      label:
        c.kind === "full"
          ? "Booking cancelled"
          : c.kind === "services"
            ? `${c.services.map((s) => s.name).join(", ") || "Extra services"} removed`
            : `${plural(c.nightsCount, "night")} cancelled`,
      // WHICH nights went, in as little room as that can be said in — the one
      // question "3 nights cancelled" leaves the guest with — and, when there
      // were services on those nights, that their money is in the refund too.
      // It doesn't follow the cancellation ladder: a service on a night that
      // is no longer happening comes back whole, so a refund bigger than the
      // tier suggests would otherwise look like a mistake.
      //
      // On a services row the same dates mean the opposite thing — the nights
      // the guest KEEPS, minus the service — so they are worded as such.
      dates:
        c.kind === "services"
          ? `for ${fmtNights(c.nights)} · refunded in full`
          : fmtNights(c.nights) +
            (c.extrasRefund > 0
              ? ` · incl. ${money(c.extrasRefund)} for extra services`
              : ""),
      detail: [
        c.kind === "services"
          ? c.services
              .map((s) => `${s.name} ${money(s.price)} × ${s.nights ?? 0}`)
              .join(", ")
          : "",
        c.nights.map((n) => fmtDate(n)).join(", "),
        c.kind !== "services" && c.extrasRefund > 0
          ? `${money(c.extrasRefund)} of extra services refunded in full`
          : "",
        c.cancellationFee > 0 ? `${money(c.cancellationFee)} cancellation charge` : "",
        c.message,
      ]
        .filter(Boolean)
        .join(" — "),
      // A cancellation inside the last 24 hours hands nothing back, and "+$0.00"
      // reads as a refund that happened. It didn't.
      value: c.refundAmount > 0 ? `+${money(c.refundAmount)}` : "No refund",
      tone: c.refundAmount > 0 ? "text-green-600" : "text-muted",
    })),
    ...(booking.additions || []).map((a) => {
      // Nights and services can be bought in ONE purchase, so the row has to
      // name both halves — an amount that covers a night and a service under a
      // label that mentions only the service is a receipt the guest can't
      // check. `carried` services were already on the booking and merely run
      // over the new nights; they are part of the price, not part of what was
      // chosen, so they are not named here.
      const bought = a.services.filter((s) => !s.carried);
      const label =
        [
          a.nightsCount > 0 ? plural(a.nightsCount, "night") : "",
          bought.map((s) => s.name).join(", "),
        ]
          .filter(Boolean)
          .join(" + ") || "Added to booking";
      return {
        id: `add-${a.id}`,
        at: a.createdAt,
        kind: "add" as const,
        label: `${label} added`,
        // The nights bought, or — on a services-only purchase — the nights the
        // service runs over, which is what it was charged for.
        dates: !a.nights.length
          ? ""
          : a.nightsCount > 0
            ? fmtNights(a.nights)
            : `for ${fmtNights(a.nights)}`,
        detail: [
          a.nightsCount > 0 ? `nights ${a.nights.map((n) => fmtDate(n)).join(", ")}` : "",
          ...a.services.map(
            (s) =>
              `${s.name} ${money(s.price)} × ${s.nights ?? 0}${s.carried ? " (carried on)" : ""}`
          ),
          a.paymentMethod
            ? `paid with ${a.paymentMethod}${a.paymentReference ? ` · ${a.paymentReference}` : ""}`
            : "",
        ]
          .filter(Boolean)
          .join(" — "),
        value: `−${money(a.amount)}`,
        tone: "text-ink",
      };
    }),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // The other party's contact: the host sees the guest, the guest sees the host.
  const contactName = role === "owner" ? booking.guestName : booking.hostName;
  const contactEmail = role === "owner" ? booking.guestEmail : booking.hostEmail;
  const contactPhone = role === "owner" ? booking.guestPhone : booking.hostPhone;
  const contactAvatar = role === "owner" ? booking.guestAvatar : booking.hostAvatar;
  // The guest's own gender isn't exposed to the host, so only the host side
  // gets a gender-based placeholder; the guest column falls back to neutral.
  const contactGender = role === "owner" ? undefined : booking.hostGender;

  // A removed listing is marked on the panel — greyed photo, plain name, the
  // note near the top — only for the host who removed it. The guest's panel
  // stays exactly as it was, and only answers if they press the property.
  const hostRemovedView = booking.villaRemoved && role === "owner";
  const onRemovedProperty = (message: string) => toast.info(message);

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
              <PropertyLink
                villaId={booking.villaId}
                removed={booking.villaRemoved}
                message={booking.villaRemovedMessage}
                // The guest keeps a working-looking link that answers when
                // pressed; the host's goes plain, because the note above has
                // already told them the listing is theirs and gone, and a name
                // still asking to be clicked would contradict it.
                onRemovedClick={role === "guest" ? onRemovedProperty : undefined}
                // Ink at rest and ink on hover: the underline is what says
                // it's a link. Turning the villa's name blue under the cursor
                // put the loudest thing on the panel in the same colour as
                // every button around it.
                className={`truncate text-[16px] font-bold text-ink underline-offset-4 transition-colors ${
                  hostRemovedView ? "" : "hover:decoration-ink/40 hover:underline"
                }`}
                removedClassName="text-ink/70"
              >
                {booking.villaTitle}
              </PropertyLink>
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
          {/* Real-time status: upcoming / staying now / checked in-out /
              cancelled — except on the host's side of a stay still to come,
              where the countdown below stands in its place. "Confirmed" is the
              guest's news, not the host's: every booking in front of a host is
              confirmed, and what they need from this line is when the guest
              arrives. The label returns the moment the stay has a state worth
              naming. */}
          {!(role === "owner" && countdown) && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${
                PILL_CLASS[status.tone]
              }`}
            >
              {/* Only the dot breathes here, not the whole chip: this pill sits
                  on a tinted background, and fading the tint in and out would
                  pulse a block of colour rather than a status. The dot is the
                  same reading as the list's, at the size this panel wants. */}
              <span
                className={`h-1.5 w-1.5 rounded-full bg-current ${
                  status.pending ? "animate-soft-pulse" : ""
                }`}
                aria-hidden
              />
              {status.label}
            </span>
          )}

          {/* How long until it starts, while it hasn't — the same pill the
              collapsed row carries, so opening a booking never loses a fact,
              and the same one both sides read. */}
          <CheckInCountdownPill countdown={countdown} checkIn={booking.checkIn} role={role} />

          {/* And once it HAS started, how much of it is left — the same pill the
              row carries, so opening a booking answers the question it was
              already answering. Renders nothing outside a stay under way. */}
          <StayCountdownPill booking={booking} />

          {!closed && onCheckIn && onCheckOut && (
            <StayActionButton
              booking={booking}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              onAllowLate={onAllowLate}
              busy={working}
            />
          )}

          {/* Changing the stay sits next to cancelling it, because they are the
              same question asked in opposite directions — "more of this trip"
              and "less of it" — and a guest who opens their booking to add two
              nights should not have to go looking for the door. In the brand
              colour rather than the warning one: this one grows the stay. */}
          {!closed && onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-primary/40 px-3.5 py-[5px] text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              title="Add extra services or more nights to this stay"
            >
              <Plus size={13} className="shrink-0" aria-hidden />
              {/* Once the last arrival has come round there is no plan left to
                  change — only more of it to buy. The word follows. */}
              {lastCheckInStarted(booking, now) ? "Extend stay" : "Edit booking"}
            </button>
          )}

          {/* Cancelling sits with the status it would change, not at the foot
              of the panel: the guest reads "Confirmed" and the way to undo it
              is right there. Outlined rather than filled — it belongs beside
              the pill without shouting over it. */}
          {!closed && onCancel && (
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
              ) : cancellationGate(booking, now).open ? (
                "Cancel booking"
              ) : (
                // The whole stay can no longer be called off, but nights of it
                // still can — the night the guest is in is theirs, the ones
                // after it aren't yet. Say what the button actually does.
                "Cancel dates"
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

      {/* Nothing narrates the status here any more. This slot used to carry a
          coloured strip restating whatever the pill above it already said —
          "You're checked in", "You're already checked in, this stay can no
          longer be cancelled" — and the panel opened with a paragraph about a
          state the reader had just read the name of. What is genuinely
          actionable has moved to where the action is: the departure warning
          onto the check-out PIN, the cancellation cost into the dialog that
          takes the decision, the early departure onto the part it happened in.

          The guest's stay PIN — arrival or departure, whichever is live (never
          both: a booking has one code at a time). Sent to the guest and to
          nobody else, which is what makes a check-in evidence that the guest was
          actually at the property, and a check-out evidence they were there to
          leave. */}
      {/* The one thing on this panel that is genuinely about to happen: the
          hour to be out has passed, and the stay closes itself when the clock
          under it runs out. Both sides see the same countdown — the host still
          has time to close it properly with the guest's PIN, and the guest is
          told when their booking stops being open rather than discovering it
          already was. */}
      <ForcedCheckOutPill booking={booking} variant="banner" />

      {/* The HOST's panel only. They took the property down, so their own
          rent-request rows say so outright, dated, and say what it does NOT
          change — because that is the question it raises: the stay is still
          on, still checks in and out, still cancels and gets reviewed on the
          terms it was booked on. Only the listing has closed.

          The guest is told nothing here. Their stay is going ahead perfectly
          normally, and a notice on it would read as trouble with the booking.
          They hear it only if they press the property expecting a listing —
          see the header link above. */}
      {booking.villaRemoved && role === "owner" && (
        <RemovedNote
          message={booking.villaRemovedMessage}
          at={booking.villaRemovedAt}
        />
      )}

      {/* The live stay codes, and only while the stay is live: a code left on a
          booking that has already been checked out or cancelled is a door that
          no longer opens, offered to a guest who would go and read it out. */}
      {role === "guest" && !closed && booking.checkinPin && (
        <StayPinCard
          mode="in"
          pin={booking.checkinPin}
          expiresIn={booking.checkinPinExpiresIn}
        />
      )}
      {role === "guest" && !closed && booking.checkoutPin && (
        <StayPinCard
          mode="out"
          pin={booking.checkoutPin}
          expiresIn={booking.checkoutPinExpiresIn}
          // Leaving early used to be announced on a strip at the top of this
          // panel, where it was a fact about a departure that hadn't happened
          // yet, sitting a long way from the digits that would make it happen.
          // It belongs with the code: this is the last moment the guest can
          // decide not to. The server's own line, the same one the host is
          // reading in their dialog, so neither side is warned about a
          // different number of nights.
          notice={booking.checkoutEarlyNow ? booking.checkoutMessage : ""}
        />
      )}

      {/* The cancellation policy is no longer previewed here either. What it
          would cost is a fact about a decision, and the guest reads it in the
          Cancel dialog at the moment they take it — where it can't be stale and
          can't be missed. Standing on the panel it was either telling them
          cancelling was free (worth nothing) or telling them they could no
          longer do a thing they weren't trying to do. */}

      {/* Cancelled: what the late-cancellation fine took, and what's refunded.
          Only for a stay cancelled before the per-event receipts existed — a
          booking that HAS them says all of this in the ledger down in the
          Payment column, on the line the money itself is on, and saying it
          twice put a banner above a panel that already answered the question. */}
      {cancelled &&
        !booking.cancellations?.length &&
        (booking.cancellationFee > 0 || booking.refundAmount > 0) && (
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
          {/* Black and white on the HOST's panel once they've taken the
              property down — the fastest reading there is, saying before a
              word is read that this one is off the platform, and it keeps the
              real picture rather than a placeholder because this is still the
              record of a stay on it.

              Full colour on the guest's. Their booking hasn't changed, and a
              greyed-out photo of the place they are going to would say it
              had. */}
          <PropertyLink
            villaId={booking.villaId}
            removed={booking.villaRemoved}
            message={booking.villaRemovedMessage}
            onRemovedClick={role === "guest" ? onRemovedProperty : undefined}
            title={booking.villaTitle}
            className="img-frame group mb-3 block aspect-[16/9] w-full overflow-hidden rounded-xl"
          >
            <Img
              src={booking.villaCover}
              alt={booking.villaTitle}
              fallback={PLACEHOLDER_IMG}
              className={`h-full w-full object-cover transition-transform duration-500 ease-out ${
                hostRemovedView ? REMOVED_IMG : "group-hover:scale-[1.06]"
              }`}
            />
          </PropertyLink>

          {/* The property's own hours. On a split stay every part opens and
              closes on these same two, so they are stated once here rather than
              repeated on each part in the list — the parts carry what differs
              between them, which is when the guest actually came and went. */}
          {splitStay && (
            <div className="mb-4">
              <Group title="Property check-in &amp; check-out">
                <Pair label="Check-in from" value={fmtWallTime(booking.checkInAt) || "—"} />
                <Pair label="Check-out by" value={fmtWallTime(booking.checkOutAt) || "—"} />
              </Group>
            </div>
          )}

          {/* The person on the other end, at the foot of the column: the host to
              a guest, the guest to a host. `mt-auto` is what puts it there — it
              takes whatever height the columns beside it left over, so this one
              ends level with them instead of trailing off into white space. */}
          <div className="mt-auto">
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
                    <span
                      className="flex items-center gap-1 truncate text-[12px] text-muted"
                      title={contactEmail}
                    >
                      <Mail size={12} className="shrink-0" aria-hidden />
                      <span className="truncate select-text">{contactEmail}</span>
                    </span>
                  ) : (
                    <span className="block text-[12px] text-muted">No contact email</span>
                  )}
                  {contactPhone && (
                    <span
                      className="flex items-center gap-1 truncate text-[12px] text-muted"
                      title={contactPhone}
                    >
                      <Phone size={12} className="shrink-0" aria-hidden />
                      <span className="truncate select-text">{contactPhone}</span>
                    </span>
                  )}
                </div>
              </div>
            </Group>
          </div>
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
            {/* Section head: what shape this stay is, then where it has got to.
                Two quiet lines instead of a heading, a pill and a status all
                fighting along one — the count is what the block IS, the
                progress is news about it, and they read in that order. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted">
                Stay
              </p>
              <span className="rounded-full bg-primary/10 px-2 py-[1px] text-[10px] font-bold uppercase tracking-wide text-primary">
                Split · {segments.length} parts
              </span>
            </div>
            {/* How far through the stay we are, in words. Derived from the
                clock, so it moves on its own as each part's check-out hour
                passes — nobody has to press anything for it to be right. */}
            <p className="mt-1 text-[11.5px] text-body">
              {plural(stayNights, "night")} in total · {progress.label}
            </p>

            {/* One card per part rather than rows of a table. A part is a small
                stay of its own — it has a name, a state, dates, its own two
                hours — and giving it a card lets each of those sit on its own
                line instead of being squeezed into shared lanes. The card's
                tint is its state, so the eye finds the part under way without
                reading a word. */}
            <ol className="mt-2 space-y-1.5">
              {segments.map((s, i) => {
                const last = i === segments.length - 1;
                const gap = last ? 0 : nightsBetween(s.checkOut, segments[i + 1].checkIn);
                const done = s.status === "completed";
                // The one part this list is really about right now: the one
                // being lived in (or whose door is open), and once that is
                // behind us, the next one the guest is due back for. It gets a
                // ring rather than another colour — the tints already say what
                // each part IS, and this says which one to look at.
                const focused = s.checkIn === focusKey;
                return (
                  <Fragment key={s.checkIn}>
                    <li
                      className={`rounded-lg border px-3 py-2 ${PART_CARD[s.status]} ${
                        focused ? `ring-2 ring-inset ${PART_RING[s.status]}` : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-muted">
                          Part {s.index} of {segments.length}
                          {focused && s.status === "upcoming" && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wide text-amber-700">
                              Next
                            </span>
                          )}
                        </span>
                        <PartStatusChip status={s.status} leftEarly={s.leftEarly} />
                      </div>

                      <div className="mt-0.5 flex items-baseline justify-between gap-3">
                        <span
                          className={`min-w-0 truncate text-[13px] font-semibold ${
                            done ? "text-muted" : "text-ink"
                          }`}
                        >
                          {fmtRange(s.checkIn, s.checkOut)}
                        </span>
                        <span className="shrink-0 text-[11.5px] font-medium text-body">
                          {plural(s.nights, "night")}
                        </span>
                      </div>

                      {/* What actually happened to THIS part — and only once
                          something HAS. Before the guest is checked in there are
                          no stamps to print, and two "not yet" lines would make
                          every future part taller for nothing; the chip above
                          already says where the part stands. The hours it was
                          due to open and close are the property's, the same on
                          every part, and are stated once beside the villa rather
                          than repeated down this list. */}
                      {s.checkedInAt && (
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                          <PartMoment
                            icon={<LogIn size={11} aria-hidden />}
                            label="Arrived"
                            actual={fmtDateTime(s.checkedInAt)}
                            pending="Not yet"
                            tone="green"
                          />
                          <PartMoment
                            icon={<LogOut size={11} aria-hidden />}
                            label={s.leftEarly ? "Left early" : "Left"}
                            actual={s.checkedOutAt ? fmtDateTime(s.checkedOutAt) : ""}
                            pending="Not yet"
                            tone={s.leftEarly ? "red" : "primary"}
                          />
                        </div>
                      )}

                      {/* Who walked in for THIS part. A split stay is arrived at
                          once per part and the party can be a different size
                          each time, so the count sits on the part rather than
                          only on the booking. */}
                      {s.checkedInGuests > 0 && (
                        <p
                          className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-body"
                          title="Guests the host counted in for this part"
                        >
                          <Users size={11} className="shrink-0 text-muted/70" aria-hidden />
                          {plural(s.checkedInGuests, "guest")} checked in
                        </p>
                      )}

                      {/* The one thing a finished part can carry that its dates
                          don't say: it ended because the guest walked out, not
                          because its hour came. Inside the card it belongs to —
                          this is that part's history, not the booking's. */}
                      {s.leftEarly && (
                        <p className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] leading-4 text-red-600">
                          {earlyNote}
                        </p>
                      )}

                      {/* And the part nobody turned up for. Same place, same
                          voice: what happened to THIS part and what it cost,
                          inside the card it happened to. */}
                      {s.status === "missed" && (
                        <p className="mt-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] leading-4 text-red-600">
                          {missedNote(s.nights)}
                        </p>
                      )}
                    </li>

                    {/* The nights between two parts: a rule with the fact on it,
                        so the break is something you SEE between the cards
                        rather than another row to read. */}
                    {gap > 0 && (
                      <li className="flex items-center gap-2.5 px-1 py-0.5">
                        <span className="h-px flex-1 bg-line" aria-hidden />
                        <span className="shrink-0 text-[10.5px] text-muted">
                          {plural(gap, "night")} in between — another booking, not charged
                        </span>
                        <span className="h-px flex-1 bg-line" aria-hidden />
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ol>

            {/* What has been done to this stay since it was booked, in rows of
                the same list the parts are in — because that is what they are:
                nights that used to be parts and nights that became them. */}
            <StayChanges changes={changes} />
          </div>
        ) : (
          <>
            {/* Stay — the scheduled check-in/out moments (the "original" times
                the arrival beside it is measured against). Falls back to the
                date alone on older payloads with no scheduled datetime. */}
            <Group title="Stay">
              <StackedPair label="Check-in" value={fmtDateTime(booking.checkInAt) || fmtDate(booking.checkIn)} />
              <StackedPair label="Check-out" value={fmtDateTime(booking.checkOutAt) || fmtDate(booking.checkOut)} />
              <Pair label="Duration" value={plural(stayNights, "night")} />
              {/* The headcount the host took at the door — not the party size
                  the booking was made for, which nobody has verified. */}
              <Pair label="Guests checked in" value={<ArrivedGuests booking={booking} />} />
              {/* An unbroken stay has no list of parts to hang these off, so
                  they sit at the foot of the stay itself — same rows, same
                  place in the reading order. */}
              <StayChanges changes={changes} />
            </Group>

            {/* Arrival & departure — when the guest actually turned up and left. */}
            <Group title="Arrival &amp; departure">
              <StackedPair
                label="Arrival"
                value={
                  booking.checkedInAt ? (
                    <span className="text-green-600">{fmtDateTime(booking.checkedInAt)}</span>
                  ) : segments[0]?.status === "missed" ? (
                    // An unbroken stay has no part card to carry this, so its
                    // arrival line does — the line that would otherwise sit on
                    // "Not yet" forever, on a stay that can never be arrived at.
                    <>
                      <span className="text-red-600">Never arrived</span>
                      <span className="mt-0.5 block text-[11px] font-normal leading-4 text-red-600">
                        {missedNote(segments[0].nights)}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted">Not yet</span>
                  )
                }
              />
              <StackedPair
                label="Departure"
                value={
                  booking.checkedOutAt ? (
                    <>
                      <span className={earlyNote ? "text-red-600" : "text-primary"}>
                        {fmtDateTime(booking.checkedOutAt)}
                      </span>
                      {/* An unbroken stay has no list of parts to hang this
                          off, so its one departure line carries it — and only
                          when there is something to carry. */}
                      {earlyNote && (
                        <span className="mt-0.5 block text-[11px] font-normal leading-4 text-red-600">
                          {earlyNote}
                        </span>
                      )}
                      {/* Nobody closed this stay — the clock did, half an hour
                          past the hour the guest had to be out. Worth saying on
                          the record: this departure was never witnessed by
                          either side, and a month from now that is exactly what
                          somebody querying it needs to know. */}
                      {/* Said in the voice of whoever is reading it: to the host
                          this is a record of who ended the stay, to the guest it
                          is news about their own departure. */}
                      {booking.forcedCheckOut && (
                        <span className="mt-0.5 block text-[11px] font-normal leading-4 text-muted">
                          {role === "guest"
                            ? "You were checked out automatically — your check-out hour passed with the stay still open."
                            : "Closed automatically — the check-out time passed with nobody checked out."}
                        </span>
                      )}
                    </>
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
            {booking.extraServices?.map((s, i) => {
              // Over how many nights this one was actually charged. A service
              // ticked at checkout ran the whole stay; one bought afterwards
              // runs only from the night it was bought, and a stay that has
              // since grown carries its services over the new nights too — so
              // the count comes from the service, not from the booking. Older
              // payloads carry neither, and fall back to what they always said.
              const nights = s.nights || booking.nights;
              const amount = s.amount ?? s.price * nights;
              // A service the guest has since dropped keeps its line: this is
              // the CHARGE, and what came back off it is in the refund below
              // with every other refund. The line only says that it went — and
              // the key is positional, because a service dropped and bought
              // again quite legitimately appears twice.
              return (
                <div
                  key={`${s.name}-${i}`}
                  className="flex items-baseline justify-between gap-3 py-[3px]"
                >
                  <span className="min-w-0 truncate text-[12px] text-muted">
                    <span className={s.removed ? "line-through" : ""}>{s.name}</span>
                    <span className="text-muted/70"> ({money(s.price)} × {nights})</span>
                    {s.removed && (
                      <span className="text-muted/70"> · removed</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium text-ink">
                    {money(amount)}
                  </span>
                </div>
              );
            })}

            {/* WHICH nights went and which were bought is not here — that is
                the stay's story, and it reads as rows beside the parts it
                changed (see StayChanges). What IS here is the arithmetic: the
                lines above are what the stay costs NOW (a stay extended has
                more nights in its first line, a service bought later has its
                own), and these two settle it against what actually happened.

                Without them the column stated a total the guest hadn't paid:
                cancelling deliberately leaves `total` alone — it is the frozen
                price of what was booked, and every per-night figure is worked
                out against it — so the money handed back has to come off HERE,
                on its way to the figure at the bottom. */}
            {refunded > 0 && (
              <>
                <div className="mt-1.5 flex items-baseline justify-between gap-3 border-t border-line pt-1.5">
                  <span className="text-[12px] text-muted">Charged</span>
                  <span className="text-[12.5px] font-medium text-ink">
                    {money(booking.total)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 py-[3px]">
                  <span className="min-w-0 truncate text-[12px] text-muted">
                    Refunded
                    {cancelledNights > 0 && (
                      <span className="text-muted/70">
                        {" "}
                        ({plural(cancelledNights, "night")} cancelled)
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12.5px] font-medium text-green-600">
                    −{money(refunded)}
                  </span>
                </div>
              </>
            )}

            <div className="mt-auto flex items-center justify-between border-t border-line pt-1.5">
              <span className="text-[12.5px] font-bold text-ink">
                {refunded > 0 ? "Paid in total" : "Total paid"}
              </span>
              <span className="text-[14px] font-bold text-ink">{money(netPaid)}</span>
            </div>

            {/* The two things the figure above doesn't explain by itself: what
                of it is a cancellation charge rather than a stay, and how much
                of it was decided after the booking was made. */}
            {(keptFee > 0 || addedTotal > 0) && (
              <p className="pt-1 text-[11px] leading-4 text-muted">
                {keptFee > 0 && <>Includes {money(keptFee)} cancellation charge. </>}
                {addedTotal > 0 && (
                  <>
                    Includes {money(addedTotal)} added after booking
                    {addedNights > 0 && ` (${plural(addedNights, "night")})`}.
                  </>
                )}
              </p>
            )}
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

            {/* On a split stay the parts list makes this row tall and leaves
                the money column with space under it. Who the booking is for
                and when it was made close it off — small facts that were
                homeless once the stay became a list of parts. */}
            {splitStay && (
              <div className="mt-3 grid grid-cols-2 gap-x-4 border-t border-line pt-2">
                {/* The counted party, never the booked one — the same single
                    figure the unbroken stay's panel shows. On a split stay this
                    is the LATEST arrival's count: each part is checked in on
                    its own, and the per-part counts are on the cards. */}
                <StackedPair
                  label="Checked in"
                  value={<ArrivedGuests booking={booking} />}
                />
                <StackedPair label="Booked on" value={fmtDate(booking.createdAt)} />
              </div>
            )}
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
