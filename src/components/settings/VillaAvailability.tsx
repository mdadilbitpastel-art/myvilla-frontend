"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarCheck2, Users, Minus, Plus } from "lucide-react";
import { fetchVillaAvailability, type VillaAvailability } from "@/lib/api";

/**
 * The host's own calendar for one villa, shown while they edit the listing.
 *
 * A booking takes the whole villa, so "is it free?" is a question about dates
 * and nothing else — which is exactly what a host can't see from a status pill.
 * This shows every night already taken and who took it, how far ahead the villa
 * is open for booking at all, and lets the host close individual nights by
 * clicking them.
 *
 * Nothing here saves on its own. Every change is held in the form above and
 * written with the rest of the listing when the host saves — clicking around a
 * calendar shouldn't be firing requests, and a host who changes their mind
 * should be able to just leave.
 */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// Local YYYY-MM-DD. toISOString() would shift the day in western time zones.
function iso(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function prettyDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y) return value;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Whole days from today to `value` — what the window is measured in. */
function daysFromToday(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

// Monday-first offset for the 1st of the month.
function leadingBlanks(year: number, month: number): number {
  const first = new Date(year, month, 1).getDay(); // 0 = Sunday
  return (first + 6) % 7;
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

const MAX_DAYS = 365;

const EMPTY: VillaAvailability = {
  villaId: "",
  windowStart: "",
  windowEnd: "",
  availabilityDays: 0,
  bookableUntil: "",
  isAvailableNow: true,
  freeFrom: "",
  bookedDates: [],
  blockedDates: [],
  upcoming: [],
  maxBookedGuests: 0,
};

export default function VillaAvailabilityPanel({
  villaId,
  /** Capacity the host currently has in the form, to warn before it's saved. */
  plannedCapacity,
  /** Draft values, owned by the form — this panel only edits them. */
  days,
  onDaysChange,
  blockedDates,
  onToggleBlocked,
}: {
  /** Omitted while the villa is being created — there's nothing to fetch. */
  villaId?: string | null;
  plannedCapacity: number;
  days: number;
  onDaysChange: (days: number) => void;
  blockedDates: string[];
  onToggleBlocked: (date: string) => void;
}) {
  const [data, setData] = useState<VillaAvailability | null>(null);
  const [error, setError] = useState("");
  // Which month the calendar is showing, as an offset from the current one.
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    // A villa that doesn't exist yet has no bookings and no saved calendar —
    // the host can still set the window and close dates ahead of publishing.
    if (!villaId) {
      setData(EMPTY);
      return;
    }
    let active = true;
    setError("");
    fetchVillaAvailability(villaId, MAX_DAYS)
      .then((a) => active && setData(a))
      .catch(
        (e) =>
          active &&
          setError(e instanceof Error ? e.message : "Could not load the calendar.")
      );
    return () => {
      active = false;
    };
  }, [villaId]);

  const booked = useMemo(() => new Set(data?.bookedDates ?? []), [data?.bookedDates]);
  const blocked = useMemo(() => new Set(blockedDates), [blockedDates]);

  function applyDays(next: number) {
    const value = Number.isFinite(next) ? Math.round(next) : 1;
    onDaysChange(Math.max(1, Math.min(value, MAX_DAYS)));
  }

  // The window's last open date, computed from the draft rather than read off
  // the server — the host has to see the result of a change they haven't saved.
  const windowEndIso = useMemo(() => {
    const end = new Date();
    end.setDate(end.getDate() + Math.max(1, days));
    return iso(end);
  }, [days]);

  const today = new Date();
  const shown = new Date(today.getFullYear(), today.getMonth() + offset, 1);
  const year = shown.getFullYear();
  const month = shown.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayIso = iso(today);

  if (error) {
    return (
      <div className="rounded-xl border border-line bg-white p-4 text-[13px] text-muted">
        {error}
      </div>
    );
  }

  if (!data) return <div className="skeleton h-[320px] rounded-xl" />;

  const capacityClash =
    data.maxBookedGuests > 0 && plannedCapacity < data.maxBookedGuests;
  // Compared against what the server last told us, so the count reflects real
  // pending edits rather than every date that happens to be closed.
  const saved = new Set(data.blockedDates);
  const pendingCount =
    [...blocked].filter((d) => !saved.has(d)).length +
    [...saved].filter((d) => !blocked.has(d)).length +
    (days !== data.availabilityDays ? 1 : 0);
  // The furthest booked night: closing the window before it would hide dates
  // the host has already promised, so the control stops there.
  const lastBooked = data.bookedDates.at(-1) ?? "";
  const minDays = lastBooked ? Math.max(1, daysFromToday(lastBooked)) : 1;

  return (
    <div className="rounded-xl border border-line bg-white p-4 sm:p-5">
      {/* The one-sentence answer, before the detail. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck2 size={18} className="shrink-0 text-primary" aria-hidden />
          <p className="text-[14px] font-semibold text-ink">Availability</p>
        </div>
        <span
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
            data.isAvailableNow ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
          }`}
        >
          {data.isAvailableNow
            ? "Free right now"
            : `Booked until ${prettyDate(data.freeFrom)}`}
        </span>
      </div>

      {/* The window itself */}
      <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-page px-3 py-2.5">
        <span className="text-[12px] text-body">Open for booking</span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => applyDays(days - 1)}
            disabled={days <= minDays}
            aria-label="One day less"
            className="rounded-md border border-line bg-white p-1 text-ink transition-colors hover:border-primary disabled:opacity-30"
          >
            <Minus size={13} aria-hidden />
          </button>
          <input
            type="number"
            min={minDays}
            max={MAX_DAYS}
            value={days}
            onChange={(e) => applyDays(Number(e.target.value))}
            aria-label="Days open for booking"
            className="w-[62px] rounded-md border border-line bg-white px-2 py-1 text-center text-[13px] font-semibold text-ink focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => applyDays(days + 1)}
            disabled={days >= MAX_DAYS}
            aria-label="One day more"
            className="rounded-md border border-line bg-white p-1 text-ink transition-colors hover:border-primary disabled:opacity-30"
          >
            <Plus size={13} aria-hidden />
          </button>
        </span>
        <span className="text-[12px] text-body">
          days — through <strong className="text-ink">{prettyDate(windowEndIso)}</strong>
        </span>
      </div>

      <p className="mt-1.5 text-[12px] text-muted">
        Tap any date to close it to guests, and tap it again to re-open it —
        as many as you like, however far ahead you like. A date closed beyond
        the window above simply waits there, already unavailable by the time
        guests can reach it. Red nights are booked and stay closed until that
        booking is cancelled.
      </p>
      {pendingCount > 0 && (
        <p className="mt-1.5 text-[12px] font-medium text-primary">
          {pendingCount} unsaved calendar change{pendingCount === 1 ? "" : "s"} —
          they apply when you save the listing.
        </p>
      )}

      {/* Month */}
      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((o) => o - 1)}
          disabled={offset <= 0}
          aria-label="Previous month"
          className="rounded-md p-1.5 text-ink transition-colors hover:bg-page disabled:opacity-30"
        >
          <ChevronLeft size={18} aria-hidden />
        </button>
        <p className="text-[13px] font-semibold text-ink">{monthLabel(year, month)}</p>
        <button
          type="button"
          onClick={() => setOffset((o) => o + 1)}
          disabled={offset >= 11}
          aria-label="Next month"
          className="rounded-md p-1.5 text-ink transition-colors hover:bg-page disabled:opacity-30"
        >
          <ChevronRight size={18} aria-hidden />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1 text-[11px] font-medium text-muted">
            {d}
          </span>
        ))}

        {Array.from({ length: leadingBlanks(year, month) }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const date = iso(new Date(year, month, day));
          const isBooked = booked.has(date);
          const isPast = date < todayIso;
          const isToday = date === todayIso;
          const isBlocked = blocked.has(date);
          const inWindow = !isPast && date <= windowEndIso;

          const tone = isPast
            ? "text-muted/40"
            : isBooked
              ? "bg-red-50 font-semibold text-red-600"
              : isBlocked
                ? "bg-amber-100 font-semibold text-amber-700 line-through hover:bg-amber-200"
                : inWindow
                  ? "bg-green-50/70 text-green-700 hover:bg-green-100"
                  : "text-muted/60 hover:bg-page";

          return (
            <button
              key={date}
              type="button"
              aria-pressed={isBlocked}
              disabled={isPast || isBooked}
              onClick={() => onToggleBlocked(date)}
              title={
                isPast
                  ? prettyDate(date)
                  : isBooked
                    ? `${prettyDate(date)} — booked by a guest`
                    : isBlocked
                      ? `${prettyDate(date)} — closed by you. Tap to re-open.`
                      : inWindow
                        ? `Close ${prettyDate(date)} to guests`
                        : `Close ${prettyDate(date)} now — it's beyond your window, but the block will hold`
              }
              className={`flex h-8 items-center justify-center rounded-md text-[12px] transition-colors disabled:cursor-default ${tone} ${
                isToday ? "ring-1 ring-primary" : ""
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-green-50/70 ring-1 ring-green-200" />
          Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-red-50 ring-1 ring-red-200" />
          Booked
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-amber-100 ring-1 ring-amber-300" />
          Closed by you
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded bg-page ring-1 ring-line" />
          Beyond window
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded ring-1 ring-primary" />
          Today
        </span>
      </div>

      {/* The bookings behind those red days */}
      <div className="mt-5 border-t border-line pt-4">
        <p className="text-[13px] font-semibold text-ink">Upcoming stays</p>
        {data.upcoming.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-muted">
            Nothing booked — every open night ahead is free.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {data.upcoming.map((b) => (
              <li
                key={b.bookingId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-page px-3 py-2 text-[12px]"
              >
                <span className="font-medium text-ink">
                  {prettyDate(b.checkIn)} → {prettyDate(b.checkOut)}
                </span>
                <span className="flex items-center gap-3 text-muted">
                  <span>
                    {b.nights} night{b.nights === 1 ? "" : "s"}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users size={12} aria-hidden />
                    {b.guests}
                  </span>
                  <span className="truncate">{b.guestName}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Changing the rooms is allowed while a stay is booked — but a host
          should know what it means before they save it. */}
      {data.upcoming.length > 0 && (
        <p
          className={`mt-4 rounded-lg px-3 py-2.5 text-[12px] ${
            capacityClash ? "bg-red-50 font-medium text-red-600" : "bg-primary/5 text-body"
          }`}
        >
          {capacityClash
            ? `A booked stay is for ${data.maxBookedGuests} guests, but your rooms now
               add up to ${plannedCapacity}. Those guests keep their booking — add the
               beds back, or contact them.`
            : `Editing rooms or beds won't change the stays above: each one is already
               agreed and stays on the calendar. New guests see the new room count
               straight away.`}
        </p>
      )}
    </div>
  );
}
