/**
 * The dates a guest may pick — the client half of the one rule the server
 * enforces in `properties/availability.py`.
 *
 * A villa is open for exactly `availabilityDays` consecutive dates, starting at
 * the first date a guest could still arrive:
 *
 *   5 days, 27 Jul, check-in 2 PM, now 11 AM  →  27, 28, 29, 30, 31 Jul
 *   the same villa at 3 PM (2 PM has gone by) →  28, 29, 30, 31 Jul, 1 Aug
 *
 * Everything outside that span is disabled on the calendar, as is every date
 * inside it that is already booked or closed by the host. The server re-derives
 * all of it when the booking is actually taken, so this is only ever the guest's
 * side of the same answer — never the authority.
 */

/** Local YYYY-MM-DD. Never toISOString(): it shifts the day across the UTC line. */
export function iso(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** "2026-07-27" + n days, as another "YYYY-MM-DD". */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y) return date;
  return iso(new Date(y, m - 1, d + n));
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00").getTime();
  const b = new Date(to + "T00:00:00").getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/** "27 Jul 2026" — how every window message names a date. */
export function prettyDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  if (!y) return date;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * The first date a guest can still check in: today while the villa's check-in
 * time is ahead of us, tomorrow once it has passed. A villa with no stated time
 * uses the standard 2 PM, the same default the backend applies.
 */
export function firstBookableDate(checkInTime: string, now: Date = new Date()): string {
  const [h, m] = (checkInTime || "14:00").split(":").map(Number);
  const cutoff = (Number.isFinite(h) ? h : 14) * 60 + (Number.isFinite(m) ? m : 0);
  const today = iso(now);
  return now.getHours() * 60 + now.getMinutes() >= cutoff ? addDays(today, 1) : today;
}

export type BookingWindow = {
  villaId: string;
  availabilityDays: number;
  /** "HH:MM" — the hour that decides whether today is still in the window. */
  checkInTime: string;
  /** The server's own wall clock, "YYYY-MM-DDTHH:MM", when it answered. */
  serverNow: string;
  /** Earliest check-in date, inclusive. */
  firstDate: string;
  /** Latest check-in date — also the last open night, inclusive. */
  lastDate: string;
  /** Exclusive: the latest check-out a stay may have (lastDate + 1 day). */
  maxCheckOut: string;
  /** Dates inside the span that are already booked or closed by the host. */
  unavailableDates: string[];
  /** `Date.now()` when this was received — how the server clock is advanced. */
  fetchedAt: number;
};

/** "YYYY-MM-DDTHH:MM" read as plain wall-clock time, with no zone attached. */
function parseWallClock(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value || "");
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  return new Date(y, mo - 1, d, h, mi);
}

/**
 * The window as it stands now, by the SERVER's clock.
 *
 * The window turns over at the check-in time, and the server is the one that
 * decides when — it may sit in a different time zone from the guest (this
 * deployment runs in UTC). Reading the browser's own clock made the calendar
 * roll over a whole day before `createBooking` agreed, which is how a check-out
 * the calendar had just offered came back "Open for booking until <the day
 * before>". So the server's wall clock is carried in and simply advanced by how
 * long this page has been open. The taken dates always come from the server;
 * only the span moves.
 */
export function slideWindow(w: BookingWindow, nowMs: number = Date.now()): BookingWindow {
  const stamped = parseWallClock(w.serverNow);
  if (!stamped) return w;
  const serverNow = new Date(stamped.getTime() + Math.max(0, nowMs - w.fetchedAt));
  const firstDate = firstBookableDate(w.checkInTime, serverNow);
  if (firstDate === w.firstDate) return w;
  const lastDate = addDays(firstDate, Math.max(1, w.availabilityDays) - 1);
  return { ...w, firstDate, lastDate, maxCheckOut: addDays(lastDate, 1) };
}

/** Can a stay start on this date? */
export function isDateOpen(date: string, w: BookingWindow | null): boolean {
  if (!w) return true;
  if (date < w.firstDate || date > w.lastDate) return false;
  return !w.unavailableDates.includes(date);
}

/**
 * The first taken date on or after `from` — where a stay starting at `from` has
 * to end, since a booking can't run through a night somebody else holds.
 * Returns "" when the rest of the window is clear.
 */
export function nextTakenDate(from: string, w: BookingWindow | null): string {
  if (!w) return "";
  for (const d of [...w.unavailableDates].sort()) {
    if (d >= from) return d;
  }
  return "";
}

/**
 * The latest check-out for a stay starting on `checkIn`.
 *
 * There is no fixed night cap: a guest may stay for as much of the window as
 * the host opened — two months open means two months bookable. Only two things
 * cut it short: the end of the window itself (one day past the last open
 * night, since a check-out day is not a night), and the next night somebody
 * else already holds.
 */
export function maxCheckOutFor(checkIn: string, w: BookingWindow | null): string {
  // Without a window all we know is that a stay is at least one night.
  if (!w) return addDays(checkIn, 1);
  const blocked = nextTakenDate(addDays(checkIn, 1), w);
  const limits = [w.maxCheckOut, ...(blocked ? [blocked] : [])];
  return limits.reduce((a, b) => (b < a ? b : a));
}

/**
 * Why these dates can't be booked, or "" when they can. The same checks the
 * server runs, so the page can say so before the guest reaches payment —
 * `createBooking` still repeats every one of them.
 */
export function stayProblem(
  checkIn: string,
  checkOut: string,
  w: BookingWindow | null
): string {
  if (!w || !checkIn || !checkOut) return "";
  if (checkIn < w.firstDate) {
    const time = w.checkInTime || "14:00";
    // Judged against the server's date, not the browser's — see slideWindow.
    const serverToday = parseWallClock(w.serverNow);
    const today = serverToday ? iso(serverToday) : w.firstDate;
    return checkIn < today
      ? "Those dates have passed. Please choose new ones."
      : `Check-in for ${prettyDate(checkIn)} closed at ${prettyTime(time)}. Please choose a later date.`;
  }
  if (checkIn > w.lastDate) {
    return `This villa is only open for bookings up to ${prettyDate(w.lastDate)}.`;
  }
  if (checkOut > w.maxCheckOut) {
    return `This villa is only open for bookings up to ${prettyDate(w.lastDate)}. Please shorten your stay.`;
  }
  // Every night of the stay must be free — the check-out day is not a night.
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    if (w.unavailableDates.includes(d)) {
      return `${prettyDate(d)} is no longer available. Please choose different dates.`;
    }
  }
  return "";
}

/** "14:00" → "2:00 PM". */
export function prettyTime(hhmm: string): string {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}
