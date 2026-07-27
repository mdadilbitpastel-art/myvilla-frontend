/**
 * A booking's real, relevant status. The authority is the server's live
 * `lifecycleStatus` (computed from the villa's check-in/out times, the clock,
 * and the host's arrival/departure stamps); the date fields are only a
 * fallback for a payload that predates it. Shared by the guest's "My Bookings"
 * and the host's "Rent Requests" so both describe the same reservation the
 * same way.
 */

export type BookingStatusTone = "green" | "blue" | "red" | "muted" | "orange";

export type BookingStatus = { label: string; tone: BookingStatusTone };

// The lifecycle values the backend sends (Booking.LIFECYCLE_*).
export type Lifecycle =
  | "upcoming"
  | "awaiting_checkin"
  | "staying"
  | "completed"
  | "no_show"
  | "cancelled";

type BookingLike = {
  status: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  checkedInAt?: string;
  checkedOutAt?: string;
  // Present on live payloads; when absent we fall back to the dates below.
  lifecycleStatus?: string;
  hoursLate?: number;
};

/**
 * The lifecycle to trust: the server's value when present, otherwise derived
 * locally from the dates/stamps the same way the old status pill used to.
 */
export function lifecycleOf(b: BookingLike): Lifecycle {
  if (b.lifecycleStatus) return b.lifecycleStatus as Lifecycle;

  if (b.status === "cancelled") return "cancelled";
  if (b.checkedOutAt) return "completed";
  if (b.checkedInAt) return "staying";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ci = new Date(b.checkIn + "T00:00:00");
  const co = new Date(b.checkOut + "T00:00:00");
  if (co < today) return "no_show";
  if (ci <= today) return "awaiting_checkin";
  return "upcoming";
}

const STATUS_BY_LIFECYCLE: Record<Lifecycle, BookingStatus> = {
  cancelled: { label: "Cancelled", tone: "red" },
  completed: { label: "Checked out", tone: "muted" },
  staying: { label: "Staying", tone: "blue" },
  no_show: { label: "No-show", tone: "red" },
  awaiting_checkin: { label: "Awaiting check-in", tone: "orange" },
  upcoming: { label: "Booked", tone: "green" },
};

export function bookingStatus(b: BookingLike): BookingStatus {
  return STATUS_BY_LIFECYCLE[lifecycleOf(b)];
}

/**
 * A one-line description of where the stay is, phrased for whoever's reading:
 * the host sees "guest not checked in yet", the guest sees "the host hasn't
 * checked you in". Drives the status strip in the detail panel and the
 * check-in-reminder popup. Returns null when nothing needs saying.
 */
export function bookingStatusDetail(
  b: BookingLike & { checkedInAt?: string; checkedOutAt?: string },
  role: "owner" | "guest"
): { text: string; tone: BookingStatusTone } | null {
  const life = lifecycleOf(b);
  const hrs = Math.floor(b.hoursLate ?? 0);
  const late = hrs >= 1 ? `${hrs} hr${hrs === 1 ? "" : "s"} late` : "Check-in time has passed";

  switch (life) {
    case "awaiting_checkin":
      return {
        tone: "orange",
        text:
          role === "owner"
            ? `${late} — guest not checked in yet.`
            : `${late} — the host hasn't checked you in yet.`,
      };
    case "no_show":
      return {
        tone: "red",
        text:
          role === "owner"
            ? "Guest didn't arrive — the check-out time passed with no check-in."
            : "Marked as a no-show — the stay's check-out time passed without a check-in.",
      };
    case "staying":
      return {
        tone: "blue",
        text:
          role === "owner"
            ? `Guest is staying${b.checkedInAt ? ` — checked in ${fmtDateTime(b.checkedInAt)}` : ""}.`
            : "You're checked in — enjoy your stay.",
      };
    case "completed":
      return {
        tone: "muted",
        text: b.checkedOutAt
          ? `Stay complete — checked out ${fmtDateTime(b.checkedOutAt)}.`
          : "Stay complete.",
      };
    default:
      return null;
  }
}

export const STATUS_TONE_CLASS: Record<BookingStatusTone, string> = {
  green: "text-green-600",
  blue: "text-primary",
  red: "text-red-400",
  muted: "text-body",
  orange: "text-orange-500",
};

/**
 * The single stay action available to the HOST on a booking, as a small state
 * machine: check the guest in → then out → then it's done. A cancelled booking
 * has no action. Drives the one button shown in the list and the detail popup.
 */
export type StayAction = "check_in" | "check_out" | "done" | null;

export function stayAction(b: {
  status: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}): StayAction {
  if (b.status === "cancelled") return null;
  if (b.checkedOutAt) return "done";
  if (b.checkedInAt) return "check_out";
  return "check_in";
}

/** "12 Feb 2026, 3:40 PM" from an ISO timestamp, or "" when unset. */
export function fmtDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
