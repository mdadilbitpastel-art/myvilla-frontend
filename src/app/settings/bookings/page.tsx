"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, ChevronDown, Star, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import BookingDetails from "@/components/settings/BookingDetails";
import CountPill from "@/components/ui/CountPill";
import StayPartChips from "@/components/ui/StayPartChips";
import Img from "@/components/ui/Img";
import { fetchMyBookings, cancelBooking, submitReview, type Booking } from "@/lib/api";
import {
  bookingStatus,
  cancellationGate,
  checkInCountdown,
  checkInGate,
  lifecycleOf,
  stayAction,
  useServerWallClock,
  stayProgress,
  STATUS_TONE_CLASS,
  type CancellationGate,
} from "@/lib/booking";

const COLUMNS = [
  "Name of Villa",
  "Posted",
  "Stay Duration",
  "No. of Guests",
  "Status",
  "",
];

// One grid template shared by the header and every row so the columns line up.
//        villa   posted   stay    guests  status  actions
// Stay Duration takes what Posted and Status give up: it carries the longest
// value of the three ("12 Sep-19 Sep", plus a "2 parts" tag on a split stay),
// while the other two are a short phrase and a one-word pill. The six still
// total 6.7fr, so the villa and action columns keep the width they had.
const ROW_GRID = "grid-cols-[1.4fr_0.75fr_1.4fr_0.8fr_0.75fr_1.6fr]";
const ROW_MINW = "min-w-[860px]";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtStay(checkIn: string, checkOut: string): string {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const one = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${one(a)}-${one(b)}`;
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "1 week ago";
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return "1 month ago";
  return `${Math.floor(days / 30)} months ago`;
}

const money = (n: number) => `$${n.toFixed(2)}`;

function fmtFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * The greeting a guest sends themselves on WhatsApp after paying — booking
 * details, the villa's photo and a link back to the listing. The photo URL
 * leads so WhatsApp previews the picture rather than the page.
 */
function greetingText(b: Booking): string {
  const site = typeof window !== "undefined" ? window.location.origin : "";
  const where = [b.villaCity, b.villaCountry].filter(Boolean).join(", ");
  return [
    `Hi ${b.guestName || "there"}! 🎉`,
    `Your MyVilla booking is confirmed.`,
    ``,
    `🏡 ${b.villaTitle}`,
    where ? `📍 ${where}` : "",
    // A split stay's two outer dates would read as one continuous booking, so
    // each part is spelled out — the guest is leaving and coming back, and the
    // message they keep on their phone is exactly where that has to be clear.
    ...(b.segments?.length > 1
      ? [
          `📅 ${b.nights} night${b.nights === 1 ? "" : "s"} in ${b.segments.length} parts:`,
          ...b.segments.map(
            (s, i) =>
              `   ${i + 1}. ${fmtFull(s.checkIn)} → ${fmtFull(s.checkOut)}` +
              ` (${s.nights} night${s.nights === 1 ? "" : "s"})`
          ),
        ]
      : [
          `📅 ${fmtFull(b.checkIn)} → ${fmtFull(b.checkOut)} (${b.nights} night${b.nights === 1 ? "" : "s"})`,
        ]),
    `👥 ${b.guests} guest${b.guests === 1 ? "" : "s"}`,
    ...(b.extraServices?.length
      ? [
          `✨ Extra services:`,
          ...b.extraServices.map(
            (s) => `   • ${s.name} — ${money(s.price)} × ${b.nights} = ${money(s.price * b.nights)}`
          ),
        ]
      : []),
    `💳 Total paid: ${money(b.total)}`,
    ``,
    b.villaCover ? `📸 ${b.villaCover}` : "",
    site ? `🔗 ${site}/villa/${b.villaId}` : "",
    ``,
    `See you soon — MyVilla.com`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function WhatsAppGreeting({
  booking,
  onDismiss,
}: {
  booking: Booking;
  onDismiss: () => void;
}) {
  // wa.me with no number opens WhatsApp's own chat picker, so the guest chooses
  // who it goes to — themselves, family, whoever is travelling with them.
  const href = `https://wa.me/?text=${encodeURIComponent(greetingText(booking))}`;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] px-4 py-3.5">
      <div className="flex items-center gap-3">
        <Img
          src={booking.villaCover}
          alt={booking.villaTitle}
          className="h-11 w-11 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold text-ink">
            Booking confirmed — {booking.villaTitle}
          </p>
          <p className="mt-0.5 text-[12.5px] text-body">
            Send the details and photo to WhatsApp.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-[#25d366] px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Share on WhatsApp
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[12.5px] text-muted underline underline-offset-2 hover:text-ink"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function SortDropdown({ sort, onToggle }: { sort: "desc" | "asc"; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-body transition-colors hover:border-primary/40"
    >
      Sort: {sort === "desc" ? "Latest to Oldest" : "Oldest to Latest"}
      <ChevronDown size={14} className="text-muted" />
    </button>
  );
}

