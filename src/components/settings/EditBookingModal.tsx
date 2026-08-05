"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Lock,
  Sparkles,
} from "lucide-react";
import {
  addToBooking,
  fetchBookingEditOptions,
  fetchChangesQuote,
  type AddonPayment,
  type Booking,
  type BookingEditOptions,
  type ChangesQuote,
} from "@/lib/api";
import { lastCheckInStarted, useServerWallClock } from "@/lib/booking";
import { COUNTRIES } from "@/lib/countries";
import { addDays, iso, prettyDate, shortRange } from "@/lib/bookingWindow";

const money = (n: number) => `$${n.toFixed(2)}`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/** Methods whose form is a card (number + expiry + CVV). Mirrors
 *  CARD_PAYMENT_METHODS in the backend's mutations.py — change both together. */
const CARD_METHODS = new Set(["Visa", "Mastercard", "Credit Card", "Debit Card"]);

const inputCls =
  "w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-muted/70";

/** Which door of the editor is open. */
type Tab = "services" | "nights";

/**
 * What one date on the calendar IS, to this booking.
 *
 * `last` outranks everything, and `gone` outranks all the rest — `own`
 * included. A night that has already begun cannot be bought, kept or given back
 * by anybody, so it is drawn as spent rather than as part of a stay still being
 * arranged; but the night the stay ENDS on is the landmark the whole screen is
 * read against ("where does the extension start?"), so it keeps its mark even
 * once its hour has passed and everything around it has gone grey.
 */
type DayState = "last" | "gone" | "own" | "taken" | "given" | "free" | "outside";

/** How each kind of date is drawn, and what it says when tapped or hovered. */
const DAY_LOOK: Record<DayState, { cls: string; title?: string }> = {
  last: {
    // Not selectable — it is already bought — so it is marked rather than
    // offered: the deepest green on the grid, ringed, with the date in bold.
    cls: "cursor-default border-green-600 bg-green-100 font-bold text-green-800 ring-1 ring-inset ring-green-600/35",
    title: "Your last night — the stay ends here. Add nights from the next date on.",
  },
  gone: {
    cls: "cursor-not-allowed border-transparent bg-transparent text-muted/45 line-through",
    title: "This night has already begun",
  },
  own: {
    cls: "border-green-500/40 bg-green-50 text-green-700",
    title: "Already yours",
  },
  taken: {
    cls: "cursor-not-allowed border-red-200 bg-red-50/70 text-red-400 line-through",
    title: "Not available — taken by someone else",
  },
  given: {
    cls: "border-dashed border-amber-400/70 bg-amber-50 text-amber-700 hover:border-primary/60 hover:bg-primary/[0.07]",
    title: "Cancelled by you — tap to take this night back",
  },
  free: {
    cls: "border-line text-ink hover:border-primary/60 hover:bg-primary/[0.07]",
  },
  outside: {
    cls: "cursor-not-allowed border-transparent bg-transparent text-muted/35",
    title: "Outside the host's open dates",
  },
};

/**
 * Every date of one month, with blanks for the days before the 1st — and
 * always six rows of them.
 *
 * The padding is what keeps the dialog still. A month that starts on a Saturday
 * needs six rows where the one before it needed five, and letting the grid
 * decide would make the whole panel jump by a row's height as the guest pages
 * through it, with the buttons at the foot moving under the cursor.
 */
function monthCells(year: number, month: number): (string | null)[] {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(iso(new Date(year, month, d)));
  while (cells.length < 42) cells.push(null);
  return cells;
}

/** Every date from `from` to `to` inclusive. */
function daysInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Changing a booking after it has been paid for.
 *
 * A stay is not finished with the moment it is booked. The guest may want the
 * airport pickup they skipped at checkout, or two more nights on the end — and
 * neither should mean cancelling and booking again, which costs a cancellation
 * fee and risks losing the villa in between. So this screen grows a booking:
 *
 *   * EXTRA SERVICES — the villa's add-ons this stay doesn't have yet. What it
 *     already has is never listed and never touched: this only ever adds. When
 *     there is nothing left to add, the option isn't offered at all rather than
 *     opening onto an empty list.
 *   * NIGHTS — picked off a calendar of the villa's own availability, with the
 *     nights this booking already holds marked as its own rather than as dates
 *     to buy again.
 *
 * Both are paid for, on the spot, with the card already on the booking or with
 * another method the host takes. Shortening the stay is the other direction and
 * lives where it always did — the cancel screen, with its refund ladder — which
 * this hands off to rather than duplicating.
 *
 * No money is ever worked out here. Every figure comes from the server's own
 * quote, priced by the same code the purchase runs, so what the guest reads is
 * exactly what the button does.
 */
