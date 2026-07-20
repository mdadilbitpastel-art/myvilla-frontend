"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { fetchMyBookings, cancelBooking, type Booking } from "@/lib/api";

const COLUMNS = [
  "Name of Villa",
  "Posted",
  "Stay Duration",
  "No. of Guests",
  "Status",
];

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
  kind,
  onCancel,
  cancelling,
}: {
  booking: Booking;
  kind: "active" | "history";
  onCancel: (id: string, title: string) => void;
  cancelling: boolean;
}) {
  const cancelled = booking.status === "cancelled";
  return (
    <div className="grid min-w-[620px] grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr] items-center rounded-lg border border-line px-4 py-3.5 text-[13px]">
      <Link
        href={`/villa/${booking.villaId}`}
        title={booking.villaTitle}
        className="truncate pr-2 text-ink hover:text-primary"
      >
        {booking.villaTitle}
      </Link>
      <span className="text-body">{relativeTime(booking.createdAt)}</span>
      <span className="text-body">{fmtStay(booking.checkIn, booking.checkOut)}</span>
      <span className="text-body">
        {booking.guests} guest{booking.guests === 1 ? "" : "s"}
      </span>
      <span className="text-right">
        {kind === "active" ? (
          <button
            type="button"
            onClick={() => onCancel(booking.id, booking.villaTitle)}
            disabled={cancelling}
            aria-busy={cancelling}
            className="text-[13px] font-medium text-red-400 underline underline-offset-2 transition-colors hover:text-red-500 disabled:opacity-50"
          >
            {cancelling ? (
              <>
                <span className="spinner" aria-hidden /> Cancelling…
              </>
            ) : (
              "Cancel Booking"
            )}
          </button>
        ) : cancelled ? (
          <span className="text-[13px] font-semibold text-red-400">Cancelled</span>
        ) : (
          <span className="text-[13px] font-semibold text-primary">Accepted</span>
        )}
      </span>
    </div>
  );
}

export default function MyBookingsPage() {
  const { user, ready } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  // Each table sorts independently — one shared state would make sorting the
  // history silently re-order the active table above it.
  const [activeSort, setActiveSort] = useState<"desc" | "asc">("desc");
  const [historySort, setHistorySort] = useState<"desc" | "asc">("desc");
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("booked") === "1") {
        setShowBanner(true);
        window.history.replaceState(null, "", window.location.pathname);
      }
    }
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    fetchMyBookings()
      .then(setBookings)
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Failed to load bookings."));
  }, [ready, user]);

  // Active = still upcoming and not cancelled; History = past or cancelled.
  const { active, history } = useMemo(() => {
    const list = bookings ?? [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const b of list) {
      const upcoming = new Date(b.checkOut) >= today;
      if (b.status === "active" && upcoming) active.push(b);
      else history.push(b);
    }
    const byCreated = (order: "desc" | "asc") => (a: Booking, b: Booking) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return order === "desc" ? diff : -diff;
    };
    active.sort(byCreated(activeSort));
    history.sort(byCreated(historySort));
    return { active, history };
  }, [bookings, activeSort, historySort]);

  const toggleActiveSort = () => setActiveSort((s) => (s === "desc" ? "asc" : "desc"));
  const toggleHistorySort = () => setHistorySort((s) => (s === "desc" ? "asc" : "desc"));

  async function onCancel(id: string, title: string) {
    if (cancellingId) return;
    if (
      !window.confirm(
        `Cancel your booking for "${title}"? This can't be undone and cancellation charges may apply.`
      )
    ) {
      return;
    }
    setCancellingId(id);
    try {
      const updated = await cancelBooking(id);
      setBookings((prev) =>
        (prev ?? []).map((b) => (b.id === id ? updated : b))
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

  // Guard: only signed-in users can view their bookings.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
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
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — bookings card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {showBanner && (
            <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-[13px] font-medium text-green-700">
              🎉 Payment successful — your booking is confirmed!
            </div>
          )}
          {loadError && (
            <div
              ref={errorRef}
              role="alert"
              className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600"
            >
              {loadError}
            </div>
          )}

          {/* Active bookings header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">
              <span className="text-primary">
                {String(active.length).padStart(2, "0")}
              </span>{" "}
              Active Bookings
            </h2>
            <SortDropdown sort={activeSort} onToggle={toggleActiveSort} />
          </div>

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
                    kind="active"
                    onCancel={onCancel}
                    cancelling={cancellingId === b.id}
                  />
                ))
              )}
            </div>
          </div>

          {/* Booking history header */}
          <div className="mt-9 flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">Booking History</h2>
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
                    kind="history"
                    onCancel={onCancel}
                    cancelling={false}
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
    <div className="mt-6 grid min-w-[620px] grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr] px-4 text-[13px] text-muted">
      {COLUMNS.map((c) => (
        <span key={c} className={c === "Status" ? "text-right" : ""}>
          {c}
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
        <div key={i} className="skeleton h-[50px] min-w-[620px]" />
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
