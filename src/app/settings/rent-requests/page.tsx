"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Star, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useVillaCount, setRentRequestCount } from "@/lib/useProperty";
import { useLiveRefresh } from "@/lib/useLiveRefresh";
import { useToast } from "@/lib/toast";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import BookingDetails, { StayActionButton } from "@/components/settings/BookingDetails";
import {
  PropertyLink,
  RemovedNote,
  REMOVED_IMG,
} from "@/components/settings/RemovedProperty";
import SectionTabs from "@/components/ui/SectionTabs";
import StayPartChips from "@/components/ui/StayPartChips";
import CheckInCountdownPill from "@/components/ui/CheckInCountdownPill";
import StayCountdownPill from "@/components/ui/StayCountdownPill";
import ForcedCheckOutPill from "@/components/ui/ForcedCheckOutPill";
import AutoCheckOutNote from "@/components/ui/AutoCheckOutNote";
import Img from "@/components/ui/Img";
import SortMenu, {
  ACTION_SORTS,
  HISTORY_SORTS,
  compareBySort,
  type SortKey,
} from "@/components/ui/SortMenu";
import {
  fetchVillaBookings,
  startCheckIn,
  verifyCheckIn,
  startCheckOut,
  verifyCheckOut,
  checkOutNow,
  type Booking,
} from "@/lib/api";
import StayPinDialog, { type StayPinMode } from "@/components/settings/StayPinDialog";
import CheckOutNowDialog from "@/components/settings/CheckOutNowDialog";
import {
  bookingStatus,
  checkInCountdown,
  checkOutPinRequired,
  lifecycleOf,
  useServerWallClock,
  stayAction,
  stayDates,
  stayProgress,
  nextActionAt,
  STATUS_TONE_CLASS,
} from "@/lib/booking";

// No tenant column: who booked is the first thing the expanded detail says,
// with their avatar, contact and status — repeating the name here bought a
// column of width for something the host reads once they open the row.
const COLUMNS = ["Property", "Stay Duration", "Guests", "Status", ""];

// One grid template shared by the header and every row so the columns line up.
// Status carries the countdown pill under its label now, so it takes the width
// back from Property and Guests — a villa title and "2 guests" each had more
// room than they were using.
// Status has since taken width back off Property and Stay Duration, because
// what it holds got longer: the countdown names itself now ("Check-in in 12
// days", not a bare "In 12 days"), and on one line rather than two. A villa
// title truncates gracefully and the dates have slack; a status that wraps
// mid-phrase does not.
// `minmax(0, …fr)`, never a bare fr: a bare track refuses to go narrower than
// its content, so an actions cell holding one control more than its share
// widened itself on those rows alone and slid every column left of it out from
// under its heading. With a 0 floor each track is exactly its share on every
// row, and the row's min-width below is what keeps the buttons fitting.
const ROW_GRID =
  "grid-cols-[minmax(0,1.4fr)_minmax(0,1.3fr)_minmax(0,0.55fr)_minmax(0,1.2fr)_minmax(0,2.2fr)]";
const ROW_MINW = "min-w-[980px]";

// Guests and Status sit a step in from the column before them, headings and
// cells alike — never one without the other, or the two drift apart. Without
// the step the count read as a continuation of the dates beside it and the
// status as a continuation of the count: one run of text with three meanings.
// The same treatment, and the same measurements, as the guest's own table.
const GUESTS_INDENT = "pl-5";
const STATUS_INDENT = "pl-6";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function fmtStay(checkIn: string, checkOut: string): string {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const one = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return `${one(a)}-${one(b)}`;
}

