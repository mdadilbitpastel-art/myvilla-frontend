"use client";

import { useState } from "react";
import Link from "next/link";
import {
  LogIn,
  LogOut,
  TicketPercent,
  ChevronUp,
  Mail,
  Phone,
  Star,
  Lock,
  AlertTriangle,
} from "lucide-react";
import Img from "@/components/ui/Img";
import Avatar from "@/components/ui/Avatar";
import StarRating from "@/components/ui/StarRating";
import ReviewForm from "@/components/reviews/ReviewForm";
import type { Booking } from "@/lib/api";
import {
  bookingStatus,
  bookingStatusDetail,
  stayAction,
  checkInGate,
  useServerWallClock,
  fmtDateTime,
  type BookingStatusTone,
} from "@/lib/booking";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

const money = (n: number) => `$${n.toFixed(2)}`;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Soft status pill colours per tone — a filled chip reads as a real-time state.
const PILL_CLASS: Record<BookingStatusTone, string> = {
  green: "bg-green-50 text-green-700",
  blue: "bg-primary/10 text-primary",
  red: "bg-red-50 text-red-600",
  muted: "bg-page text-body",
  orange: "bg-orange-50 text-orange-600",
};

// The same tones as a left-border + tint strip, for the one-line status detail.
const STRIP_CLASS: Record<BookingStatusTone, string> = {
  green: "border-green-500 bg-green-50 text-green-700",
  blue: "border-primary bg-primary/[0.06] text-primary",
  red: "border-red-500 bg-red-50 text-red-600",
  muted: "border-line bg-page text-body",
  orange: "border-orange-500 bg-orange-50 text-orange-700",
};

/**
 * The one stay action a host takes on a booking — check the guest in, then out.
 * Renders nothing once the stay is done/cancelled. Shown in the list row.
 */
