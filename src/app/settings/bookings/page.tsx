"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Star, KeyRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { setBookingCount } from "@/lib/useProperty";
import { useToast } from "@/lib/toast";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import BookingDetails from "@/components/settings/BookingDetails";
import CancelBookingModal from "@/components/settings/CancelBookingModal";
import EditBookingModal from "@/components/settings/EditBookingModal";
import CountPill from "@/components/ui/CountPill";
import StayPartChips from "@/components/ui/StayPartChips";
import CheckInCountdownPill from "@/components/ui/CheckInCountdownPill";
import StayCountdownPill from "@/components/ui/StayCountdownPill";
import ForcedCheckOutPill from "@/components/ui/ForcedCheckOutPill";
import Img from "@/components/ui/Img";
import SortMenu, {
  ACTION_SORTS,
  HISTORY_SORTS,
  compareBySort,
  type SortKey,
} from "@/components/ui/SortMenu";
import {
  fetchMyBookings,
  submitReview,
  type Booking,
  type NightsCancellationQuote,
} from "@/lib/api";
import {
  bookingClosed,
  bookingStatus,
  cancellationGate,
  checkInCountdown,
  checkInGate,
  lastCheckInStarted,
  lifecycleOf,
  stayAction,
  stayChangeable,
  stayDates,
  useServerWallClock,
  stayProgress,
  nextActionAt,
  type BookingStatusTone,
} from "@/lib/booking";

// The list is cards, not a table: one card per booking, each carrying its own
// labels. What used to live here — the shared column template, its minimum
// width and the per-column indents that kept five headings over five cells —
// went with the table it was holding up.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "12 Sep" — one end of the stay, as the card's ticket strip prints it. */
function fmtDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso || "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "Fri" — which day of the week that is, under the date. */
function weekdayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { weekday: "short" });
}

/**
 * "2:00 PM" out of a naive wall-clock string. Read off the text rather than
 * parsed into a Date on purpose: these hours belong to the PROPERTY, and a
 * guest reading their booking from another time zone must see the hour they
 * are due at the door, not that hour shifted into their own.
 */
function wallTime(value: string): string {
  const m = /[T ](\d{2}):(\d{2})/.exec(value || "");
  if (!m) return "";
  const h24 = Number(m[1]);
  const h = h24 % 12 || 12;
  return `${h}:${m[2]} ${h24 >= 12 ? "PM" : "AM"}`;
}

/** Soft status chips, one per tone — the card's own reading of a status, in the
 *  top-right corner where a booking's state belongs. */
const TONE_CHIP: Record<BookingStatusTone, string> = {
  green: "bg-green-50 text-green-700 ring-green-600/15",
  blue: "bg-ink/[0.06] text-ink ring-ink/10",
  red: "bg-red-50 text-red-600 ring-red-500/15",
  muted: "bg-page text-body ring-ink/10",
  orange: "bg-orange-50 text-orange-600 ring-orange-500/20",
};

/**
 * One fact in the card's ticket strip: a small grey heading, the answer under
 * it, and a quieter qualifier under that. Every fact is set the same way, so
 * five of them side by side read as one strip rather than five little cards.
 */
function Fact({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  /** Green for a figure the property has confirmed — the party counted in at
   *  the door, as opposed to the number that was booked. */
  tone?: "green";
}) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={`mt-0.5 truncate text-[14px] font-bold ${
          tone === "green" ? "text-green-600" : "text-ink"
        }`}
      >
        {value}
      </p>
      {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
    </div>
  );
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
            // Over the nights this one was actually charged for — a service
            // bought after checkout runs from the night it was bought, not the
            // whole stay (older payloads carry neither and fall back).
            (s) => {
              const n = s.nights || b.nights;
              return `   • ${s.name} — ${money(s.price)} × ${n} = ${money(s.amount ?? s.price * n)}`;
            }
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

