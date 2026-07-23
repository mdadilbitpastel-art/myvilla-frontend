"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, Users } from "lucide-react";
import type { Villa } from "@/lib/villa";
import { fetchVilla } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { computeStayPricing, money, TAX_RATE } from "@/lib/pricing";

export default function ReservationCard({
  pricing,
  rating,
  villaId,
  ownerId,
  maxGuests = 4,
  checkInTime = "",
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
}) {
  const router = useRouter();
  const { user, openAuth } = useAuth();

  // A booking takes the whole villa, so the party size changes nothing about
  // the price — there is nothing here for a guest to choose. The capacity is
  // stated instead, and the booking is made for it.
  const guestCount = Math.max(1, maxGuests);

  // Max nights per stay — must match the backend (MAX_BOOKING_NIGHTS).
  const MAX_NIGHTS = 5;
  const iso = (d: Date) => {
    const p = (x: number) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const addDays = (base: string, n: number) => {
    const d = new Date(base + "T00:00:00");
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  // "Today" must not be read during render: the server resolves it in UTC and
  // the browser in local time, so the two disagree across the date boundary and
  // React throws a hydration mismatch (dates and total price visibly flip).
  // Resolve it after mount instead, exactly like the hero search widget does.
  const [earliest, setEarliest] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  useEffect(() => {
    const now = new Date();
    // Today only counts while the villa's check-in time is still ahead of us —
    // once it has passed, tonight can no longer be taken, so the calendar opens
    // on tomorrow instead. A villa with no stated time keeps today open.
    const [h, m] = checkInTime.split(":");
    const cutoff = checkInTime
      ? Number(h) * 60 + Number(m)
      : Number.POSITIVE_INFINITY;
    const past = now.getHours() * 60 + now.getMinutes() >= cutoff;
    const first = past ? addDays(iso(now), 1) : iso(now);
    setEarliest(first);
    setCheckIn(first);
    // One night by default — the shortest valid stay. Anything longer is the
    // user's choice to make, not a total we quote them before they ask.
    setCheckOut(addDays(first, 1));
    // iso/addDays are pure local helpers, so only the villa's time matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkInTime]);

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
  // Keep check-out valid & within the max-stay window whenever check-in moves.
  function onCheckInChange(next: string) {
    setCheckIn(next);
    if (checkOut <= next) setCheckOut(addDays(next, 1));
    else if (checkOut > addDays(next, MAX_NIGHTS)) setCheckOut(addDays(next, MAX_NIGHTS));
  }
  // Everything below the Reserve button is derived from the chosen dates.
  const stay = computeStayPricing(pricing.price, nights);
  const dateError = !datesReady
    ? ""
    : nights < 1
      ? "Check-out must be after check-in."
      : nights > MAX_NIGHTS
        ? `You can book at most ${MAX_NIGHTS} nights per stay.`
        : "";

  // Availability for the dates on screen, asked of the backend so it's the same
  // answer checkout will give. Debounced: the dates move as the user picks.
  const [taken, setTaken] = useState("");
  useEffect(() => {
    if (!villaId || !datesReady || dateError) {
      setTaken("");
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      fetchVilla(villaId, { checkIn, checkOut, guests: guestCount })
        .then((v) => {
          if (!active || !v) return;
          setTaken(v.isAvailable ? "" : v.unavailableReason || "Not available");
        })
        // A failed check must not block booking: the server re-checks anyway.
        .catch(() => active && setTaken(""));
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [villaId, checkIn, checkOut, guestCount, datesReady, dateError]);

  const blocked = isOwner || !!dateError || !datesReady || !!taken;

  function onReserve() {
    if (!villaId) return; // demo page — nothing to book
    if (!user) {
      openAuth("signin");
      return;
    }
    if (blocked) return;
    router.push(
      `/villa/${villaId}/book?guests=${guestCount}&checkIn=${checkIn}&checkOut=${checkOut}`
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

      {/* Check-in / Check-out — user selectable */}
      <div className="mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-line">
        <DateField
          label="Check - In"
          value={checkIn}
          min={earliest}
          onChange={onCheckInChange}
          className="border-r border-line"
        />
        <DateField
          label="Check - Out"
          value={checkOut}
          min={datesReady ? addDays(checkIn, 1) : undefined}
          max={datesReady ? addDays(checkIn, MAX_NIGHTS) : undefined}
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
        {isOwner ? "This is your villa" : taken ? "Not available" : "Reserve"}
      </button>
      {isOwner ? (
        <p className="mt-2 text-center text-[12px] text-muted">
          You can&apos;t book your own villa.
        </p>
      ) : (
        taken && (
          <p role="status" className="mt-2 text-center text-[12px] font-medium text-red-600">
            {taken}. Try different dates.
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

function DateField({
  label,
  value,
  onChange,
  min,
  max,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`px-4 py-2.5 transition-colors hover:bg-page ${className}`}>
      <label htmlFor={id} className="block cursor-pointer text-[13px] font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full cursor-pointer bg-transparent text-[13px] text-body outline-none"
      />
    </div>
  );
}