export function StayActionButton({
  booking,
  onCheckIn,
  onCheckOut,
  busy,
}: {
  booking: Booking;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  busy: boolean;
}) {
  // The server's clock, ticking — never the browser's. The button opens at an
  // exact hour, and the two clocks can be whole time zones apart.
  const now = useServerWallClock(booking.serverNow);
  const gate = checkInGate(booking, now);
  const action = stayAction(booking);
  if (action !== "check_in" && action !== "check_out") return null;

  const isIn = action === "check_in";

  // Check-out keeps its one look. Check-in escalates: plain green while the
  // guest is roughly on time, amber an hour past their check-in, red with a
  // countdown once check-out is close and the stay is about to be a no-show.
  const tone = !isIn
    ? "bg-primary hover:bg-primary-dark"
    : gate.tone === "urgent"
      ? "bg-[#d92d20] hover:bg-[#b42318]"
      : gate.tone === "late"
        ? "bg-[#e8912a] hover:bg-[#cf7d1c]"
        : "bg-[#2f9e44] hover:bg-[#268c3b]";

  const locked = isIn && !gate.open;
  const label = isIn ? "Check in" : "Check out";

  const button = (
    <button
      type="button"
      disabled={busy || locked}
      aria-busy={busy}
      // The reason is on the wrapper too (below) — a disabled button gets no
      // pointer events, so its own title would never show on hover.
      title={locked ? gate.reason : undefined}
      onClick={() => (isIn ? onCheckIn(booking.id) : onCheckOut(booking.id))}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors disabled:cursor-not-allowed ${
        locked ? "bg-muted/60" : `${tone} disabled:opacity-60`
      }`}
    >
      {busy ? (
        <span className="spinner" aria-hidden />
      ) : locked ? (
        <Lock size={14} aria-hidden />
      ) : isIn && gate.tone !== "ready" ? (
        <AlertTriangle size={15} aria-hidden />
      ) : isIn ? (
        <LogIn size={15} aria-hidden />
      ) : (
        <LogOut size={15} aria-hidden />
      )}
      {label}
      {/* The countdown lives inside the button in the final stretch, so the
          host sees how long is left without reading anything else. */}
      {isIn && !locked && gate.badge && (
        <span className="rounded bg-white/20 px-1.5 py-px text-[11px] font-bold">
          {gate.badge}
        </span>
      )}
    </button>
  );

  if (!locked) return button;

  // Locked: the button can't be hovered itself, so the wrapper carries the
  // explanation — as a native tooltip AND a styled bubble, since a host who
  // can't press the button deserves to be told why without waiting a second.
  return (
    <span className="group relative inline-flex" title={gate.reason}>
      {button}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 z-30 w-max max-w-[240px] rounded-lg bg-ink px-2.5 py-1.5 text-[11.5px] font-medium leading-4 text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100"
      >
        {gate.reason}
      </span>
    </span>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-muted">
        {title}
      </p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px]">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="truncate text-right text-[12.5px] font-medium text-ink">{value}</span>
    </div>
  );
}

// Label on top, value on its own line below — for the longer date-time values
// (a full "12 Feb 2026, 2:00 PM") that would be clipped by the side-by-side Pair.
function StackedPair({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-[3px]">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-[12.5px] font-medium text-ink">{value}</p>
    </div>
  );
}

/**
 * The full, compact detail panel shown inline when a booking row expands. A
 * guest header (bigger avatar, name, email beneath) with a live status pill,
 * then four balanced columns so no space is left vacant.
 */
export default function BookingDetails({
  booking,
  onCollapse,
  onCheckIn,
  onCheckOut,
  working = false,
  onCancel,
  cancelling = false,
  onReview,
  reviewBusy = false,
}: {
  booking: Booking;
  onCollapse?: () => void;
  onCheckIn?: (id: string) => void;
  onCheckOut?: (id: string) => void;
  working?: boolean;
  // Guest side: cancel this booking. Shown as a header action when provided.
  onCancel?: () => void;
  cancelling?: boolean;
  // Guest side: leave/update a review for a completed stay.
  onReview?: (rating: number, comment: string) => void | Promise<void>;
  reviewBusy?: boolean;
}) {
  const [editingReview, setEditingReview] = useState(false);
  // Same ticking server clock the row uses, so the pill here and the label in
  // the collapsed row above can never disagree about how late a guest is.
  const now = useServerWallClock(booking.serverNow);
  const status = bookingStatus(booking, now);
  const place = [booking.villaCity, booking.villaCountry].filter(Boolean).join(", ");
  // The panel is shared: the host sees it with check-in/out handlers, the guest
  // with a cancel handler. That tells us which side is reading, so the status
  // line and the contact column can be phrased/aimed for the right person.
  const role: "owner" | "guest" = onCheckIn || onCheckOut ? "owner" : "guest";
  const detail = bookingStatusDetail(booking, role);
  const cancelled = booking.status === "cancelled";

  // The other party's contact: the host sees the guest, the guest sees the host.
  const contactName = role === "owner" ? booking.guestName : booking.hostName;
  const contactEmail = role === "owner" ? booking.guestEmail : booking.hostEmail;
  const contactPhone = role === "owner" ? booking.guestPhone : booking.hostPhone;
  const contactAvatar = role === "owner" ? booking.guestAvatar : booking.hostAvatar;
  // The guest's own gender isn't exposed to the host, so only the host side
  // gets a gender-based placeholder; the guest column falls back to neutral.
  const contactGender = role === "owner" ? undefined : booking.hostGender;

  return (
    <div className="space-y-4">
      {/* Property header — a bigger villa image, its title & location, and on
          the right the status, the stay action, and the collapse control. Only
          shown here (the collapsed row already carries the compact version), so
          nothing is duplicated between the two states. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="img-frame h-[68px] w-[104px] shrink-0 overflow-hidden rounded-xl bg-page">
            <Img
              src={booking.villaCover}
              alt={booking.villaTitle}
              fallback={PLACEHOLDER_IMG}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <Link
              href={`/villa/${booking.villaId}`}
              className="block truncate text-[17px] font-bold text-ink hover:text-primary"
            >
              {booking.villaTitle}
            </Link>
            {place && <p className="mt-0.5 truncate text-[12.5px] text-muted">{place}</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Real-time status: upcoming / staying now / checked in-out / cancelled */}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold ${PILL_CLASS[status.tone]}`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
            {status.label}
          </span>

          {onCheckIn && onCheckOut && (
            <StayActionButton
              booking={booking}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              busy={working}
            />
          )}

          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={cancelling}
              aria-busy={cancelling}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#e5484d] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#d93d42] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {cancelling ? (
                <>
                  <span className="spinner" aria-hidden /> Cancelling…
                </>
              ) : (
                "Cancel booking"
              )}
            </button>
          )}

          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Hide booking details"
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary bg-primary/5 px-3 py-[5px] text-[12.5px] font-medium text-primary transition-colors hover:bg-primary/10"
            >
              <span className="w-[30px] text-center">Hide</span>
              <ChevronUp size={15} className="shrink-0" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Live status line — "2 hrs late — not checked in yet", "Guest didn't
          arrive", "You're checked in", etc. Phrased for whoever's reading. */}
      {detail && (
        <div
          className={`flex items-start gap-2 rounded-lg border-l-4 px-3.5 py-2.5 text-[13px] font-medium ${STRIP_CLASS[detail.tone]}`}
          role="status"
        >
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
          <span>{detail.text}</span>
        </div>
      )}

      {/* Cancelled: what the late-cancellation fine took, and what's refunded. */}
      {cancelled && (booking.cancellationFee > 0 || booking.refundAmount > 0) && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-page px-3.5 py-2.5 text-[12.5px]">
          <span className="text-muted">
            Cancellation fee:{" "}
            <span className="font-semibold text-red-600">{money(booking.cancellationFee)}</span>
          </span>
          <span className="text-muted">
            Refunded:{" "}
            <span className="font-semibold text-green-600">{money(booking.refundAmount)}</span>
          </span>
        </div>
      )}

      {/* Four columns. Stay and Arrival & departure share their space equally
          (50/50), with Guest and Payment on the outside. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1.2fr_1fr]">
        {/* Contact — the guest (to the host) or the host (to the guest): avatar,
            name, and tappable email + phone, plus the booking reference. */}
        <Group title={role === "owner" ? "Guest" : "Host"}>
          <div className="flex items-center gap-2.5">
            <Avatar src={contactAvatar} name={contactName} gender={contactGender} size={38} />
            <div className="min-w-0 space-y-0.5">
              <p
                className="truncate text-[13.5px] font-semibold text-ink"
                title={contactName}
              >
                {contactName || (role === "owner" ? "Guest" : "Host")}
              </p>
              {contactEmail ? (
                <a
                  href={`mailto:${contactEmail}`}
                  className="flex items-center gap-1 truncate text-[12px] text-muted hover:text-primary"
                >
                  <Mail size={12} className="shrink-0" aria-hidden />
                  <span className="truncate">{contactEmail}</span>
                </a>
              ) : (
                <span className="block text-[12px] text-muted">No contact email</span>
              )}
              {contactPhone && (
                <a
                  href={`tel:${contactPhone}`}
                  className="flex items-center gap-1 truncate text-[12px] text-muted hover:text-primary"
                >
                  <Phone size={12} className="shrink-0" aria-hidden />
                  <span className="truncate">{contactPhone}</span>
                </a>
              )}
            </div>
          </div>
          <div className="pt-2">
            <Pair label="Reference" value={`#${booking.id}`} />
          </div>
        </Group>

        {/* Stay — the scheduled check-in/out moments (the "original" times the
            arrival below is measured against). Falls back to the date alone on
            older payloads that carry no scheduled datetime. */}
        <Group title="Stay">
          <StackedPair label="Check-in" value={fmtDateTime(booking.checkInAt) || fmtDate(booking.checkIn)} />
          <StackedPair label="Check-out" value={fmtDateTime(booking.checkOutAt) || fmtDate(booking.checkOut)} />
          <Pair label="Duration" value={`${booking.nights} night${booking.nights === 1 ? "" : "s"}`} />
          <Pair label="Guests" value={`${booking.guests} guest${booking.guests === 1 ? "" : "s"}`} />
        </Group>

        {/* Arrival & departure */}
        <Group title="Arrival &amp; departure">
          <StackedPair
            label="Checked in"
            value={
              booking.checkedInAt ? (
                <span className="text-green-600">{fmtDateTime(booking.checkedInAt)}</span>
              ) : (
                <span className="text-muted">Not yet</span>
              )
            }
          />
          <StackedPair
            label="Checked out"
            value={
              booking.checkedOutAt ? (
                <span className="text-primary">{fmtDateTime(booking.checkedOutAt)}</span>
              ) : (
                <span className="text-muted">Not yet</span>
              )
            }
          />
          <Pair label="Booked on" value={fmtDate(booking.createdAt)} />
        </Group>

        {/* Payment */}
        <Group title="Payment">
          <Pair label={`${money(booking.pricePerNight)} × ${booking.nights}`} value={money(booking.subtotal)} />
          {booking.discount > 0 && (
            <Pair label="Discount" value={<span className="text-green-600">−{money(booking.discount)}</span>} />
          )}
          <Pair label="Service fee" value={money(booking.serviceFee)} />
          <Pair label="Tax" value={money(booking.tax)} />
          {booking.extraServices?.map((s) => (
            <div key={s.name} className="flex items-baseline justify-between gap-3 py-[3px]">
              <span className="min-w-0 truncate text-[12px] text-muted">
                {s.name}
                <span className="text-muted/70"> ({money(s.price)} × {booking.nights})</span>
              </span>
              <span className="shrink-0 text-[12.5px] font-medium text-ink">
                {money(s.price * booking.nights)}
              </span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t border-line pt-1.5">
            <span className="text-[12.5px] font-bold text-ink">Total paid</span>
            <span className="text-[14px] font-bold text-ink">{money(booking.total)}</span>
          </div>
        </Group>
      </div>

      {/* Review — a guest can rate a stay once it's completed. Always visible
          for a completed booking (never hidden): a form to leave one, or their
          existing review with an Edit control. */}
      {role === "guest" && onReview && (booking.canReview || booking.reviewRating > 0) && (
        <div className="rounded-xl border border-line bg-page/50 p-4">
          {booking.reviewRating > 0 && !editingReview ? (
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Star size={15} className="fill-star text-star" aria-hidden />
                  <span className="text-[13px] font-bold text-ink">Your review</span>
                  <StarRating value={booking.reviewRating} size={14} />
                </div>
                <button
                  type="button"
                  onClick={() => setEditingReview(true)}
                  className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-medium text-body transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Edit
                </button>
              </div>
              {booking.reviewComment && (
                <p className="mt-2 text-[13px] leading-5 text-body">{booking.reviewComment}</p>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-3 text-[13.5px] font-bold text-ink">
                {booking.reviewRating > 0 ? "Edit your review" : "How was your stay?"}
              </p>
              <ReviewForm
                initialRating={booking.reviewRating}
                initialComment={booking.reviewComment}
                busy={reviewBusy}
                submitLabel={booking.reviewRating > 0 ? "Update review" : "Submit review"}
                onCancel={booking.reviewRating > 0 ? () => setEditingReview(false) : undefined}
                onSubmit={async (rating, comment) => {
                  await onReview(rating, comment);
                  setEditingReview(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* The host sees the guest's review here too (read-only) once it's left —
          it shows up in their rent-request history. */}
      {role === "owner" && booking.reviewRating > 0 && (
        <div className="rounded-xl border border-line bg-page/50 p-4">
          <div className="flex items-center gap-2">
            <Star size={15} className="fill-star text-star" aria-hidden />
            <span className="text-[13px] font-bold text-ink">Guest&apos;s review</span>
            <StarRating value={booking.reviewRating} size={14} />
          </div>
          {booking.reviewComment && (
            <p className="mt-2 text-[13px] leading-5 text-body">{booking.reviewComment}</p>
          )}
        </div>
      )}

      {/* Bottom strip — coupon (used or not) on the left, how it was paid on the
          right, so the full width stays used with nothing left vacant. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
        {booking.couponCode ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-[#ff2d2d]/30 bg-[#ff2d2d]/5 px-3 py-1.5 text-[12.5px]">
            <TicketPercent size={14} className="text-[#ff2d2d]" aria-hidden />
            <span className="font-mono font-bold tracking-wide text-ink">{booking.couponCode}</span>
            <span className="font-semibold text-[#ff2d2d]">−{money(booking.discount)}</span>
            <span className="text-muted">coupon applied</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-1.5 text-[12.5px] text-muted">
            <TicketPercent size={14} aria-hidden />
            No coupon used
          </span>
        )}
        <span className="text-[12.5px] text-muted">
          Paid with{" "}
          <span className="font-medium text-ink">{booking.paymentMethod || "Card"}</span>
          {booking.cardLast4 ? ` · ${booking.cardLast4}` : ""}
        </span>
      </div>
    </div>
  );
}
