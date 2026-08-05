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

export type BookingStatus = {
  label: string;
  tone: BookingStatusTone;
  /**
   * The status is waiting on somebody to DO something — right now that is only
   * the open check-in window: the guest is due, the door is open, and nobody
   * has been checked in yet. Drawn with a slow breath (`animate-soft-pulse`) so
   * it reads as live rather than as one more settled label in the column.
   *
   * It stops the instant the check-in lands. "Staying" is the same green in the
   * same place — the movement is the only thing that goes, which is exactly
   * what makes it mean something while it is there.
   */
  pending?: boolean;
};

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
  // When the check-in window shuts, and the host's decision to reopen it.
  graceEndsAt?: string;
  lateCheckInAllowed?: boolean;
  // The server's own reading of the check-in button, at the moment the payload
  // was built. `checkInGate` re-derives it live from the clock instead of
  // trusting it forever, but falls back to it when the times are missing.
  buttonState?: string;
  checkinMessage?: string;
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
  // (A payload old enough to lack `lifecycleStatus` also predates the check-in
  // window, so the day-level reading above is the best it can support.)
}

const STATUS_BY_LIFECYCLE: Record<Lifecycle, BookingStatus> = {
  cancelled: { label: "Cancelled", tone: "red" },
  completed: { label: "Checked out", tone: "muted" },
  // "Staying", not "Checked in": one names where the guest IS, the other names
  // a thing that happened to them once, at the door, hours or days ago. The
  // list is read to find out what is going on right now, and green is the
  // colour of a booking that is going right — the same green as the check-in
  // window standing open, which is the state immediately before this one.
  staying: { label: "Staying", tone: "green" },
  no_show: { label: "No show", tone: "red" },
  // "awaiting_checkin" is the check-in WINDOW: from the check-in time until the
  // grace period runs out. It's a good state, not a late one — being late is
  // what the sharper reading in `bookingStatus` below says.
  awaiting_checkin: { label: "Check-in window open", tone: "green", pending: true },
  upcoming: { label: "Confirmed", tone: "green" },
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
    // The window's closing stretch: say how long is left, not just that it's
    // open — after this the booking becomes a no-show on its own.
    // Still the open window, said more sharply — so it keeps breathing. Going
    // still here would read as "settled" at the one moment it is least settled.
    if (gate.tone === "yellow") {
      return {
        label: `Check-in closes in ${gate.minutesLeft}m`,
        tone: "orange",
        pending: true,
      };
    }
  }
  if (life === "no_show" && b.lateCheckInAllowed) {
    return { label: "No show · late check-in allowed", tone: "orange" };
  }
  return STATUS_BY_LIFECYCLE[life];
}

/*
 * There used to be a `bookingStatusDetail` here: a sentence per lifecycle
 * state, drawn as a coloured strip across the top of the booking panel. It has
 * gone, and nothing replaced it. Every one of those sentences either restated
 * the status pill an inch above it ("You're checked in") or gave instructions
 * for something that wasn't happening yet ("when you leave, show the host the
 * check-out PIN"). What actually needs saying is now said where the thing is
 * done: the departure warning rides on the check-out PIN card, what cancelling
 * costs is in the cancel dialog, and an early departure is recorded on the part
 * of the stay it happened in.
 */

export const STATUS_TONE_CLASS: Record<BookingStatusTone, string> = {
  green: "text-green-600",
  // No lifecycle uses `blue` any more — a stay under way is green, like the
  // window opening that precedes it. Kept as ink rather than the brand purple,
  // which read as a link in a column of plain labels.
  blue: "text-ink",
  red: "text-red-400",
  muted: "text-body",
  orange: "text-orange-500",
};

/* ------------------------------------------------------------------ */
/* How long until a confirmed stay starts                              */
/* ------------------------------------------------------------------ */

export type CheckInCountdown = {
  /** "in 12 days" / "tomorrow" / "today" — the WHEN on its own, lower case,
   *  because it is always read after the word "Check-in": the two are drawn as
   *  a quiet noun and a loud answer, and a phrase baked into one string here
   *  couldn't be. Not "arriving": that is how the HOST talks about a guest,
   *  and the guest reading their own booking is not arriving at themselves. */
  when: string;
  /** Today or tomorrow — near enough that the guest should act on it. */
  imminent: boolean;
  /** Whole days until the stay begins (0 = today). */
  days: number;
};

/** Midnight at the start of the day `ms` falls in. */
function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * How long a confirmed booking has left before it starts. Null for anything not
 * still waiting to begin — a stay under way, finished, cancelled or missed —
 * so a caller can render whatever it gets back without asking twice.
 *
 * Counted in whole days on the SERVER's wall clock (pass `useServerWallClock`),
 * never the browser's: a guest in IST reading a booking the server timed in UTC
 * is five and a half hours out, which is a whole day's difference either side
 * of midnight — and "1 day left" being wrong is exactly the kind of wrong a
 * guest plans a flight around.
 */
export function checkInCountdown(b: BookingLike, nowMs: number): CheckInCountdown | null {
  if (Number.isNaN(nowMs) || lifecycleOf(b) !== "upcoming") return null;

  // The scheduled arrival hour when the payload carries it, the check-in date
  // at midnight otherwise. Either way it is read at day granularity, so the
  // two agree — the hour only ever decides which day it lands on.
  const wall = parseWall(b.checkInAt || "");
  const startsAt = Number.isNaN(wall) ? new Date(b.checkIn + "T00:00:00").getTime() : wall;
  if (Number.isNaN(startsAt)) return null;

  const days = Math.round((dayStart(startsAt) - dayStart(nowMs)) / 86_400_000);
  // Already here or behind us: the lifecycle says the stay hasn't started, so
  // there is nothing useful to count and nothing worth guessing at.
  if (days < 0) return null;
  if (days === 0) return { when: "today", imminent: true, days };
  if (days === 1) return { when: "tomorrow", imminent: true, days };
  return { when: `in ${days} days`, imminent: false, days };
}

