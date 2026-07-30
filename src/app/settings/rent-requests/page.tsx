"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Star } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVillaCount } from "@/lib/useProperty";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useToast } from "@/lib/toast";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import BookingDetails, { StayActionButton } from "@/components/settings/BookingDetails";
import CountPill from "@/components/ui/CountPill";
import StayPartChips from "@/components/ui/StayPartChips";
import Img from "@/components/ui/Img";
import {
  fetchVillaBookings,
  startCheckIn,
  verifyCheckIn,
  allowLateCheckIn,
  startCheckOut,
  verifyCheckOut,
  type Booking,
} from "@/lib/api";
import StayPinDialog, { type StayPinMode } from "@/components/settings/StayPinDialog";
import {
  bookingStatus,
  lifecycleOf,
  useServerWallClock,
  stayAction,
  stayProgress,
  STATUS_TONE_CLASS,
} from "@/lib/booking";

// A broken avatar URL falls back to this transparent pixel, which reveals the
// initial-letter tile rendered behind it.
const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const COLUMNS = ["Tenant", "Property", "Stay Duration", "Guests", "Status", ""];

// One grid template shared by the header and every row so the columns line up.
const ROW_GRID = "grid-cols-[1.3fr_1.2fr_1fr_0.7fr_0.9fr_1.5fr]";
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

