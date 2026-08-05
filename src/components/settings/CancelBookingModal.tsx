"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CalendarX2, Loader2, Lock, X } from "lucide-react";
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

/**
 * "12–16 Sep" for a run of nights. The end printed is the morning AFTER the
 * last night — the day the guest actually leaves — which is how every other
 * date range in the product reads.
 */
function rangeLabel(nights: { date: string }[]): string {
  if (!nights.length) return "";
  const first = parseDay(nights[0].date);
  const last = parseDay(nights[nights.length - 1].date);
  last.setDate(last.getDate() + 1);
  const sameMonth =
    first.getMonth() === last.getMonth() && first.getFullYear() === last.getFullYear();
  return sameMonth
    ? `${first.getDate()}–${last.getDate()} ${MONTHS[last.getMonth()]}`
    : `${first.getDate()} ${MONTHS[first.getMonth()]} – ${last.getDate()} ${MONTHS[last.getMonth()]}`;
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
 * Would giving up `selected` leave a hole in this part — nights kept on BOTH
 * sides of a night handed back?
 *
 * A hole is allowed: the part becomes the two runs either side of it, which is
 * the same shape a stay booked around somebody else's nights already has. It is
 * worth saying out loud all the same, because the guest has to check out before
 * the gap and check back in after it, on a fresh PIN — so the picker owns up to
 * that here rather than letting them find out at the door.
 *
 * Nights already given up are not holes: they left one when they went, and the
 * run either side of them is what the stay is now.
 */
function splitsPart(partNights: BookingNightOption[], selected: Set<string>): boolean {
  const kept = partNights
    .filter((night) => night.state !== "cancelled")
    .map((night, i) => (night.cancellable && selected.has(night.date) ? -1 : i))
    .filter((i) => i >= 0);
  if (kept.length < 2) return false;
  return kept[kept.length - 1] - kept[0] + 1 !== kept.length;
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

  // What the picker lays out: the nights that can still go, and the ones
  // already given up — in date order, whichever part they belong to.
  //
  // Nights that have simply run out of time (a stay under way, an arrival hour
  // gone by) are NOT here. They can't be chosen and they can't be undone, so
  // all they did was pad the screen with things to be refused. A night already
  // handed back is different: it IS an answer to "what have I cancelled?", and
  // it comes back struck through and disabled rather than pretending the
  // booking was always this length.
  const shownRows = useMemo(
    () =>
      rows
        .filter((row) => row.cancellable || row.state === "cancelled")
        .sort((a, b) => a.date.localeCompare(b.date)),
    [rows]
  );

  // The stay in one line, for the header — what the guest is looking at before
  // they change any of it. Nights already handed back are not part of it.
  const stayLabel = useMemo(() => {
    const held = rows.filter((row) => row.state !== "cancelled");
    if (!held.length) return "";
    return `${rangeLabel(held)} · ${held.length} night${held.length === 1 ? "" : "s"}`;
  }, [rows]);

  const openNights = useMemo(
    () => rows.filter((row) => row.cancellable).map((row) => row.date),
    [rows]
  );
  const anySelectable = openNights.length > 0;

  // What is actually being given up: exactly the nights tapped, and nothing
  // else. Each night stands on its own — one out of the middle of a part is a
  // perfectly good choice, it just breaks that part in two — so a tap never
  // moves a chip the guest didn't touch.
  const effective = useMemo(
    () => rows.filter((row) => row.cancellable && selected.has(row.date)).map((r) => r.date),
    [rows, selected]
  );
  const effectiveSet = useMemo(() => new Set(effective), [effective]);
  // Parts this selection would break in two, so the guest is told before the
  // button that they'd be leaving and coming back across the gap.
  const splitParts = useMemo(
    () => parts.filter((part) => splitsPart(part.nights, selected)).length,
    [parts, selected]
  );
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

  /** A night the guest tapped: it joins the selection, or leaves it. Every
   *  night in the picker can go — the ones that can't are not shown — so there
   *  is nothing left to refuse and nothing to explain. */
  const tapNight = useCallback((row: BookingNightOption) => {
    setError("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(row.date)) next.delete(row.date);
      else next.add(row.date);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setError("");
    setSelected(new Set(openNights));
  }, [openNights]);

  const clearAll = useCallback(() => {
    setError("");
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
  // As wide as the stay needs and no wider. Width is what buys the height back:
  // the dates lay themselves out in as many columns as the panel gives them, so
  // a long booking gets a wide dialog rather than a tall one — and neither the
  // picker nor the page ends up with a scrollbar.
  // Sized to what is actually on show — the nights that can still go — not to
  // the whole booking: a month-long stay with three nights left to give up
  // needs a small dialog, not a hall with three chips in it.
  const shown = shownRows.length;
  const panelWidth = shown <= 7 ? 620 : shown <= 14 ? 780 : shown <= 24 ? 920 : 1080;
  // Past a month the chips themselves give ground, so another column or two
  // fits across rather than the dialog growing another row.
  const chipWidth = shown > 24 ? 66 : 78;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] overflow-y-auto overscroll-contain"
    >
      <div
        aria-hidden
        onClick={() => !busy && onClose()}
        className="animate-fade-in fixed inset-0 bg-ink/50 backdrop-blur-[3px]"
      />

      <div className="relative flex min-h-full items-center justify-center px-5 py-6">
        <div
          ref={panelRef}
          style={{ maxWidth: panelWidth }}
          className="animate-toast-in relative w-full overflow-hidden rounded-2xl border border-line bg-white shadow-[0_30px_80px_-24px_rgba(20,20,45,0.5)]"
        >
          {/* Header — the stay it is about, and a way out of the corner. */}
          <div className="flex items-center gap-3.5 border-b border-line bg-gradient-to-r from-red-50/80 to-transparent px-5 py-3.5 sm:px-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-red-500 ring-1 ring-red-100">
              <CalendarX2 size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[16px] font-bold leading-tight text-ink">
                Cancel dates
              </h2>
              <p className="mt-0.5 truncate text-[12.5px] text-body">
                {booking.villaTitle}
                {stayLabel && <span className="text-muted"> · {stayLabel}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={() => !busy && onClose()}
              disabled={busy}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-page hover:text-ink disabled:opacity-50"
            >
              <X size={17} aria-hidden />
            </button>
          </div>

          {/* The stay on the left, the money on the right. Side by side the
              dialog is wide rather than tall, which is what keeps a long stay
              on one screen. */}
          <div className="px-5 py-4 sm:px-6 md:flex md:items-start md:gap-6">
            <div className="min-w-0 md:flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <div className="flex items-center gap-3">
                  <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">
                    Your nights
                  </p>
                  <Legend />
                </div>
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

              {/* One run of dates, in date order — not a block per part. The
                  parts are still what the stay IS, and the line under the
                  picker owns up to a gap, but heading each one cost a row of
                  its own: a stay cut into five one-night pieces became five
                  lines with a single chip on each and the whole right of the
                  dialog blank beside them. The dates say it themselves. */}
              <div className="mt-2.5 rounded-2xl border border-line/70 bg-gradient-to-b from-page/70 to-white p-2.5">
                {shownRows.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {shownRows.map((row) => (
                      <NightChip
                        key={row.date}
                        row={row}
                        width={chipWidth}
                        picked={effectiveSet.has(row.date)}
                        busy={busy}
                        onTap={() => tapNight(row)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="px-1 py-3 text-center text-[12.5px] text-muted">
                    No nights left to cancel.
                  </p>
                )}
              </div>

              {/* One line, and the space for it is always there so nothing
                  below jumps as the guest taps around. It says the one thing
                  the money can't: that this choice would break the stay in two.
                  Nothing else — not a count of the nights that aren't on offer
                  (they aren't being cancelled, so they are not this screen's
                  business), and not the per-night policy sentence, which read
                  as if it described the whole selection: "Free cancellation
                  available." sitting above a summary charging 10%. Each date
                  wears its own share, and the summary is what adds up. */}
              <p
                role="status"
                className="mt-2 min-h-[17px] text-[12px] leading-[17px] text-muted"
              >
                {splitParts > 0
                  ? "Leaves a gap — your stay splits, with a new PIN after it."
                  : !anySelectable && shownRows.length > 0
                    ? "No nights left to cancel."
                    : ""}
              </p>
            </div>

            <div className="mt-3 md:mt-0 md:w-[272px] md:shrink-0">
              {/* What it costs. Every number here is the server's. */}
              <div className="rounded-xl border border-line bg-page px-4 py-3">
                {effective.length === 0 ? (
                  <p className="text-[12.5px] leading-5 text-body">
                    Pick the nights to cancel — the refund shows up here.
                  </p>
                ) : quoting && !quote ? (
                  <p className="flex items-center gap-2 text-[12.5px] text-body">
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    Working out your refund…
                  </p>
                ) : blocked ? (
                  <p className="flex items-start gap-2 text-[12.5px] leading-5 text-red-600">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
                    {quote?.error}
                  </p>
                ) : quote ? (
                  <div>
                    <Line
                      label={
                        quote.full
                          ? `Whole booking · ${quote.nightsCount} night${quote.nightsCount === 1 ? "" : "s"}`
                          : `${quote.nightsCount} of ${booking.activeNights} nights`
                      }
                      value={money(quote.stayValue)}
                    />
                    {/* Services on those nights come back whole — they don't
                        follow the ladder, and the sum reads wrong without it. */}
                    {quote.extrasValue > 0 && (
                      <Line label="Extras (full)" value={`+ ${money(quote.extrasValue)}`} />
                    )}
                    <Line
                      label={`Charge (${100 - quote.refundPercentage}%)`}
                      value={`− ${money(quote.cancellationFee)}`}
                      tone="red"
                    />
                    <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                      <span className="text-[13px] font-semibold text-ink">Refund</span>
                      <span
                        className={`text-[16px] font-bold ${
                          quote.refundAmount > 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {quote.refundAmount > 0 ? money(quote.refundAmount) : "No refund"}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>

              {error && (
                <p className="mt-2.5 text-[12.5px] font-medium text-red-600" role="alert">
                  {error}
                </p>
              )}

              <p className="mt-2 text-[11.5px] leading-[17px] text-muted">
                {full
                  ? "The booking is called off. This can't be undone."
                  : "The rest of your stay is unaffected. This can't be undone."}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 border-t border-line bg-page/40 px-5 py-3 sm:px-6">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-body transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-60"
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
      </div>
    </div>,
    document.body
  );
}

/**
 * One night: the day, the date, and the share it would hand back.
 *
 * A shut night is NOT `disabled` — a disabled button swallows the tap, and
 * tapping is how the guest is told why that night can't go.
 */
function NightChip({
  row,
  width,
  picked,
  busy,
  onTap,
}: {
  row: BookingNightOption;
  /** Every chip in the dialog is the same width, whatever part it belongs to —
   *  that is what lets the parts sit beside each other and still line up. */
  width: number;
  picked: boolean;
  busy: boolean;
  onTap: () => void;
}) {
  const gone = row.state === "cancelled";
  const pct = row.refundPercentage;
  const badge = gone ? "Cancelled" : pct >= 100 ? "Full refund" : pct > 0 ? `${pct}% back` : "No refund";
  // The one number on the chip that decides anything, so it is the one thing
  // wearing a colour — and it wears THREE, not two. Green for a night that
  // comes back whole, amber for one that comes back short, red for one that
  // doesn't come back at all. At two colours a 50% night was the same green as
  // a free one, which read as "all good" for a night that costs half its price
  // to give up. On a chip already picked the pill goes white-on-red: the chip
  // itself is the state by then, and a green pill inside a red one only
  // fights it.
  const badgeClass = picked
    ? "bg-white/20 text-white"
    : gone
      ? "text-muted"
      : pct >= 100
        ? "bg-green-50 text-green-700"
        : pct > 0
          ? "bg-amber-50 text-amber-700"
          : "bg-red-50 text-red-600";

  const face = (
    <>
      <span
        className={`block text-[9.5px] uppercase tracking-wide ${
          picked ? "text-white/70" : "text-muted"
        }`}
      >
        {fmtWeekday(row.date)}
      </span>
      <span
        className={`block text-[12.5px] font-bold leading-[16px] ${gone ? "line-through" : ""}`}
      >
        {fmtDay(row.date)}
      </span>
      <span
        className={`mx-auto mt-0.5 flex w-fit items-center justify-center gap-0.5 rounded px-1 py-px text-[9px] font-bold uppercase tracking-wide ${badgeClass}`}
      >
        {gone && <Lock size={8} aria-hidden />}
        {badge}
      </span>
    </>
  );

  const shell =
    "shrink-0 rounded-xl border px-1 py-2 text-center transition-all duration-150 ease-out";

  // A night already handed back is not a button at all — there is nothing to
  // press it for. Drawn as a plain <span>, deliberately: a `disabled` button
  // takes no pointer events in any browser, so the one thing the guest WOULD
  // want from it — hovering to be told it is cancelled — never happened.
  if (gone) {
    return (
      <span
        title={`Cancelled${row.message ? ` — ${row.message}` : ""}`}
        aria-label={`${fmtDay(row.date)} — cancelled`}
        style={{ width }}
        className={`${shell} cursor-not-allowed border-dashed border-line bg-page text-muted opacity-80`}
      >
        {face}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={picked}
      disabled={busy}
      onClick={onTap}
      title={row.message || undefined}
      style={{ width }}
      className={`${shell} ${
        picked
          ? "-translate-y-px border-red-500 bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[0_6px_14px_-6px_rgba(229,72,77,0.8)]"
          : "border-line bg-white text-ink shadow-[0_1px_2px_rgba(20,20,45,0.04)] hover:-translate-y-px hover:border-red-300 hover:shadow-[0_5px_12px_-6px_rgba(20,20,45,0.35)] active:translate-y-0"
      } disabled:opacity-60`}
    >
      {face}
    </button>
  );
}

/** Three dots and three words, inline beside the picker's heading — a legend
 *  set as a list of its own cost more height than the thing it explained. */
function Legend() {
  return (
    <ul className="flex items-center gap-2.5 text-[11px] text-muted">
      <LegendItem className="border-line bg-white" label="Open" />
      <LegendItem className="border-red-500 bg-red-500" label="Cancelling" />
      <LegendItem className="border-dashed border-line bg-page" label="Locked" />
    </ul>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <li className="flex items-center gap-1">
      <span className={`h-2.5 w-2.5 rounded-[3px] border ${className}`} aria-hidden />
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