/**
 * The moment this stay is due to start, as a comparable number: the scheduled
 * check-in hour when the payload carries it, the check-in date at midnight
 * otherwise. On the SERVER's wall clock, like everything else here — so a list
 * ordered by it is ordered the same way for a host in IST and one in UTC.
 *
 * Infinity for a booking with neither, so sorting by it parks the unreadable
 * rows at the end rather than at the top where the next arrival belongs.
 */
export function stayStartMs(b: { checkInAt?: string; checkIn?: string }): number {
  const wall = parseWall(b.checkInAt || "");
  if (!Number.isNaN(wall)) return wall;
  const day = new Date(`${b.checkIn || ""}T00:00:00`).getTime();
  return Number.isNaN(day) ? Infinity : day;
}

/**
 * When this booking next needs somebody to DO something, as a comparable
 * number on the server's wall clock.
 *
 * Not the same question as "when does the stay start". A stay already under way
 * started days ago, but what is outstanding on it is the CHECK-OUT; a split
 * stay whose first part is behind us is waiting on the arrival for its next
 * part, not on the date the booking brackets. Sorting a list by the stay's
 * start therefore put a booking whose next job is two days away above one whose
 * guest arrives today — the row said "in 2 days" and sat on top of "today".
 *
 * So: the soonest hour, across the parts still live, at which either the guest
 * must arrive or the guest must leave. A part whose hour has already come and
 * gone unanswered lands in the past, which is exactly where it belongs — that
 * is the most urgent row on the page, not the least.
 *
 * Infinity when nothing is outstanding (every part done, missed or cancelled),
 * so those park at the end rather than at the top.
 */
export function nextActionAt(
  b: BookingLike & { nights?: number; segments?: SegmentLike[]; earlyCheckOut?: boolean },
  nowMs: number
): number {
  let soonest = Infinity;
  let outstanding = false;
  for (const p of stayProgress(b, nowMs).parts) {
    if (p.status === "completed" || p.status === "missed" || p.status === "cancelled") {
      continue;
    }
    outstanding = true;
    // A part being lived in is waiting on its check-out; every other live part
    // is waiting on its arrival.
    const at = parseWall(p.status === "current" ? p.checkOutAt : p.checkInAt);
    if (!Number.isNaN(at) && at < soonest) soonest = at;
  }
  if (!outstanding) return Infinity;
  // Something IS outstanding but carries no readable hour (an old payload):
  // fall back to the stay's own start, the best this booking can answer with.
  return soonest === Infinity ? stayStartMs(b) : soonest;
}

/* ------------------------------------------------------------------ */
/* How much of a stay under way is left                                */
/* ------------------------------------------------------------------ */

export type StayRemaining = {
  /** "in 3d 4h" / "in 5h 12m" / "in 12m 34s" / "due now" — coarse while the
   *  answer is "days", down to the second once it is "now". A guest reading
   *  this on the last morning is deciding when to pack, not admiring a clock.
   *
   *  The WHEN on its own, like `CheckInCountdown.when`, and for the same
   *  reason: it is always drawn after the word "Check-out", the two weighted
   *  differently. The pair reads "Check-out in 3d 4h" — the mirror of
   *  "Check-in in 4 days" at the other end of the stay. */
  when: string;
  /** Milliseconds to the departure hour. Negative once it has passed. */
  ms: number;
  /** Under six hours: close enough that leaving is today's problem. */
  urgent: boolean;
  /** The hour has passed and nobody has checked the guest out yet. */
  overdue: boolean;
  /** The hour being counted to, as the naive wall-clock string it came from —
   *  the CURRENT part's on a split stay, which is not the booking's own. */
  endsAtWall: string;
};

/**
 * How long the guest has left in the property, on the SERVER's wall clock.
 * Null for anything that isn't a stay actually under way — nothing to count
 * before they arrive or after they've gone.
 *
 * Counted to the CURRENT PART's check-out hour on a split stay, not the
 * booking's last date: a guest who has to vacate on Thursday and comes back on
 * Saturday is owed the Thursday, and counting to the far end of the booking
 * would tell them they have five days left in a room they lose in two.
 */
export function stayRemaining(
  b: BookingLike & { segments?: SegmentLike[] },
  nowMs: number
): StayRemaining | null {
  if (Number.isNaN(nowMs) || lifecycleOf(b) !== "staying") return null;

  // The part they are in: checked into, not yet checked out of. Found by the
  // recorded stamps alone — no clock comparison — so this picks the same part
  // the host's Check out button is aimed at.
  const part = (b.segments || []).find((s) => s.checkedInAt && !s.checkedOutAt);
  const endsAtWall = part?.checkOutAt || b.checkOutAt || "";
  const endsAt = parseWall(endsAtWall);
  if (Number.isNaN(endsAt)) return null;

  const ms = endsAt - nowMs;
  const secs = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(secs / 86_400);
  const h = Math.floor((secs % 86_400) / 3_600);
  const m = Math.floor((secs % 3_600) / 60);
  const s = secs % 60;

  return {
    ms,
    endsAtWall,
    urgent: ms <= 6 * 3_600_000,
    overdue: ms <= 0,
    when:
      ms <= 0
        ? "due now"
        : d > 0
          ? `in ${d}d ${h}h`
          : h > 0
            ? `in ${h}h ${m}m`
            : `in ${m}m ${s}s`,
  };
}

