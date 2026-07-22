"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useToast } from "@/lib/toast";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import CountPill from "@/components/ui/CountPill";
import Img from "@/components/ui/Img";
import { fetchVillaBookings, respondBooking, type Booking } from "@/lib/api";

// A broken avatar URL falls back to this transparent pixel, which reveals the
// initial-letter tile rendered behind it.
const TRANSPARENT_PX =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const COLUMNS = ["Tenant", "Property", "Stay Duration", "No. of Guests", "Status"];

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
  kind,
  onRespond,
  responding,
}: {
  req: Booking;
  kind: "active" | "history";
  onRespond: (id: string) => void;
  responding: boolean;
}) {
  const cancelled = req.status === "cancelled";
  return (
    <div className="grid min-w-[620px] grid-cols-[1.4fr_1.2fr_1.1fr_1fr_0.8fr] items-center rounded-lg border border-line px-4 py-3 text-[13px]">
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
        className="truncate pr-2 text-body hover:text-primary"
      >
        {req.villaTitle}
      </Link>
      <span className="text-body">{fmtStay(req.checkIn, req.checkOut)}</span>
      <span className="text-body">
        {req.guests} {req.guests === 1 ? "guest" : "guests"}
      </span>

      {/* History rows are read-only: a cancelled or finished stay can't be
          responded to any more, it's just a record for the owner. */}
      <span className="text-right">
        {kind === "history" ? (
          cancelled ? (
            <span className="text-[13px] font-semibold text-red-400">Cancelled</span>
          ) : req.hostResponded ? (
            <span className="text-[13px] font-semibold text-primary">Responded</span>
          ) : (
            <span className="text-[13px] font-semibold text-body">Completed</span>
          )
        ) : req.hostResponded ? (
          <span className="text-[13px] font-semibold text-primary">Responded</span>
        ) : (
          <button
            type="button"
            onClick={() => onRespond(req.id)}
            disabled={responding}
            aria-busy={responding}
            aria-label={
              responding
                ? `Responding to ${req.guestName}'s request`
                : `Respond to ${req.guestName}'s request`
            }
            className="text-[13px] font-medium text-primary underline underline-offset-2 transition-colors hover:text-primary-dark disabled:opacity-50"
          >
            {responding ? <span className="spinner" aria-hidden /> : "Respond"}
          </button>
        )}
      </span>
    </div>
  );
}

export default function RentRequestsPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  const [respondingId, setRespondingId] = useState<string | null>(null);
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

  // Surfaces guest cancellations without a manual reload. Paused mid-respond so
  // an in-flight poll can't land stale rows over the new state.
  useLiveRefresh(() => load(true), ready && !!user && !respondingId);

  // Active = live booking whose stay hasn't ended; History = cancelled or past.
  const { active, history } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const r of requests ?? []) {
      const upcoming = new Date(r.checkOut) >= today;
      if (r.status === "active" && upcoming) active.push(r);
      else history.push(r);
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

  async function onRespond(id: string) {
    setRespondingId(id);
    try {
      const updated = await respondBooking(id);
      setRequests((prev) => (prev ?? []).map((r) => (r.id === id ? updated : r)));
      toast.success("Response sent — the guest can see it now.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not respond to request.");
    } finally {
      setRespondingId(null);
    }
  }

  // Guard: only signed-in users can view their rent requests.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
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

  const toggleSort = () => setSort((s) => (s === "desc" ? "asc" : "desc"));
  const toggleHistorySort = () => setHistorySort((s) => (s === "desc" ? "asc" : "desc"));

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-9 lg:px-7">
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

          {/* Header */}
          <div className="flex items-center justify-between">
            {/* Label first, count as a pill after it — "00 Active Rent
                Requests" read as a zero-padded code rather than as a total. */}
            <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink">
              Active Rent Requests
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
                  <div key={i} className="skeleton h-[48px] min-w-[620px]" />
                ))}
              </>
            ) : active.length === 0 ? (
              <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                No rent requests yet. When someone books one of your villas, it&apos;ll
                show up here.
              </div>
            ) : (
              active.map((req) => (
                <RequestRow
                  key={req.id}
                  req={req}
                  kind="active"
                  onRespond={onRespond}
                  responding={respondingId === req.id}
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
                      <div key={i} className="skeleton h-[48px] min-w-[620px]" />
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
                    kind="history"
                    onRespond={onRespond}
                    responding={false}
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
    <div className="mt-6 grid min-w-[620px] grid-cols-[1.4fr_1.2fr_1.1fr_1fr_0.8fr] px-4 text-[13px] text-muted">
      {COLUMNS.map((c) => (
        <span key={c} className={c === "Status" ? "text-right" : ""}>
          {c}
        </span>
      ))}
    </div>
  );
}
