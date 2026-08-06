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
 * "11–12 Aug", or "30 Jul – 2 Aug" across a month boundary — one span of dates
 * in as little room as it can be said in.
 *
 * The year is left off deliberately: this is for spans sitting next to the
 * dates the guest just picked, where the year is never in question and repeating
 * it four times costs a line of height. `prettyDate` remains the full form.
 */
export function shortRange(from: string, to: string): string {
  const a = from.split("-").map(Number);
  const b = to.split("-").map(Number);
  if (!a[0] || !b[0]) return `${from} → ${to}`;
  const month = (p: number[]) =>
    new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { month: "short" });
  const sameMonth = a[0] === b[0] && a[1] === b[1];
  return sameMonth
    ? `${a[2]}–${b[2]} ${month(b)}`
    : `${a[2]} ${month(a)} – ${b[2]} ${month(b)}`;
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

/**
 * The moment it is right now on the SERVER's clock, as plain wall-clock time —
 * the stamp it sent, advanced by how long this page has been open. Null when it
 * sent none.
 *
 * Everything about a booking is judged against this rather than the browser's
 * clock (see slideWindow), so anything asking "has that hour gone by?" — the
 * window turning over, a cancellation deadline that has already passed — has to
 * ask it here to get the same answer the server would give.
 */
export function serverWallNow(w: BookingWindow | null, nowMs: number = Date.now()): Date | null {
  if (!w) return null;
  const stamped = parseWallClock(w.serverNow);
  if (!stamped) return null;
  return new Date(stamped.getTime() + Math.max(0, nowMs - w.fetchedAt));
}

/**
 * The date it is right now on the SERVER's clock — the day the guest is living
 * in as far as booking is concerned. "" when the stamp is missing.
 *
 * Not the browser's date: the two can be a whole day apart at the boundary, and
 * everything about the window is judged server-side (see slideWindow).
 */
export function serverDate(w: BookingWindow | null, nowMs: number = Date.now()): string {
  const now = serverWallNow(w, nowMs);
  return now ? iso(now) : "";
}

/** Can a stay start on this date? */
export function isDateOpen(date: string, w: BookingWindow | null): boolean {
  if (!w) return true;
  if (date < w.firstDate || date > w.lastDate) return false;
  return !w.unavailableDates.includes(date);
}

/**
 * The latest check-out for a stay starting on `checkIn`.
 *
 * There is no fixed night cap: a guest may stay for as much of the window as
 * the host opened — two months open means two months bookable. Only the end of
 * the window itself cuts it short (one day past the last open night, since a
 * check-out day is not a night).
 *
 * A night somebody else holds no longer cuts it short — it used to, back when
 * a clash refused the whole range. The stay now splits around it instead (see
 * `splitStay`), so the guest keeps the far side of the booking they're
 * reaching over; what they can't do is END on a date whose previous night is
 * taken, and that is closed on the calendar date by date, not by a cap.
 */
export function maxCheckOutFor(checkIn: string, w: BookingWindow | null): string {
  // Without a window all we know is that a stay is at least one night.
  if (!w) return addDays(checkIn, 1);
  return w.maxCheckOut;
}

/** One unbroken run of a stay: arrive, sleep `nights`, leave. */
export type StaySegment = {
  checkIn: string;
  checkOut: string;
  nights: number;
};

export type SplitStay = {
  /** The runs the guest actually gets, in date order. Empty when none are free. */
  segments: StaySegment[];
  /** Nights slept — and charged. NOT the days between the outer dates. */
  nights: number;
  /** The nights inside the range that belong to somebody else, in date order. */
  skipped: string[];
};

/**
 * Break a chosen range into the runs of nights this villa can actually take.
 *
 * A booking somebody else holds in the middle no longer refuses the whole
 * range: the villa is genuinely free either side of it, so the stay splits —
 * the guest checks out the morning the other booking starts and checks back in
 * the morning it ends, and only the nights they sleep are charged.
 *
 *   want 29 Jul → 2 Aug, 30 & 31 Jul taken
 *     →  29 Jul → 30 Jul  (1 night)
 *        1 Aug  → 2 Aug   (1 night)
 *        30, 31 Jul skipped, and not paid for
 *
 * The mirror of `availability.split_stay` on the server, which is the one that
 * decides for real when the booking is taken.
 */
export function splitStay(
  checkIn: string,
  checkOut: string,
  w: BookingWindow | null
): SplitStay {
  const span = daysBetween(checkIn, checkOut);
  if (!checkIn || !checkOut || span < 1) {
    return { segments: [], nights: 0, skipped: [] };
  }
  // Without a window nothing is known to be taken, so the range stands whole.
  const taken = new Set(w?.unavailableDates ?? []);

  const segments: StaySegment[] = [];
  const skipped: string[] = [];
  let runStart = "";
  const close = (end: string) => {
    if (!runStart) return;
    segments.push({ checkIn: runStart, checkOut: end, nights: daysBetween(runStart, end) });
    runStart = "";
  };
  for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
    if (taken.has(d)) {
      skipped.push(d);
      close(d);
    } else if (!runStart) {
      runStart = d;
    }
  }
  close(checkOut);

  return {
    segments,
    nights: segments.reduce((sum, s) => sum + s.nights, 0),
    skipped,
  };
}

/**
 * Why these dates can't be booked, or "" when they can. The same checks the
 * server runs, so the page can say so before the guest reaches payment —
 * `createBooking` still repeats every one of them.
 *
 * A night somebody else holds inside the range is NOT a problem: it is skipped
 * and the stay splits around it (see `splitStay`). The only date clash left to
 * refuse is a range with no free night in it at all.
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
  if (splitStay(checkIn, checkOut, w).nights < 1) {
    return "Every night in those dates is already taken. Please choose different dates.";
  }
  return "";
}

/**
 * How a split stay reads in one line — "30 Jul 2026 and 31 Jul 2026 are
 * already booked", or "" when nothing was skipped. Long runs are summarised
 * rather than listed out.
 */
export function skippedNightsText(skipped: string[]): string {
  if (!skipped.length) return "";
  if (skipped.length === 1) return `${prettyDate(skipped[0])} is already booked`;
  if (skipped.length === 2) {
    return `${prettyDate(skipped[0])} and ${prettyDate(skipped[1])} are already booked`;
  }
  return `${skipped.length} nights between ${prettyDate(skipped[0])} and ${prettyDate(
    skipped[skipped.length - 1]
  )} are already booked`;
}

/** "14:00" → "2:00 PM". */
export function prettyTime(hhmm: string): string {
  const [h, m] = (hhmm || "").split(":").map(Number);
  if (!Number.isFinite(h)) return hhmm;
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
}