/* ------------------------------------------------------------------ */
/* The overrun: a stay that closes itself                              */
/* ------------------------------------------------------------------ */

export type ForcedCheckOut = {
  /** "29:41" — minutes and seconds, because that is the whole range it ever
   *  covers and a half hour counted in "0h 29m" reads as an estimate. */
  when: string;
  /** Seconds until the stay closes itself. 0 the moment it is due. */
  secondsLeft: number;
  /** The countdown has run out; the next read of this booking closes it. */
  due: boolean;
};

/**
 * The half hour between the hour a guest had to be out and the moment the
 * platform closes the stay on its own. Null whenever nothing is overrunning —
 * so a caller can render whatever it gets back without asking twice.
 *
 * Counted off the SERVER's wall clock like every other hour in this file, and
 * re-based on `autoCheckOutSecondsLeft` whenever a poll lands: the server is
 * the only clock that decides when this actually fires, and a browser ticking
 * alone would drift away from it over half an hour.
 */
export function forcedCheckOut(
  b: {
    checkoutOverdue?: boolean;
    autoCheckOutAt?: string;
    autoCheckOutSecondsLeft?: number;
  },
  nowMs: number
): ForcedCheckOut | null {
  if (!b.checkoutOverdue) return null;

  const dueAt = parseWall(b.autoCheckOutAt || "");
  const secondsLeft = Number.isNaN(dueAt) || Number.isNaN(nowMs)
    ? Math.max(0, b.autoCheckOutSecondsLeft ?? 0)
    : Math.max(0, Math.ceil((dueAt - nowMs) / 1000));

  const m = Math.floor(secondsLeft / 60);
  const s = secondsLeft % 60;
  return {
    secondsLeft,
    due: secondsLeft <= 0,
    when: `${m}:${String(s).padStart(2, "0")}`,
  };
}

/**
 * Does closing this stay still need the guest's 4-digit PIN?
 *
 * Only until the hour they booked to stay until. The code exists to stop a host
 * putting a guest out EARLY; past that hour there is nothing left for it to
 * protect, and the platform is going to close the stay itself half an hour
 * later anyway (see `forcedCheckOut`). So the host gets one press instead — the
 * mirror of Booking.check_out_pin_required, which is what actually enforces it.
 *
 * Derived from the clock rather than read off the payload for the same reason
 * `checkInGate` is: a dashboard sits open across the hour, and the button has
 * to change at the hour without anyone reloading the page.
 *
 * `checkOutAt` is the CURRENT part's end, so a split stay is judged on the part
 * in front of the host — an early part still takes a PIN even when a later one
 * would not.
 *
 * Says "yes" whenever it cannot tell. A missing hour must not be the thing that
 * waives a code; the server refuses the PIN-free path in that case anyway.
 */
export function checkOutPinRequired(
  b: { checkOutAt?: string },
  nowMs: number
): boolean {
  const endsAt = parseWall(b.checkOutAt || "");
  if (Number.isNaN(endsAt) || Number.isNaN(nowMs)) return true;
  return nowMs < endsAt;
}

/**
 * The single stay action available to the HOST on a booking, as a small state
 * machine: check the guest in → then out → then it's done. A cancelled booking
 * has no action. Drives the one button shown in the list and the detail popup.
 */
export type StayAction = "check_in" | "check_out" | "done" | null;

/**
 * The part of a split stay the host is working on: the first one not yet
 * checked out. `null` once every part is closed — the only moment the whole
 * stay is over. An unbroken stay (no segments) has no part to find, and the
 * booking's own two stamps answer for it.
 */
function currentPartStamps(b: {
  checkedInAt?: string;
  checkedOutAt?: string;
  segments?: { checkedInAt?: string; checkedOutAt?: string }[];
}): { checkedInAt?: string; checkedOutAt?: string } | null {
  const parts = b.segments ?? [];
  if (parts.length < 2) return { checkedInAt: b.checkedInAt, checkedOutAt: b.checkedOutAt };
  return parts.find((p) => !p.checkedOutAt) ?? null;
}

export function stayAction(b: {
  status: string;
  lifecycleStatus?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
  segments?: { checkedInAt?: string; checkedOutAt?: string }[];
}): StayAction {
  // Either reading of "cancelled" is enough. `status` is the booking's own
  // field and the lifecycle is the server's verdict; a payload that carries
  // only the second one must not come back offering to check anybody in.
  if (b.status === "cancelled" || b.lifecycleStatus === "cancelled") return null;
  // Per PART: closing part one of a split stay ends that part, not the stay —
  // the guest is due back, so the button has to return to "check in" for the
  // next part instead of settling on "done".
  const part = currentPartStamps(b);
  if (!part) return "done";
  // This part is closed — the guest checked in and back out again. Only the
  // unbroken-stay path can land here (a split stay's `currentPartStamps`
  // already skips closed parts), and without this a finished booking offered
  // "Check out" a second time from the history table.
  if (part.checkedOutAt) return "done";
  if (part.checkedInAt) return "check_out";
  return "check_in";
}