function BookingRow({
  booking,
  onCancel,
  cancelling,
  onReview,
  reviewBusy,
  expanded,
  onToggle,
}: {
  booking: Booking;
  onCancel: (booking: Booking, gate: CancellationGate) => void;
  cancelling: boolean;
  onReview: (rating: number, comment: string) => void | Promise<void>;
  reviewBusy: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  // The server's clock, ticking — so a page left open through the check-in
  // hour drops the Cancel button on its own, exactly when the server would
  // start refusing it, rather than offering a cancellation that can't happen.
  const now = useServerWallClock(booking.serverNow);
  const status = bookingStatus(booking, now);
  // How far through a split stay this is — the row shows a chip per part, the
  // expanded panel below spells each one out with its dates.
  const progress = stayProgress(booking, now);
  // The flexible cancellation policy: free before the check-in day, 50% on the
  // day, closed from the check-in time on.
  const gate = cancellationGate(booking, now);
  const canCancel = gate.open;
  // The guest's check-in code. Cancelling used to share this slot; it has moved
  // into the expanded panel, where it sits at the foot past everything it would
  // undo, so the row now carries no destructive action at all — the one thing
  // a mis-aimed tap next to "View" could do damage with.
  //
  // The slot appears the moment the window opens, not when the host presses
  // Check in — until the code exists it holds `****`. A guest standing at the
  // door needs to know the code is coming and where it will appear; an empty
  // row that sprouts a PIN for sixty seconds is one they can miss entirely.
  //
  // The same slot serves the departure code, so a guest who is asked for a PIN
  // on the way out looks in the place they already know. Which of the two it is
  // follows the one stay action that's open: never both, because the booking is
  // only ever at one of them.
  const checkin = checkInGate(booking, now);
  const action = stayAction(booking);
  const pinMode: "in" | "out" | null =
    action === "check_in" && checkin.visible && checkin.open
      ? "in"
      : action === "check_out" && booking.checkoutAvailable
        ? "out"
        : null;
  const pin = pinMode === "out" ? booking.checkoutPin : booking.checkinPin;
  // How many days until this stay starts — only ever set while it's confirmed
  // and still ahead, so the row can render it without asking any questions.
  const countdown = checkInCountdown(booking, now);
  const rowRef = useRef<HTMLDivElement>(null);

  // On expand, bring the whole opened panel into view — after the 300ms open
  // animation, so what gets measured is its final height and not a box still
  // growing. `nearest` scrolls the least it can: a panel already fully visible
  // doesn't move at all, one hanging off the bottom comes up just enough, and
  // one taller than the viewport lands with its top edge in view.
  //
  // The scroll margins below are what keep it clear of the chrome: the page's
  // sticky navbar + "Manage Account" bar would otherwise take a bite out of
  // the top of the panel, since the browser scrolls to the element's own edge
  // and knows nothing about what is floating over it.
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => {
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 320);
    return () => clearTimeout(t);
  }, [expanded]);

  return (
    <div
      ref={rowRef}
      // scroll-mt: navbar (68px) + the collapsed page header (~50px) + a gap.
      // scroll-mb: the same courtesy at the foot, so the panel never ends
      // flush against the bottom edge of the window.
      // Open, the row draws its own edge clearly: the hairline darkens from the
      // list's own border-line to near-ink, over white, on a soft drop shadow.
      // An opened panel is tall enough that its top and bottom are rarely on
      // screen together, and at border-line it was easy to lose track of where
      // the thing you're reading starts and ends. Deliberately neutral, not the
      // brand colour — a blue outline read as a selection or an alert, and this
      // row is neither: it's simply the one you have open.
      className={`${ROW_MINW} scroll-mt-[132px] scroll-mb-6 overflow-hidden rounded-lg border transition-all duration-300 ${
        expanded
          ? "border-ink/25 bg-white shadow-[0_6px_22px_-10px_rgba(20,20,45,0.28)]"
          : "border-line"
      }`}
    >
      {/* Collapsed: the compact table row (collapses away as the detail opens). */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`grid ${ROW_GRID} items-center px-4 py-3.5 text-[13px]`}>
            <Link
              href={`/villa/${booking.villaId}`}
              title={booking.villaTitle}
              className="group flex min-w-0 items-center gap-2.5 pr-2"
            >
              <Img
                src={booking.villaCover}
                alt={booking.villaTitle}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-ink group-hover:text-primary">
                  {booking.villaTitle}
                </span>
                {booking.extraServices?.length > 0 && (
                  <span
                    className="truncate text-[11px] text-muted"
                    title={booking.extraServices.map((s) => s.name).join(", ")}
                  >
                    ✨ {booking.extraServices.length} extra service
                    {booking.extraServices.length === 1 ? "" : "s"} · +{money(booking.extrasTotal)}
                  </span>
                )}
              </span>
            </Link>
            <span className="text-body">{relativeTime(booking.createdAt)}</span>
            <span className="flex min-w-0 flex-col text-body">
              <span>{fmtStay(booking.checkIn, booking.checkOut)}</span>
              {/* The two dates only bracket a split stay, so the parts are shown
                  under them rather than letting the row read as one continuous
                  booking. A chip each, in order: which are behind us, which one
                  the stay is on, which are still to come. */}
              <StayPartChips progress={progress} />
            </span>
            <span className="text-body">
              {booking.guests} guest{booking.guests === 1 ? "" : "s"}
            </span>
            {/* Status — reflects where the stay actually is (upcoming / ongoing / done). */}
            <span className={`text-[13px] font-semibold ${STATUS_TONE_CLASS[status.tone]}`}>
              {status.label}
            </span>
            {/* Actions — cancel / rate (per stay state) + view details. */}
            <div className="flex items-center justify-end gap-2">
              {/* A confirmed stay's countdown, standing in the gap this cell
                  leaves to its left (`mr-auto`) — between the status and the
                  buttons, which is dead space on every upcoming booking and
                  the one place the guest is already looking to find out where
                  the stay stands. Gone the moment the stay starts, so it never
                  competes with the PIN that takes its place. */}
              {countdown && (
                <span
                  title={`Check-in ${fmtFull(booking.checkIn)}`}
                  className={`mr-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1 text-[12px] font-semibold ${
                    countdown.imminent
                      ? "bg-[#e8912a]/12 text-[#b26a10]"
                      : "bg-green-600/10 text-green-700"
                  }`}
                >
                  <CalendarClock size={13} aria-hidden />
                  {countdown.label}
                </span>
              )}
              {booking.reviewRating > 0 ? (
                // One star and the score, not a five-star strip: in a dense
                // row the strip sat awkwardly next to the other star icons.
                <span
                  title={`You rated this stay ${booking.reviewRating} out of 5`}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-star/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-[#b8860b]"
                >
                  <Star size={13} className="fill-star text-star" aria-hidden />
                  Rated {booking.reviewRating.toFixed(1)}
                </span>
              ) : booking.canReview ? (
                <button
                  type="button"
                  onClick={() => onToggle(booking.id)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-star/15 px-3 py-1.5 text-[12.5px] font-semibold text-[#b8860b] transition-colors hover:bg-star/25"
                >
                  <Star size={13} className="fill-star text-star" aria-hidden />
                  Rate stay
                </button>
              ) : null}
              {pinMode && (
                <span
                  title={
                    pin
                      ? `Read this out to your host to be checked ${pinMode}`
                      : `Your host starts check-${pinMode} — your code appears here`
                  }
                  aria-label={
                    pin
                      ? `Check-${pinMode} PIN ${pin.split("").join(" ")}`
                      : `Check-${pinMode} PIN not issued yet`
                  }
                  // Green arriving, blue leaving — the same pair the host's
                  // dialog uses, so both sides of the conversation are looking
                  // at the same colour.
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1 text-[12.5px] font-semibold ${
                    pinMode === "out"
                      ? "border-[#1971c2]/30 bg-[#1971c2]/[0.07] text-[#1971c2]"
                      : "border-[#2f9e44]/30 bg-[#2f9e44]/[0.07] text-[#2f9e44]"
                  }`}
                >
                  <KeyRound size={13} aria-hidden />
                  PIN
                  <span
                    aria-hidden
                    className={`font-mono text-[15px] font-bold tracking-[0.18em] ${
                      // The placeholder is deliberately quieter than a real
                      // code, so a glance can tell "not yet" from "here it is".
                      pin ? "text-ink" : "text-muted"
                    }`}
                  >
                    {pin || "****"}
                  </span>
                </span>
              )}
              <button
                type="button"
                onClick={() => onToggle(booking.id)}
                aria-expanded={expanded}
                aria-label={`View ${booking.villaTitle} booking details`}
                // py-[5px], not py-1.5: the 1px border adds the missing pixel,
                // so this ends up exactly as tall as the filled buttons beside it.
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-[5px] text-[12.5px] font-medium text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
              >
                <span className="w-[30px] text-center">View</span>
                <ChevronDown size={15} className="shrink-0" aria-hidden />
              </button>
            </div>
          </div>

          {/* The PIN used to sit here, as its own band under the row. It now
              rides in the actions cell above — same reasoning that put it in
              the collapsed row in the first place (a code you have to hunt for
              is a code that expires first), one step further. */}
        </div>
      </div>

      {/* Expanded: the full detail, which carries its own header, status and
          Hide control — so nothing shows twice — and now the only Cancel
          booking button there is, at the foot of it. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-4 sm:px-5">
            <BookingDetails
              booking={booking}
              onCollapse={() => onToggle(booking.id)}
              onCancel={canCancel ? () => onCancel(booking, gate) : undefined}
              cancelling={cancelling}
              onReview={onReview}
              reviewBusy={reviewBusy}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyBookingsPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // Which booking row is expanded to show its full details inline.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = useCallback(
    (id: string) => setExpandedId((cur) => (cur === id ? null : id)),
    []
  );
  // Each table sorts independently — one shared state would make sorting the
  // history silently re-order the active table above it.
  const [activeSort, setActiveSort] = useState<"desc" | "asc">("desc");
  const [historySort, setHistorySort] = useState<"desc" | "asc">("desc");
  const errorRef = useRef<HTMLDivElement>(null);

  // Set by ?booked=1: the greeting card below only belongs on the trip the
  // user has just paid for, not on every visit to this page.
  const [justBooked, setJustBooked] = useState(false);

  // One-time toast after a successful checkout (?booked=1).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("booked") === "1") {
      toast.success("Payment successful — your booking is confirmed!");
      setJustBooked(true);
      window.history.replaceState(null, "", window.location.pathname);
    }
    // Runs once on mount — `toast` is stable, and re-running would double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `silent` refreshes are background polls — a transient network blip there
  // must not replace the list the user is looking at with an error banner.
  const load = useCallback((silent = false) => {
    return fetchMyBookings()
      .then(setBookings)
      .catch((e) => {
        if (!silent) {
          setLoadError(e instanceof Error ? e.message : "Failed to load bookings.");
        }
      });
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    load();
  }, [ready, user, load]);

  // Keeps the list current (e.g. a stay rolling from upcoming to ongoing)
  // without a manual reload. Paused mid-cancel so an in-flight poll can't land
  // stale rows over the new state.
  // A stay inside its check-in window can be handed a PIN at any second, and
  // the PIN only lives a minute — poll fast enough that the guest is never
  // reading a code that has already died. Ordinary pace the rest of the time.
  const awaitingPin = (bookings ?? []).some((b) => b.otpRequired);
  useLiveRefresh(
    () => load(true),
    ready && !!user && !cancellingId,
    awaitingPin ? 5_000 : undefined
  );

  // The server's clock for the list itself, so the active/history split below
  // is judged on the same time as every row's own status.
  const listNow = useServerWallClock(bookings?.[0]?.serverNow ?? "");

  // Active = still upcoming and not cancelled; History = past or cancelled.
  const { active, history } = useMemo(() => {
    const list = bookings ?? [];
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const b of list) {
      // A booking leaves this table for the history for exactly two reasons: it
      // was cancelled, or the stay is over with nothing outstanding. On a split
      // stay that second one means EVERY part — one part still to come keeps the
      // booking here, whatever the lifecycle says about the part in front of us.
      // (It can say `no_show` while a later part is still due: missing part one
      // is not the end of the stay, and the guest is expected back.)
      const life = lifecycleOf(b);
      const live =
        life === "upcoming" || life === "awaiting_checkin" || life === "staying";
      const partsLeft =
        !Number.isNaN(listNow) && stayProgress(b, listNow).remaining > 0;
      if (life !== "cancelled" && (live || partsLeft)) {
        active.push(b);
      } else {
        history.push(b);
      }
    }
    const byCreated = (order: "desc" | "asc") => (a: Booking, b: Booking) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return order === "desc" ? diff : -diff;
    };
    active.sort(byCreated(activeSort));
    history.sort(byCreated(historySort));
    return { active, history };
  }, [bookings, activeSort, historySort, listNow]);

  // The stay just paid for: newest by creation, whichever way the table is
  // sorted — the greeting card must not follow the sort dropdown around.
  const newest = useMemo(() => {
    let best: Booking | null = null;
    for (const b of active) {
      if (!best || new Date(b.createdAt) > new Date(best.createdAt)) best = b;
    }
    return best;
  }, [active]);

  const toggleActiveSort = () => setActiveSort((s) => (s === "desc" ? "asc" : "desc"));
  const toggleHistorySort = () => setHistorySort((s) => (s === "desc" ? "asc" : "desc"));

  async function onCancel(b: Booking, gate: CancellationGate) {
    if (cancellingId) return;
    // The server's own figures while its reading still matches the live gate;
    // once the clock has moved the booking into the next tier (midnight, or the
    // check-in hour), the same percentages applied here.
    const fee =
      gate.penaltyPercentage === b.penaltyPercentage
        ? b.cancelFeeNow
        : Math.round(b.total * gate.penaltyPercentage) / 100;
    // Spell out the exact fine (and refund) before it's charged — never a
    // surprise after the fact.
    const message =
      fee > 0
        ? `Your stay at "${b.villaTitle}" will be cancelled. Cancelling on the check-in day carries a ${gate.penaltyPercentage}% charge — ${money(fee)} — and you'll be refunded ${money(b.total - fee)}. This can't be undone.`
        : `Your stay at "${b.villaTitle}" will be cancelled and you'll be refunded in full (${gate.refundPercentage}%). This can't be undone.`;
    const ok = await confirm({
      title: "Cancel this booking?",
      message,
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep booking",
      tone: "danger",
    });
    if (!ok) return;
    setCancellingId(b.id);
    try {
      const updated = await cancelBooking(b.id);
      setBookings((prev) =>
        (prev ?? []).map((x) => (x.id === b.id ? updated : x))
      );
      // The server is the authority on what was actually charged — quote its
      // frozen figures back, not the estimate the dialog showed.
      toast.success(
        updated.cancellationFee > 0
          ? `Booking cancelled — ${money(updated.cancellationFee)} charged, ${money(updated.refundAmount)} refunded.`
          : "Booking cancelled — you'll be refunded in full."
      );
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not cancel booking.");
      // The banner sits at the top of the card, far above the row the user just
      // acted on — bring it into view once React has committed it.
      requestAnimationFrame(() =>
        errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      );
    } finally {
      setCancellingId(null);
    }
  }

  // Leave / update a review for a completed stay, then fold the fresh review
  // back into the list so the row updates in place.
  const onReview = useCallback(
    async (b: Booking, rating: number, comment: string) => {
      setReviewingId(b.id);
      try {
        const updated = await submitReview(b.id, rating, comment);
        setBookings((prev) => (prev ?? []).map((x) => (x.id === b.id ? updated : x)));
        toast.success("Thanks for your review!");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save your review.");
      } finally {
        setReviewingId(null);
      }
    },
    [toast]
  );

  // Guard: only signed-in users can view their bookings.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">Please sign in to view your bookings.</p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-body px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — bookings card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {loadError && (
            <div
              ref={errorRef}
              role="alert"
              className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600"
            >
              {loadError}
            </div>
          )}

          {/* Active bookings header — sits in its own band across the top of
              the card, cancelling the card's top padding and carrying an even
              py-4 of its own, so the title is centred in it rather than pushed
              down by two paddings stacked. Matches the other account tabs. */}
          <div
            className={`-mx-6 flex items-center justify-between border-b border-line px-6 py-4 sm:-mx-8 sm:px-8 ${
              // Only reach up into the card's padding when nothing is above it.
              loadError ? "" : "-mt-6 sm:-mt-8"
            }`}
          >
            {/* Label first, count as a pill after it — "00 Active Bookings"
                read as a zero-padded code rather than as a total. */}
            <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink">
              Active Bookings
              <CountPill value={active.length} />
            </h2>
            <SortDropdown sort={activeSort} onToggle={toggleActiveSort} />
          </div>

          {justBooked && newest && (
            <WhatsAppGreeting booking={newest} onDismiss={() => setJustBooked(false)} />
          )}

          {/* Active table (scrolls horizontally on small screens) */}
          <div className="overflow-x-auto">
            <ColumnHeadings />

            {/* Active rows */}
            <div className="mt-2.5 space-y-3">
              {bookings === null ? (
                <SkeletonRows count={3} />
              ) : active.length === 0 ? (
                <EmptyLine text="No active bookings yet. Book a villa to see it here." />
              ) : (
                active.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    onCancel={onCancel}
                    cancelling={cancellingId === b.id}
                    onReview={(rating, comment) => onReview(b, rating, comment)}
                    reviewBusy={reviewingId === b.id}
                    expanded={expandedId === b.id}
                    onToggle={toggleExpand}
                  />
                ))
              )}
            </div>
          </div>

          {/* Booking history header */}
          <div className="mt-9 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink">
              Booking History
              <CountPill value={history.length} />
            </h2>
            <SortDropdown sort={historySort} onToggle={toggleHistorySort} />
          </div>

          {/* History rows */}
          <div className="overflow-x-auto">
            <ColumnHeadings />

            <div className="mt-2.5 space-y-3">
              {bookings === null ? (
                <SkeletonRows count={2} />
              ) : history.length === 0 ? (
                <EmptyLine text="No past bookings." />
              ) : (
                history.map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    onCancel={onCancel}
                    cancelling={false}
                    onReview={(rating, comment) => onReview(b, rating, comment)}
                    reviewBusy={reviewingId === b.id}
                    expanded={expandedId === b.id}
                    onToggle={toggleExpand}
                  />
                ))
              )}
            </div>
          </div>

          {/* Note */}
          <p className="mt-6 max-w-[720px] text-[11px] leading-5 text-muted">
            Note: Cancellation of booking may result in cancellation charges. Charges vary
            from property to property. They may also depend upon cancellation time. Read
            cancellation policy of hosted place for further information.
          </p>
        </div>
      </div>
    </div>
  );
}

function ColumnHeadings() {
  return (
    <div className={`mt-6 grid ${ROW_MINW} ${ROW_GRID} px-4 text-[13px] text-muted`}>
      {COLUMNS.map((c, i) => (
        <span key={c || `col-${i}`} className={c === "" ? "text-right" : ""}>
          {c || "Action"}
        </span>
      ))}
    </div>
  );
}

// Placeholders sized like a real row so the note below doesn't get shoved
// down once the bookings arrive.
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={`skeleton h-[50px] ${ROW_MINW}`} />
      ))}
    </>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
      {text}
    </div>
  );
}
