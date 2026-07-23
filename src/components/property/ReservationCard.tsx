"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, ChevronDown } from "lucide-react";
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
  const [guests, setGuests] = useState(pricing.guests);
  const [open, setOpen] = useState(false);
  const guestsRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  // Close the guests dropdown on outside click / Escape — without this it
  // stays open and floats over whatever the user scrolls to next.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!guestsRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // The picker offers exactly what the villa can sleep — a party it can't take
  // shouldn't be selectable here only to be refused at checkout.
  const GUEST_OPTIONS = Array.from(
    { length: Math.max(1, maxGuests) },
    (_, i) => `${i + 1} guest${i === 0 ? "" : "s"}`
  );

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

  const guestCount = parseInt(guests, 10) || 1;
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

      {/* Guests dropdown */}
      <div ref={guestsRef} className="relative mt-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${uid}-guests`}
          className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-2.5 text-left transition-colors hover:border-primary"
        >
          <span>
            <span className="block text-[13px] font-semibold text-ink">Guests</span>
            <span className="block text-[14px] text-body">{guests}</span>
          </span>
          <ChevronDown
            size={20}
            className={`text-ink transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>

        {open && (
          <ul
            id={`${uid}-guests`}
            role="listbox"
            className="animate-fade-in absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg"
          >
            {GUEST_OPTIONS.map((opt) => (
              <li key={opt}>
                <button
                  type="button"
                  role="option"
                  aria-selected={guests === opt}
                  onClick={() => {
                    setGuests(opt);
                    setOpen(false);
                  }}
                  className={`block w-full px-4 py-2.5 text-left text-[14px] hover:bg-page ${
                    guests === opt ? "font-medium text-primary" : "text-body"
                  }`}
                >
                  {opt}
                </button>
              </li>
            ))}
          </ul>
        )}
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
