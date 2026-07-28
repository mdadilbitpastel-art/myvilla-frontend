"use client";

import { useEffect, useMemo, useState } from "react";

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
  // Scheduled wall-clock start/end, for the live "how late is this?" reading.
  checkInAt?: string;
  checkOutAt?: string;
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

/**
 * The status label to show. Pass `nowMs` (the server's ticking wall clock) to
 * get the sharper reading of a stay nobody has checked into yet: how late the
 * guest is, and — once check-out is close — that the window is running out.
 * Without it this is exactly the plain lifecycle label it always was.
 */
export function bookingStatus(b: BookingLike, nowMs?: number): BookingStatus {
  const life = lifecycleOf(b);
  if (life === "awaiting_checkin" && nowMs !== undefined) {
    const gate = checkInGate(b, nowMs);
    if (gate.tone === "urgent") {
      return { label: `Not checked in · ${gate.badge}`, tone: "red" };
    }
    if (gate.tone === "late") {
      const h = gate.hoursLate;
      return { label: `Not checked in · ${h} hr${h === 1 ? "" : "s"} late`, tone: "orange" };
    }
  }
  return STATUS_BY_LIFECYCLE[life];
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

/* ------------------------------------------------------------------ */
/* When the host may check a guest in                                  */
/* ------------------------------------------------------------------ */

/** Past this many hours without a check-in, the button starts warning. */
const LATE_AFTER_HOURS = 1;
/** Inside this many hours of check-out, it goes urgent and counts down. */
const URGENT_WITHIN_HOURS = 8;

/**
 * `check_in_at` / `check_out_at` / `server_now` all arrive as NAIVE wall-clock
 * ISO strings — deliberately, so they compare to each other directly and none
 * of them is shifted into the viewer's time zone. Parsed as local components
 * purely to get comparable numbers; the value is only ever used in differences.
 */
function parseWall(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || "");
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  return new Date(y, mo - 1, d, h, mi, s || 0).getTime();
}

/** "27 Jul 2026 at 2:00 PM" — how the gate names the hour it opens. */
function fmtWall(value: string): string {
  const t = parseWall(value);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const date = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} at ${time}`;
}

export type CheckInTone = "ready" | "late" | "urgent";

export type CheckInGate = {
  /** May the host press Check in right now? */
  open: boolean;
  /** Why not — shown on hover while the button is disabled. "" when open. */
  reason: string;
  /** How the button should look once it IS open. */
  tone: CheckInTone;
  /** Whole hours past the booking's check-in time (0 when not late yet). */
  hoursLate: number;
  /** Whole hours left before check-out (only meaningful when urgent). */
  hoursToCheckOut: number;
  /** Short countdown shown inside the button when urgent, e.g. "6h left". */
  badge: string;
};

/**
 * Whether — and how loudly — the host can check this guest in, at `nowMs` on
 * the server's wall clock (see `useServerWallClock`).
 *
 * The hour comes from the BOOKING, not the villa: `check_in_at` is built from
 * the check-in time snapshotted when the guest booked, so a host who re-times
 * the property afterwards doesn't move an existing guest's arrival.
 *
 * Three stages once it opens: plain while the guest is roughly on time, a
 * warning an hour past it, and an urgent countdown in the last stretch before
 * check-out — the point after which the stay becomes a no-show.
 */
export function checkInGate(
  b: { checkInAt?: string; checkOutAt?: string },
  nowMs: number
): CheckInGate {
  const opensAt = parseWall(b.checkInAt || "");
  const endsAt = parseWall(b.checkOutAt || "");
  const base: CheckInGate = {
    open: true,
    reason: "",
    tone: "ready",
    hoursLate: 0,
    hoursToCheckOut: 0,
    badge: "",
  };
  // No clock yet (first paint, before the list lands) or no scheduled time —
  // leave the button alone rather than guessing; the server refuses an early
  // check-in regardless.
  if (Number.isNaN(nowMs) || Number.isNaN(opensAt)) return base;

  if (nowMs < opensAt) {
    return {
      ...base,
      open: false,
      reason: `Check-in opens ${fmtWall(b.checkInAt || "")} — the time this guest booked.`,
    };
  }

  const hoursLate = Math.floor((nowMs - opensAt) / 3_600_000);
  const hoursToCheckOut = Number.isNaN(endsAt)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.ceil((endsAt - nowMs) / 3_600_000));

  if (hoursToCheckOut <= URGENT_WITHIN_HOURS) {
    return {
      ...base,
      tone: "urgent",
      hoursLate,
      hoursToCheckOut,
      badge: hoursToCheckOut <= 0 ? "last chance" : `${hoursToCheckOut}h left`,
    };
  }
  if (hoursLate >= LATE_AFTER_HOURS) {
    return { ...base, tone: "late", hoursLate, hoursToCheckOut };
  }
  return { ...base, hoursToCheckOut };
}

/**
 * The server's wall clock, ticking. Takes the stamp that came with the data and
 * advances it by real elapsed time, so the button opens on the hour the SERVER
 * keeps rather than the browser's — the two can be whole time zones apart.
 * Re-bases whenever fresh data arrives. NaN until the first stamp lands.
 */
export function useServerWallClock(serverNow: string, tickMs = 30_000): number {
  const base = useMemo(
    () => ({ wall: parseWall(serverNow), at: Date.now() }),
    [serverNow]
  );
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);
  if (Number.isNaN(base.wall)) return NaN;
  return base.wall + (Date.now() - base.at);
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