function BookingRow({
  booking,
  onCancel,
  onEdit,
  cancelling,
  onReview,
  reviewBusy,
  expanded,
  onToggle,
  onRefresh,
}: {
  booking: Booking;
  onCancel: (booking: Booking) => void;
  onEdit: (booking: Booking) => void;
  cancelling: boolean;
  onReview: (rating: number, comment: string) => void | Promise<void>;
  reviewBusy: boolean;
  expanded: boolean;
  onToggle: (id: string) => void;
  /** Re-read the list — used when this stay's forced check-out falls due, since
   *  the close itself happens on the server's next read of the booking. */
  onRefresh: () => void;
}) {
  // The server's clock, ticking — so a page left open through the check-in
  // hour drops the Cancel button on its own, exactly when the server would
  // start refusing it, rather than offering a cancellation that can't happen.
  const now = useServerWallClock(booking.serverNow);
  const status = bookingStatus(booking, now);
  // How far through a split stay this is — the row shows a chip per part, the
  // expanded panel below spells each one out with its dates.
  const progress = stayProgress(booking, now);
  // The flexible cancellation policy on its sliding scale: free 15 days out,
  // charging more the nearer the stay gets, nothing back inside the last 24
  // hours, and closed from the check-in time on.
  const gate = cancellationGate(booking, now);
  // The stay is over — checked out, or called off. A booking in that state sits
  // in Booking History under "Checked out" or "Cancelled", and there is nothing
  // left to do to it: no cancelling, no adding to it, no PIN to read out. Asked
  // once here and applied to every control in the row, so no combination of
  // server flags can put an action back on a finished booking.
  const closed = bookingClosed(booking);
  // The gate above answers "may the WHOLE stay be called off", which shuts the
  // moment the guest checks in. On a split stay that is not the end of it: the
  // parts they haven't arrived for are still theirs to give back, and the
  // server will still take them (see Booking.cancellable_nights). So the button
  // survives as long as there is any night left to hand over — with the dialog
  // offering the rest of the stay rather than a whole-booking cancellation it
  // could no longer perform.
  const canCancel = !closed && (gate.open || (booking.cancellableNights?.length ?? 0) > 0);
  // And the same question the other way up: is there anything to ADD? The
  // server decides both halves — services the villa offers and this stay
  // doesn't have, and whether it still has nights ahead to extend from — so a
  // guest who has everything on offer is never shown a door onto an empty room.
  // What the stay is after anything given back — the dates the row prints and
  // the length under them. `activeNights` is the server's count of what is still
  // held; the booked figure stands everywhere else, including on a stay called
  // off altogether, where "0 nights" would be a fact about nothing.
  const stay = stayDates(booking);
  const heldNights = booking.partiallyCancelled ? booking.activeNights : booking.nights;
  // `stayChangeable` is the clock half of the same rule, so the button goes on
  // the hour the guest was due rather than at the next refetch.
  const canEdit =
    !closed &&
    (booking.canAddServices || booking.canAddNights) &&
    stayChangeable(booking, now);
  // Once the stay's LAST arrival has come round there is nothing ahead of the
  // guest to re-plan — what they can still do is stay longer. So the button
  // stops saying "Edit", which promises choices, and says what it now does.
  const extendOnly = lastCheckInStarted(booking, now);
  // The guest's stay code, in the row where they can reach it without opening
  // anything — a code you have to hunt for is a code that expires first.
  //
  // ARRIVING, the slot appears the moment the window opens rather than when the
  // host presses Check in — until the code exists it holds `****`. A guest
  // standing at the door needs to know the code is coming and where it will
  // appear; an empty row that sprouts a PIN for sixty seconds is one they can
  // miss entirely.
  //
  // LEAVING, there is no such placeholder: it waits for a real code. A guest who
  // has just checked in is not standing at any door, and four grey asterisks
  // parked on their booking for a week of holiday only ever read as something
  // broken. What answers for the stay meanwhile is the countdown in the Status
  // column, and the digits appear here the moment the host actually starts the
  // check-out.
  const checkin = checkInGate(booking, now);
  const action = stayAction(booking);
  const pinMode: "in" | "out" | null = closed
    ? null
    : action === "check_in" && checkin.visible && checkin.open
      ? "in"
      : action === "check_out" && booking.checkoutAvailable && booking.checkoutPin
        ? "out"
        : null;
  const pin = pinMode === "out" ? booking.checkoutPin : booking.checkinPin;
  // How many days until this stay starts — only ever set while it's confirmed
  // and still ahead, so the row can render it without asking any questions.
  const countdown = checkInCountdown(booking, now);
  // Where the villa is, for the line under its name. The city alone when that
  // is all the payload has; nothing at all rather than a stray comma.
  const place = [booking.villaCity, booking.villaCountry].filter(Boolean).join(", ");
  // The card element itself — an <article>, so typed as the base HTMLElement.
  const rowRef = useRef<HTMLElement>(null);

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
    <article
      ref={rowRef}
      // scroll-mt: navbar (68px) + the collapsed page header (~50px) + a gap.
      // scroll-mb: the same courtesy at the foot, so the panel never ends flush
      // against the bottom edge of the window.
      //
      // A card per booking, not a row in a table. A stay is one thing a person
      // owns — a place, two dates, a party, a price — and reading it across a
      // grid meant reading it in the same five columns as every other stay,
      // none of which were about this one. The card gives each booking its own
      // frame: the villa at the top with its status, the trip laid out as a
      // strip of facts under it, and everything you can still DO about it
      // gathered along the foot.
      className={`scroll-mt-[132px] scroll-mb-6 overflow-hidden rounded-2xl border bg-white transition-all duration-300 ${
        expanded
          ? "border-ink/25 shadow-[0_10px_30px_-14px_rgba(20,20,45,0.35)]"
          : "border-line hover:border-ink/20 hover:shadow-[0_6px_20px_-12px_rgba(20,20,45,0.45)]"
      }`}
    >
      {/* The card itself, which folds away as the full detail opens — so the
          villa, the dates and the status are never shown twice at once. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:p-5">
            {/* The property. A real photograph at a real size: this is a trip,
                and the picture is most of what makes the card recognisable at a
                glance in a list of them. */}
            <Link
              href={`/villa/${booking.villaId}`}
              title={booking.villaTitle}
              className="group relative block h-[140px] w-full shrink-0 overflow-hidden rounded-xl bg-page ring-1 ring-ink/[0.07] sm:h-[104px] sm:w-[140px]"
            >
              <Img
                src={booking.villaCover}
                alt={booking.villaTitle}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.07]"
              />
            </Link>

            <div className="flex min-w-0 flex-1 flex-col">
              {/* Name, where it is, and how the stay is doing. The status sits
                  opposite the title on the same line — the two facts a guest
                  looks for first, at the two ends of the card's top edge. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/villa/${booking.villaId}`}
                    className="block truncate text-[15px] font-bold text-ink transition-colors hover:text-primary"
                    title={booking.villaTitle}
                  >
                    {booking.villaTitle}
                  </Link>
                  <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                    {place && <span className="truncate">{place}</span>}
                    {place && <span className="text-muted/40" aria-hidden>·</span>}
                    <span className="whitespace-nowrap">ID #{booking.id}</span>
                    {booking.extraServices?.length > 0 && (
                      <>
                        <span className="text-muted/40" aria-hidden>·</span>
                        <span
                          className="whitespace-nowrap"
                          title={booking.extraServices.map((s) => s.name).join(", ")}
                        >
                          ✨ {booking.extraServices.length} extra
                          {booking.extraServices.length === 1 ? "" : "s"} · +
                          {money(booking.extrasTotal)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11.5px] font-bold ring-1 ring-inset ${
                    TONE_CHIP[status.tone]
                  } ${status.pending ? "animate-soft-pulse" : ""}`}
                >
                  {status.label}
                </span>
              </div>

              {/* The trip itself, as a strip of facts. The dashed rule above it
                  is the seam of a ticket, which is what this part of the card
                  is: the details that were fixed when it was paid for. */}
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-dashed border-line pt-3 sm:grid-cols-3 lg:grid-cols-5">
                <Fact
                  label="Check-in"
                  value={fmtDay(stay.checkIn)}
                  sub={[weekdayOf(stay.checkIn), wallTime(booking.checkInAt)]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Fact
                  label="Check-out"
                  value={fmtDay(stay.checkOut)}
                  sub={[weekdayOf(stay.checkOut), wallTime(booking.checkOutAt)]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Fact
                  label="Nights"
                  value={String(heldNights)}
                  sub={heldNights === 1 ? "night" : "nights"}
                />
                {/* Once the host has counted the party in at the door, that
                    count replaces the booked one: it is who is actually in the
                    property, and the same figure the host's table shows. */}
                <Fact
                  label="Guests"
                  value={String(
                    booking.checkedInGuests > 0 ? booking.checkedInGuests : booking.guests
                  )}
                  sub={booking.checkedInGuests > 0 ? "checked in" : "booked"}
                  tone={booking.checkedInGuests > 0 ? "green" : undefined}
                />
                <Fact label="Trip total" value={money(booking.total)} sub="paid" />
              </div>

              {/* A split stay's two outer dates only bracket it, so the parts
                  are named here rather than letting the strip above read as one
                  continuous booking: which are behind us, which one the stay is
                  on, which are still to come. */}
              {progress.parts.length > 1 && (
                <div className="mt-2.5">
                  <StayPartChips progress={progress} />
                </div>
              )}
            </div>
          </div>

          {/* The foot of the card: what is happening now on the left, what you
              can do about it on the right. */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-line bg-page/50 px-4 py-3 sm:px-5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
              {/* How long until it starts — the thing this page is opened for
                  while the stay is still ahead. */}
              {countdown && (
                <CheckInCountdownPill
                  countdown={countdown}
                  checkIn={booking.checkIn}
                  role="guest"
                  variant="text"
                />
              )}
              {/* And once it has started, how much of it is left. */}
              <StayCountdownPill booking={booking} />
              {/* The check-out hour has gone by with the stay still open. It
                  closes itself half an hour later — the guest sees exactly when
                  their booking stops being live, rather than finding it closed. */}
              <ForcedCheckOutPill booking={booking} onDue={onRefresh} />

              {/* The stay code, where it can be reached without opening
                  anything — a code you have to hunt for is a code that expires
                  first. Green arriving, black leaving: the same pair the host's
                  dialog uses, so both sides of the conversation are looking at
                  the same colour. */}
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
                  className={`inline-flex items-center gap-2 whitespace-nowrap rounded-lg border px-3 py-1 text-[12.5px] font-semibold ${
                    pinMode === "out"
                      ? "border-ink/25 bg-ink/[0.06] text-ink"
                      : "border-[#2f9e44]/30 bg-[#2f9e44]/[0.07] text-[#2f9e44]"
                  }`}
                >
                  <KeyRound size={13} aria-hidden />
                  PIN
                  <span
                    aria-hidden
                    className={`font-mono text-[15px] font-bold tracking-[0.18em] ${
                      // The placeholder is deliberately quieter than a real
                      // code, so a glance tells "not yet" from "here it is".
                      pin ? "text-ink" : "text-muted"
                    }`}
                  >
                    {pin || "****"}
                  </span>
                </span>
              )}

              {/* The stay is over and there is a word to leave about it. */}
              {!pinMode && booking.reviewRating > 0 && (
                <span
                  title={`You rated this stay ${booking.reviewRating} out of 5`}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-star/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-[#b8860b]"
                >
                  <Star size={13} className="fill-star text-star" aria-hidden />
                  Rated {booking.reviewRating.toFixed(1)}
                </span>
              )}
              {!pinMode && booking.reviewRating === 0 && booking.canReview && (
                <button
                  type="button"
                  onClick={() => onToggle(booking.id)}
                  className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-star/15 px-3 py-1.5 text-[12.5px] font-semibold text-[#b8860b] transition-colors hover:bg-star/25"
                >
                  <Star size={13} className="fill-star text-star" aria-hidden />
                  Rate stay
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {/* Add to the stay. First, so the foot reads in the order a guest
                  thinks in — more of this trip, then less of it — and only when
                  there is genuinely something to add. */}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(booking)}
                  aria-label={`Add services or nights to ${booking.villaTitle} booking`}
                  title={
                    extendOnly
                      ? "Stay longer — add nights to this booking"
                      : "Add extra services or more nights"
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-line bg-white px-3 py-[5px] text-[12.5px] font-medium text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                >
                  <Plus size={13} className="shrink-0" aria-hidden />
                  {extendOnly ? "Extend" : "Edit"}
                </button>
              )}

              {/* The word stays "Cancel" at every width, but what it cancels is
                  not always the whole stay: once the guest has checked in, only
                  the nights they haven't reached are still theirs to give back.
                  The dialog opens on exactly that; the tooltip says so first.
                  It only turns red under the cursor — late enough to be a
                  confirmation, early enough to stop a mis-aimed tap. */}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => onCancel(booking)}
                  disabled={cancelling}
                  aria-busy={cancelling}
                  aria-label={`Cancel ${booking.villaTitle} booking`}
                  title={
                    gate.open
                      ? "Cancel this booking"
                      : "Give back the nights you haven't stayed"
                  }
                  className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line bg-white px-3.5 py-[5px] text-[12.5px] font-medium text-body transition-colors hover:border-[#e5484d]/60 hover:bg-[#e5484d]/5 hover:text-[#e5484d] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancelling && <span className="spinner shrink-0" aria-hidden />}
                  Cancel
                </button>
              )}

              <button
                type="button"
                onClick={() => onToggle(booking.id)}
                aria-expanded={expanded}
                aria-label={`View ${booking.villaTitle} booking details`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-[5px] text-[12.5px] font-semibold text-primary transition-colors hover:bg-primary hover:text-white"
              >
                View details
                <ChevronDown size={15} className="shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded: the full detail, which carries its own header, status and
          Hide control — so nothing shows twice — and the same two actions,
          which is where they belong once the card itself is folded away. */}
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
              onEdit={canEdit ? () => onEdit(booking) : undefined}
              cancelling={cancelling}
              onReview={onReview}
              reviewBusy={reviewBusy}
            />
          </div>
        </div>
      </div>
    </article>
  );
}

