"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import BookingDetails from "@/components/settings/BookingDetails";
import CountPill from "@/components/ui/CountPill";
import Img from "@/components/ui/Img";
import { fetchMyBookings, cancelBooking, submitReview, type Booking } from "@/lib/api";
import { bookingStatus, lifecycleOf, STATUS_TONE_CLASS } from "@/lib/booking";

const COLUMNS = [
  "Name of Villa",
  "Posted",
  "Stay Duration",
  "No. of Guests",
  "Status",
  "",
];

// One grid template shared by the header and every row so the columns line up.
const ROW_GRID = "grid-cols-[1.4fr_0.9fr_1.1fr_0.8fr_0.9fr_1.6fr]";
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
    `📅 ${fmtFull(b.checkIn)} → ${fmtFull(b.checkOut)} (${b.nights} night${b.nights === 1 ? "" : "s"})`,
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
  onCancel: (booking: Booking) => void;
  cancelling: boolean;
  onReview: (rating: number, comment: string) => void | Promise<void>;
  reviewBusy: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
}) {
  const status = bookingStatus(booking);
  // The server decides whether cancelling is still on the table: only a live,
  // not-yet-checked-in stay (upcoming / awaiting) can be called off.
  const canCancel = booking.canCancel;
  const rowRef = useRef<HTMLDivElement>(null);

  // On expand, bring the revealed details into view (after the open animation).
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
      className={`${ROW_MINW} overflow-hidden rounded-lg border transition-colors ${
        expanded ? "border-primary/40 bg-primary/[0.015]" : "border-line"
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
            <span className="text-body">{fmtStay(booking.checkIn, booking.checkOut)}</span>
            <span className="text-body">
              {booking.guests} guest{booking.guests === 1 ? "" : "s"}
            </span>
            {/* Status — reflects where the stay actually is (upcoming / ongoing / done). */}
            <span className={`text-[13px] font-semibold ${STATUS_TONE_CLASS[status.tone]}`}>
              {status.label}
            </span>
            {/* Actions — cancel / rate (per stay state) + view details. */}
            <div className="flex items-center justify-end gap-2">
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
              {canCancel && (
                <button
                  type="button"
                  onClick={() => onCancel(booking)}
                  disabled={cancelling}
                  aria-busy={cancelling}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#e5484d] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#d93d42] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelling ? <span className="spinner" aria-hidden /> : "Cancel booking"}
                </button>
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
        </div>
      </div>

      {/* Expanded: the redesigned full detail, which carries its own header,
          status, cancel action and Hide control — so nothing shows twice. */}
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
              onCancel={canCancel ? () => onCancel(booking) : undefined}
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
  useLiveRefresh(() => load(true), ready && !!user && !cancellingId);

  // Active = still upcoming and not cancelled; History = past or cancelled.
  const { active, history } = useMemo(() => {
    const list = bookings ?? [];
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const b of list) {
      // Active = the stay is still live (upcoming, awaiting check-in, or under
      // way). Everything settled — completed, no-show, cancelled — is history.
      const life = lifecycleOf(b);
      if (life === "upcoming" || life === "awaiting_checkin" || life === "staying") {
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
  }, [bookings, activeSort, historySort]);

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

  async function onCancel(b: Booking) {
    if (cancellingId) return;
    const fee = b.cancelFeeNow;
    // Spell out the exact fine (and refund) before it's charged — never a
    // surprise after the fact.
    const message =
      fee > 0
        ? `Your stay at "${b.villaTitle}" will be cancelled. A cancellation fee of ${money(fee)} applies, and you'll be refunded ${money(b.total - fee)}. This can't be undone.`
        : `Your stay at "${b.villaTitle}" will be cancelled and you'll be fully refunded. This can't be undone.`;
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
      toast.success(
        fee > 0 ? `Booking cancelled — ${money(fee)} fee applied.` : "Booking cancelled."
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
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1320px] flex-col items-center justify-center px-5 text-center">
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
    <div className="mx-auto w-full max-w-[1320px] px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
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
