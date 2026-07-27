"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVillaCount } from "@/lib/useProperty";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useToast } from "@/lib/toast";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import BookingDetails, { StayActionButton } from "@/components/settings/BookingDetails";
import CountPill from "@/components/ui/CountPill";
import StarRating from "@/components/ui/StarRating";
import Img from "@/components/ui/Img";
import { fetchVillaBookings, checkInBooking, checkOutBooking, type Booking } from "@/lib/api";
import { bookingStatus, lifecycleOf, STATUS_TONE_CLASS } from "@/lib/booking";

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
  onCheckOut,
  working,
}: {
  req: Booking;
  expanded: boolean;
  onToggle: (id: string) => void;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  working: boolean;
}) {
  const status = bookingStatus(req);
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
      className={`${ROW_MINW} overflow-hidden rounded-lg border transition-colors ${
        expanded ? "border-primary/40 bg-primary/[0.015]" : "border-line"
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
            <span className="text-body">{fmtStay(req.checkIn, req.checkOut)}</span>
            <span className="text-body">
              {req.guests} {req.guests === 1 ? "guest" : "guests"}
            </span>

            {/* Status — the real stay state, plus the guest's rating once they
                leave one (so it shows right in the row, not only on expand). */}
            <span className="flex flex-col items-start gap-1">
              <span className={`text-[13px] font-semibold ${STATUS_TONE_CLASS[status.tone]}`}>
                {status.label}
              </span>
              {req.reviewRating > 0 && (
                <span title={`Guest rated ${req.reviewRating}/5`}>
                  <StarRating value={req.reviewRating} size={12} />
                </span>
              )}
            </span>

            {/* Actions — expand for full details, and the single stay action. */}
            <div className="flex items-center justify-end gap-2">
              <StayActionButton
                booking={req}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
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

  const doCheckIn = useCallback(
    async (id: string) => {
      setWorkingId(id);
      try {
        applyUpdate(await checkInBooking(id));
        toast.success("Guest checked in.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not check the guest in.");
      } finally {
        setWorkingId(null);
      }
    },
    [applyUpdate, toast]
  );

  const doCheckOut = useCallback(
    async (id: string) => {
      setWorkingId(id);
      try {
        applyUpdate(await checkOutBooking(id));
        toast.success("Guest checked out.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not check the guest out.");
      } finally {
        setWorkingId(null);
      }
    },
    [applyUpdate, toast]
  );

  // Active = a live stay (upcoming, awaiting check-in, or under way); History =
  // settled — checked out, no-show, or cancelled (it belongs to the record).
  const { active, history } = useMemo(() => {
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const r of requests ?? []) {
      const life = lifecycleOf(r);
      if (life === "upcoming" || life === "awaiting_checkin" || life === "staying") {
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
  }, [requests, sort, historySort]);

  function retryLoad() {
    setError("");
    setRequests(null);
    load();
  }

  // Guard: only signed-in users can view their rent requests.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1320px] flex-col items-center justify-center px-5 text-center">
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
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1320px] flex-col items-center justify-center px-5 text-center">
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
    <div className="mx-auto w-full max-w-[1320px] px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
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
                    onCheckOut={doCheckOut}
                    working={workingId === req.id}
                  />
                ))
              )}
            </div>
          </div>
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
          {c || "Actions"}
        </span>
      ))}
    </div>
  );
}