function RequestRow({
  req,
  expanded,
  onToggle,
  onCheckIn,
  onCheckOut,
  onRefresh,
  working,
}: {
  req: Booking;
  expanded: boolean;
  onToggle: (id: string) => void;
  onCheckIn: (id: string) => void;
  onCheckOut: (id: string) => void;
  /** Re-read the list — used when a stay's forced check-out falls due, since
   *  the close itself happens on the server's next read of that booking. */
  onRefresh: () => void;
  working: boolean;
}) {
  // The server's clock, ticking — so a stay that has been waiting an hour says
  // so without the host reloading, and on the SERVER's hour, not the browser's.
  const now = useServerWallClock(req.serverNow);
  const status = bookingStatus(req, now);
  // How far through a split stay this guest is, so the host can see at a glance
  // that the property is theirs in parts and which part is running.
  const progress = stayProgress(req, now);
  // The dates the property is actually held for, after anything given back.
  const stay = stayDates(req);
  // How long until this guest turns up — the same countdown the guest reads on
  // their own booking, so the two sides are never a day apart on when the stay
  // starts. Null once it has started (or was cancelled/missed), which is
  // exactly when the status beside it takes over the story.
  const countdown = checkInCountdown(req, now);
  const rowRef = useRef<HTMLDivElement>(null);

  // On expand, bring the newly revealed details into view — after the open
  // animation so the scroll targets the row's final, taller height.
  useEffect(() => {
    if (!expanded) return;
    const t = setTimeout(() => {
      rowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 320);
    return () => clearTimeout(t);
  }, [expanded]);

  return (
    <div
      ref={rowRef}
      // Same scroll margins as the guest's booking rows: the sticky navbar and
      // "Manage Account" bar float over the page, and `scrollIntoView` would
      // otherwise park the opened panel's top edge underneath them.
      // Open, the row draws its own edge clearly — a darkened neutral hairline
      // over white on a soft shadow, never the brand colour. Same treatment as
      // the guest's booking rows, which these sit alongside in one account.
      className={`${ROW_MINW} scroll-mt-[132px] scroll-mb-6 overflow-hidden rounded-lg border transition-all duration-300 ${
        expanded
          ? "border-ink/25 bg-white shadow-[0_6px_22px_-10px_rgba(20,20,45,0.28)]"
          : "border-line"
      }`}
    >
      {/* Collapsed: the compact table row. It collapses away as the detail
          opens, so the guest, property and status never show in both at once. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
        }`}
      >
        <div className="overflow-hidden">
          <div className={`grid ${ROW_GRID} items-center px-4 py-3 text-[13px]`}>
            {/* Property — the row's identity now that the tenant has moved
                into the expanded detail where the rest of their contact is. */}
            {/* Once the host has taken this property down the row still names
                it — it is what the guest booked — but there is no listing to
                open any more, so nothing here is clickable and the thumbnail
                goes grey. The note underneath is worded back at the host:
                "You removed this property." */}
            <PropertyLink
              villaId={req.villaId}
              removed={req.villaRemoved}
              message={req.villaRemovedMessage}
              title={req.villaTitle}
              className="group flex min-w-0 items-center gap-2.5 pr-2"
            >
              <Img
                src={req.villaCover}
                alt={req.villaTitle}
                className={`h-9 w-9 shrink-0 rounded-lg object-cover ${
                  req.villaRemoved ? REMOVED_IMG : ""
                }`}
              />
              <span className="flex min-w-0 flex-col">
                <span
                  className={`truncate ${
                    req.villaRemoved ? "text-body/70" : "text-body group-hover:text-primary"
                  }`}
                >
                  {req.villaTitle}
                </span>
                {req.villaRemoved && (
                  <RemovedNote
                    message={req.villaRemovedMessage}
                    compact
                    className="mt-1 self-start"
                  />
                )}
              </span>
            </PropertyLink>
            <span className="flex min-w-0 flex-col text-body">
              {/* What the property is held for NOW. Nights the guest handed
                  back are the host's to sell again, so a row that still bracketed
                  them would be describing an occupancy that no longer exists. */}
              <span>{fmtStay(stay.checkIn, stay.checkOut)}</span>
              {/* This guest booked around nights another booking holds, so the
                  two dates only bracket their stay — the host needs to see that
                  the property is theirs in parts, not straight through, and
                  which part they are on. */}
              <StayPartChips progress={progress} />
            </span>
            {/* One figure, and the truest one available: once the host has
                counted the party in at the door that count IS who is in the
                property, so it replaces the booked number rather than sitting
                beside it. Until then the booking's own is all there is. */}
            {/* One colour for every row, whichever of the two figures it is.
                The count used to turn green once the host had counted the party
                in, which made a column of numbers read as a column of statuses:
                a green 4 beside a black 4 looked like a difference in the
                GUESTS, when the only difference is where the number came from.
                The status column already says where the stay is, and the
                tooltip below still says which figure this is. */}
            <span
              className={`flex items-center gap-1.5 text-[13px] font-medium text-body ${GUESTS_INDENT}`}
              title={
                req.checkedInGuests > 0
                  ? `${req.checkedInGuests} guest${
                      req.checkedInGuests === 1 ? "" : "s"
                    } checked in`
                  : `${req.guests} guest${req.guests === 1 ? "" : "s"} booked`
              }
            >
              <Users size={14} className="shrink-0 text-muted" aria-hidden />
              {req.checkedInGuests > 0 ? req.checkedInGuests : req.guests}
            </span>

            {/* Status — the real stay state, plus the guest's rating once they
                leave one (so it shows right in the row, not only on expand).
                On a stay still to come the countdown REPLACES the label rather
                than joining it: "Confirmed" told the host nothing they didn't
                already know from the booking being in this table, while what
                they actually need is when the guest turns up. It is the guest's
                own countdown, shown unchanged, so neither side can be a day out
                from the other. The label comes back the moment the stay starts
                — check-in window, checked in, no-show all have something to
                say.

                And once the guest is in, "Staying" alone doesn't say the thing
                the host's day is actually organised around: when the room comes
                free. The check-out countdown goes under it, the same reading
                the guest has on their own booking, so neither side is planning
                against a different hour. */}
            <span className={`flex min-w-0 flex-col items-start gap-1 ${STATUS_INDENT}`}>
              {countdown ? (
                // `text`, not the chip: whatever this cell shows, it is the
                // status of the row, and every reading of it — "Check-in in 2
                // days", "Check-in window open", "Checked in" — has to start on
                // the same left edge and be the same size, or the column reads
                // as if it were two columns badly stacked.
                <CheckInCountdownPill
                  countdown={countdown}
                  checkIn={req.checkIn}
                  role="owner"
                  variant="text"
                />
              ) : (
                <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5">
                  <span
                    className={`text-[13px] font-semibold ${STATUS_TONE_CLASS[status.tone]} ${
                      status.pending ? "animate-soft-pulse" : ""
                    }`}
                  >
                    {status.label}
                  </span>
                  {/* "Checked out" alone doesn't say who ended it, and in a
                      history every finished stay says that. The ones the
                      platform closed say so here, beside the label, rather than
                      only inside the panel the host has to open first. */}
                  <AutoCheckOutNote booking={req} />
                </span>
              )}
              <StayCountdownPill booking={req} />
              {/* The guest's hour to be out has gone by and nobody has closed
                  the stay. Half an hour from that hour it closes itself, and
                  this is the host's warning that it is about to — while there
                  is still time to do it properly, with the guest's PIN. */}
              <ForcedCheckOutPill booking={req} onDue={onRefresh} />
            </span>

            {/* Actions — the guest's score, then the single stay action, then
                expand for the full details. */}
            <div className="flex items-center justify-end gap-2">
              <span className="flex w-[104px] shrink-0 justify-end">
                {req.reviewRating > 0 && (
                  <span
                    title={`Guest rated this stay ${req.reviewRating} out of 5`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-star/10 px-2.5 py-1.5 text-[12.5px] font-semibold text-[#b8860b]"
                  >
                    <Star size={13} className="fill-star text-star" aria-hidden />
                    Rated {req.reviewRating.toFixed(1)}
                  </span>
                )}
              </span>
              <StayActionButton
                booking={req}
                onCheckIn={onCheckIn}
                onCheckOut={onCheckOut}
                busy={working}
              />
              <button
                type="button"
                onClick={() => onToggle(req.id)}
                aria-expanded={expanded}
                aria-label={`View ${req.guestName}'s booking details`}
                // py-[5px] + the 1px border = the same height as the filled
                // Check in / Check out button next to it.
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-[5px] text-[12.5px] font-medium text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
              >
                <span className="w-[30px] text-center">View</span>
                <ChevronDown size={15} className="shrink-0" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Expanded: the redesigned full detail, which carries its own property
          header, status, stay action and Hide control — so the compact row
          above can hide entirely and nothing is shown twice. */}
      <div
        className={`grid transition-all duration-300 ease-out ${
          expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-4 py-4 sm:px-5">
            <BookingDetails
              booking={req}
              onCollapse={() => onToggle(req.id)}
              onCheckIn={onCheckIn}
              onCheckOut={onCheckOut}
              working={working}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RentRequestsPage() {
  const { user, ready } = useAuth();
  const { count, hasProperty } = useVillaCount();
  const toast = useToast();
  const [requests, setRequests] = useState<Booking[] | null>(null);
  const [error, setError] = useState("");
  // Which booking's detail popup is open, and which booking has a check-in/out
  // Which row is expanded (its details shown inline), and which booking has a
  // check-in/out request in flight.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  // Which booking's PIN dialog is open, which end of the stay it is verifying,
  // and how that dialog is doing. Arrival and departure share one dialog and one
  // piece of state: a booking is only ever at one of them.
  const [pinBookingId, setPinBookingId] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<StayPinMode>("in");
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");
  const toggleExpand = useCallback(
    (id: string) => setExpandedId((cur) => (cur === id ? null : id)),
    []
  );
  // Each table sorts on its own — sorting the history shouldn't silently
  // re-order the active requests above it.
  //
  // The upcoming table sorts by CHECK-IN, soonest first, and that is its
  // default: this list is a queue of people about to arrive, and the row the
  // host needs is the next one through the door — not the booking that happened
  // to be made most recently, which could be a stay four months out sitting
  // above a guest turning up this afternoon.
  // The upcoming table is a queue of jobs: it leads with the one falling due
  // soonest. The history is a record and leads with the most recent.
  const [sort, setSort] = useState<SortKey>("action");
  const [historySort, setHistorySort] = useState<SortKey>("newest");
  // Which of the two tables is showing. Both are already in hand — the tab
  // picks which one is drawn, and nothing is fetched to change between them.
  const [tab, setTab] = useState<"active" | "history">("active");

  // Switching closes whatever row was open: it isn't in the table you just
  // moved to, and left open it would scroll itself back into view on return.
  const showTab = useCallback((next: "active" | "history") => {
    setTab(next);
    setExpandedId(null);
  }, []);

  // `silent` refreshes are background polls — a transient network blip there
  // must not swap the list the owner is reading for an error banner.
  const load = useCallback(
    (silent = false) => {
      return fetchVillaBookings()
        .then((rs) => {
          setRequests(rs);
          // The sidebar marks a section with nothing in it; this page is
          // holding the real list, so it keeps that mark honest.
          if (user) setRentRequestCount(user.id, rs.length);
        })
        .catch((e) => {
          if (!silent) {
            setError(e instanceof Error ? e.message : "Failed to load rent requests.");
          }
        });
    },
    [user]
  );

  useEffect(() => {
    if (!ready || !user) return;
    load();
  }, [ready, user, load]);

  // Surfaces new bookings and guest cancellations without a manual reload.
  // Paused mid check-in/out so an in-flight poll can't land stale rows over it.
  useLiveRefresh(() => load(true), ready && !!user && !workingId);

  // A read is what closes an overrunning stay (the server does it lazily, on
  // the next look at that booking), so a row whose forced check-out falls due
  // asks for one immediately rather than sitting on "0:00" until the next poll.
  const refreshNow = useCallback(() => {
    load(true);
  }, [load]);


  // Apply a mutation's returned booking into the list (the popup, derived by
  // id, updates with it).
  const applyUpdate = useCallback((updated: Booking) => {
    setRequests((prev) => (prev ?? []).map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  // The server's clock for the page itself, ticking — so every question asked
  // about an hour here (which check-out dialog to open, and the active/history
  // split further down) is asked of the same time as every row's own status.
  const listNow = useServerWallClock(requests?.[0]?.serverNow ?? "");

  // Both ends of the stay are two steps: pressing the button only issues a PIN,
  // which shows up on the GUEST's booking page. The host then has to be told it
  // and type it into the dialog — that is what makes a check-in proof the guest
  // was here, and a check-out proof they were here to leave.
  const openPin = useCallback(
    async (id: string, mode: StayPinMode) => {
      setWorkingId(id);
      setPinError("");
      try {
        applyUpdate(await (mode === "in" ? startCheckIn(id) : startCheckOut(id)));
        setPinMode(mode);
        setPinBookingId(id);
      } catch (e) {
        toast.error(
          e instanceof Error
            ? e.message
            : `Could not start check-${mode === "in" ? "in" : "out"}.`
        );
      } finally {
        setWorkingId(null);
      }
    },
    [applyUpdate, toast]
  );

  const doCheckIn = useCallback((id: string) => openPin(id, "in"), [openPin]);

  // Check-out takes one of two roads, decided by the clock. Before the booked
  // hour it is the two-step PIN above — the code exists to stop a host putting
  // a guest out early. From that hour it is a single confirmed press: there is
  // nothing left for a code to protect, and the platform closes the stay itself
  // half an hour later either way.
  //
  // No PIN is issued on the second road, so `openPin` is skipped entirely and
  // the dialog is chosen at render time from the same question — which keeps
  // the two in step if the hour passes with the dialog already open.
  const doCheckOut = useCallback(
    (id: string) => {
      const b = (requests ?? []).find((r) => r.id === id);
      if (b && !checkOutPinRequired(b, listNow)) {
        setPinError("");
        setPinMode("out");
        setPinBookingId(id);
        return;
      }
      openPin(id, "out");
    },
    [openPin, requests, listNow]
  );

  // The PIN-free close. Same reporting as a verified departure, minus the code
  // — and minus the early-departure line, because a stay closed at or past its
  // booked hour has no nights left to hand back.
  const doCheckOutNow = useCallback(async () => {
    if (!pinBookingId) return;
    setPinBusy(true);
    setPinError("");
    try {
      applyUpdate(await checkOutNow(pinBookingId));
      setPinBookingId(null);
      toast.success("Guest checked out — the property is free.");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Could not close this stay.");
      load(true);
    } finally {
      setPinBusy(false);
    }
  }, [applyUpdate, load, pinBookingId, toast]);

  // Step 2. A refusal (wrong digits, expired code, locked after three tries)
  // stays inside the dialog, next to the boxes it is about — the host is
  // mid-conversation with the guest and shouldn't have to hunt for it.
  const doVerifyPin = useCallback(
    async (pin: string, guests: number) => {
      if (!pinBookingId) return;
      const leaving = pinMode === "out";
      setPinBusy(true);
      setPinError("");
      try {
        const updated = await (leaving
          ? verifyCheckOut(pinBookingId, pin)
          : verifyCheckIn(pinBookingId, pin, guests));
        applyUpdate(updated);
        setPinBookingId(null);
        // An early departure is worth saying out loud: the host has just given
        // nights back to their own calendar, and that is the point of it.
        toast.success(
          !leaving
            ? `PIN verified — ${updated.checkedInGuests || guests} guest${
                (updated.checkedInGuests || guests) === 1 ? "" : "s"
              } checked in.`
            : updated.releasedNights > 0
              ? `Guest checked out ${updated.releasedNights} night${
                  updated.releasedNights === 1 ? "" : "s"
                } early — those nights are back on your calendar.`
              : "PIN verified — guest checked out."
        );
      } catch (e) {
        setPinError(e instanceof Error ? e.message : "Could not verify that PIN.");
        // Re-read the booking so the dialog's attempts-left counter is the
        // server's, not a guess made from the error text.
        load(true);
      } finally {
        setPinBusy(false);
      }
    },
    [applyUpdate, load, pinBookingId, pinMode, toast]
  );

  // A fresh PIN, after one expires or locks. The old one dies server-side the
  // moment this lands, so there is never more than one live code.
  const doResendPin = useCallback(async () => {
    if (!pinBookingId) return;
    setPinBusy(true);
    setPinError("");
    try {
      applyUpdate(
        await (pinMode === "in" ? startCheckIn(pinBookingId) : startCheckOut(pinBookingId))
      );
      toast.success("New PIN sent to the guest's booking.");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Could not issue a new PIN.");
    } finally {
      setPinBusy(false);
    }
  }, [applyUpdate, pinBookingId, pinMode, toast]);

  // There was a `doAllowLate` here — the host taking a no-show guest in anyway.
  // The window closing now cancels the booking for nothing back, so there is no
  // stay left to take them into and no decision left to offer. The row says
  // what happened instead of asking the host what to do about it.

  // The booking the PIN dialog is about, read back out of the list rather than
  // held separately: a poll or a mutation that refreshes the row must refresh
  // the dialog with it (that's where its countdown and attempts-left come from).
  //
  // It closes on its own once the stay has moved past the point it was for —
  // judged on the SAME question the button asked, so a split stay's second
  // arrival re-opens it rather than finding the booking "already checked in".
  const pinBooking = useMemo(() => {
    const b = (requests ?? []).find((r) => r.id === pinBookingId);
    if (!b) return null;
    const wanted = pinMode === "in" ? "check_in" : "check_out";
    return stayAction(b) === wanted ? b : null;
  }, [requests, pinBookingId, pinMode]);

  // Which of the two check-out dialogs this booking is at, asked of the ticking
  // clock rather than of whichever road the button took. A host who opened the
  // PIN dialog a minute before the booked hour watches it become the one-press
  // close as the hour lands, instead of typing a code the server has just
  // stopped issuing.
  const checkOutNoPin =
    pinBooking !== null &&
    pinMode === "out" &&
    !checkOutPinRequired(pinBooking, listNow);

  // Active = a live stay (upcoming, awaiting check-in, or under way); History =
  // settled — checked out, no-show, or cancelled (it belongs to the record).
  const { active, history } = useMemo(() => {
    const active: Booking[] = [];
    const history: Booking[] = [];
    for (const r of requests ?? []) {
      // Cancelled, or over with nothing outstanding — those are the only two
      // ways a stay reaches the record. On a split stay "over" means every
      // part: one still to come keeps it here even when the lifecycle reports
      // `no_show` for a part that was missed, because the guest is still due
      // back and the host still has a check-in to run.
      const life = lifecycleOf(r);
      const live =
        life === "upcoming" || life === "awaiting_checkin" || life === "staying";
      // Parts the host still has an arrival to run for — not merely ones left
      // waiting on one. A window that shut with nobody in it is not a part
      // still to come (see stayProgress's `dueLater`).
      const partsLeft =
        !Number.isNaN(listNow) && stayProgress(r, listNow).dueLater > 0;
      if (life !== "cancelled" && (live || partsLeft)) {
        active.push(r);
      } else {
        history.push(r);
      }
    }
    // Whatever the host has to do next, first — an arrival to run, or a
    // departure to close for the guest already in. Sorting on the stay's start
    // read the wrong thing off a split stay: with its first part behind it, a
    // booking whose next arrival is days away still had the earliest start of
    // all and sat above the guest turning up this afternoon. `nextActionAt` is
    // the hour the job actually falls due. Ties fall back to the newer booking,
    // so the order is stable rather than left to the server's.
    const stamp = (b: Booking) => {
      const t = new Date(b.createdAt).getTime();
      return Number.isNaN(t) ? 0 : t;
    };
    const nextAction = (b: Booking) => nextActionAt(b, listNow);
    active.sort(compareBySort(sort, nextAction, stamp));
    history.sort(compareBySort(historySort, nextAction, stamp));
    return { active, history };
  }, [requests, sort, historySort, listNow]);

  function retryLoad() {
    setError("");
    setRequests(null);
    load();
  }

  // Guard: only signed-in users can view their rent requests.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your rent requests.
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

  // Guard: rent requests only exist once you host a property. (The sidebar
  // hides this section too, but a direct link could still land here.)
  if (count !== null && !hasProperty) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">List a property first</h1>
        <p className="mt-2 text-[14px] text-body">
          Rent requests come from guests booking your villas — add a property to start.
        </p>
        <Link
          href="/settings/property/add"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Add Property
        </Link>
      </div>
    );
  }


  return (
    <div className="mx-auto w-full max-w-body px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — rent requests card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {error && (
            <div role="alert" className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600">
              {error}
            </div>
          )}

          {/* Header — its own band across the top of the card: the card's top
              padding is cancelled and an even py-4 takes its place, so what
              sits in the band is centred in it like the other account tabs. The
              two tables are tabs in it now — the stays still to come, and the
              record of the ones that are over — with the sort belonging to
              whichever is showing on the right. */}
          <div
            className={`-mx-6 flex items-center justify-between border-b border-line px-6 py-4 sm:-mx-8 sm:px-8 ${
              // Only reach up into the card's padding when nothing is above it.
              error ? "" : "-mt-6 sm:-mt-8"
            }`}
          >
            {/* A booking is confirmed the moment it's made, so the first tab is
                simply the upcoming stays on the owner's villas — nothing to
                action. The second is what stays on record: finished stays, and
                the ones that were called off. */}
            <SectionTabs
              idPrefix="rent-requests"
              value={tab}
              onChange={showTab}
              tabs={[
                {
                  key: "active" as const,
                  label: "Upcoming Bookings",
                  shortLabel: "Upcoming",
                  count: active.length,
                },
                {
                  key: "history" as const,
                  label: "Booking History",
                  shortLabel: "History",
                  count: history.length,
                },
              ]}
            />
            {tab === "active" ? (
              <SortMenu value={sort} options={ACTION_SORTS} onChange={setSort} />
            ) : (
              <SortMenu value={historySort} options={HISTORY_SORTS} onChange={setHistorySort} />
            )}
          </div>

          {/* Table (scrolls horizontally on small screens) */}
          {tab === "active" && (
            <div
              role="tabpanel"
              id="rent-requests-panel-active"
              aria-labelledby="rent-requests-tab-active"
              className="overflow-x-auto"
            >
              <ColumnHeadings />

              {/* Rows */}
              <div className="mt-2.5 space-y-3">
                {requests === null && error ? (
                  // A failed load is terminal — don't keep a loader spinning
                  // under the error banner.
                  <div className="rounded-lg border border-dashed border-line px-4 py-8 text-center">
                    <p className="text-[13px] text-muted">We couldn&apos;t load your rent requests.</p>
                    <button
                      type="button"
                      onClick={retryLoad}
                      className="mt-4 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
                    >
                      Try again
                    </button>
                  </div>
                ) : requests === null ? (
                  <>
                    {Array.from({ length: 3 }, (_, i) => (
                      <div key={i} className="skeleton h-[48px] min-w-[860px]" />
                    ))}
                  </>
                ) : active.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                    No upcoming bookings yet. When someone books one of your villas,
                    it&apos;ll show up here.
                  </div>
                ) : (
                  active.map((req) => (
                    <RequestRow
                      key={req.id}
                      req={req}
                      expanded={expandedId === req.id}
                      onToggle={toggleExpand}
                      onCheckIn={doCheckIn}
                      onCheckOut={doCheckOut}
                      onRefresh={refreshNow}
                      working={workingId === req.id}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Booking history — cancelled and finished stays stay on record here
              instead of vanishing from the owner's view. */}
          {tab === "history" && (
            <div
              role="tabpanel"
              id="rent-requests-panel-history"
              aria-labelledby="rent-requests-tab-history"
              className="overflow-x-auto"
            >
              <ColumnHeadings />

              <div className="mt-2.5 space-y-3">
                {requests === null ? (
                  error ? null : (
                    <>
                      {Array.from({ length: 2 }, (_, i) => (
                        <div key={i} className="skeleton h-[48px] min-w-[860px]" />
                      ))}
                    </>
                  )
                ) : history.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
                    No past or cancelled bookings.
                  </div>
                ) : (
                  history.map((req) => (
                    <RequestRow
                      key={req.id}
                      req={req}
                      expanded={expandedId === req.id}
                      onToggle={toggleExpand}
                      onCheckIn={doCheckIn}
                      onCheckOut={doCheckOut}
                      onRefresh={refreshNow}
                      working={workingId === req.id}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* The PIN dialog — one for both ends of the stay, green on the way in and
          blue on the way out. Driven by the booking it belongs to, so its
          countdown and attempts-left re-base themselves whenever a fresh PIN
          lands, and it closes itself once the stay has moved on. */}
      {/* Past the booked hour there is no code to type, so the same slot holds
          the one-press close instead — see `checkOutNoPin`. */}
      {pinBooking && checkOutNoPin && (
        <CheckOutNowDialog
          booking={pinBooking}
          busy={pinBusy}
          error={pinError}
          onConfirm={doCheckOutNow}
          onClose={() => {
            setPinBookingId(null);
            setPinError("");
          }}
        />
      )}
      {pinBooking && !checkOutNoPin && (
        <StayPinDialog
          booking={pinBooking}
          mode={pinMode}
          busy={pinBusy}
          error={pinError}
          // The server's own line about what closing this stay right now means.
          // Only worth showing when it changes the decision — an ordinary
          // departure on the booked day says nothing the host doesn't know.
          notice={
            pinMode === "out" && pinBooking.checkoutEarlyNow
              ? pinBooking.checkoutMessage
              : ""
          }
          onVerify={doVerifyPin}
          onResend={doResendPin}
          onClose={() => {
            setPinBookingId(null);
            setPinError("");
          }}
        />
      )}
    </div>
  );
}

function ColumnHeadings() {
  return (
    // The transparent border matches the bordered row cards below, so heading
    // and cell sit on the same left edge — see the guest table's own headings.
    <div
      className={`mt-6 grid ${ROW_MINW} ${ROW_GRID} border border-transparent px-4 text-[13px] text-muted`}
    >
      {COLUMNS.map((c, i) => (
        <span
          key={c || `col-${i}`}
          className={
            c === "" ? "text-right" : i === 2 ? GUESTS_INDENT : i === 3 ? STATUS_INDENT : ""
          }
        >
          {c || "Actions"}
        </span>
      ))}
    </div>
  );
}
