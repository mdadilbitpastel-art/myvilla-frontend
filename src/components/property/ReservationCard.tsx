"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import type { Villa } from "@/lib/villa";
import { fetchBookingWindow } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { computeStayPricing, money, TAX_RATE } from "@/lib/pricing";
import { propertyNoun } from "@/lib/categories";
import {
  addDays,
  firstBookableDate,
  isDateOpen,
  iso,
  prettyDate,
  serverDate,
  shortRange,
  slideWindow,
  splitStay,
  stayProblem,
  type BookingWindow,
} from "@/lib/bookingWindow";
import DateField from "@/components/ui/DateField";

export default function ReservationCard({
  pricing,
  villaId,
  ownerId,
  maxGuests = 4,
  checkInTime = "",
  coupon = "",
  propertyType = "",
  initialCheckIn = "",
  initialCheckOut = "",
}: {
  pricing: Villa["pricing"];
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
  /** the listing's own category — decides what the card calls the place. */
  propertyType?: string;
  /**
   * A stay handed back to the card, "YYYY-MM-DD" — from Cancel on the payment
   * page. Taken once, as the starting dates, instead of the first free night.
   * They still have to survive the host's window: a range that has been taken
   * in the meantime is parked on the first open night like any other.
   */
  initialCheckIn?: string;
  initialCheckOut?: string;
}) {
  const router = useRouter();
  const { user, openAuth } = useAuth();

  // A booking takes the whole place, so the party size changes nothing about
  // the price — there is nothing here for a guest to choose. The capacity is
  // stated instead, and the booking is made for it.
  const guestCount = Math.max(1, maxGuests);

  // What this listing calls itself — "the whole bungalow", "the whole villa".
  // "" for a hotel, where a guest takes a room rather than the building, so the
  // line is left off entirely rather than reworded into something untrue.
  const noun = propertyNoun(propertyType);

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

  // A stay coming back from a cancelled payment starts the card off, when there
  // is one. Taken as the INITIAL value rather than pushed in by an effect: this
  // card is only ever mounted once its villa has loaded, and the page has read
  // the URL long before that — so the dates are already here on the first
  // render, and seeding them later would only cost an extra pass and a flash of
  // the wrong dates. Everything downstream treats them as any other choice: the
  // effect below still parks them on the first open night if the host's window
  // says they're gone, and `stayProblem` still has the last word on whether the
  // stay can be booked at all.
  const returning = !!initialCheckIn && !!initialCheckOut && initialCheckOut > initialCheckIn;
  const [checkIn, setCheckIn] = useState(returning ? initialCheckIn : "");
  const [checkOut, setCheckOut] = useState(returning ? initialCheckOut : "");

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
      // Still valid; only pull check-out back if the window itself shrank past
      // it. A taken night in between is NOT pulled back — the guest is left on
      // the date they picked and told which night is in the way, rather than
      // having the field silently rewritten under them.
      if (checkOut > win.maxCheckOut) setCheckOut(win.maxCheckOut);
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

  // Today, once this villa's check-in time has gone by. `min` alone would grey
  // it out like any date outside the window, which reads as "not open yet" —
  // but the day IS the guest's own, it has simply been taken off the board.
  // Shown with the booked treatment instead: struck through, and "Already
  // booked" on hover.
  //
  // The server's date decides while the window is here (the browser's can be a
  // whole day out at the boundary); the browser's is only the fallback for when
  // the window never arrived and the calendar is running on its own.
  const checkInBlocked = useMemo(() => {
    const taken = win?.unavailableDates ?? [];
    if (!now || !earliest) return win ? taken : undefined;
    const today = win ? serverDate(win, now.getTime()) : iso(now);
    if (!today || today >= earliest) return win ? taken : undefined;
    return [...taken, today];
  }, [win, now, earliest]);

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

  // The stay as the guest will actually get it. A booking somebody else holds
  // in the middle of the chosen range doesn't refuse it — the range breaks into
  // runs around that booking, and only the nights slept are counted (and
  // charged). `createBooking` splits it exactly the same way for real.
  const split = useMemo(
    () => (datesReady ? splitStay(checkIn, checkOut, win) : null),
    [datesReady, checkIn, checkOut, win]
  );
  const nights = split?.nights ?? 0;
  const isSplit = (split?.segments.length ?? 0) > 1;
  // The check-out calendar offers the host's whole window, closing only the
  // dates that can't END a stay.
  //
  // That is NOT the same list the check-in side uses. A check-out day is not a
  // night: leaving on the 30th means you slept on the 29th, so the 30th being
  // booked by somebody else doesn't stop you checking out on it. What stops you
  // is the night BEFORE — so the taken nights are shifted a day forward here.
  //
  //   30 & 31 Jul taken  →  check-in closes 30, 31
  //                      →  check-out closes 31, 1 Aug (30 stays open)
  const checkOutBlocked = useMemo(
    () => win?.unavailableDates.map((d) => addDays(d, 1)),
    [win]
  );

  // Keep check-out after check-in, and inside the host's window, whenever
  // check-in moves. A taken night in between is left to the message below.
  function onCheckInChange(next: string) {
    setCheckIn(next);
    if (checkOut <= next) setCheckOut(addDays(next, 1));
    else if (win && checkOut > win.maxCheckOut) setCheckOut(win.maxCheckOut);
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

  // Every night of the range is somebody else's. That is a different refusal
  // from "check-out must be after check-in", and the button says so: the stay
  // isn't unbookable, it is already reserved. A range with only SOME nights
  // taken is not this — it splits around them and books fine.
  const datesTaken = !!win && datesReady && nights < 1;

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

  // ── Staying inside one screenful ─────────────────────────────────────────
  // The card is pinned, so `.sticky-panel` bounds it to the space under the
  // page header and scrolls whatever doesn't fit. A scrollbar appearing over a
  // line or two of overflow is a poor trade — it hides the total and Reserve
  // behind a scroll nobody looks for — so the card first gives that much back
  // out of its own bottom block: the price breakdown's row spacing, which is
  // the one part of the card carrying slack. Padding and type stay exactly as
  // they are, and nothing is hidden; `data-fit` only tightens spacing, in two
  // small steps (see globals.css). Past what those absorb, the panel scrolls as
  // before — this is a nudge, not a replacement for it.
  const cardRef = useRef<HTMLDivElement>(null);
  // The least room the panel has ever offered. Its height moves as the page
  // header collapses on scroll; sizing off the live value would re-tighten the
  // card under the guest's eyes, so the worst case decides once.
  const leastRoom = useRef(Infinity);
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    // "" first: the roomiest fit that works, wins.
    const STEPS = ["", "snug", "tight"];
    let queued = false;

    function fit() {
      queued = false;
      const panel = el!.closest<HTMLElement>(".sticky-panel");
      if (!panel) return;
      const cs = getComputedStyle(panel);
      // The panel's own ceiling, already resolved to px — and only set while it
      // is actually pinned, so on a narrow screen (max-height: none) there is
      // nothing to fit into and the card is left alone.
      const cap = parseFloat(cs.maxHeight);
      if (!Number.isFinite(cap)) {
        el!.dataset.fit = "";
        return;
      }
      const room =
        cap - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
      leastRoom.current = Math.min(leastRoom.current, room);

      for (const step of STEPS) {
        el!.dataset.fit = step;
        // offsetHeight, read back after the write, is what applies the step —
        // and it is the card's own height, not the scroll container's.
        if (el!.offsetHeight <= leastRoom.current) return;
      }
      // Still over even at `tight`: leave it there and let the panel scroll the
      // remainder, which is now a smaller remainder than it would have been.
    }

    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(fit);
    }

    fit();
    // The card's own height changing (a split-stay breakdown appearing, an
    // error line, the booking-window text arriving)...
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    // ...and the page header settling, which rewrites `--sticky-top` inline and
    // with it the panel's ceiling.
    const panel = el.closest<HTMLElement>(".sticky-panel");
    const mo = panel ? new MutationObserver(schedule) : null;
    if (panel && mo) mo.observe(panel, { attributeFilter: ["style"] });

    function onResize() {
      // A new viewport is a new worst case — measure it from scratch.
      leastRoom.current = Infinity;
      schedule();
    }
    window.addEventListener("resize", onResize);
    return () => {
      ro.disconnect();
      mo?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    // Kept deliberately tight vertically: the card is sticky, so anything past
    // roughly one viewport height gets cut off at the bottom — the total was.
    <div
      ref={cardRef}
      data-fit=""
      className="rc-card rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
    >
      {/* Price. The rating used to sit opposite it, but this card is about one
          thing — what a stay costs and booking it — and the score is already
          told by the page header and the reviews section below. */}
      <p className="text-[22px] font-bold text-ink">
        ${pricing.price}
        <span className="text-[15px] font-normal text-muted"> / {pricing.period}</span>
      </p>

      {/* Only the bad news. The open span used to be spelled out here too, but
          the date fields right below already refuse anything outside it (and
          grey the rest out in the calendar), so the line restated in words what
          the control enforces — a whole line of a card that is pinned to one
          screenful. Being fully booked is the one thing the fields can't say. */}
      {win && windowFull && (
        <p className="mt-3 text-[12.5px] font-medium text-red-600">
          Fully booked through {prettyDate(win.lastDate)}
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
          disabledDates={checkInBlocked}
          onChange={onCheckInChange}
          className="border-r border-line"
        />
        <DateField
          variant="plain"
          label="Check - Out"
          value={checkOut}
          min={datesReady ? addDays(checkIn, 1) : undefined}
          max={win?.maxCheckOut}
          disabledDates={checkOutBlocked}
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

      {/* A stay booked around somebody else's nights: they are leaving and
          coming back, and finding that out at the property would be a nasty
          surprise. The parts ARE the explanation — a paragraph naming which
          nights are taken and what is charged said, at length, what the dates
          underneath it show at a glance. The booking page still spells it out
          in full, which is where a guest reads carefully. */}
      {isSplit && !dateError && split && (
        <div
          className="mt-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2"
          // The long form, for anyone who wants the years and the full dates.
          title={split.segments
            .map(
              (s, i) =>
                `Part ${i + 1}: ${prettyDate(s.checkIn)} → ${prettyDate(s.checkOut)}` +
                ` (${s.nights} night${s.nights === 1 ? "" : "s"})`
            )
            .join("\n")}
        >
          <p className="text-[11px] font-semibold leading-snug text-amber-900">
            Split into {split.segments.length} parts · {nights} night
            {nights === 1 ? "" : "s"}
          </p>
          {/* One wrapped row of short spans rather than a line per part: on a
              stay cut into three or four, a list was several lines of the card's
              height, and the card is pinned to one screenful. Compressed to
              "P1 11–12 Aug (1n)" it says the same in a fraction of the room. */}
          <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10.5px] leading-snug text-amber-900">
            {split.segments.map((s, i) => (
              <span key={s.checkIn} className="whitespace-nowrap">
                <span className="font-semibold">P{i + 1}</span>{" "}
                {shortRange(s.checkIn, s.checkOut)}
                <span className="text-amber-800/75"> ({s.nights}n)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Capacity — stated, not chosen: the whole villa is booked either way,
          so a picker here would only look like it changed the price.
          One line, not two: "the whole villa is yours for the stay" was a
          sentence where a clause would do, and the second line cost the card
          height it doesn't have to spare. Kept as a slim band for the same
          reason — the icon sets the tile's height, so it is a 28px disc with
          thin padding rather than a 36px one inside a roomy box. */}
      <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-page px-3.5 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <Users size={15} strokeWidth={1.8} aria-hidden />
        </span>
        {/* The capacity always reads in full; only the "whole ___" clause gives
            way, since a host may have typed a property type of any length
            ("combinative villa") and the tile's height is fixed by the icon
            beside it either way. */}
        <span className="flex min-w-0 items-baseline gap-1 text-[13px] font-semibold text-ink">
          <span className="whitespace-nowrap">
            Sleeps {guestCount} guest{guestCount === 1 ? "" : "s"}
          </span>
          {noun && (
            <span
              className="min-w-0 truncate font-normal text-muted"
              title={`The whole ${noun} is yours for the stay`}
            >
              · whole {noun}
            </span>
          )}
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
        {isOwner
          ? `This is your ${noun || "property"}`
          : windowFull
            ? "Fully booked"
            : datesTaken
              ? "Reserved"
              : "Reserve"}
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
      {/* Smaller and closer together than the rest of the card on purpose: four
          line items and a total is the longest block here, and it is reference
          detail — the guest reads the total, and checks the rest only if a
          number surprises them. */}
      <div className="rc-breakdown mt-3 space-y-1.5 text-[12.5px] leading-snug">
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

      <div className="rc-total mt-2.5 flex items-center justify-between border-t border-line pt-2.5 text-[15px] font-bold leading-tight text-ink">
        <span>Total</span>
        <span>{money(stay.total)}</span>
      </div>
    </div>
  );
}
