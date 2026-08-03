"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarX2, Loader2, Lock } from "lucide-react";
import {
  cancelBookingNights,
  fetchNightsCancellationQuote,
  type Booking,
  type BookingNightOption,
  type NightsCancellationQuote,
} from "@/lib/api";

const money = (n: number) => `$${n.toFixed(2)}`;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A date-only ISO string as a local date — never `new Date(iso)`, which reads
 *  a bare "2026-08-04" as UTC midnight and can show the day before. */
function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function fmtDay(iso: string): string {
  const d = parseDay(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function fmtWeekday(iso: string): string {
  return DAYS[parseDay(iso).getDay()];
}

/** Every night of one run of the stay: the nights slept, so the last date is
 *  the morning the guest leaves and is NOT one of them. */
function nightsOf(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const end = parseDay(checkOut);
  for (let d = parseDay(checkIn); d < end; d.setDate(d.getDate() + 1)) {
    out.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`
    );
  }
  return out;
}

/**
 * Keep what's LEFT of each part in one unbroken run.
 *
 * A stay is nights the guest is physically present for, so dropping one out of
 * the middle would mean packing up, leaving and coming back — the server
 * refuses it, and rather than let the guest build a selection that will be
 * rejected, a tap in the middle takes everything from there to the nearer end
 * of that part with it. That is what "trim your stay" means on every travel
 * site, and it is the only shape the server will accept.
 *
 * Nights that can't go count as KEPT while this is worked out. On a part the
 * guest is already living in, tonight is theirs and stays; the run may then only
 * be trimmed from the far end, so picking the middle of what's left reaches
 * forward to the end of the stay rather than backwards into a night already
 * being slept in.
 */
function trimToEdges(partNights: BookingNightOption[], selected: Set<string>): string[] {
  const picked = partNights
    .map((night, i) => (night.cancellable && selected.has(night.date) ? i : -1))
    .filter((i) => i >= 0);
  if (picked.length === 0) return [];
  const first = picked[0];
  const last = picked[picked.length - 1];
  const dates = (from: number, to: number) =>
    partNights.slice(from, to).map((night) => night.date);
  // Which ends are actually free: an end is only an end if everything between
  // it and the furthest pick can go at all.
  const headFree = partNights.slice(0, last + 1).every((n) => n.cancellable);
  const tailFree = partNights.slice(first).every((n) => n.cancellable);
  if (headFree && tailFree) {
    // Both open — fall to whichever end is closer, so the tap costs the guest
    // as few nights as it can while still leaving them somewhere to sleep.
    return first <= partNights.length - 1 - last
      ? dates(0, last + 1)
      : dates(first, partNights.length);
  }
  if (headFree) return dates(0, last + 1);
  if (tailFree) return dates(first, partNights.length);
  // No shape of this part works. Send what was picked and let the server say so
  // rather than silently dropping the guest's choice.
  return picked.map((i) => partNights[i].date);
}

/**
 * The stay laid out night by night, as the server describes it.
 *
 * `nightOptions` is the source: every date the booking was made for, held or
 * already given up, each carrying its own state, its own refund tier and the
 * sentence explaining it. A booking read before that field existed (a page left
 * open across a deploy) is rebuilt from the dates it does carry, so the picker
 * never comes up empty — it simply has no per-night figures to show.
 */
function nightRows(booking: Booking): BookingNightOption[] {
  if (booking.nightOptions?.length) return booking.nightOptions;
  const cancellable = new Set(booking.cancellableNights || []);
  const gone = new Set(booking.cancelledNights || []);
  return (booking.segments || []).flatMap((segment) =>
    nightsOf(segment.checkIn, segment.checkOut).map((date) => ({
      date,
      partIndex: segment.index,
      state: gone.has(date) ? "cancelled" : cancellable.has(date) ? "open" : "started",
      cancellable: cancellable.has(date) && !gone.has(date),
      refundPercentage: 0,
      stayValue: 0,
      refundAmount: 0,
      cancellationFee: 0,
      message: "",
    }))
  );
}

const STATE_NOTE: Record<string, string> = {
  started:
    "This night has already begun — it's yours. The nights that haven't started can still be given up.",
  expired:
    "This night has already begun, so it can no longer be cancelled. The nights that haven't started can.",
  cancelled: "This night has already been cancelled.",
};

/**
 * The cancel screen: the whole stay, night by night, and what giving any of it
 * up costs right now.
 *
 * Every date the booking holds is on show. The ones that can still go are
 * selectable and wear their own refund tier; the ones that can't — a part
 * already under way, an arrival hour gone by, a night already handed back — are
 * disabled and say why when tapped. Picking dates re-prices the selection
 * against the server as it's made, so the refund (or the reason there isn't
 * one) is on screen before the button is ever pressed.
 *
 * The money is never worked out here. Every figure comes from the server's own
 * quote — the same code that performs the cancellation — so what the guest
 * reads is what the button does.
 */
export default function CancelBookingModal({
  booking,
  onClose,
  onCancelled,
}: {
  booking: Booking;
  onClose: () => void;
  /** The booking as the server returned it, cancelled or trimmed. */
  onCancelled: (updated: Booking, quote: NightsCancellationQuote) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // The line under the picker: what the last tap meant. A night that can't go
  // says why here rather than only in a tooltip, and a tap that had to take
  // its neighbours with it explains itself instead of just moving the chips.
  const [note, setNote] = useState("");
  // The last answer the server gave, tagged with the selection it was FOR. A
  // quote is only ever shown against its own selection, so changing the picker
  // needs nothing cleared: the stale figure simply stops matching and the
  // summary goes back to "working it out" until the new one lands.
  const [priced, setPriced] = useState<{
    key: string;
    quote: NightsCancellationQuote | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const rows = useMemo(() => nightRows(booking), [booking]);

  // The stay as the guest sees it: one block per part, in date order. A split
  // stay is lived in instalments and is chosen from the same way.
  const parts = useMemo(() => {
    const groups = new Map<number, BookingNightOption[]>();
    for (const row of rows) {
      const list = groups.get(row.partIndex);
      if (list) list.push(row);
      else groups.set(row.partIndex, [row]);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([index, nights]) => ({ index, nights }));
  }, [rows]);

  const openNights = useMemo(
    () => rows.filter((row) => row.cancellable).map((row) => row.date),
    [rows]
  );
  const anySelectable = openNights.length > 0;

  // What is actually being given up: the picked nights, trimmed per part so
  // what's left of each is one unbroken run.
  const effective = useMemo(
    () =>
      parts.flatMap((part) =>
        // Only the nights the booking still holds shape the run — one already
        // given up is no longer in the way of anything.
        trimToEdges(
          part.nights.filter((n) => n.state !== "cancelled"),
          selected
        )
      ),
    [parts, selected]
  );
  const effectiveSet = useMemo(() => new Set(effective), [effective]);
  // The selection as one comparable value — what a quote is tagged with, and
  // what the effect below watches (the array itself is rebuilt every render).
  const selectionKey = effective.join(",");
  const settled = priced?.key === selectionKey;
  const quote = settled ? priced?.quote ?? null : null;
  const quoting = selectionKey !== "" && !settled;

  // Body scroll lock + Escape to close, matching ConfirmDialog's behaviour.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [busy, onClose]);

  // Price the selection on the server, a beat after it settles. Every answer
  // arrives tagged with the selection it was for, so one that comes back late,
  // after the guest has picked again, is simply never the one on screen.
  useEffect(() => {
    if (selectionKey === "") return;
    let live = true;
    const nights = selectionKey.split(",");
    const timer = setTimeout(async () => {
      try {
        const next = await fetchNightsCancellationQuote(booking.id, nights);
        if (live) setPriced({ key: selectionKey, quote: next });
      } catch (e) {
        if (live) {
          setPriced({ key: selectionKey, quote: null });
          setError(e instanceof Error ? e.message : "Could not price that selection.");
        }
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [booking.id, selectionKey]);

  /** A night the guest tapped. One that can't go answers on the spot; one that
   *  can joins (or leaves) the selection and says what it costs. */
  const tapNight = useCallback(
    (row: BookingNightOption) => {
      setError("");
      if (!row.cancellable) {
        setNote(row.message || STATE_NOTE[row.state] || "This night can't be cancelled.");
        return;
      }
      setNote(row.message ? `${fmtDay(row.date)} — ${row.message}` : "");
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(row.date)) next.delete(row.date);
        else next.add(row.date);
        return next;
      });
    },
    []
  );

  const selectAll = useCallback(() => {
    setError("");
    setNote("");
    setSelected(new Set(openNights));
  }, [openNights]);

  const clearAll = useCallback(() => {
    setError("");
    setNote("");
    setSelected(new Set());
  }, []);

  async function submit() {
    if (busy || effective.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const updated = await cancelBookingNights(booking.id, effective);
      onCancelled(updated, quote as NightsCancellationQuote);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not cancel that.");
      setBusy(false);
    }
  }

  // Nothing to portal into during a server render. This dialog is only ever
  // mounted by a click, long after hydration, so there is no markup to mismatch.
  if (typeof document === "undefined") return null;

  const full = quote?.full ?? false;
  const blocked = !!quote && !quote.allowed;
  // A tap that had to take its neighbours with it — worth saying out loud, or
  // the picker looks like it selected dates on its own.
  const pulledAlong = effective.filter((n) => !selected.has(n)).length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] flex items-center justify-center px-5 py-8"
    >
      <div
        aria-hidden
        onClick={() => !busy && onClose()}
        className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        className="animate-toast-in relative flex max-h-full w-full max-w-[560px] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3.5 border-b border-line px-6 py-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-500">
            <CalendarX2 size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={titleId} className="text-[16px] font-bold text-ink">
              Cancel dates
            </h2>
            <p className="mt-0.5 truncate text-[13px] text-body">{booking.villaTitle}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* The whole stay, night by night. Nothing is hidden: the dates that
              can't go are here too, disabled, with their reason a tap away. */}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">
              Your booked dates
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={selectAll}
                disabled={!anySelectable || busy}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-body transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={clearAll}
                disabled={selected.size === 0 || busy}
                className="rounded-md border border-line px-2.5 py-1 text-[12px] font-semibold text-body transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-50"
              >
                Clear
              </button>
            </div>
          </div>

          {parts.map((part) => (
            <div key={part.index} className="mt-3">
              {parts.length > 1 && (
                <p className="mb-1.5 text-[12px] font-semibold text-body">
                  Part {part.index} of {parts.length}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {part.nights.map((row) => (
                  <NightChip
                    key={row.date}
                    row={row}
                    picked={effectiveSet.has(row.date)}
                    busy={busy}
                    onTap={() => tapNight(row)}
                  />
                ))}
              </div>
            </div>
          ))}

          <Legend />

          {/* Why the last tap did what it did — a night that can't go, or one
              that took its neighbours with it. */}
          {(note || pulledAlong > 0) && (
            <p className="mt-2.5 text-[12px] leading-5 text-body" role="status">
              {pulledAlong > 0
                ? `A stay can't have a gap you leave and come back across, so ${pulledAlong} night${
                    pulledAlong === 1 ? " next to your pick was" : "s next to your picks were"
                  } added — nights are given up from the start or the end of a stay.`
                : note}
            </p>
          )}

          {!anySelectable && (
            <p className="mt-2.5 text-[12px] leading-5 text-body">
              None of these nights can be cancelled any more. If your stay is under way,
              check out early instead — the nights go back on the calendar, but nothing is
              refunded.
            </p>
          )}

          {/* What it costs. Every number here is the server's. */}
          <div className="mt-5 rounded-xl border border-line bg-page px-4 py-3.5">
            {effective.length === 0 ? (
              <p className="text-[13px] text-body">
                Pick the dates you want to cancel to see what comes back.
              </p>
            ) : quoting && !quote ? (
              <p className="flex items-center gap-2 text-[13px] text-body">
                <Loader2 size={15} className="animate-spin" aria-hidden /> Working out your
                refund…
              </p>
            ) : blocked ? (
              <p className="flex items-start gap-2 text-[13px] leading-5 text-red-600">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                {quote?.error}
              </p>
            ) : quote ? (
              <div>
                <Line
                  label={
                    quote.full
                      ? `Whole booking — ${quote.nightsCount} night${quote.nightsCount === 1 ? "" : "s"}`
                      : `${quote.nightsCount} night${quote.nightsCount === 1 ? "" : "s"} of ${booking.activeNights}`
                  }
                  value={money(quote.stayValue)}
                />
                <Line
                  label={`Cancellation charge (${100 - quote.refundPercentage}%)`}
                  value={`− ${money(quote.cancellationFee)}`}
                  tone="red"
                />
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-[13px] font-semibold text-ink">Refund to you</span>
                  <span
                    className={`text-[15px] font-bold ${
                      quote.refundAmount > 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {quote.refundAmount > 0 ? money(quote.refundAmount) : "No refund"}
                  </span>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-muted">{quote.message}</p>
              </div>
            ) : null}
          </div>

          {error && (
            <p className="mt-3 text-[12.5px] font-medium text-red-600" role="alert">
              {error}
            </p>
          )}

          <p className="mt-3 text-[12px] leading-5 text-muted">
            {full
              ? "The booking is called off and the nights go back on the villa's calendar. This can't be undone."
              : "The rest of your stay is unaffected; the nights you give up go back on the villa's calendar. This can't be undone."}
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2.5 text-[13px] font-semibold text-body transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-60"
          >
            Keep booking
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || quoting || blocked || effective.length === 0}
            aria-busy={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <span className="spinner" aria-hidden />}
            {busy
              ? "Cancelling…"
              : full
                ? "Cancel booking"
                : `Cancel ${effective.length || ""} night${effective.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * One night. What it says depends on what may be done with it: an open night
 * wears the share it would hand back, a shut one wears a lock and answers when
 * tapped, and one already given up is struck through.
 *
 * Shut nights are NOT `disabled` — a disabled button swallows the tap, and the
 * whole point is that tapping is how the guest is told why the night can't go.
 */
function NightChip({
  row,
  picked,
  busy,
  onTap,
}: {
  row: BookingNightOption;
  picked: boolean;
  busy: boolean;
  onTap: () => void;
}) {
  const open = row.cancellable;
  const gone = row.state === "cancelled";
  const badge = open
    ? row.refundPercentage > 0
      ? `${row.refundPercentage}% back`
      : "No refund"
    : gone
      ? "Cancelled"
      : null;

  return (
    <button
      type="button"
      aria-pressed={open ? picked : undefined}
      aria-disabled={!open}
      disabled={busy}
      onClick={onTap}
      title={row.message || undefined}
      className={`w-[84px] rounded-lg border px-2 py-1.5 text-center transition-colors disabled:opacity-60 ${
        picked
          ? "border-red-500 bg-red-50 text-red-600"
          : open
            ? "border-line text-ink hover:border-red-300 hover:bg-red-50/40"
            : "cursor-not-allowed border-dashed border-line bg-page text-muted"
      }`}
    >
      <span className="block text-[10px] uppercase tracking-wide">
        {fmtWeekday(row.date)}
      </span>
      <span className={`block text-[12.5px] font-semibold ${gone ? "line-through" : ""}`}>
        {fmtDay(row.date)}
      </span>
      <span className="mt-0.5 flex items-center justify-center gap-0.5 text-[9.5px] font-semibold uppercase tracking-wide">
        {!open && !gone && <Lock size={9} aria-hidden />}
        {badge ?? "Locked"}
      </span>
    </button>
  );
}

function Legend() {
  return (
    <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-muted">
      <LegendItem className="border-line bg-white" label="Can be cancelled" />
      <LegendItem className="border-red-500 bg-red-50" label="Selected to cancel" />
      <LegendItem className="border-dashed border-line bg-page" label="Locked — tap to see why" />
    </ul>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className={`h-3 w-3 rounded border ${className}`} aria-hidden />
      {label}
    </li>
  );
}

function Line({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "red";
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[12.5px] text-body">{label}</span>
      <span
        className={`text-[13px] font-semibold ${tone === "red" ? "text-red-600" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