/**
 * Is this booking finished for good — the guest checked out, or it was called
 * off? These are the two states that put a booking in Booking History with
 * "Checked out" or "Cancelled" against it, and NOTHING can be done to one
 * afterwards: no check-in, no check-out, no cancelling, no adding to it.
 *
 * Every action button on both sides asks this first, so a closed booking can
 * never offer one by accident — however the payload it was built from happens
 * to be shaped, and whichever of the gates below would otherwise have said yes.
 * (Leaving a review is not an action on the stay; it is the record of one, and
 * it belongs to exactly these bookings.)
 *
 * A no-show is deliberately NOT closed: nobody arrived, and the host may still
 * decide to take the guest in late — see `checkInGate`.
 *
 * This is the lifecycle and NOTHING else. It is deliberately the same question
 * the status label answers — `completed` is printed as "Checked out" and
 * `cancelled` as "Cancelled" — so the rule holds exactly as it reads: a row
 * that says one of those two words has no buttons on it.
 *
 * It does NOT second-guess the lifecycle by re-deriving a stay action from the
 * stamps. It used to, to protect a split stay whose guest is still due back,
 * and that let the very thing this exists to stop straight through: a booking
 * whose last part was closed on the server's side but whose stamps still read
 * "checked in, not out" came back as open and offered Check out under a
 * "Checked out" label. The guard is unnecessary anyway — the server only
 * reports `completed` once every part of the stay is behind the guest (see
 * Booking.lifecycle_status, which reaches it only when `current_part` is None),
 * so there is no half-finished split stay for it to protect.
 */
export function bookingClosed(b: {
  status: string;
  checkIn: string;
  checkOut: string;
  lifecycleStatus?: string;
  checkedInAt?: string;
  checkedOutAt?: string;
}): boolean {
  const life = lifecycleOf(b);
  return life === "completed" || life === "cancelled" || b.status === "cancelled";
}

/* ------------------------------------------------------------------ */
/* When the host may check a guest in                                  */
/* ------------------------------------------------------------------ */

/**
 * The closing stretch of the check-in window, where the button goes yellow.
 * Mirrors GRACE_WARNING_MINUTES in properties/models.py — change both together;
 * the two are meant to colour the button identically.
 */
const GRACE_WARNING_MINUTES = 60;

/**
 * `check_in_at` / `check_out_at` / `grace_ends_at` / `server_now` all arrive as
 * NAIVE wall-clock ISO strings — deliberately, so they compare to each other
 * directly and none of them is shifted into the viewer's time zone. Parsed as
 * local components purely to get comparable numbers; the value is only ever
 * used in differences.
 */
function parseWall(value: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || "");
  if (!m) return NaN;
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  return new Date(y, mo - 1, d, h, mi, s || 0).getTime();
}

/**
 * Has the LAST arrival of this stay come round?
 *
 * Not the booking's own check-in, which on a split stay is only the first of
 * several: once the final part has opened there is no arrival left ahead of the
 * guest, and what they can still do with the booking changes shape — adding to
 * the trip stops being "edit my plans" and becomes "stay longer". That is the
 * moment the button changes its word.
 *
 * Judged on the SERVER's clock, like every other hour in this file: the browser
 * may sit in another time zone, and the two disagree by whole days at the
 * boundary. Falls back to the booking's own check-in on a payload with no
 * per-part times.
 */