function TenantAvatar({ name, avatar }: { name: string; avatar: string }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-[13px] font-semibold text-primary">
      {initial}
      {avatar && (
        <Img
          src={avatar}
          alt={name}
          fallback={TRANSPARENT_PX}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </div>
  );
}

function RequestRow({
  req,
  expanded,
  onToggle,
  onCheckIn,
  onAllowLate,
  onCheckOut,
  working,
}: {
  req: Booking;
  expanded: boolean;
  onToggle: (id: string) => void;
  onCheckIn: (id: string) => void;
  onAllowLate: (id: string) => void;
  onCheckOut: (id: string) => void;
  working: boolean;
}) {
  // The server's clock, ticking — so a stay that has been waiting an hour says
  // so without the host reloading, and on the SERVER's hour, not the browser's.
  const now = useServerWallClock(req.serverNow);
  const status = bookingStatus(req, now);
  // How far through a split stay this guest is, so the host can see at a glance
  // that the property is theirs in parts and which part is running.
  const progress = stayProgress(req, now);
  const rowRef = useRef<HTMLDivElement>(null);

  // On expand, bring the newly revealed details into view — after the open
  // animation so the scroll targets the row's final, taller height.
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
      // Same scroll margins as the guest's booking rows: the sticky navbar and
      // "Manage Account" bar float over the page, and `scrollIntoView` would
      // otherwise park the opened panel's top edge underneath them.
      // Open, the row draws its own edge clearly — a darkened neutral hairline
      // over white on a soft shadow, never the brand colour. Same treatment as
      // the guest's booking rows, which these sit alongside in one account.
      className={`${ROW_MINW} scroll-mt-[132px] scroll-mb-6 overflow-hidden rounded-lg border transition-all duration-300 ${
        expanded
          ? "border-ink/25 bg-white shadow-[0_6px_22px_-10px_rgba(20,20,45,0.28)]"
          : "border-line"
      }`}
    >
      {/* Collapsed: the compact table row. It collapses away as the detail
          opens, so the guest, property and status never show in both at once. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`grid ${ROW_GRID} items-center px-4 py-3 text-[13px]`}>
            {/* Tenant */}
            <div className="flex items-center gap-2.5">
              <TenantAvatar name={req.guestName} avatar={req.guestAvatar} />
              <span className="truncate text-ink" title={req.guestName}>
                {req.guestName}
              </span>
            </div>

            <Link
              href={`/villa/${req.villaId}`}
              title={req.villaTitle}
              className="group flex min-w-0 items-center gap-2.5 pr-2"
            >
              <Img
                src={req.villaCover}
                alt={req.villaTitle}
                className="h-9 w-9 shrink-0 rounded-lg object-cover"
              />
              <span className="truncate text-body group-hover:text-primary">
                {req.villaTitle}
              </span>
            </Link>
            <span className="flex min-w-0 flex-col text-body">
              <span>{fmtStay(req.checkIn, req.checkOut)}</span>
              {/* This guest booked around nights another booking holds, so the
                  two dates only bracket their stay — the host needs to see that
                  the property is theirs in parts, not straight through, and
                  which part they are on. */}
              <StayPartChips progress={progress} />
            </span>
            <span className="text-body">
              {req.guests} {req.guests === 1 ? "guest" : "guests"}
            </span>

            {/* Status — the real stay state, plus the guest's rating once they
                leave one (so it shows right in the row, not only on expand). */}
            <span className="flex flex-col items-start gap-1">
              <span className={`text-[13px] font-semibold ${STATUS_TONE_CLASS[status.tone]}`}>
                {status.label}
              </span>
              {/* One star and the score rather than a five-star strip — the
                  strip crowded the status column and read as decoration. */}
              {req.reviewRating > 0 && (
                <span
                  title={`Guest rated this stay ${req.reviewRating} out of 5`}
                  className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-muted"
                >
                  <Star size={11} className="fill-star text-star" aria-hidden />
                  Guest rated {req.reviewRating.toFixed(1)}
                </span>
              )}
            </span>

            {/* Actions — expand for full details, and the single stay action. */}
            <div className="flex items-center justify-end gap-2">
              <StayActionButton
                booking={req}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                onAllowLate={onAllowLate}
                busy={working}
              />
              <button
                type="button"
                onClick={() => onToggle(req.id)}
                aria-expanded={expanded}
                aria-label={`View ${req.guestName}'s booking details`}
                // py-[5px] + the 1px border = the same height as the filled
                // Check in / Check out button next to it.
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-[5px] text-[12.5px] font-medium text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
              >
                <span className="w-[30px] text-center">View</span>
                <ChevronDown size={15} className="shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded: the redesigned full detail, which carries its own property
          header, status, stay action and Hide control — so the compact row
          above can hide entirely and nothing is shown twice. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-4 sm:px-5">
            <BookingDetails
              booking={req}
              onCollapse={() => onToggle(req.id)}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              onAllowLate={onAllowLate}
              working={working}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RentRequestsPage() {
  const { user, ready } = useAuth();
  const { count, hasProperty } = useVillaCount();
  const toast = useToast();
  const [requests, setRequests] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  // Which booking's detail popup is open, and which booking has a check-in/out
  // Which row is expanded (its details shown inline), and which booking has a
  // check-in/out request in flight.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  // Which booking's PIN dialog is open, which end of the stay it is verifying,
  // and how that dialog is doing. Arrival and departure share one dialog and one
  // piece of state: a booking is only ever at one of them.
  const [pinBookingId, setPinBookingId] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<StayPinMode>("in");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const toggleExpand = useCallback(
    (id: string) => setExpandedId((cur) => (cur === id ? null : id)),
    []
  );
  // Each table sorts on its own — sorting the history shouldn't silently
  // re-order the active requests above it.
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [historySort, setHistorySort] = useState<"desc" | "asc">("desc");

  // `silent` refreshes are background polls — a transient network blip there
  // must not swap the list the owner is reading for an error banner.
  const load = useCallback((silent = false) => {
    return fetchVillaBookings()
      .then(setRequests)
      .catch((e) => {
        if (!silent) {
          setError(e instanceof Error ? e.message : "Failed to load rent requests.");
        }
      });
  }, []);

  useEffect(() => {
    if (!ready || !user) return;
    load();
  }, [ready, user, load]);

  // Surfaces new bookings and guest cancellations without a manual reload.
  // Paused mid check-in/out so an in-flight poll can't land stale rows over it.
  useLiveRefresh(() => load(true), ready && !!user && !workingId);


  // Apply a mutation's returned booking into the list (the popup, derived by
  // id, updates with it).
  const applyUpdate = useCallback((updated: Booking) => {
    setRequests((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  // Both ends of the stay are two steps: pressing the button only issues a PIN,
  // which shows up on the GUEST's booking page. The host then has to be told it
  // and type it into the dialog — that is what makes a check-in proof the guest
  // was here, and a check-out proof they were here to leave.
  const openPin = useCallback(
    async (id: string, mode: StayPinMode) => {
      setWorkingId(id);
      setPinError("");
      try {
        applyUpdate(await (mode === "in" ? startCheckIn(id) : startCheckOut(id)));
        setPinMode(mode);
        setPinBookingId(id);
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : `Could not start check-${mode === "in" ? "in" : "out"}.`
        );
      } finally {
        setWorkingId(null);
      }
    },
    [applyUpdate, toast]
  );

  const doCheckIn = useCallback((id: string) => openPin(id, "in"), [openPin]);
  const doCheckOut = useCallback((id: string) => openPin(id, "out"), [openPin]);

  // Step 2. A refusal (wrong digits, expired code, locked after three tries)
  // stays inside the dialog, next to the boxes it is about — the host is
  // mid-conversation with the guest and shouldn't have to hunt for it.
  const doVerifyPin = useCallback(
    async (pin: string) => {
      if (!pinBookingId) return;
      const leaving = pinMode === "out";
      setPinBusy(true);
      setPinError("");
      try {
        const updated = await (leaving
          ? verifyCheckOut(pinBookingId, pin)
          : verifyCheckIn(pinBookingId, pin));
        applyUpdate(updated);
        setPinBookingId(null);
        // An early departure is worth saying out loud: the host has just given
        // nights back to their own calendar, and that is the point of it.
        toast.success(
          !leaving
            ? "PIN verified — guest checked in."
            : updated.releasedNights > 0
              ? `Guest checked out ${updated.releasedNights} night${
                  updated.releasedNights === 1 ? "" : "s"
                } early — those nights are back on your calendar.`
              : "PIN verified — guest checked out."
        );
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "Could not verify that PIN.");
        // Re-read the booking so the dialog's attempts-left counter is the
        // server's, not a guess made from the error text.
        load(true);
      } finally {
        setPinBusy(false);
      }
    },
    [applyUpdate, load, pinBookingId, pinMode, toast]
  );

  // A fresh PIN, after one expires or locks. The old one dies server-side the
  // moment this lands, so there is never more than one live code.
  const doResendPin = useCallback(async () => {
    if (!pinBookingId) return;
    setPinBusy(true);
    setPinError("");
    try {
      applyUpdate(
        await (pinMode === "in" ? startCheckIn(pinBookingId) : startCheckOut(pinBookingId))
      );
      toast.success("New PIN sent to the guest's booking.");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Could not issue a new PIN.");
    } finally {
      setPinBusy(false);
    }
  }, [applyUpdate, pinBookingId, pinMode, toast]);

  // The host taking a no-show guest in anyway. Re-opens the check-in button;
  // the booking stays a no-show and the refund stays 0%.
  const doAllowLate = useCallback(
    async (id: string) => {
      setWorkingId(id);
      try {
        applyUpdate(await allowLateCheckIn(id));
        toast.success("Late check-in allowed — you can now verify the guest's PIN.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not allow a late check-in.");
      } finally {
        setWorkingId(null);
      }
    },
    [applyUpdate, toast]
  );

  // The booking the PIN dialog is about, read back out of the list rather than
  // held separately: a poll or a mutation that refreshes the row must refresh
  // the dialog with it (that's where its countdown and attempts-left come from).
  //
  // It closes on its own once the stay has moved past the point it was for —
  // judged on the SAME question the button asked, so a split stay's second
  // arrival re-opens it rather than finding the booking "already checked in".
  const pinBooking = useMemo(() => {
    const b = (requests ?? []).find((r) => r.id === pinBookingId);
    if (!b) return null;
    const wanted = pinMode === "in" ? "check_in" : "check_out";
    return stayAction(b) === wanted ? b : null;
  }, [requests, pinBookingId, pinMode]);

  // The server's clock for the list itself, so the split below is judged on the
  // same time as every row's own status.
  const listNow = useServerWallClock(requests?.[0]?.serverNow ?? "");

  // Active = a live stay (upcoming, awaiting check-in, or under way); History =
  // settled — checked out, no-show, or cancelled (it belongs to the record).
  const { active, history } = useMemo(() => {
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const r of requests ?? []) {
      // Cancelled, or over with nothing outstanding — those are the only two
      // ways a stay reaches the record. On a split stay "over" means every
      // part: one still to come keeps it here even when the lifecycle reports
      // `no_show` for a part that was missed, because the guest is still due
      // back and the host still has a check-in to run.
      const life = lifecycleOf(r);
      const live =
        life === "upcoming" || life === "awaiting_checkin" || life === "staying";
      const partsLeft =
        !Number.isNaN(listNow) && stayProgress(r, listNow).remaining > 0;
      if (life !== "cancelled" && (live || partsLeft)) {
        active.push(r);
      } else {
        history.push(r);
      }
    }
    const byCreated = (order: "desc" | "asc") => (a: Booking, b: Booking) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return order === "desc" ? diff : -diff;
    };
    active.sort(byCreated(sort));
    history.sort(byCreated(historySort));
    return { active, history };
  }, [requests, sort, historySort, listNow]);

  function retryLoad() {
    setError("");
    setRequests(null);
    load();
  }

  // Guard: only signed-in users can view their rent requests.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your rent requests.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // Guard: rent requests only exist once you host a property. (The sidebar
  // hides this section too, but a direct link could still land here.)
  if (count !== null && !hasProperty) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">List a property first</h1>
        <p className="mt-2 text-[14px] text-body">
          Rent requests come from guests booking your villas — add a property to start.
        </p>
        <Link
          href="/settings/property/add"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Add Property
        </Link>
      </div>
    );
  }

  const toggleSort = () => setSort((s) => (s === "desc" ? "asc" : "desc"));
  const toggleHistorySort = () => setHistorySort((s) => (s === "desc" ? "asc" : "desc"));

  return (
    <div className="mx-auto w-full max-w-body px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — rent requests card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {error && (
            <div role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600">
              {error}
            </div>
          )}

          {/* Header — its own band across the top of the card: the card's top
              padding is cancelled and an even py-4 takes its place, so the
              title sits centred in the band like the other account tabs. */}
          <div
            className={`-mx-6 flex items-center justify-between border-b border-line px-6 py-4 sm:-mx-8 sm:px-8 ${
              // Only reach up into the card's padding when nothing is above it.
              error ? "" : "-mt-6 sm:-mt-8"
            }`}
          >
            {/* A booking is confirmed the moment it's made, so these are simply
                the upcoming stays on the owner's villas — nothing to action. */}
            <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink">
              Upcoming Bookings
              <CountPill value={active.length} />
            </h2>
            <SortDropdown sort={sort} onToggle={toggleSort} />
          </div>

          {/* Table (scrolls horizontally on small screens) */}
          <div className="overflow-x-auto">
          <ColumnHeadings />

          {/* Rows */}
          <div className="mt-2.5 space-y-3">
            {requests === null && error ? (
              // A failed load is terminal — don't keep a loader spinning under
              // the error banner.
              <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
                <p className="text-[13px] text-muted">We couldn&apos;t load your rent requests.</p>
                <button
                  type="button"
                  onClick={retryLoad}
                  className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
                >
                  Try again
                </button>
              </div>
            ) : requests === null ? (
              <>
                {Array.from({ length: 3 }, (_, i) => (
                  <div key={i} className="skeleton h-[48px] min-w-[860px]" />
                ))}
              </>
            ) : active.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                No upcoming bookings yet. When someone books one of your villas,
                it&apos;ll show up here.
              </div>
            ) : (
              active.map((req) => (
                <RequestRow
                  key={req.id}
                  req={req}
                  expanded={expandedId === req.id}
                  onToggle={toggleExpand}
                  onCheckIn={doCheckIn}
                  onAllowLate={doAllowLate}
                  onCheckOut={doCheckOut}
                  working={workingId === req.id}
                />
              ))
            )}
          </div>
          </div>

          {/* Booking history — cancelled and finished stays stay on record here
              instead of vanishing from the owner's view. */}
          <div className="mt-9 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink">
              Booking History
              <CountPill value={history.length} />
            </h2>
            <SortDropdown sort={historySort} onToggle={toggleHistorySort} />
          </div>

          <div className="overflow-x-auto">
            <ColumnHeadings />

            <div className="mt-2.5 space-y-3">
              {requests === null ? (
                error ? null : (
                  <>
                    {Array.from({ length: 2 }, (_, i) => (
                      <div key={i} className="skeleton h-[48px] min-w-[860px]" />
                    ))}
                  </>
                )
              ) : history.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                  No past or cancelled bookings.
                </div>
              ) : (
                history.map((req) => (
                  <RequestRow
                    key={req.id}
                    req={req}
                    expanded={expandedId === req.id}
                    onToggle={toggleExpand}
                    onCheckIn={doCheckIn}
                    onAllowLate={doAllowLate}
                    onCheckOut={doCheckOut}
                    working={workingId === req.id}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* The PIN dialog — one for both ends of the stay, green on the way in and
          blue on the way out. Driven by the booking it belongs to, so its
          countdown and attempts-left re-base themselves whenever a fresh PIN
          lands, and it closes itself once the stay has moved on. */}
      {pinBooking && (
        <StayPinDialog
          booking={pinBooking}
          mode={pinMode}
          busy={pinBusy}
          error={pinError}
          // The server's own line about what closing this stay right now means.
          // Only worth showing when it changes the decision — an ordinary
          // departure on the booked day says nothing the host doesn't know.
          notice={
            pinMode === "out" && pinBooking.checkoutEarlyNow
              ? pinBooking.checkoutMessage
              : ""
          }
          onVerify={doVerifyPin}
          onResend={doResendPin}
          onClose={() => {
            setPinBookingId(null);
            setPinError("");
          }}
        />
      )}
    </div>
  );
}

function ColumnHeadings() {
  return (
    <div className={`mt-6 grid ${ROW_MINW} ${ROW_GRID} px-4 text-[13px] text-muted`}>
      {COLUMNS.map((c, i) => (
        <span key={c || `col-${i}`} className={c === "" ? "text-right" : ""}>
          {c || "Actions"}
        </span>
      ))}
    </div>
  );
}
