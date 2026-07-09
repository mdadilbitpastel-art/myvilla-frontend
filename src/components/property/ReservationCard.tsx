"use client";

import { useState } from "react";
import { Star, ChevronDown } from "lucide-react";
import type { Villa } from "@/lib/villa";

export default function ReservationCard({
  pricing,
  rating,
}: {
  pricing: Villa["pricing"];
  rating: number;
}) {
  const [guests, setGuests] = useState(pricing.guests);
  const [open, setOpen] = useState(false);

  const GUEST_OPTIONS = ["1 guest", "2 guests", "3 guests", "4 guests"];

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
          <a href="#" className="text-muted underline underline-offset-2">
            {pricing.ratingReviews} Reviews
          </a>
        </span>
      </div>

      {/* Check-in / Check-out */}
      <div className="mt-5 grid grid-cols-2 overflow-hidden rounded-xl border border-line">
        <DateField label="Check - In" value={pricing.checkIn} className="border-r border-line" />
        <DateField label="Check - Out" value={pricing.checkOut} />
      </div>

      {/* Guests dropdown */}
      <div className="relative mt-3">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left"
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
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-line bg-white shadow-lg">
            {GUEST_OPTIONS.map((opt) => (
              <li key={opt}>
                <button
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
      <button className="mt-4 w-full rounded-xl bg-primary py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-primary-dark">
        Reserve
      </button>

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
  className = "",
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={`px-4 py-3 ${className}`}>
      <p className="text-[13px] font-semibold text-ink">{label}</p>
      <p className="mt-0.5 text-[13px] text-body">{value}</p>
    </div>
  );
}