export default function MyBookingsPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [loadError, setLoadError] = useState("");
  // The booking whose cancel dialog is open, if any — and the one whose edit
  // dialog is. Never both: the edit screen hands over to the cancel screen for
  // shortening a stay, which is where that is priced.
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [editTarget, setEditTarget] = useState<Booking | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  // Which booking row is expanded to show its full details inline.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const toggleExpand = useCallback(
    (id: string) => setExpandedId((cur) => (cur === id ? null : id)),
    []
  );
  // Each table sorts independently — one shared state would make sorting the
  // history silently re-order the active table above it.
  // Active leads with the stay about to happen; history leads with the one that
  // happened last. Both are "nearest to now first" — read forwards or backwards
  // depending on which side of now the table lives on.
  // Active leads with whatever falls due first — the stay you have to do
  // something about. The history has nothing outstanding on it, so it leads
  // with the most recent instead.
  const [activeSort, setActiveSort] = useState<SortKey>("action");
  const [historySort, setHistorySort] = useState<SortKey>("newest");
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
  const load = useCallback(
    (silent = false) => {
      return fetchMyBookings()
        .then((bs) => {
          setBookings(bs);
          // The sidebar marks a section with nothing in it. This page has the
          // real list, so it says so — otherwise the mark would keep quoting
          // the count from whenever the tab was first opened.
          if (user) setBookingCount(user.id, bs.length);
        })
        .catch((e) => {
          if (!silent) {
            setLoadError(e instanceof Error ? e.message : "Failed to load bookings.");
          }
        });
    },
    [user]
  );

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
  // Paused while the cancel dialog is open: a background refresh would swap the
  // booking out from under a picker the guest is halfway through filling in.
  useLiveRefresh(
    () => load(true),
    ready && !!user && !cancelTarget,
    awaitingPin ? 5_000 : undefined
  );

  // A read is what closes an overrunning stay (the server does it lazily, on
  // the next look at that booking), so a row whose forced check-out falls due
  // asks for one immediately rather than sitting on "0:00" until the next poll.
  const refreshNow = useCallback(() => {
    load(true);
  }, [load]);

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
    // The list is ordered by the STAY, not by when it was bought. What a guest
    // scans this page for is which trip is next, so the one whose check-in
    // comes soonest leads the active table; the history reads the other way,
    // most recent stay first. Two stays that start on the same day fall back to
    // when they were booked (newest first) and then to the id, so the order is
    // fully determined — no row can swap places with another between renders.
    const stamp = (b: Booking) => {
      const t = new Date(b.createdAt).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    // Whatever needs doing soonest, first — see `nextActionAt`. That is the
    // arrival for a stay still to come, and the DEPARTURE for one under way,
    // which is why sorting on the stay's start date got it wrong: a booking
    // whose first part is behind it sorted above a guest arriving today while
    // its own row read "in 2 days". The menu can order it the other way, or by
    // when the booking was made, and every ordering falls back to the stamp so
    // the list never reshuffles between renders.
    const nextAction = (b: Booking) => nextActionAt(b, listNow);
    active.sort(compareBySort(activeSort, nextAction, stamp));
    history.sort(compareBySort(historySort, nextAction, stamp));
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


  // Cancelling is a screen of its own, not a yes/no box: the guest may be
  // calling the whole stay off or handing back three nights of it, and either
  // way the money depends on which nights and how near they are. The dialog
  // prices the choice against the server as it's made (see CancelBookingModal);
  // this only opens it and folds the result back into the list.
  function onCancel(b: Booking) {
    setCancelTarget(b);
  }

  function onCancelled(updated: Booking, quote: NightsCancellationQuote) {
    setCancelTarget(null);
    setBookings((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
    // The server's own figures for THIS event, never the running totals on the
    // booking: a stay trimmed twice would otherwise report the sum of both.
    const what = quote.full
      ? "Booking cancelled"
      : `${quote.nightsCount} night${quote.nightsCount === 1 ? "" : "s"} cancelled`;
    toast.success(
      quote.refundAmount > 0
        ? `${what} — ${money(quote.refundAmount)} refunded${
            quote.cancellationFee > 0 ? `, ${money(quote.cancellationFee)} charged` : ""
          }.`
        : `${what} — no refund is due.`
    );
  }

  // Adding to a stay is a screen of its own for the same reason cancelling is:
  // what it costs depends on what is picked and on how much of the stay is
  // still ahead, and both are priced against the server as the guest chooses
  // (see EditBookingModal). This opens it and folds the result back in.
  function onEdit(b: Booking) {
    setEditTarget(b);
  }

  function onEdited(updated: Booking, summary: string) {
    setEditTarget(null);
    setBookings((prev) => (prev ?? []).map((x) => (x.id === updated.id ? updated : x)));
    toast.success(summary);
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
            <SortMenu value={activeSort} options={ACTION_SORTS} onChange={setActiveSort} />
          </div>

          {justBooked && newest && (
            <WhatsAppGreeting booking={newest} onDismiss={() => setJustBooked(false)} />
          )}

          {/* Active bookings, one card each. No column headings: a card is not
              a row in a table, and every fact on it is labelled where it sits. */}
          <div>
            <div className="mt-6 space-y-4">
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
                    onEdit={onEdit}
                    cancelling={cancelTarget?.id === b.id}
                    onReview={(rating, comment) => onReview(b, rating, comment)}
                    reviewBusy={reviewingId === b.id}
                    expanded={expandedId === b.id}
                    onToggle={toggleExpand}
                    onRefresh={refreshNow}
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
            <SortMenu value={historySort} options={HISTORY_SORTS} onChange={setHistorySort} />
          </div>

          {/* History — the same cards, for stays that are over. */}
          <div>
            <div className="mt-6 space-y-4">
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
                    onEdit={onEdit}
                    cancelling={false}
                    onReview={(rating, comment) => onReview(b, rating, comment)}
                    reviewBusy={reviewingId === b.id}
                    expanded={expandedId === b.id}
                    onToggle={toggleExpand}
                    onRefresh={refreshNow}
                  />
                ))
              )}
            </div>
          </div>

          {/* Note */}
          <p className="mt-6 max-w-[720px] text-[11px] leading-5 text-muted">
            Note: Cancelling a booking may carry a charge, and the charge grows as the
            check-in date approaches — free 15 days or more ahead, 10% inside 15 days, 25%
            inside 7 days, 50% inside 3 days, and nothing refunded in the last 24 hours.
            You can also hand back only some of your nights and keep the rest of the stay.
            Once a stay has started, the night you&apos;re in is yours, but the nights after
            it can still be given up — they go back on the calendar, with no refund.
          </p>
        </div>
      </div>

      {cancelTarget && (
        <CancelBookingModal
          booking={cancelTarget}
          onClose={() => setCancelTarget(null)}
          onCancelled={onCancelled}
        />
      )}

      {editTarget && !cancelTarget && (
        <EditBookingModal
          booking={editTarget}
          onClose={() => setEditTarget(null)}
          onUpdated={onEdited}
          // "Fewer nights" is the cancel screen's job — it prices the refund.
          // Handing over rather than duplicating keeps one place where nights
          // are given up, whichever door the guest came in by.
          onCancelDates={() => {
            setCancelTarget(editTarget);
            setEditTarget(null);
          }}
        />
      )}
    </div>
  );
}

// Placeholders sized like a real row so the note below doesn't get shoved
// down once the bookings arrive.
function SkeletonRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        // Sized like a real card — the photo and its two rows of facts, plus
        // the action bar under them. A placeholder shorter than the thing it
        // stands in for makes the whole list jump when the data lands.
        <div key={i} className="skeleton h-[218px] rounded-2xl sm:h-[190px]" />
      ))}
    </>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">
      {text}
    </div>
  );
}