export function lastCheckInStarted(
  b: { checkInAt?: string; segments?: { checkInAt?: string }[] },
  nowMs: number
): boolean {
  const parts = b.segments || [];
  const opensAt = parseWall(
    (parts.length ? parts[parts.length - 1].checkInAt || "" : "") || b.checkInAt || ""
  );
  if (Number.isNaN(opensAt)) return false;
  return nowMs >= opensAt;
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

/** Grey before the hour, green inside the window, yellow through its closing
 *  stretch, hidden once it has shut. */
export type CheckInTone = "grey" | "green" | "yellow" | "hidden";

export type CheckInGate = {
  /** Is there a check-in button at all? False once the window has shut with
   *  nobody checked in — the stay is a no-show and the host has to decide. */
  visible: boolean;
  /** May the host press it right now? */
  open: boolean;
  /** How it should look. */
  tone: CheckInTone;
  /** What to say about it: why it's locked, or that time is running out. */
  reason: string;
  /** Whole minutes left of the check-in window (0 once it's shut). */
  minutesLeft: number;
  /** Whole hours past the booking's check-in time (0 when not late yet). */
  hoursLate: number;
  /** Short countdown for inside the button while the window closes, e.g.
   *  "42m left". "" when there's nothing pressing to say. */
  badge: string;
  /** The window shut without a check-in. The host may still allow a late one. */
  noShow: boolean;
  /**
   * The stay's own check-out has passed with nobody ever checked in — so there
   * is nothing left to arrive for, and not even the host's late-check-in
   * decision applies. Distinct from `noShow`, which is true from the moment the
   * window shuts: both are "hidden" gates, but only one of them is still
   * offerable. (Mirrors the server, which refuses a late check-in past
   * `check_out_datetime()` before it ever consults `late_check_in_allowed`.)
   */
  stayEnded: boolean;
};

/**
 * Whether — and how loudly — the host can check this guest in, at `nowMs` on
 * the server's wall clock (see `useServerWallClock`).
 *
 * This mirrors Booking.check_in_gate on the server, and deliberately re-derives
 * the state from the clock rather than trusting the `buttonState` that came
 * with the payload: a dashboard is left open for hours, and the button has to
 * turn green at the check-in time and vanish when the window shuts without
 * anyone reloading the page. The server re-checks every rule at the mutation
 * anyway — this is the same rule, kept honest on both sides.
 *
 * The hour comes from the BOOKING, not the villa: `check_in_at` is built from
 * the check-in time snapshotted when the guest booked, so a host who re-times
 * the property afterwards doesn't move an existing guest's arrival.
 */
/**
 * Has this booking stopped being live — checked out, cancelled, or a no-show?
 * Deliberately tolerant of the partial booking shapes `checkInGate` is handed:
 * it answers from whatever the payload actually carries, and says "no" only
 * when there is genuinely nothing to go on.
 */
function isSettled(b: {
  status?: string;
  checkIn?: string;
  checkOut?: string;
  lifecycleStatus?: string;
  checkedOutAt?: string;
}): boolean {
  if (b.status === "cancelled" || b.checkedOutAt) return true;
  if (!b.status || !b.checkIn || !b.checkOut) return false;
  const life = lifecycleOf(b as BookingLike);
  return life === "completed" || life === "no_show" || life === "cancelled";
}

export function checkInGate(
  b: {
    checkInAt?: string;
    checkOutAt?: string;
    graceEndsAt?: string;
    lateCheckInAllowed?: boolean;
    checkinMessage?: string;
    // Enough of the booking to tell whether it is still live. Only consulted
    // when there is no scheduled check-in hour to reason from — see below.
    status?: string;
    checkIn?: string;
    checkOut?: string;
    lifecycleStatus?: string;
    checkedInAt?: string;
    checkedOutAt?: string;
  },
  nowMs: number
): CheckInGate {
  const opensAt = parseWall(b.checkInAt || "");
  const graceEnds = parseWall(b.graceEndsAt || "");
  const stayEndsAt = parseWall(b.checkOutAt || "");
  const base: CheckInGate = {
    visible: true,
    open: true,
    tone: "green",
    reason: b.checkinMessage || "",
    minutesLeft: 0,
    hoursLate: 0,
    badge: "",
    noShow: false,
    stayEnded: false,
  };
  // No clock yet (first paint, before the list lands) or no scheduled times.
  if (Number.isNaN(nowMs) || Number.isNaN(opensAt)) {
    // A booking with no check-in hour on it is data from before the check-in
    // window existed. Left at `base` it came back wide open, which is how a
    // booking sitting in Booking History — finished, cancelled, or never
    // arrived for, sometimes months ago — still offered a green Check in.
    // Nothing about a settled booking is still arriving, whatever fields it
    // happens to be missing.
    if (isSettled(b)) {
      return {
        ...base,
        visible: false,
        open: false,
        tone: "hidden",
        noShow: true,
        stayEnded: true,
        reason: "This booking is closed — there is no check-in left to take.",
      };
    }
    // Otherwise leave the button alone rather than guessing; the server
    // refuses an out-of-window check-in regardless.
    return base;
  }

  const minutesLeft = Number.isNaN(graceEnds)
    ? 0
    : Math.max(0, Math.ceil((graceEnds - nowMs) / 60_000));

  // Before the hour: visible but locked, so the host can see that check-in
  // exists and when it opens rather than wondering where the button is.
  if (nowMs < opensAt) {
    return {
      ...base,
      open: false,
      tone: "grey",
      minutesLeft,
      reason: `Check-in opens ${fmtWall(b.checkInAt || "")} — the time this guest booked.`,
    };
  }

  const hoursLate = Math.floor((nowMs - opensAt) / 3_600_000);

  if (Number.isNaN(graceEnds) || nowMs < graceEnds) {
    // Yellow through the closing stretch — an hour of warning where the window
    // is long enough to spare it, half of it where it isn't (as on the server).
    const graceMinutes = Number.isNaN(graceEnds)
      ? 0
      : Math.round((graceEnds - opensAt) / 60_000);
    const warnAfter = Math.max(
      graceMinutes - GRACE_WARNING_MINUTES,
      Math.floor(graceMinutes / 2)
    );
    const warning = graceMinutes > 0 && nowMs >= opensAt + warnAfter * 60_000;
    return {
      ...base,
      tone: warning ? "yellow" : "green",
      minutesLeft,
      hoursLate,
      badge: warning ? `${minutesLeft}m left` : "",
      reason: warning
        ? "Guest check-in is within the grace period."
        : "Check-in available — ask the guest for the PIN on their booking.",
    };
  }

  // Past the stay's own check-out with nobody ever checked in: there is nothing
  // left to arrive for, so not even the host's late-check-in decision applies.
  // A late check-in is taking a guest in hours late, not days later.
  //
  // A payload carrying a check-in hour but no check-out hour can't be read that
  // way, so it falls back to the booking's own state: if it has already settled,
  // treat the stay as ended rather than offering a late arrival on it forever.
  const stayOver = Number.isNaN(stayEndsAt) ? isSettled(b) : nowMs >= stayEndsAt;
  if (stayOver) {
    return {
      ...base,
      visible: false,
      open: false,
      tone: "hidden",
      hoursLate,
      noShow: true,
      stayEnded: true,
      reason: "The guest never checked in and the stay has now ended.",
    };
  }

  // The window has shut but the stay is still running. The host can take the
  // guest in, but that is now a decision they make rather than the normal flow.
  if (b.lateCheckInAllowed) {
    return {
      ...base,
      hoursLate,
      noShow: true,
      reason: "Late check-in allowed — verify the guest's PIN to check them in.",
    };
  }
  return {
    ...base,
    visible: false,
    open: false,
    tone: "hidden",
    hoursLate,
    noShow: true,
    reason: "The guest did not check in within the allowed check-in window.",
  };
}

/* ------------------------------------------------------------------ */
/* Whether the guest may still cancel                                  */
/* ------------------------------------------------------------------ */

/** The tier wordings, exactly as the backend words them. */
export const CANCEL_MSG_FREE = "Free cancellation available.";
export const CANCEL_MSG_NO_REFUND =
  "Cancelling within 24 hours of check-in is non-refundable — no refund will be issued.";
export const CANCEL_MSG_EXPIRED = "Cancellation period has expired.";

/** How long before check-in a cancellation stops earning anything back.
 *  Mirrors Booking.NO_REFUND_WINDOW_HOURS on the server. */
export const NO_REFUND_WINDOW_HOURS = 24;

/**
 * The sliding refund scale, mirroring Booking.REFUND_TIERS on the server:
 * hours before check-in, what comes back, and the line to show. Read top-down —
 * the first threshold `now` still clears is the band it is in.
 *
 * Duplicated rather than fetched because it is also what the CHECKOUT page
 * quotes before a booking exists to ask about. The server remains the
 * authority: every live booking carries the percentages it worked out, and
 * this only re-reads the ladder as the clock moves past a boundary.
 */
export const REFUND_TIERS: ReadonlyArray<
  readonly [hoursBefore: number, refundPercentage: number, message: string]
> = [
  [15 * 24, 100, CANCEL_MSG_FREE],
  [7 * 24, 90, "Cancelling now carries a 10% charge — 90% is refunded."],
  [3 * 24, 75, "Cancelling now carries a 25% charge — 75% is refunded."],
  [NO_REFUND_WINDOW_HOURS, 50, "Cancelling now carries a 50% charge — half is refunded."],
  [0, 0, CANCEL_MSG_NO_REFUND],
] as const;

/** Which band an arrival at `opensAt` falls into, judged at `nowMs`. */
export function refundTierAt(
  opensAt: number,
  nowMs: number
): { refundPercentage: number; message: string } {
  for (const [hours, refundPercentage, message] of REFUND_TIERS) {
    if (nowMs <= opensAt - hours * 3_600_000) return { refundPercentage, message };
  }
  return { refundPercentage: 0, message: CANCEL_MSG_NO_REFUND };
}

export type CancellationGate = {
  /** May the guest press Cancel booking right now? */
  open: boolean;
  /** Of the total: how much comes back, and how much is kept. */
  refundPercentage: number;
  penaltyPercentage: number;
  /** The line to show — the server's wording when it sent one. */
  message: string;
  /** Closed because the check-in moment came and went (rather than because the
   *  stay was already cancelled) — this is what earns the "expired" note. */
  expired: boolean;
};

type CancellableBooking = BookingLike & {
  canCancel?: boolean;
  refundPercentage?: number;
  penaltyPercentage?: number;
  cancellationMessage?: string;
};

/**
 * The flexible cancellation policy, re-read against the ticking server clock.
 *
 * The SERVER decides this — `canCancel` and the percentages arrive with the
 * booking. This only re-runs the same rule locally so a page left open across
 * the boundary keeps up: the button disappears the moment check-in time
 * arrives, and a full refund quietly becomes no refund once the stay is 24
 * hours out, without waiting for a reload. It can only ever close a gate the
 * server left open, never open one the server closed.
 *
 * `nowMs` is the server's wall clock (see `useServerWallClock`), not the
 * browser's — the two can be whole time zones apart, and the guest's own clock
 * must not decide whether their refund window is shut.
 */
export function cancellationGate(b: CancellableBooking, nowMs: number): CancellationGate {
  const serverOpen = b.canCancel !== false;
  const gate: CancellationGate = {
    open: serverOpen,
    refundPercentage: b.refundPercentage ?? 100,
    penaltyPercentage: b.penaltyPercentage ?? 0,
    message: b.cancellationMessage || CANCEL_MSG_FREE,
    expired: false,
  };

  const opensAt = parseWall(b.checkInAt || "");
  // No clock or no scheduled time yet: take the server's word as it stands.
  if (Number.isNaN(nowMs) || Number.isNaN(opensAt)) return gate;

  // Past the check-in moment — closed, whatever the payload said when it left.
  if (nowMs >= opensAt) {
    return {
      open: false,
      refundPercentage: 0,
      penaltyPercentage: 100,
      // Keep the server's phrasing when it has a more specific reason than
      // "expired" (already cancelled, guest already checked in).
      message: serverOpen ? CANCEL_MSG_EXPIRED : gate.message,
      expired: b.status !== "cancelled",
    };
  }

  if (!serverOpen) return gate;

  // Still open: re-read the sliding scale, so a page left sitting through a
  // boundary shows the band the server would now charge at. Distances are
  // durations, not calendar days — 24 hours before a 2 PM check-in is 2 PM the
  // day before, not the midnight in between.
  const { refundPercentage, message } = refundTierAt(opensAt, nowMs);
  return {
    open: true,
    refundPercentage,
    penaltyPercentage: 100 - refundPercentage,
    message,
    expired: false,
  };
}

/* ------------------------------------------------------------------ */
/* Where a split stay has got to                                       */
/* ------------------------------------------------------------------ */

/**
 * A stay booked around nights somebody else holds runs in parts: the guest
 * leaves and comes back. Each part is one of these.
 */
export type StayPartStatus =
  | "upcoming" // hasn't opened yet
  | "awaiting" // its hour has come, but the check-in PIN isn't confirmed yet
  | "current" // the guest is verifiably in this part right now
  | "completed" // ran its course with the guest checked in
  | "missed" // nobody ever arrived — the whole stay was a no-show
  | "cancelled";

export type StayPart = {
  /** 1-based, as shown: "Part 2 of 3". */
  index: number;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string;
  /** Naive wall-clock at the property — compare only against the server clock. */
  checkInAt: string;
  checkOutAt: string;
  /** When the host actually recorded THIS part's arrival and departure — a
   *  PIN-verified check-in and a confirmed check-out, "" until each happens.
   *  Real instants (unlike the scheduled pair above), and per part: on a split
   *  stay the booking's own two stamps are only ever the first arrival and the
   *  last departure, which says nothing about the parts in between. */
  checkedInAt: string;
  checkedOutAt: string;
  /** How many people the host counted in for THIS part, 0 until they do. Per
   *  part for the same reason the stamps are: the guest leaves and comes back,
   *  and the party that returns need not be the size that left. */
  checkedInGuests: number;
  nights: number;
  status: StayPartStatus;
  /** The guest walked out of THIS part before its check-out hour — the one
   *  thing about a finished part that isn't simply "done", and the only reason
   *  a completed part is worth a second glance. False everywhere else. */
  leftEarly: boolean;
};

export type StayProgress = {
  parts: StayPart[];
  /** True only when there is more than one part — an ordinary stay has none. */
  isSplit: boolean;
  completed: number;
  /** Parts whose hours ran out with nobody ever arriving for them. */
  missed: number;
  /** Parts still to come, INCLUDING the one under way. Zero is what makes a
   *  stay settled: nothing left to arrive for, vacate, or wait on. */
  remaining: number;
  /** 1-based index of the part happening now, 0 when between parts or done.
   *  Only ever set once the check-in PIN has been confirmed. */
  currentIndex: number;
  /** 1-based index of a part whose hour has come with no verified arrival —
   *  0 when none. This is what "waiting for check-in" hangs off. */
  awaitingIndex: number;
  /** True once every part has run its course. */
  allDone: boolean;
  /** One line for a header: "Part 2 of 3 · 1 done, 1 to go". */
  label: string;
};

type SegmentLike = {
  index?: number;
  checkIn: string;
  checkOut: string;
  checkInAt?: string;
  checkOutAt?: string;
  nights: number;
  /** What the host actually recorded for this part — the truth about it. */
  checkedInAt?: string;
  checkedOutAt?: string;
  /** And how many people they counted in for it. */
  checkedInGuests?: number;
};

/**
 * How far through a split stay the guest is, at `nowMs` on the SERVER's wall
 * clock (see `useServerWallClock`).
 *
 * Derived live rather than stored: a part ends by the hour arriving, not by
 * anyone pressing a button, so reading it off the clock keeps the panel honest
 * between refetches — and keeps it in step with `checkInGate`, which judges the
 * host's button the same way.
 *
 * The host's own stamps still win where they exist: a stay they closed out is
 * done whatever the clock says, and one nobody ever arrived for is missed in
 * every part rather than quietly "completing" as its hours roll by.
 */
export function stayProgress(
  b: BookingLike & { nights?: number; segments?: SegmentLike[]; earlyCheckOut?: boolean },
  nowMs: number
): StayProgress {
  // No segments on the payload (an older response, or an unbroken stay that
  // carries none) — the booking's own dates ARE the single part.
  const raw: SegmentLike[] =
    b.segments && b.segments.length
      ? b.segments
      : [
          {
            checkIn: b.checkIn,
            checkOut: b.checkOut,
            checkInAt: b.checkInAt,
            checkOutAt: b.checkOutAt,
            nights: b.nights ?? 0,
            checkedInAt: b.checkedInAt,
            checkedOutAt: b.checkedOutAt,
          },
        ];

  const life = lifecycleOf(b);
  const cancelled = life === "cancelled";
  const noShow = life === "no_show";
  // A recorded departure closes the whole stay, however many parts it had.
  const closedOut = life === "completed";
  const clockKnown = !Number.isNaN(nowMs);

  // Where the early departure happened, when there was one. An early check-out
  // ends the whole stay, so it belongs to the LAST part anyone actually left —
  // found by the recorded stamps rather than by comparing a departure INSTANT
  // against a naive wall-clock hour, which are two different kinds of number.
  const lastDeparted = b.earlyCheckOut
    ? raw.reduce((found, s, i) => (s.checkedOutAt ? i : found), -1)
    : -1;

  const parts: StayPart[] = raw.map((s, i) => {
    const opensAt = parseWall(s.checkInAt || "");
    const endsAt = parseWall(s.checkOutAt || "");
    // What the host RECORDED for this part — a PIN-verified arrival and a
    // checklist-confirmed departure. These outrank the clock in both
    // directions: an hour arriving never means the guest came, and an hour
    // passing never means they left.
    const arrived = !!s.checkedInAt;
    const departed = !!s.checkedOutAt;
    let status: StayPartStatus;
    if (cancelled) status = "cancelled";
    else if (departed) status = "completed";
    else if (arrived) status = "current";
    else if (!clockKnown || Number.isNaN(opensAt) || Number.isNaN(endsAt)) {
      // Before the first clock reading lands there is nothing to judge
      // against; call it upcoming rather than invent progress — unless the
      // server has already declared the whole stay closed off.
      status = closedOut ? "completed" : "upcoming";
    } else if (nowMs < opensAt) status = "upcoming";
    // Nobody arrived and the hour to leave has passed: this part is gone. Only
    // THIS part — a missed part says nothing about the ones after it, which the
    // guest is still due for. (The booking-wide no-show lifecycle is not used
    // here for the same reason: on a split stay it is a verdict on the part in
    // front of the host, not on the whole stay.)
    else if (nowMs >= endsAt) status = "missed";
    // Its hour has come and nobody has verified an arrival — neither "staying"
    // nor quietly "done", so it stays visibly outstanding.
    else status = "awaiting";

    return {
      index: s.index ?? i + 1,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      checkInAt: s.checkInAt || "",
      checkOutAt: s.checkOutAt || "",
      checkedInAt: s.checkedInAt || "",
      checkedOutAt: s.checkedOutAt || "",
      checkedInGuests: s.checkedInGuests || 0,
      nights: s.nights,
      status,
      leftEarly: i === lastDeparted,
    };
  });

  const completed = parts.filter((p) => p.status === "completed").length;
  const missed = parts.filter((p) => p.status === "missed").length;
  const remaining = parts.filter(
    (p) =>
      p.status === "current" || p.status === "upcoming" || p.status === "awaiting"
  ).length;
  const currentIndex = parts.find((p) => p.status === "current")?.index ?? 0;
  const awaitingIndex = parts.find((p) => p.status === "awaiting")?.index ?? 0;
  const total = parts.length;
  const allDone = completed === total && total > 0;

  let label = "";
  if (cancelled) label = "Cancelled";
  else if (missed === total)
    label = total > 1 ? `No-show — all ${total} parts missed` : "No-show";
  else if (allDone) label = `All ${total} parts complete`;
  // Nothing outstanding, but it didn't all go to plan: some parts were stayed
  // and some were never arrived for. Saying "complete" would paper over that.
  else if (!remaining)
    label = `${completed} of ${total} parts stayed · ${missed} missed`;
  else if (currentIndex) {
    const left = remaining - 1;
    label =
      `Part ${currentIndex} of ${total} under way` +
      (left ? ` · ${left} more to come` : " · final part");
  } else if (awaitingIndex) {
    // Its hour has come and gone unverified — the thing to say is that the
    // check-in hasn't happened, not that the stay is under way.
    label = `Part ${awaitingIndex} of ${total} · check-in not confirmed yet`;
  } else {
    // Between parts: away from the property, with more still booked.
    const next = parts.find((p) => p.status === "upcoming");
    label =
      `${completed} of ${total} parts complete` +
      (missed ? ` · ${missed} missed` : "") +
      (next ? ` · Part ${next.index} next` : "");
  }

  return {
    parts,
    isSplit: total > 1,
    completed,
    missed,
    remaining,
    currentIndex,
    awaitingIndex,
    allDone,
    label,
  };
}

/**
 * The dates this stay actually covers NOW — the first night still held, and the
 * morning after the last one.
 *
 * NOT `checkIn`/`checkOut`. Those are the outer bounds the booking was MADE
 * with, and the server freezes them there on purpose: they sit beside the money
 * as the record of what was bought, and the gap between them and the segments is
 * the record of what was given back. Printed in a row that answers "when am I
 * going?", though, they are simply wrong — a guest who handed back the first
 * three nights of 1 → 5 would still read "1 → 5" the morning they were meant to
 * arrive. The segments are what the booking holds, and what it holds is the stay.
 *
 * On a split stay these still only BRACKET it: the part chips underneath are
 * what say the middle belongs to somebody else.
 */
export function stayDates(b: {
  checkIn: string;
  checkOut: string;
  segments?: { checkIn: string; checkOut: string }[];
}): { checkIn: string; checkOut: string } {
  const parts = b.segments || [];
  if (!parts.length) return { checkIn: b.checkIn, checkOut: b.checkOut };
  return {
    checkIn: parts[0].checkIn,
    checkOut: parts[parts.length - 1].checkOut,
  };
}

/**
 * May the guest still change this stay right now — add services, add nights?
 *
 * Up to the hour they are due, yes: the trip is still a plan and re-planning it
 * is what the button is for. ON that hour the door shuts, whether or not they
 * turned up, because a stay whose check-in has come round with nobody verified
 * in it is not yet anything to add to — the host is at the door and the grace
 * period is running. Checking in settles it and the door opens again.
 *
 * Judged on the part in FRONT of the guest, the same one the server judges (see
 * additions.blocked_reason): a part they have arrived for is open even if a
 * later hour has since come round, and a part nobody ever arrived for is behind
 * us and says nothing about the parts still to come.
 *
 * Derived from the clock rather than read off the server's flags alone, so the
 * button goes the moment the hour passes instead of at the next refetch. The
 * server refuses either way; this only stops drawing a door it would refuse.
 */
export function stayChangeable(
  b: Parameters<typeof stayProgress>[0],
  nowMs: number
): boolean {
  const outstanding = stayProgress(b, nowMs).parts.find(
    (part) =>
      part.status === "current" ||
      part.status === "awaiting" ||
      part.status === "upcoming"
  );
  return !!outstanding && outstanding.status !== "awaiting";
}

/** "Fri, 29 Jul · 2:00 PM" — a part's arrival or departure moment. */
export function fmtPartMoment(wall: string): string {
  const t = parseWall(wall);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
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

/**
 * Seconds left on a check-in PIN — the one countdown, used by both sides of it.
 *
 * Anchored to a deadline and re-read from the clock on every tick, never
 * decremented. A counter that subtracts 1 per interval loses whatever each tick
 * costs above 1000ms — the timer itself, the re-render, a backgrounded tab — and
 * over a 60-second PIN that adds up to seconds of imaginary time. The host's
 * dialog and the guest's card had drifted apart exactly that way: the guest's
 * card re-based on every poll and stayed honest, while the host's counted on
 * undisturbed and went on showing time that was already spent. So the guest's
 * PIN died first, and the host was still looking at a code they thought was
 * live. Both now read the same number, because both read the same clock.
 *
 * `expiresIn` is the server's own reading, and every refetch carries a fresh
 * one; taking each of them re-anchors the deadline rather than letting local
 * ticks define the truth.
 */
export function usePinCountdown(expiresIn: number): number {
  const [left, setLeft] = useState(expiresIn);

  useEffect(() => {
    // Read once, here: the effect re-runs on every new server value, so this is
    // exactly as fresh as the number it is anchoring.
    const deadline = Date.now() + expiresIn * 1000;
    const tick = () => setLeft(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
    // The first reading lands on the next turn of the event loop rather than
    // inline — setting state synchronously in an effect only buys a number the
    // interval produces a quarter-second later anyway, at the price of a second
    // render pass. Four ticks a second after that, so the displayed second
    // turns over when it actually does rather than up to a second late.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [expiresIn]);

  return left;
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
