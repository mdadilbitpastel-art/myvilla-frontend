"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { activeBookings, bookingHistory, type Booking } from "@/lib/myBookings";

const COLUMNS = [
  "Name of Villa",
  "Posted",
  "Stay Duration",
  "No. of Guests",
  "Status",
];

function SortDropdown() {
  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-body transition-colors hover:border-primary/40"
    >
      Sort: Latest to Oldest
      <ChevronDown size={14} className="text-muted" />
    </button>
  );
}

function BookingRow({ booking, status }: { booking: Booking; status: "active" | "history" }) {
  return (
    <div className="grid grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr] items-center rounded-lg border border-line px-4 py-3.5 text-[13px]">
      <span className="text-ink">{booking.villa}</span>
      <span className="text-body">{booking.posted}</span>
      <span className="text-body">{booking.stay}</span>
      <span className="text-body">{booking.guests} guests</span>
      <span className="text-right">
        {status === "active" ? (
          <button
            type="button"
            className="text-[13px] font-medium text-red-400 underline underline-offset-2 transition-colors hover:text-red-500"
          >
            Cancel Booking
          </button>
        ) : (
          <span className="text-[13px] font-semibold text-primary">Accepted</span>
        )}
      </span>
    </div>
  );
}

export default function MyBookingsPage() {
  const { user, ready } = useAuth();

  // Guard: only signed-in users can view their bookings.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your bookings.
        </p>
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
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar active="My Bookings" />
        </aside>

        {/* Right — bookings card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {/* Active bookings header */}
          <div className="flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">
              <span className="text-primary">
                {String(activeBookings.length).padStart(2, "0")}
              </span>{" "}
              Active Bookings
            </h2>
            <SortDropdown />
          </div>

          {/* Column headings */}
          <div className="mt-6 grid grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr] px-4 text-[13px] text-muted">
            {COLUMNS.map((c) => (
              <span key={c} className={c === "Status" ? "text-right" : ""}>
                {c}
              </span>
            ))}
          </div>

          {/* Active rows */}
          <div className="mt-2.5 space-y-3">
            {activeBookings.map((b, i) => (
              <BookingRow key={i} booking={b} status="active" />
            ))}
          </div>

          {/* Booking history header */}
          <div className="mt-9 flex items-center justify-between">
            <h2 className="text-[16px] font-bold text-ink">Booking History</h2>
            <SortDropdown />
          </div>

          {/* History rows */}
          <div className="mt-4 space-y-3">
            {bookingHistory.map((b, i) => (
              <BookingRow key={i} booking={b} status="history" />
            ))}
          </div>

          {/* Note */}
          <p className="mt-6 max-w-[720px] text-[11px] leading-5 text-muted">
            Note: Cancelation of booking may result in cancelation charges. Charges
            vary from property to property. They may also depend upon cancelation
            time. Read cancelation policy of hosted place for furthur information.
          </p>
        </div>
      </div>
    </div>
  );
}
