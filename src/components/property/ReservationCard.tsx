"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Star, ChevronDown } from "lucide-react";
import type { Villa } from "@/lib/villa";
import { useAuth } from "@/lib/auth";

export default function ReservationCard({
  pricing,
  rating,
  villaId,
  ownerId,
}: {
  pricing: Villa["pricing"];
  rating: number;
  /** real villa id — omit for the static demo page (Reserve disabled) */
  villaId?: string;
  /** owner's user id — used to block booking your own villa */
  ownerId?: string;
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

  const GUEST_OPTIONS = ["1 guest", "2 guests", "3 guests", "4 guests"];

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
  const [today, setToday] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");

  useEffect(() => {
    const t = iso(new Date());
    setToday(t);
    setCheckIn(t);
    setCheckOut(addDays(t, 3));
    // Runs once on mount; iso/addDays are pure local helpers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const dateError = !datesReady
    ? ""
    : nights < 1
      ? "Check-out must be after check-in."
      : nights > MAX_NIGHTS
        ? `You can book at most ${MAX_NIGHTS} nights per stay.`
        : "";

  function onReserve() {
    if (!villaId) return; // demo page — nothing to book
    if (!user) {
      openAuth("signin");
      return;
    }
    if (isOwner || dateError) return;
    router.push(
      `/villa/${villaId}/book?guests=${guestCount}&checkIn=${checkIn}&checkOut=${checkOut}`
    );
  }

  return (
    <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      {/* Price + rating */}
      <div className="flex items-center justify-between">
        <p className="text-[22px] font-bold text-ink">
          ${pricing.price}
          <span className="text-[15px] font-normal text-muted"> / {pricing.period}</span>
        </p>
        <span className="flex items-center gap-1.5 text-[14px]">
          <Star size={15} className="fill-primary text-primary" />
          <span className="font-medium text-ink">{rating}</span>
          <a href="#reviews" className="text-muted underline underline-offset-2">
            {pricing.ratingReviews} Reviews
          </a>
        </span>
      </div>

      {/* Check-in / Check-out — user selectable */}
      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-line">
        <DateField
          label="Check - In"
          value={checkIn}
          min={today}
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
        <p role="alert" className="mt-2 text-[12px] text-red-500">
          {dateError}
        </p>
      ) : (
        // `&nbsp;` holds the line's height before the dates resolve, so the
        // card below it doesn't shift down by one line on mount.
        <p className="mt-2 text-[12px] text-muted">
          {datesReady ? `${nights} night${nights === 1 ? "" : "s"}` : " "}
        </p>
      )}

      {/* Guests dropdown */}
      <div ref={guestsRef} className="relative mt-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={`${uid}-guests`}
          className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left transition-colors hover:border-primary"
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
        disabled={isOwner || !!dateError || !datesReady}
        className={`mt-4 w-full rounded-xl py-3.5 text-[15px] font-semibold text-white transition-colors ${
          isOwner || dateError || !datesReady
            ? "cursor-not-allowed bg-muted/60"
            : "bg-primary hover:bg-primary-dark"
        }`}
      >
        {isOwner ? "This is your villa" : "Reserve"}
      </button>
      {isOwner && (
        <p className="mt-2 text-center text-[12px] text-muted">
          You can&apos;t book your own villa.
        </p>
      )}

      {/* Price breakdown */}
      <div className="mt-6 space-y-3 text-[15px]">
        {pricing.breakdown.map((row) => (
          <div key={row.label} className="flex items-center justify-between text-body">
            <span>{row.label}</span>
            <span>${row.value}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-line pt-4 text-[16px] font-bold text-ink">
        <span>Total before taxes</span>
        <span>${pricing.total}</span>
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
    <div className={`px-4 py-3 transition-colors hover:bg-page ${className}`}>
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