export default function EditBookingModal({
  booking,
  onClose,
  onUpdated,
  onCancelDates,
}: {
  booking: Booking;
  onClose: () => void;
  /** The booking as the server returned it, plus the line to toast. */
  onUpdated: (updated: Booking, summary: string) => void;
  /** Hand over to the cancel screen — shortening a stay is priced there. */
  onCancelDates?: () => void;
}) {
  const [options, setOptions] = useState<BookingEditOptions | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("services");
  const [step, setStep] = useState<"choose" | "pay">("choose");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const uid = useId();
  // The server's clock, ticking. Once the stay's last arrival has come round
  // there is no plan left to change — only more of it to buy — so the screen
  // calls itself what it now is, and opens on the calendar rather than on a
  // list of services. Held in a ref as well, so the one-off load below can read
  // it without re-fetching every time the hour turns over.
  const now = useServerWallClock(booking.serverNow);
  const extendOnly = lastCheckInStarted(booking, now);
  const extendOnlyRef = useRef(extendOnly);
  extendOnlyRef.current = extendOnly;

  // --- What the guest has chosen ---
  const [picked, setPicked] = useState<string[]>([]);
  // The date the guest tapped on the calendar. Everything between the stay and
  // it is what gets added — see `selection` below, which is where that is
  // worked out; this is only the one date they chose.
  const [target, setTarget] = useState("");
  // Nights the guest had GIVEN UP and is taking back, tapped one at a time.
  //
  // Its own state, and not `target`, because it is its own gesture. A given-back
  // night sits inside the stay with nights kept either side of it, so "extend up
  // to here" cannot reach one without dragging its neighbours in; and a guest
  // reclaiming three separate nights is making three decisions, not replacing
  // one. Keeping them apart is also what stops a tap on the extend date from
  // wiping a reclaimed night, and the other way round.
  const [refill, setRefill] = useState<string[]>([]);
  const [cursor, setCursor] = useState<{ y: number; m: number } | null>(null);
  const [note, setNote] = useState("");

  // --- Payment ---
  const [useSaved, setUseSaved] = useState(true);
  const [method, setMethod] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cvv, setCvv] = useState("");
  const [detail, setDetail] = useState("");
  const [street, setStreet] = useState("");
  const [apartment, setApartment] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");

  // The last quote the server gave, tagged with the choice it was FOR — the
  // same arrangement the cancel screen uses. A quote is only ever shown against
  // its own selection, so changing the choice needs nothing cleared: the stale
  // figure simply stops matching and the summary says "working it out" until
  // the new one lands.
  //
  // ONE quote for both halves, because they are one purchase: a service bought
  // alongside two extra nights runs over those nights too, and no pair of
  // separate quotes could say so.
  const [priced, setPriced] = useState<{
    key: string;
    quote: ChangesQuote | null;
  } | null>(null);

  // Body scroll lock + Escape to close, matching the cancel dialog.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [busy, onClose]);

  // What may be added, read fresh: the booking in the list behind this dialog
  // may have been sitting there for an hour, and both the calendar and "which
  // nights haven't started" move with the clock.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const next = await fetchBookingEditOptions(booking.id);
        if (!live) return;
        setOptions(next);
        setTab(next.canAddServices && !extendOnlyRef.current ? "services" : "nights");
        // Paying with the card already on file is the default, and the only
        // option worth defaulting to — but a booking without one has to choose.
        setUseSaved(!!next.savedPaymentMethod);
        setMethod(next.acceptedPayments[0] || "");
        // Open on the month where something can be done: the stay's first night
        // that is still ahead of the guest, else the first date the villa is
        // open for. Never a month behind the window — on a stay under way that
        // would be a page of dates every one of which has already begun.
        const start =
          next.ownNights.find((d) => d >= next.firstDate) || next.firstDate;
        const [y, m] = start.split("-").map(Number);
        setCursor({ y, m: m - 1 });
      } catch (e) {
        if (live) setLoadError(e instanceof Error ? e.message : "Could not load this booking.");
      }
    })();
    return () => {
      live = false;
    };
  }, [booking.id]);

  const own = useMemo(() => new Set(options?.ownNights ?? []), [options]);
  const taken = useMemo(() => new Set(options?.unavailableDates ?? []), [options]);
  // Nights this guest gave back. Still free — that is what giving them back did
  // — so they are bookable like any other date; they are only drawn and tapped
  // differently, because to the person who gave them up they are not a stranger's
  // dates but their own, waiting.
  const given = useMemo(() => new Set(options?.cancelledNights ?? []), [options]);
  // The night the stay ends on — the date every extension is measured from.
  const lastNight = useMemo(() => {
    const nights = options?.ownNights ?? [];
    return nights.length ? nights[nights.length - 1] : "";
  }, [options]);

  const dayState = useCallback(
    (day: string): DayState => {
      if (!options) return "outside";
      // The stay's own last night, marked before anything else can grey it out.
      // It is where the guest reads the answer to "so where do I add from?", and
      // on a stay already under way every date around it has begun and gone
      // flat — which is precisely when the landmark is worth the most.
      if (day && day === lastNight) return "last";
      // A night that has already begun is spent, and it is spent for EVERYONE —
      // the guest's own nights included. `firstDate` is the villa's own answer
      // to "what is the earliest date anybody can still arrive for": today while
      // the check-in hour is ahead, tomorrow once it has passed. Drawing a night
      // behind that line in the green of "already yours" would offer a stay that
      // is being slept in as something still to be arranged. Asked ahead of
      // `own`, so a past night of this booking's own greys out with the rest —
      // only the last night above is allowed past it.
      if (day < options.firstDate) return "gone";
      if (own.has(day)) return "own";
      if (day > options.lastDate) return "outside";
      if (taken.has(day)) return "taken";
      // A given-back night the host is still open for and nobody else has taken.
      return given.has(day) ? "given" : "free";
    },
    [options, own, taken, given, lastNight]
  );

  /**
   * What the tapped date actually adds.
   *
   * One tap, not two: a guest extending a stay is not picking an arbitrary
   * window, they are saying "until here". So the run starts where their stay
   * ends — the night after its last, or the night before its first when they
   * tapped backwards — and reaches the date they chose, taking every free night
   * in between with it.
   *
   * Nights somebody else holds inside that stretch are simply left out. They
   * show as taken, they are not selected, and the server skips them too: the
   * stay extends around them and the guest checks out and back in, which is the
   * same bargain checkout strikes on a range with a clash in the middle.
   *
   * `from`/`to` are the SPAN — what the server is asked about, so a first night
   * that happens to be taken can still be skipped rather than making the whole
   * request look detached from the stay. `days` are the nights actually being
   * bought, which is what the calendar lights up.
   */
  const selection = useMemo(() => {
    const nights = options?.ownNights ?? [];
    if (!target) return { from: "", to: "", days: [] as string[] };
    let from = target;
    let to = target;
    if (nights.length) {
      const first = nights[0];
      const last = nights[nights.length - 1];
      if (target < first) to = addDays(first, -1);
      else if (target > last) from = addDays(last, 1);
      // A tap inside the stay's own span is a night in the gap of a split
      // stay — that one night, and nothing either side of it.
    }
    return {
      from,
      to,
      // A night the guest gave back is free like any other, so a range reaching
      // across one takes it: the range has to JOIN the stay, and a hole punched
      // in it where a given-back night sits would leave the rest detached. They
      // are only picked ONE AT A TIME when no range is reaching them, which is
      // every given-back night in the middle of a stay.
      days: daysInclusive(from, to).filter((d) => {
        const state = dayState(d);
        return state === "free" || state === "given";
      }),
    };
  }, [target, options, dayState]);

  // The range's own nights, and then everything being bought: the range plus the
  // given-back nights reclaimed one by one. Two gestures, one purchase.
  const ranged = useMemo(() => new Set(selection.days), [selection]);
  const nights = useMemo(
    () => [...new Set([...selection.days, ...refill])].sort(),
    [selection.days, refill]
  );
  const selected = useMemo(() => new Set(nights), [nights]);
  const checkIn = selection.from;
  const checkOut = selection.to ? addDays(selection.to, 1) : "";

  // --- Live pricing, a beat after the choice settles ---

  // The whole choice as one comparable value — services AND dates. Switching
  // tabs doesn't re-price anything: the guest hasn't changed what they're
  // buying, only which half of it they're looking at.
  const servicesKey = picked.join(",");
  const nightsKey = checkIn && checkOut ? `${checkIn}:${checkOut}` : "";
  // The reclaimed nights the range doesn't already cover — what the server has
  // to be told about separately.
  const extraKey = refill.filter((d) => !ranged.has(d)).sort().join(",");
  const choiceKey = `${servicesKey}|${nightsKey}|${extraKey}`;
  const chose = servicesKey !== "" || nightsKey !== "" || extraKey !== "";

  useEffect(() => {
    if (!chose) return;
    let live = true;
    const [names, dates, extras] = choiceKey.split("|");
    const [from = "", to = ""] = dates ? dates.split(":") : [];
    const timer = setTimeout(async () => {
      try {
        const quote = await fetchChangesQuote(
          booking.id,
          names ? names.split(",") : [],
          from,
          to,
          extras ? extras.split(",") : []
        );
        if (live) setPriced({ key: choiceKey, quote });
      } catch (e) {
        if (live) {
          setPriced({ key: choiceKey, quote: null });
          setError(e instanceof Error ? e.message : "Could not price that.");
        }
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [booking.id, choiceKey, chose]);

  const quote = priced?.key === choiceKey ? priced?.quote ?? null : null;
  // Nights being bought in this same breath. A service picked alongside them
  // runs over them too — the server prices it that way (see quote_services'
  // `extra_nights`), so the cards have to OFFER it that way or the guest reads
  // "× 3" on a card, pays for five and has to work out why. The server's own
  // count once a quote is in; the picker's until then, so the cards move the
  // moment a date is tapped rather than a beat later.
  const quoting = chose && !quote;
  const serviceQuote = quote?.services ?? null;
  const nightsQuote = quote?.nights ?? null;
  const addedNights = nightsQuote?.nightsCount ?? nights.length;
  const serviceNights = (options?.chargeableNights ?? 0) + addedNights;
  const amount = quote?.allowed ? quote.amount : 0;
  const ready = !!quote?.allowed && !quoting;

  // --- Choosing ---

  const toggleService = useCallback((name: string) => {
    setError("");
    setPicked((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }, []);

  /**
   * A tap on the calendar. Which of two things it means depends on the date.
   *
   * On a free date it is "extend my stay up to here", and one tap does the whole
   * run (see `selection`) — the gesture this screen has always had.
   *
   * On a night the guest GAVE BACK it is "I'll take that one again", and it
   * toggles just that night. They accumulate, one tap each, and they do not
   * touch the extend target: reclaiming three scattered nights is three
   * decisions, and picking a date to extend to must not undo them.
   *
   * A night that can't be had explains itself rather than silently doing
   * nothing.
   */
  const tapDay = useCallback(
    (day: string, kind: DayState) => {
      setError("");
      if (kind === "last") {
        setNote(`${prettyDate(day)} is your last night — add from the next date on.`);
        return;
      }
      if (kind === "gone") {
        setNote(`${prettyDate(day)} has already begun.`);
        return;
      }
      if (kind === "taken") {
        setNote(`${prettyDate(day)} is taken — pick a date past it and it's skipped.`);
        return;
      }
      if (kind === "outside") {
        setNote(`${prettyDate(day)} is outside the host's open dates.`);
        return;
      }
      if (kind === "own") {
        setNote(`${prettyDate(day)} is already yours.`);
        return;
      }
      if (kind === "given") {
        // Already swept up by the run the guest is extending over — toggling it
        // here would change nothing, so say that instead of doing nothing.
        if (ranged.has(day)) {
          setNote(`${prettyDate(day)} is already coming back with your new nights.`);
          return;
        }
        setRefill((prev) =>
          prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
        );
        setNote(
          refill.includes(day)
            ? ""
            : `${prettyDate(day)} added back — tap any others one by one.`
        );
        return;
      }
      setNote("");
      setTarget((prev) => (prev === day ? "" : day));
    },
    [ranged, refill]
  );

  // --- Paying ---

  function paymentProblem(): string {
    if (useSaved) return "";
    if (!method) return "Please choose a payment method.";
    if (CARD_METHODS.has(method)) {
      if (cardNumber.replace(/\D/g, "").length < 12) return "Enter a valid card number.";
      if (!expiration.trim()) return "Enter the card expiration date.";
      const digits = cvv.replace(/\D/g, "");
      if (digits.length < 3 || digits.length > 4) return "Enter a valid CVV.";
      if (!street.trim()) return "Enter your billing street name.";
      if (!city.trim()) return "Enter your billing city.";
      if (!country.trim()) return "Select your billing country or region.";
      return "";
    }
    if (!detail.includes("@")) {
      return method === "PayPal"
        ? "Enter the e-mail for your PayPal account."
        : "Enter your UPI ID (name@bank) or Google account e-mail.";
    }
    return "";
  }

  function payment(): AddonPayment {
    if (useSaved) return { useSaved: true };
    return {
      useSaved: false,
      paymentMethod: method,
      cardNumber,
      expiration,
      cvv,
      paymentDetail: detail,
      billingStreet: street,
      billingApartment: apartment,
      billingCity: city,
      billingState: state,
      billingZip: zip,
      billingCountry: country,
    };
  }

  async function submit() {
    if (busy || !ready) return;
    const problem = paymentProblem();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const names = (serviceQuote?.services ?? []).map((s) => s.name);
      const updated = await addToBooking(
        booking.id,
        names,
        checkIn,
        checkOut,
        payment(),
        refill.filter((d) => !ranged.has(d))
      );
      // One line for one purchase, however many halves it had.
      const nights = nightsQuote?.nightsCount ?? 0;
      const bought = [
        nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "",
        names.length ? `${names.length} service${names.length === 1 ? "" : "s"}` : "",
      ].filter(Boolean);
      onUpdated(updated, `${bought.join(" and ")} added — ${money(amount)} charged.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That payment could not be completed.");
      setBusy(false);
    }
  }

  if (typeof document === "undefined") return null;

  const canServices = !!options?.canAddServices;
  const canNights = !!options?.canAddNights;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[110] overflow-y-auto overscroll-contain"
    >
      <div
        aria-hidden
        onClick={() => !busy && onClose()}
        className="animate-fade-in fixed inset-0 bg-ink/45 backdrop-blur-[2px]"
      />

      <div className="relative flex min-h-full items-center justify-center px-5 py-6">
        <div className="animate-toast-in relative w-full max-w-[860px] overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(20,20,45,0.45)]">
          {/* Header. A wash of the brand colour rather than plain white: this is
              the one band the guest sees on every screen of the dialog, and it
              is what makes the panel read as one thing rather than three stacked
              boxes. */}
          <div className="flex items-center gap-3.5 border-b border-line bg-gradient-to-r from-primary/[0.09] via-primary/[0.035] to-transparent px-6 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-[0_1px_3px_rgba(20,20,45,0.12)] ring-1 ring-primary/15">
              <CalendarPlus size={19} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[16px] font-bold leading-tight text-ink">
                {step === "pay"
                  ? "Confirm and pay"
                  : extendOnly
                    ? "Extend stay"
                    : "Edit booking"}
              </h2>
              <p className="mt-0.5 truncate text-[12.5px] text-body">
                {booking.villaTitle} · {shortRange(booking.checkIn, booking.checkOut)}
              </p>
            </div>
            {/* Where the guest is in the two steps. Two words and a rule between
                them — enough to say "there is one more screen after this", which
                is the only thing a two-step flow has to promise. */}
            {options && (canServices || canNights) && (
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <StepDot label="Choose" done={step === "pay"} active={step === "choose"} />
                <span className="h-px w-5 bg-line" aria-hidden />
                <StepDot label="Pay" active={step === "pay"} />
              </div>
            )}
          </div>

          {/* Every state below stands in the same box. The dialog's height is
              settled by its tallest screen and never moves after that: a panel
              that grew as the guest paged the calendar, or shrank when they
              reached payment, walked the buttons out from under the cursor. */}
          {!options && !loadError && (
            <p className="flex items-center justify-center gap-2 px-6 py-10 text-[13.5px] text-body md:min-h-[418px]">
              <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
              Loading…
            </p>
          )}

          {loadError && (
            <p
              className="flex items-center justify-center gap-2 px-6 py-10 text-[13.5px] text-red-600 md:min-h-[418px]"
              role="alert"
            >
              <AlertTriangle size={16} className="shrink-0" aria-hidden />
              {loadError}
            </p>
          )}

          {options && !canServices && !canNights && (
            <div className="flex px-6 py-10 md:min-h-[418px] md:items-center md:justify-center">
              <p className="max-w-[420px] text-center text-[13.5px] leading-6 text-body">
                {options.blockedReason ||
                  "There is nothing left to add to this booking."}
              </p>
            </div>
          )}

          {options && (canServices || canNights) && (
            <>
              {/* Which door. A tab is only ever drawn when it opens onto
                  something: a guest who already has every extra service the
                  villa offers is not shown an empty picker, they are shown the
                  calendar. */}
              {/* Rendered on the payment screen too, greyed out rather than
                  taken away — a strip that disappears is 41px of height the
                  dialog would lose the moment the guest pressed Continue. */}
              <div className="flex gap-1 border-b border-line px-6 pb-3 pt-3.5">
                {canServices && (
                  <TabButton
                    active={tab === "services"}
                    disabled={step === "pay"}
                    onClick={() => {
                      setTab("services");
                      setError("");
                    }}
                    icon={<Sparkles size={14} aria-hidden />}
                    label="Add extra services"
                    // What is picked HERE, shown on the tab — the two halves are
                    // paid for together, so the one the guest isn't looking at
                    // must still say that it's in the total.
                    count={picked.length}
                  />
                )}
                {canNights && (
                  <TabButton
                    active={tab === "nights"}
                    disabled={step === "pay"}
                    onClick={() => {
                      setTab("nights");
                      setError("");
                    }}
                    icon={<CalendarPlus size={14} aria-hidden />}
                    label="Add nights"
                    count={nightsQuote?.nightsCount ?? nights.length}
                  />
                )}
              </div>

              {/* Nothing inside this dialog scrolls. Every panel is written to
                  fit — the calendar especially, because a grid you have to
                  scroll to reach the end of the month hides the date you were
                  looking for. `min-h` rather than `h`: it holds the buttons
                  still at the height the calendar needs, and gives rather than
                  clips on the rare payment form that runs longer. */}
              <div className="px-6 py-4 md:flex md:min-h-[418px] md:items-start md:gap-6">
                <div className="min-w-0 md:flex-1">
                  {step === "pay" ? (
                    <PaymentStep
                      options={options}
                      uid={uid}
                      useSaved={useSaved}
                      setUseSaved={(v) => {
                        setUseSaved(v);
                        setError("");
                      }}
                      method={method}
                      setMethod={(v) => {
                        setMethod(v);
                        setError("");
                      }}
                      cardNumber={cardNumber}
                      setCardNumber={setCardNumber}
                      expiration={expiration}
                      setExpiration={setExpiration}
                      cvv={cvv}
                      setCvv={setCvv}
                      detail={detail}
                      setDetail={setDetail}
                      street={street}
                      setStreet={setStreet}
                      apartment={apartment}
                      setApartment={setApartment}
                      city={city}
                      setCity={setCity}
                      state={state}
                      setState={setState}
                      zip={zip}
                      setZip={setZip}
                      country={country}
                      setCountry={setCountry}
                    />
                  ) : tab === "services" ? (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                          Add services
                        </p>
                        <p className="text-[11.5px] text-muted">
                          Per night ·{" "}
                          <span className="font-semibold text-body">
                            {plural(serviceNights, "night")}
                          </span>
                        </p>
                      </div>
                      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
                        {options.availableServices.map((service) => (
                          <ServiceChoice
                            key={service.name}
                            name={service.name}
                            price={service.price}
                            nights={serviceNights}
                            picked={picked.includes(service.name)}
                            busy={busy}
                            onTap={() => toggleService(service.name)}
                          />
                        ))}
                      </div>
                      {booking.extraServices?.length > 0 && (
                        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
                          <Lock size={11} aria-hidden />
                          Already yours:
                          {booking.extraServices.map((s) => (
                            <span
                              key={s.name}
                              className="rounded-md border border-line bg-page px-1.5 py-0.5 font-medium text-body"
                            >
                              {s.name}
                            </span>
                          ))}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-[12.5px] font-semibold uppercase tracking-[0.05em] text-muted">
                          Pick the nights
                        </p>
                        <p className="text-[11.5px] text-muted">
                          Tap the date to stay until
                        </p>
                      </div>
                      {cursor && (
                        <Calendar
                          cursor={cursor}
                          setCursor={setCursor}
                          options={options}
                          lastNight={lastNight}
                          dayState={dayState}
                          selected={selected}
                          onTap={tapDay}
                          busy={busy}
                        />
                      )}
                      {note && (
                        <p
                          className="mt-2 rounded-lg bg-page px-2.5 py-1.5 text-[11.5px] leading-[15px] text-body"
                          role="status"
                        >
                          {note}
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* What it costs. Every number here is the server's. Set apart
                    from the picker beside it by a tinted card with its own
                    heading — the money is the answer, not another control. */}
                <div className="mt-4 md:mt-0 md:w-[286px] md:shrink-0">
                  <div className="overflow-hidden rounded-xl border border-line bg-gradient-to-b from-page to-white shadow-[0_1px_2px_rgba(20,20,45,0.04)]">
                    <p className="border-b border-line/70 px-4 py-2 text-[10.5px] font-bold uppercase tracking-[0.07em] text-muted">
                      What you&apos;re adding
                    </p>
                    <div className="px-4 py-3">
                      <Summary quoting={quoting} quote={quote} chose={chose} />
                    </div>
                  </div>

                  {error && (
                    <p
                      className="mt-3 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium leading-5 text-red-600"
                      role="alert"
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
                      {error}
                    </p>
                  )}

                  {step === "choose" && onCancelDates && (
                    <button
                      type="button"
                      onClick={onCancelDates}
                      className="mt-3 w-full rounded-xl border border-dashed border-line px-3.5 py-2 text-left text-[11.5px] leading-[16px] text-muted transition-colors hover:border-primary/40 hover:bg-primary/[0.03] hover:text-body"
                    >
                      <span className="block font-semibold text-body">
                        Want fewer nights?
                      </span>
                      Cancel dates instead.
                    </button>
                  )}
                </div>
              </div>

              {/* Actions. On the page's own tint rather than white, so the foot
                  of the dialog reads as a bar the buttons sit in. */}
              <div className="flex items-center justify-end gap-3 border-t border-line bg-page/60 px-6 py-3.5">
                <button
                  type="button"
                  onClick={() => (step === "pay" ? setStep("choose") : onClose())}
                  disabled={busy}
                  className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] font-semibold text-body transition-colors hover:border-primary/40 hover:text-ink disabled:opacity-60"
                >
                  {step === "pay" ? "Back" : "Close"}
                </button>
                <button
                  type="button"
                  onClick={() => (step === "pay" ? submit() : setStep("pay"))}
                  disabled={busy || !ready}
                  aria-busy={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white shadow-[0_2px_8px_-2px_rgba(93,63,211,0.55)] transition-all hover:bg-primary-dark hover:shadow-[0_4px_12px_-2px_rgba(93,63,211,0.6)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
                >
                  {busy && <span className="spinner" aria-hidden />}
                  {busy
                    ? "Paying…"
                    : step === "pay"
                      ? `Pay ${money(amount)}`
                      : ready
                        ? `Continue · ${money(amount)}`
                        : "Continue"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** One of the two steps, in the header: a dot and its word. */
function StepDot({
  label,
  active = false,
  done = false,
}: {
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11.5px] font-semibold ${
        active ? "text-primary" : done ? "text-body" : "text-muted"
      }`}
    >
      <span
        className={`flex h-[15px] w-[15px] items-center justify-center rounded-full text-[9px] font-bold ${
          active
            ? "bg-primary text-white"
            : done
              ? "bg-primary/15 text-primary"
              : "bg-ink/[0.07] text-muted"
        }`}
        aria-hidden
      >
        {done ? <Check size={9} strokeWidth={3.5} /> : "•"}
      </span>
      {label}
    </span>
  );
}

function TabButton({
  active,
  disabled = false,
  onClick,
  icon,
  label,
  count = 0,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  /** How many things are picked on this tab — shown so the half the guest
   *  isn't looking at still says that it's in the total below. */
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      // A pill rather than an underline: two doors side by side read as a choice
      // when one of them is filled in, and as a heading when both are just text.
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-45 ${
        active
          ? "bg-primary/10 text-primary ring-1 ring-inset ring-primary/20"
          : "text-body hover:bg-ink/[0.04] hover:text-ink"
      }`}
    >
      {icon}
      {label}
      {count > 0 && (
        <span
          className={`min-w-[17px] rounded-full px-1 py-px text-center text-[10px] font-bold tabular-nums ${
            active ? "bg-primary text-white" : "bg-ink/10 text-body"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** One add-on the guest can buy, with what it would cost over the nights it
 *  would actually run for. */
function ServiceChoice({
  name,
  price,
  nights,
  picked,
  busy,
  onTap,
}: {
  name: string;
  price: number;
  nights: number;
  picked: boolean;
  busy: boolean;
  onTap: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={picked}
      disabled={busy}
      onClick={onTap}
      className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors disabled:opacity-60 ${
        picked ? "border-primary bg-primary/[0.05]" : "border-line hover:border-primary/40"
      }`}
    >
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink">{name}</span>
        <span className="mt-0.5 block text-[11.5px] text-muted">
          {money(price)} × {nights} night{nights === 1 ? "" : "s"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-[13px] font-bold text-ink">{money(price * nights)}</span>
        <span
          className={`flex h-[18px] w-[18px] items-center justify-center rounded border ${
            picked ? "border-primary bg-primary text-white" : "border-line"
          }`}
          aria-hidden
        >
          {picked && <Check size={12} strokeWidth={3} />}
        </span>
      </span>
    </button>
  );
}

/**
 * The villa's calendar, drawn for THIS booking: the nights it already holds are
 * its own rather than dates somebody has taken, and everything else is either
 * free to add, taken by someone else, or outside the host's window.
 */
function Calendar({
  cursor,
  setCursor,
  options,
  lastNight,
  dayState,
  selected,
  onTap,
  busy,
}: {
  cursor: { y: number; m: number };
  setCursor: (next: { y: number; m: number }) => void;
  options: BookingEditOptions;
  /** The night the stay ends on — marked, and always reachable by paging. */
  lastNight: string;
  dayState: (day: string) => DayState;
  selected: Set<string>;
  onTap: (day: string, state: DayState) => void;
  busy: boolean;
}) {
  // The months worth paging through: from the first date anybody can still
  // arrive for — or the month the stay ENDS in, when that is further back — to
  // the last the host is open for. No further than that: every date behind the
  // window has begun, and a month of them is a page with nothing on it to press.
  // The stay's last night is the exception, because it is the one thing on such a
  // page worth walking back to see.
  const floor = lastNight && lastNight < options.firstDate ? lastNight : options.firstDate;
  const first = floor.slice(0, 7);
  const last = options.lastDate.slice(0, 7);
  const current = `${cursor.y}-${String(cursor.m + 1).padStart(2, "0")}`;
  const shift = (by: number) => {
    const next = new Date(cursor.y, cursor.m + by, 1);
    setCursor({ y: next.getFullYear(), m: next.getMonth() });
  };

  return (
    // Deliberately tight, and it NEVER scrolls: six rows of dates, a month bar,
    // a weekday strip and a legend all sit inside the panel's height. A calendar
    // you have to scroll to reach the end of the month is a calendar that hides
    // the date you were looking for. Always six rows (see `monthCells`), so
    // paging months moves nothing.
    <div className="mt-2 overflow-hidden rounded-xl border border-line shadow-[0_1px_2px_rgba(20,20,45,0.04)]">
      {/* The month bar sits on its own tinted strip so the grid below reads as
          the calendar and this reads as the control over it. */}
      <div className="flex items-center justify-between border-b border-line bg-page/70 px-2.5 py-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={busy || current <= first}
          aria-label="Previous month"
          className="rounded-lg border border-line bg-white p-1 text-body transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-35 disabled:hover:border-line disabled:hover:text-body"
        >
          <ChevronLeft size={15} aria-hidden />
        </button>
        <p className="text-[13px] font-bold tracking-[0.01em] text-ink">
          {MONTHS[cursor.m]}{" "}
          <span className="font-medium text-muted">{cursor.y}</span>
        </p>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={busy || current >= last}
          aria-label="Next month"
          className="rounded-lg border border-line bg-white p-1 text-body transition-colors hover:border-primary/50 hover:text-primary disabled:opacity-35 disabled:hover:border-line disabled:hover:text-body"
        >
          <ChevronRight size={15} aria-hidden />
        </button>
      </div>

      <div className="px-2.5 pb-2.5 pt-2">
        <div className="grid grid-cols-7 gap-[3px] text-center text-[10px] font-bold uppercase tracking-[0.06em] text-muted/80">
          {WEEKDAYS.map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>

        <div className="mt-1 grid grid-cols-7 gap-[3px]">
          {monthCells(cursor.y, cursor.m).map((day, i) => {
            if (!day) return <span key={`blank-${i}`} />;
            const state = dayState(day);
            const on = selected.has(day);
            const look = DAY_LOOK[state];
            const dim =
              state === "outside" ||
              state === "taken" ||
              state === "gone" ||
              state === "last";
            return (
              <button
                key={day}
                type="button"
                disabled={busy}
                aria-pressed={on}
                aria-disabled={dim}
                onClick={() => onTap(day, state)}
                title={look.title}
                // Green is "already yours", red is "you can't have this", amber
                // is "you gave this one back — it's still here", plain grey is a
                // night already behind us, and the brand colour is what this tap
                // is buying. None is confusable with another at a glance, which
                // is the whole job of this grid. A date being ADDED is lifted off
                // the page, so the run just picked reads as one block rather than
                // as seven separate purple squares.
                className={`h-8 rounded-lg border text-[12px] font-semibold tabular-nums transition-all disabled:opacity-60 ${
                  on
                    ? "border-primary bg-primary text-white shadow-[0_1px_3px_rgba(93,63,211,0.35)] ring-1 ring-inset ring-white/25"
                    : look.cls
                }`}
              >
                {Number(day.slice(-2))}
              </button>
            );
          })}
        </div>

        <ul className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line/70 pt-2 text-[10.5px] font-medium text-muted">
          <LegendItem className="border-line bg-white" label="Free" />
          <LegendItem className="border-primary bg-primary" label="Adding" />
          <LegendItem className="border-green-500/40 bg-green-50" label="Yours" />
          <LegendItem className="border-green-600 bg-green-100" label="Last night" />
          {/* Only worth a chip when there is one on the calendar to explain. */}
          {options.cancelledNights?.length > 0 && (
            <LegendItem
              className="border-dashed border-amber-400/70 bg-amber-50"
              label="Cancelled by you"
            />
          )}
          <LegendItem className="border-red-200 bg-red-50" label="Taken" />
        </ul>
      </div>
    </div>
  );
}

function LegendItem({ className, label }: { className: string; label: string }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-page/80 px-2 py-[3px]">
      <span className={`h-2.5 w-2.5 rounded-[3px] border ${className}`} aria-hidden />
      {label}
    </li>
  );
}

/** What the choice costs — the server's own breakdown, or the reason there
 *  isn't one. */
/**
 * What the whole choice costs — both halves of it, under ONE total.
 *
 * Never per tab. A guest who has picked two nights and breakfast is buying both
 * and paying once, so switching tabs must not change the figure they are
 * looking at: what changes is which list they are editing, and the summary
 * stays the summary of everything.
 */
function Summary({
  quoting,
  quote,
  chose,
}: {
  quoting: boolean;
  quote: ChangesQuote | null;
  chose: boolean;
}) {
  if (!chose) {
    return (
      <p className="text-[12.5px] leading-[18px] text-muted">
        Pick nights or services to see the price.
      </p>
    );
  }
  if (quoting) {
    return (
      <p className="flex items-center gap-2 text-[12.5px] text-body">
        <Loader2 size={14} className="animate-spin text-primary" aria-hidden /> Working
        it out…
      </p>
    );
  }
  if (!quote) return null;
  if (!quote.allowed) {
    return (
      <p className="flex items-start gap-2 text-[13px] leading-5 text-red-600">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
        {quote.error}
      </p>
    );
  }

  const nights = quote.nights;
  const services = quote.services;
  return (
    <div>
      {nights && (
        <>
          <Line
            label={`${nights.nightsCount} night${nights.nightsCount === 1 ? "" : "s"}`}
            value={money(nights.accommodation)}
          />
          <Line label="Service fee" value={money(nights.serviceFee)} />
          <Line label="Tax" value={money(nights.tax)} />
          {nights.services.map((s) => (
            <Line
              key={`carried-${s.name}`}
              label={`${s.name} (${money(s.price)} × ${s.nights ?? 0})`}
              value={money(s.amount ?? 0)}
            />
          ))}
        </>
      )}
      {services?.services.map((s) => (
        <Line
          key={s.name}
          label={`${s.name} (${money(s.price)} × ${s.nights ?? 0})`}
          value={money(s.amount ?? 0)}
        />
      ))}

      <Total value={money(quote.amount)} />

      {nights && nights.skipped.length > 0 && (
        <p className="mt-2 text-[11.5px] leading-[16px] text-red-600">
          {nights.skipped.length} night{nights.skipped.length === 1 ? "" : "s"} taken
          and skipped.
        </p>
      )}
      {nights && nights.kept.length > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-[16px] text-muted">
          {nights.kept.length} already yours — not charged again.
        </p>
      )}
      {nights && (
        <p className="mt-2 border-t border-line/70 pt-2 text-[11.5px] leading-[16px] text-muted">
          Stay becomes{" "}
          <span className="font-semibold text-body">
            {shortRange(nights.checkIn, nights.checkOut)}
          </span>{" "}
          · {plural(nights.totalNights, "night")}
        </p>
      )}
    </div>
  );
}

/** How the addition is paid for: the card already on the booking, or another
 *  method this host takes — validated exactly as checkout validates one. */
function PaymentStep({
  options,
  uid,
  useSaved,
  setUseSaved,
  method,
  setMethod,
  cardNumber,
  setCardNumber,
  expiration,
  setExpiration,
  cvv,
  setCvv,
  detail,
  setDetail,
  street,
  setStreet,
  apartment,
  setApartment,
  city,
  setCity,
  state,
  setState,
  zip,
  setZip,
  country,
  setCountry,
}: {
  options: BookingEditOptions;
  uid: string;
  useSaved: boolean;
  setUseSaved: (v: boolean) => void;
  method: string;
  setMethod: (v: string) => void;
  cardNumber: string;
  setCardNumber: (v: string) => void;
  expiration: string;
  setExpiration: (v: string) => void;
  cvv: string;
  setCvv: (v: string) => void;
  detail: string;
  setDetail: (v: string) => void;
  street: string;
  setStreet: (v: string) => void;
  apartment: string;
  setApartment: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  state: string;
  setState: (v: string) => void;
  zip: string;
  setZip: (v: string) => void;
  country: string;
  setCountry: (v: string) => void;
}) {
  const isCard = CARD_METHODS.has(method);
  return (
    <div>
      <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">
        Pay using
      </p>

      {options.savedPaymentMethod && (
        <button
          type="button"
          role="radio"
          aria-checked={useSaved}
          onClick={() => setUseSaved(true)}
          className={`mt-3 flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
            useSaved ? "border-primary bg-primary/[0.05]" : "border-line hover:border-primary/40"
          }`}
        >
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-ink">
              Same as this booking
            </span>
            <span className="mt-0.5 block truncate text-[12px] text-muted">
              {options.savedPaymentMethod}
              {options.savedPaymentReference ? ` · ${options.savedPaymentReference}` : ""}
            </span>
          </span>
          {useSaved && <Check size={16} className="shrink-0 text-primary" aria-hidden />}
        </button>
      )}

      {options.acceptedPayments.length > 0 && (
        <>
          <p className="mt-3 text-[12px] text-muted">
            {options.savedPaymentMethod ? "Or pay another way" : "Choose a payment method"}
          </p>
          <div
            role="radiogroup"
            aria-label="Payment method"
            className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4"
          >
            {options.acceptedPayments.map((m) => {
              const on = !useSaved && method === m;
              return (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setUseSaved(false);
                    setMethod(m);
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-[12.5px] transition-colors ${
                    on
                      ? "border-primary bg-primary/[0.05] font-semibold text-ink"
                      : "border-line text-body hover:border-primary/40"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </>
      )}

      {!useSaved && isCard && (
        <>
          <div className="mt-2.5 overflow-hidden rounded-xl border border-line">
            <div className="px-4 py-2">
              <input
                id={`${uid}-card`}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                inputMode="numeric"
                autoComplete="cc-number"
                maxLength={19}
                placeholder="Card number *"
                aria-label="Card number"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 border-t border-line">
              <div className="border-r border-line px-4 py-2">
                <input
                  id={`${uid}-exp`}
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  placeholder="MM/YY *"
                  aria-label="Expiration"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  maxLength={5}
                  className={inputCls}
                />
              </div>
              <div className="px-4 py-2">
                <input
                  id={`${uid}-cvv`}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="CVV *"
                  aria-label="CVV"
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  maxLength={4}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          <p className="mt-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
            Billing address
          </p>
          <div className="mt-2 overflow-hidden rounded-xl border border-line">
            <div className="px-4 py-2">
              <input
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Street name *"
                aria-label="Street name"
                autoComplete="address-line1"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 border-t border-line">
              <div className="border-r border-line px-4 py-2">
                <input
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                  placeholder="Apartment"
                  aria-label="Apartment"
                  autoComplete="address-line2"
                  className={inputCls}
                />
              </div>
              <div className="px-4 py-2">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City *"
                  aria-label="City"
                  autoComplete="address-level2"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 border-t border-line">
              <div className="border-r border-line px-4 py-2">
                <input
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="State"
                  aria-label="State"
                  autoComplete="address-level1"
                  className={inputCls}
                />
              </div>
              <div className="px-4 py-2">
                <input
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="Zip code"
                  aria-label="Zip code"
                  autoComplete="postal-code"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="border-t border-line px-4 py-2">
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Country or region"
                autoComplete="country-name"
                className={`${inputCls} ${country ? "" : "text-muted/70"}`}
              >
                <option value="">Country or region *</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

      {!useSaved && !isCard && method && (
        <div className="mt-3 overflow-hidden rounded-xl border border-line px-4 py-2">
          <input
            id={`${uid}-detail`}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={
              method === "PayPal"
                ? "PayPal e-mail *"
                : "UPI ID (name@bank) or Google e-mail *"
            }
            aria-label={method === "PayPal" ? "PayPal e-mail" : "UPI ID or Google e-mail"}
            autoComplete="email"
            className={inputCls}
          />
        </div>
      )}

      <p className="mt-3 text-[11.5px] leading-[17px] text-muted">
        You&apos;re paying only for what you&apos;re adding. The rest of the booking
        is untouched.
      </p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="min-w-0 truncate text-[12.5px] text-body">{label}</span>
      <span className="shrink-0 text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}

function Total({ value }: { value: string }) {
  return (
    <div className="mt-2.5 flex items-center justify-between rounded-lg bg-primary/[0.07] px-2.5 py-2">
      <span className="text-[12.5px] font-semibold text-ink">To pay now</span>
      <span className="text-[16px] font-bold tabular-nums text-primary">{value}</span>
    </div>
  );
}
