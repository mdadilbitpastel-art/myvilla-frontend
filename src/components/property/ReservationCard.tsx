"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Users } from "lucide-react";
import type { Villa } from "@/lib/villa";
import { fetchBookingWindow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { computeStayPricing, money, TAX_RATE } from "@/lib/pricing";
import {
  addDays,
  firstBookableDate,
  isDateOpen,
  maxCheckOutFor,
  prettyDate,
  slideWindow,
  stayProblem,
  type BookingWindow,
} from "@/lib/bookingWindow";
import DateField from "@/components/ui/DateField";

export default function ReservationCard({
  pricing,
  rating,
  villaId,
  ownerId,
  maxGuests = 4,
  checkInTime = "",
  coupon = "",
}: {
  pricing: Villa["pricing"];
  rating: number;
  /** real villa id — omit for the static demo page (Reserve disabled) */
  villaId?: string;
  /** owner's user id — used to block booking your own villa */
  ownerId?: string;
  /** the villa's stated guest capacity — the guest picker stops there */
  maxGuests?: number;
  /** the villa's check-in time, "HH:MM" — decides whether today is still bookable */
  checkInTime?: string;
  /** a coupon code to carry through to checkout (from a home-page offer). */
  coupon?: string;
}) {
  const router = useRouter();
  const { user, openAuth } = useAuth();

  // A booking takes the whole villa, so the party size changes nothing about
  // the price — there is nothing here for a guest to choose. The capacity is
  // stated instead, and the booking is made for it.
  const guestCount = Math.max(1, maxGuests);

  // No fixed cap on the length of a stay: the host's window is the limit, so a
  // villa opened for two months can be booked for two months. The backend
  // applies exactly the same rule.
  //
  // The host's booking window, from the server: which dates are open at all,
  // and which of those are already taken. Everything the calendar offers comes
  // from here — the guest can only pick inside it, and `createBooking` refuses
  // anything outside it regardless.
  const [rawWindow, setRawWindow] = useState<BookingWindow | null>(null);
  useEffect(() => {
    if (!villaId) return;
    let active = true;
    fetchBookingWindow(villaId)
      .then((w) => active && setRawWindow(w))
      // Leaving `win` null falls back to the plain min-is-today calendar; the
      // server is the one that decides, so a failed fetch can't let a bad date
      // through — only make the card less helpful about it.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [villaId]);

  // "Now" must not be read during render: the server resolves it in UTC and the
  // browser in local time, so the two disagree across the date boundary and
  // React throws a hydration mismatch. Resolved after mount instead — and kept
  // ticking, so a tab left open past the check-in time watches today drop out
  // of the calendar rather than keeping a date nobody can take any more.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The window as it stands at this minute, on the SERVER's clock (which is
  // what createBooking will judge against — see slideWindow). Only the span
  // moves; which dates are taken still comes from the server.
  const win = useMemo(
    () => (rawWindow && now ? slideWindow(rawWindow, now.getTime()) : null),
    [rawWindow, now]
  );

  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  // The first date the guest can actually take: the window's start, stepped
  // past any dates already booked or closed. "" when the whole window is gone.
  const firstOpen = useMemo(() => {
    if (!win) return "";
    for (let d = win.firstDate; d <= win.lastDate; d = addDays(d, 1)) {
      if (isDateOpen(d, win)) return d;
    }
    return "";
  }, [win]);

  // Park the dates on the first free night whenever the window moves under
  // them — on load, when the clock crosses the check-in time, and when a date
  // the guest had chosen turns out to be taken.
  useEffect(() => {
    if (!win) return;
    if (checkIn && isDateOpen(checkIn, win) && checkOut > checkIn) {
      // Still valid; only pull check-out back if the window shrank past it.
      const latest = maxCheckOutFor(checkIn, win);
      if (checkOut > latest) setCheckOut(latest);
      return;
    }
    if (!firstOpen) return;
    setCheckIn(firstOpen);
    // One night by default — the shortest valid stay. Anything longer is the
    // guest's choice to make, not a total we quote them before they ask.
    setCheckOut(addDays(firstOpen, 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win, firstOpen]);

  // Before the window lands (or if it failed to), fall back to the villa's own
  // check-in time so the calendar still can't open on a date already gone. A
  // villa with no stated time uses the standard 2 PM — the same default the
  // backend applies, so the two never disagree about whether today is still on.
  const fallbackEarliest = useMemo(
    () => (now ? firstBookableDate(checkInTime, now) : ""),
    [now, checkInTime]
  );

  const earliest = win ? win.firstDate : fallbackEarliest;

  // Nothing left in the window — every open date is booked or closed.
  const windowFull = !!win && !firstOpen;

  // Fall back to the plain "one night from today" pair only while the window
  // hasn't arrived, so the card isn't blank on first paint.
  useEffect(() => {
    if (win || !fallbackEarliest || checkIn) return;
    setCheckIn(fallbackEarliest);
    setCheckOut(addDays(fallbackEarliest, 1));
  }, [win, fallbackEarliest, checkIn]);

  const isOwner = !!user && !!ownerId && String(user.id) === String(ownerId);
  // False until the mount effect above has resolved the local date.
  const datesReady = !!checkIn && !!checkOut;
  const nights = !datesReady
    ? 0
    : Math.max(
        0,
        Math.round(
          (new Date(checkOut + "T00:00:00").getTime() -
            new Date(checkIn + "T00:00:00").getTime()) /
            86_400_000
        )
      );
  // The latest check-out this stay may have: the end of the host's window, or
  // the next night somebody else holds — whichever comes first. No night cap of
  // our own, so the whole of a two-month window really is bookable.
  const latestCheckOut = datesReady ? maxCheckOutFor(checkIn, win) : undefined;

  // Keep check-out inside that whenever check-in moves.
  function onCheckInChange(next: string) {
    setCheckIn(next);
    const latest = maxCheckOutFor(next, win);
    if (checkOut <= next) setCheckOut(addDays(next, 1));
    else if (checkOut > latest) setCheckOut(latest);
  }
  // Everything below the Reserve button is derived from the chosen dates.
  const stay = computeStayPricing(pricing.price, nights);
  const dateError = !datesReady
    ? ""
    : nights < 1
      ? "Check-out must be after check-in."
      : // The window's own rules, worded the same way the server words them.
        stayProblem(checkIn, checkOut, win);

  // Availability comes from ONE source of truth: the host's booking window
  // (`win`), whose `unavailableDates` already list every booked/closed night and
  // whose span is judged on the server's own clock (see slideWindow). That's
  // what `stayProblem` checks above. We deliberately do NOT run a second,
  // separate `villa(checkIn, checkOut)` availability query here: it recomputes
  // the window from the server clock at a slightly different instant, so at the
  // check-in-time boundary it could reject a check-out the calendar had just
  // offered ("Open for booking until <the day before>"). `createBooking` is the
  // final authority and re-checks everything at the moment of booking.
  const blocked = isOwner || !!dateError || !datesReady || windowFull;

  function onReserve() {
    if (!villaId) return; // demo page — nothing to book
    if (!user) {
      openAuth("signin");
      return;
    }
    if (blocked) return;
    const couponQ = coupon ? `&coupon=${encodeURIComponent(coupon)}` : "";
    router.push(
      `/villa/${villaId}/book?guests=${guestCount}&checkIn=${checkIn}&checkOut=${checkOut}${couponQ}`
    );
  }

  return (
    // Kept deliberately tight vertically: the card is sticky, so anything past
    // roughly one viewport height gets cut off at the bottom — the total was.
    <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      {/* Price + rating */}
      <div className="flex items-center justify-between">
        <p className="text-[22px] font-bold text-ink">
          ${pricing.price}
          <span className="text-[15px] font-normal text-muted"> / {pricing.period}</span>
        </p>
        <span className="flex items-center gap-1.5 text-[14px]">
          <Star size={15} className="fill-star text-star" />
          <span className="font-medium text-ink">{rating}</span>
          <a href="#reviews" className="text-muted underline underline-offset-2">
            {pricing.ratingReviews} Reviews
          </a>
        </span>
      </div>

      {/* How far ahead this host is open — the calendar allows exactly this
          span and nothing else, so it's worth saying out loud. */}
      {win && (
        <p className="mt-3 text-[12.5px] text-muted">
          {windowFull ? (
            <span className="font-medium text-red-600">
              Fully booked through {prettyDate(win.lastDate)}
            </span>
          ) : (
            <>
              Open for booking{" "}
              <span className="font-medium text-ink">{prettyDate(win.firstDate)}</span> –{" "}
              <span className="font-medium text-ink">{prettyDate(win.lastDate)}</span>
            </>
          )}
        </p>
      )}

      {/* Check-in / Check-out — user selectable, inside the window only */}
      <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-xl border border-line">
        <DateField
          variant="plain"
          label="Check - In"
          value={checkIn}
          min={earliest}
          max={win?.lastDate}
          disabledDates={win?.unavailableDates}
          onChange={onCheckInChange}
          className="border-r border-line"
        />
        <DateField
          variant="plain"
          label="Check - Out"
          value={checkOut}
          min={datesReady ? addDays(checkIn, 1) : undefined}
          max={latestCheckOut}
          onChange={setCheckOut}
        />
      </div>
      {dateError ? (
        <p role="alert" className="mt-1.5 text-[12px] text-red-500">
          {dateError}
        </p>
      ) : (
        // `&nbsp;` holds the line's height before the dates resolve, so the
        // card below it doesn't shift down by one line on mount.
        <p className="mt-1.5 text-[12px] text-muted">
          {datesReady ? `${nights} night${nights === 1 ? "" : "s"}` : " "}
        </p>
      )}

      {/* Capacity — stated, not chosen: the whole villa is booked either way,
          so a picker here would only look like it changed the price. */}
      <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-page px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <Users size={17} strokeWidth={1.8} aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold text-ink">
            Sleeps up to {guestCount} guest{guestCount === 1 ? "" : "s"}
          </span>
          <span className="block text-[12.5px] text-muted">
            The whole villa is yours for the stay.
          </span>
        </span>
      </div>

      {/* Reserve button */}
      <button
        type="button"
        onClick={onReserve}
        disabled={blocked}
        className={`mt-3.5 w-full rounded-xl py-3 text-[15px] font-semibold text-white transition-colors ${
          blocked ? "cursor-not-allowed bg-muted/60" : "bg-primary hover:bg-primary-dark"
        }`}
      >
        {isOwner ? "This is your villa" : windowFull ? "Fully booked" : "Reserve"}
      </button>
      {isOwner ? (
        <p className="mt-2 text-center text-[12px] text-muted">
          You can&apos;t book your own villa.
        </p>
      ) : (
        windowFull && (
          <p role="status" className="mt-2 text-center text-[12px] font-medium text-red-600">
            Every date this host is open for is already taken. Check back later.
          </p>
        )
      )}

      {/* Price breakdown — recomputed from the dates above, not a fixed
          template, so it always matches what checkout will charge. */}
      <div className="mt-4 space-y-2 text-[14px]">
        <div className="flex items-center justify-between text-body">
          <span>
            {money(pricing.price)} x {nights} night{nights === 1 ? "" : "s"}
          </span>
          <span>{money(stay.subtotal)}</span>
        </div>
        <div className="flex items-center justify-between text-body">
          <span>Discount</span>
          <span>{stay.discount > 0 ? `-${money(stay.discount)}` : money(0)}</span>
        </div>
        <div className="flex items-center justify-between text-body">
          <span>Service Fee</span>
          <span>{money(stay.serviceFee)}</span>
        </div>
        <div className="flex items-center justify-between text-body">
          <span>Tax ({Math.round(TAX_RATE * 100)}%)</span>
          <span>{money(stay.tax)}</span>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[16px] font-bold text-ink">
        <span>Total</span>
        <span>{money(stay.total)}</span>
      </div>
    </div>
  );
}

