"use client";

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Check, Pencil, PartyPopper, ArrowRight, Moon } from "lucide-react";
import Img from "@/components/ui/Img";
import { useAuth } from "@/lib/auth";
import { useWelcomeOffer } from "@/lib/welcome";
import {
  fetchVilla,
  fetchBookingWindow,
  createBooking,
  fetchSavedPayments,
  type SavedPayment,
  validateCoupon,
  type Villa,
} from "@/lib/api";
import {
  slideWindow,
  splitStay,
  skippedNightsText,
  stayProblem,
  maxCheckOutFor,
  firstBookableDate,
  prettyDate,
  prettyTime,
  addDays as addIsoDays,
  type BookingWindow,
} from "@/lib/bookingWindow";
import { REFUND_TIERS } from "@/lib/booking";
import DateField from "@/components/ui/DateField";
import { villaCover } from "@/lib/home";
import { computeStayPricing, TAX_RATE } from "@/lib/pricing";
import { DIAL_CODES, splitContact, joinContact } from "@/lib/phone";
import PageHeader, { pageHeaderAction } from "@/components/ui/PageHeader";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia",
  "Germany", "France", "Spain", "Italy", "Netherlands", "United Arab Emirates",
  "Singapore", "Japan", "China", "Brazil", "Mexico", "South Africa",
  "New Zealand", "Switzerland", "Sweden", "Norway", "Ireland", "Portugal",
  "Colombia", "Argentina", "Other",
];

const money = (n: number) => `$${n.toFixed(2)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// The day of the week an ISO date falls on — "Tue". From a fixed table for the
// same reason as MONTHS: it must read identically wherever the page renders.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtWeekday(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y) return "";
  return WEEKDAYS[new Date(y, m - 1, d).getDay()];
}
// "Feb 01" — spelled out from a fixed table rather than toLocaleDateString,
// whose output depends on the locale of whoever renders it.
function fmtShort(d: Date) {
  return `${MONTHS[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}
const addDays = (d: Date, n: number) => {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
};
const isoDate = (d: Date) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

// Luhn checksum — validates a card number's structure (not that it's a real card).
function luhnValid(digits: string): boolean {
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Types as "MM/YY": the slash lands on its own after the month, a lone digit
// that can't start a month (2-9) is padded to "0X", and an out-of-range month
// is clamped. `deleting` keeps backspace from re-adding the slash it just ate.
function formatExpiry(raw: string, deleting: boolean): string {
  let d = onlyDigits(raw).slice(0, 4);
  if (d.length === 1 && d > "1") d = "0" + d;
  if (d.length >= 2) {
    const n = parseInt(d.slice(0, 2), 10);
    const mm = n === 0 ? "01" : n > 12 ? "12" : d.slice(0, 2);
    d = mm + d.slice(2);
  }
  if (d.length < 2) return d;
  if (d.length === 2) return deleting ? d : d + "/";
  return `${d.slice(0, 2)}/${d.slice(2)}`;
}

// "" when the expiration is usable, otherwise the reason it isn't.
function expiryError(value: string): string {
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(value.trim());
  if (!m) return "Enter the expiration as MM/YY.";
  const month = parseInt(m[1], 10);
  const year = 2000 + parseInt(m[2], 10);
  if (month < 1 || month > 12) return "Month must be between 01 and 12.";
  const now = new Date();
  // A card is valid through the last day of its printed month.
  if (new Date(year, month, 1) <= now) return "This card has expired.";
  if (year > now.getFullYear() + 20) return "Enter a valid expiration year.";
  return "";
}

// Which field a validation message belongs to, so it can be marked invalid.
type FieldKey =
  // Not an input: the open date editor, which has to be closed with Done
  // before the stay it would change can be paid for.
  | "dates"
  | "method"
  | "cardType"
  | "cardNumber"
  | "expiration"
  | "cvv"
  | "paypalEmail"
  | "paypalPass"
  | "gpayId"
  | "street"
  | "city"
  | "country"
  | "email";

// The four methods a host can offer, and which of them are card-based (so the
// checkout knows to show card fields vs. a PayPal / Google Pay flow instead).
const KNOWN_METHODS = ["Visa", "Mastercard", "Google Pay", "PayPal"];
const CARD_METHODS = new Set(["Visa", "Mastercard"]);
const isCardMethod = (m: string) => CARD_METHODS.has(m);

// A guest's Google Pay handle: either a UPI id ("name@bank") or a Google
// account e-mail. Both are "something@something", so one shape check covers it.
const isGpayId = (s: string) => /^[^\s@]+@[^\s@]+$/.test(s.trim());

// The selected card brand must match the number the guest typed — Visa starts
// with 4, Mastercard with 51-55 or 2221-2720. Returns "" when it fits.
function cardBrandError(method: string, digits: string): string {
  if (method === "Visa" && digits[0] !== "4")
    return "A Visa card number starts with 4.";
  if (method === "Mastercard" && !/^(5[1-5]|2[2-7])/.test(digits))
    return "Enter a valid Mastercard number.";
  return "";
}

// `useSearchParams` makes this subtree client-rendered, so it needs a boundary.
export default function BookVillaPage() {
  return (
    <Suspense fallback={<BookSkeleton />}>
      <BookVillaContent />
    </Suspense>
  );
}

function BookVillaContent() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, ready, openAuth } = useAuth();
  const uid = useId();

  // Trip params come from the Reserve button (?guests=&checkIn=&checkOut=).
  // Read through the router hook, not window.location: the server has no
  // window, so the fallback branch below would render there and the client
  // would then hydrate with different dates AND a different total.
  const guests = Math.max(1, parseInt(searchParams.get("guests") || "1", 10) || 1);
  const qCheckIn = searchParams.get("checkIn");
  const qCheckOut = searchParams.get("checkOut");
  const qNights = searchParams.get("nights");

  const urlDates = useMemo(() => {
    const parseISO = (s: string | null) => {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      const d = new Date(s + "T00:00:00");
      return Number.isNaN(d.getTime()) ? null : d;
    };
    const start = parseISO(qCheckIn);
    const end = parseISO(qCheckOut);
    if (!start || !end || end <= start) return null;
    return { start, end };
  }, [qCheckIn, qCheckOut]);

  // Older links carry no dates at all, so they fall back to "today + N nights".
  // "Today" is local to the browser and must not be resolved during render.
  const [fallbackDates, setFallbackDates] = useState<{ start: Date; end: Date } | null>(null);
  useEffect(() => {
    if (urlDates) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const n = Math.max(1, parseInt(qNights || "3", 10) || 3);
    setFallbackDates({ start, end: addDays(start, n) });
  }, [urlDates, qNights]);

  const dates = urlDates ?? fallbackDates;

  // Both results are tagged with the id they belong to, so a slow response for
  // a previous id can neither win nor leak into the next one.
  // `undefined` = still loading, `null` = the villa genuinely doesn't exist.
  const [loaded, setLoaded] = useState<{ id: string; villa: Villa | null } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const v = loaded?.id === id ? loaded.villa : undefined;
  const loadError = failure?.id === id ? failure.message : "";

  // Payment form state
  // Which of the host's offered methods the guest is paying with. Set to the
  // first accepted method once the villa loads (see the effect below).
  const [method, setMethod] = useState("");
  // Ways this guest has paid before, and whether they've chosen to pay that way
  // again — in which case none of the card/account fields below are read (the
  // server looks the details up from their own bookings).
  const [savedPayments, setSavedPayments] = useState<SavedPayment[]>([]);
  const [useSaved, setUseSaved] = useState(false);
  const [cardType, setCardType] = useState("Credit Card or Debit Card");
  const [cardNumber, setCardNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  // Shown under the expiration cell as soon as a complete MM/YY is bad, so the
  // user doesn't have to reach Confirm to find out.
  const [expError, setExpError] = useState("");
  const [cvv, setCvv] = useState("");
  const [street, setStreet] = useState("");
  const [apartment, setApartment] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  // The dialling code for the phone, auto-filled from the saved profile contact.
  const [phoneCode, setPhoneCode] = useState("");

  // PayPal / Google Pay credentials — only one set is used, depending on the
  // method the guest picks. Kept separate from the card fields so switching
  // methods never carries stale card digits into a PayPal booking.
  const [paypalEmail, setPaypalEmail] = useState("");
  const [paypalPass, setPaypalPass] = useState("");
  const [gpayId, setGpayId] = useState("");

  // Coupon: what the guest typed, and the applied discount once it validates.
  // `applied` holds the server-confirmed code + amount off for these nights.
  // Extra services the guest ticked (by name). Priced per night from the villa;
  // the total updates live as these change.
  const [selectedExtras, setSelectedExtras] = useState<string[]>([]);
  const [couponInput, setCouponInput] = useState(searchParams.get("coupon") || "");
  const [applied, setApplied] = useState<{ code: string; discount: number; label: string } | null>(null);
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [applying, setApplying] = useState(false);

  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<FieldKey | "">("");
  const [submitting, setSubmitting] = useState(false);

  // The first-booking welcome offer. Read here so the total on screen is the
  // total the server will charge; `createBooking` decides it again for real.
  const welcome = useWelcomeOffer();

  // The host's booking window, and a clock to judge it against. Filling in a
  // payment form takes minutes: the villa's check-in time can go by, or another
  // guest can take these very nights, while this page sits open. Both are
  // refused by `createBooking` — this is so the page says it first, before the
  // guest types a card number they were never going to be able to use.
  const [bookingWindow, setBookingWindow] = useState<BookingWindow | null>(null);
  const [nowTick, setNowTick] = useState<Date | null>(null);
  useEffect(() => {
    setNowTick(new Date());
    const timer = setInterval(() => setNowTick(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    fetchBookingWindow(id)
      .then((w) => active && setBookingWindow(w))
      // The server checks all of this again at Confirm, so a failed fetch only
      // costs the early warning — never lets a bad stay through.
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, reloadKey]);
  // Judged on the SERVER's clock, not the browser's — see slideWindow.
  const win = useMemo(
    () => (bookingWindow && nowTick ? slideWindow(bookingWindow, nowTick.getTime()) : null),
    [bookingWindow, nowTick]
  );

  // The stay as the guest actually gets it. Nights somebody else holds inside
  // the chosen range don't refuse it — the range breaks into runs around them,
  // and only the nights slept are counted and charged (see splitStay). Before
  // the window lands there is nothing known to be taken, so this is simply the
  // whole range, which is what the page used to assume outright.
  const split = useMemo(
    () => (dates ? splitStay(isoDate(dates.start), isoDate(dates.end), win) : null),
    [dates, win]
  );
  const trip = { guests, nights: split?.nights ?? 0 };
  const isSplit = (split?.segments.length ?? 0) > 1;

  const errorRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchVilla(id)
      .then((res) => {
        if (!cancelled) setLoaded({ id, villa: res });
      })
      .catch((e) => {
        // A network/server failure is not the same as a deleted listing.
        if (!cancelled)
          setFailure({
            id,
            message: e instanceof Error ? e.message : "Could not load this property.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // Prefill the e-mail and phone from the signed-in user's saved profile. The
  // contact number is stored with its country code ("+91 9876543210"), so it's
  // split back into the code picker and the number box here.
  useEffect(() => {
    if (user?.email) setEmail((e) => e || user.email);
    if (user?.emergencyContact) {
      const { code, number } = splitContact(user.emergencyContact);
      if (number) {
        setPhone((p) => p || number);
        if (code) setPhoneCode((c) => c || code);
      }
    }
  }, [user]);

  // Not signed in → surface the sign-in modal (Reserve normally guards this).
  // Latched so a new auth-context identity can't re-open the modal behind the
  // "Please sign in" page the user is already looking at.
  const authPrompted = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (user) {
      authPrompted.current = false;
      return;
    }
    if (authPrompted.current) return;
    authPrompted.current = true;
    openAuth("signin");
  }, [ready, user, openAuth]);

  // The form error sits below a long form — bring it into view when it appears.
  // The one exception is the "press Done" message: what the guest has to act on
  // is the open editor at the top of the page, not the line above the button.
  useEffect(() => {
    if (!error) return;
    const target = errorField === "dates" ? dateEditRef.current : errorRef.current;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error, errorField]);

  // Validate + apply a coupon against this villa and stay. The server decides
  // whether it applies and the exact amount off — the same figure the booking
  // will freeze, so the summary never quotes a discount the payment won't honour.
  const applyCoupon = useCallback(
    // `nightsOverride`: when the guest edits the stay, the coupon has to be
    // re-checked against the NEW night count, and this callback still closes
    // over the old one at that moment.
    async (rawCode: string, nightsOverride?: number) => {
      const code = rawCode.trim();
      if (!code) {
        setApplied(null);
        setCouponMsg(null);
        return;
      }
      setApplying(true);
      setCouponMsg(null);
      try {
        const res = await validateCoupon(code, id, Math.max(1, nightsOverride ?? trip.nights));
        if (res.valid) {
          setApplied({ code: res.code, discount: res.discount, label: res.label });
          setCouponInput(res.code);
          setCouponMsg({ ok: true, text: res.message });
        } else {
          setApplied(null);
          setCouponMsg({ ok: false, text: res.message });
        }
      } catch (e) {
        setApplied(null);
        setCouponMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't check that coupon." });
      } finally {
        setApplying(false);
      }
    },
    [id, trip.nights]
  );

  // A coupon carried in the URL (?coupon=CODE, e.g. from the home-page offer
  // popup) is applied automatically once the villa and nights are known — once.
  const autoApplied = useRef(false);
  useEffect(() => {
    if (autoApplied.current) return;
    if (!v || !dates) return;
    const code = searchParams.get("coupon");
    if (!code) return;
    autoApplied.current = true;
    applyCoupon(code);
  }, [v, dates, searchParams, applyCoupon]);

  // --- Editing the stay, in place ---
  //
  // The dates live in the URL (that is where the Reserve button put them), so
  // changing them is a `replace` of those two params: everything on the page —
  // the nights, the price rows, the total, the cancellation dates — is derived
  // from them and re-renders on its own. No navigation, no state to keep in
  // step, and the back button still holds the stay the guest arrived with.
  const [editingDates, setEditingDates] = useState(false);
  // The dates as they are being CHOSEN, before they are applied. The editor
  // writes here and nowhere else, so the summary on the right — the nights, the
  // price rows, the total, the cancellation dates — holds still while the guest
  // clicks around the calendar. Done is what moves them into the URL, and the
  // whole page re-quotes from there in one step. Picking a check-in used to
  // re-price the stay on the way to picking a check-out, so the total flickered
  // through a one-night stay nobody had asked for and a coupon was re-validated
  // against it. `null` means "not editing — the URL's dates are the dates".
  const [draft, setDraft] = useState<{ checkIn: string; checkOut: string } | null>(null);
  // Done has just re-priced the stay. The summary on the right is where the
  // figure that will actually be charged lives, and on a long page it is easy
  // to press Done and not notice the number that moved — so it lights up for a
  // moment. Purely a signal that this is the new total; it fades on its own.
  const [justPriced, setJustPriced] = useState(false);
  useEffect(() => {
    if (!justPriced) return;
    // Long enough to outlast the coupon re-check Done kicks off, so the
    // highlight is still on the number when the discount settles.
    const t = setTimeout(() => setJustPriced(false), 2200);
    return () => clearTimeout(t);
  }, [justPriced]);
  // The panel sits high on a long page — opening it from the alert at the
  // bottom has to bring it into view.
  const dateEditRef = useRef<HTMLDivElement>(null);
  const openDateEditor = useCallback(() => {
    setEditingDates(true);
    // After the panel has finished sliding open (see its 420ms transition), not
    // a frame after the state change: mid-slide it is still a few pixels tall,
    // and centring THAT lands the finished panel somewhere else entirely.
    setTimeout(
      () => dateEditRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }),
      440
    );
  }, []);
  const setStay = useCallback(
    (checkIn: string, checkOut: string) => {
      const q = new URLSearchParams(searchParams.toString());
      q.set("checkIn", checkIn);
      q.set("checkOut", checkOut);
      // An explicit pair supersedes the older "N nights from today" form.
      q.delete("nights");
      router.replace(`/villa/${id}/book?${q.toString()}`, { scroll: false });

      // A coupon is validated for a specific number of nights, and the amount
      // it takes off can change with them — re-check it rather than carry a
      // discount the payment wouldn't honour. Nights the stay skips over don't
      // count: they are not slept in and not paid for.
      const nights = splitStay(checkIn, checkOut, win).nights;
      if (applied && nights > 0) applyCoupon(applied.code, nights);
    },
    [applied, applyCoupon, id, router, searchParams, win]
  );

  // --- What the dates in the open editor would COST, before Done applies them.
  //
  // The guest is choosing dates against a price, so the price has to be there
  // while they choose. Everything in it is the same arithmetic the summary on
  // the right runs — except the coupon, which the SERVER decides for a given
  // number of nights (a percentage code takes a different amount off a longer
  // stay). So the draft's coupon is quoted the same way the applied one was,
  // read-only, and the panel says "working it out" until the answer lands
  // rather than showing a total the coupon would change underneath it.
  const draftQuoteNights = useMemo(
    () => (draft ? splitStay(draft.checkIn, draft.checkOut, win).nights : 0),
    [draft, win]
  );
  // Tagged with the night count it was quoted FOR — a figure is only ever used
  // against its own draft, so an answer that arrives after the guest has picked
  // again is simply never the one on screen.
  const [draftCoupon, setDraftCoupon] = useState<{ nights: number; discount: number } | null>(null);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(async () => {
      if (!applied?.code || draftQuoteNights <= 0) {
        setDraftCoupon(null);
        return;
      }
      try {
        const res = await validateCoupon(applied.code, id, draftQuoteNights);
        // A code that stops applying at this length takes nothing off — which
        // is exactly what Done would find, so it is what the total shows.
        if (live) setDraftCoupon({ nights: draftQuoteNights, discount: res.valid ? res.discount : 0 });
      } catch {
        if (live) setDraftCoupon({ nights: draftQuoteNights, discount: 0 });
      }
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [applied?.code, draftQuoteNights, id]);

  // The payment methods THIS host accepts, in a stable known order — EXACTLY
  // what the host ticked, nothing more. No fallback to "all four": if the host
  // enabled only Visa, the guest sees only Visa. An empty list means the host
  // set none, and the form says so rather than inventing options.
  const acceptedMethods = useMemo(() => {
    const accepted = v?.acceptedPayments ?? [];
    return KNOWN_METHODS.filter((m) => accepted.includes(m));
  }, [v?.acceptedPayments]);

  // Default to the host's first accepted method, and re-home the selection if
  // the guest's current pick isn't offered here (e.g. once the villa loads and
  // narrows the list from the fallback).
  useEffect(() => {
    setMethod((m) => (m && acceptedMethods.includes(m) ? m : acceptedMethods[0] ?? ""));
  }, [acceptedMethods]);

  // --- Paying the way they paid last time ---
  //
  // The platform never stored a card number or a CVV — only the masked tail and
  // the billing address — so "saved card" here means "don't make me type an
  // address again", which is the part guests actually resent. Offered only for
  // methods THIS host accepts: a saved PayPal is no use at a villa that takes
  // cards alone.
  useEffect(() => {
    if (!user) return;
    let live = true;
    fetchSavedPayments()
      .then((rows) => live && setSavedPayments(rows))
      .catch(() => {
        // A guest who has never booked has none, and a failure here is not
        // worth an error on a payment page — the form below still works.
      });
    return () => {
      live = false;
    };
  }, [user]);

  const savedChoices = useMemo(
    () => savedPayments.filter((p) => acceptedMethods.includes(p.method)),
    [savedPayments, acceptedMethods]
  );
  // The saved card stops being an option the moment it isn't offered any more.
  useEffect(() => {
    if (useSaved && !savedChoices.some((p) => p.method === method)) setUseSaved(false);
  }, [useSaved, savedChoices, method]);

  if (loadError) {
    return (
      <Centered
        title="Couldn't load this property"
        note={loadError}
        onRetry={() => {
          setFailure(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  if (!ready || v === undefined || !dates) {
    return <BookSkeleton />;
  }

  if (!user) {
    return (
      <Centered
        title="Please sign in"
        note="You need to be signed in to book a villa."
      />
    );
  }

  if (v === null) {
    return <Centered title="Villa not found" note="This listing may have been removed." />;
  }

  // Guard: a host cannot book their own villa (mirrors the backend rule).
  if (String(v.ownerId) === String(user.id)) {
    return (
      <Centered
        title="You can't book your own villa"
        note="Hosts are not able to reserve their own listings."
        backHref={`/villa/${id}`}
        backLabel="Back to villa"
      />
    );
  }

  // --- Extra services ---
  const offeredExtras = v.extraServices || [];
  const chosenExtras = offeredExtras.filter((s) => selectedExtras.includes(s.name));
  const extrasPerNight = chosenExtras.reduce((sum, s) => sum + (s.price || 0), 0);
  function toggleExtra(name: string) {
    setSelectedExtras((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }

  // --- Price details ---
  const price = v.pricePerNight || 0;
  // The first-booking welcome offer, applied automatically — there is no code
  // to type. It does NOT stack with a host's coupon: whichever takes more off
  // wins, exactly as the server decides it when the booking is taken.
  const rawSubtotal = Math.max(0, price * Math.max(0, trip.nights));
  const welcomeDiscount = welcome.available
    ? Math.round(rawSubtotal * (welcome.offer?.percentOff ?? 0)) / 100
    : 0;
  const couponDiscount = applied?.discount ?? 0;
  const welcomeWins = welcomeDiscount > 0 && welcomeDiscount >= couponDiscount;
  const { subtotal, discount, serviceFee, tax, extras, total } = computeStayPricing(
    price,
    trip.nights,
    welcomeWins ? welcomeDiscount : couponDiscount,
    extrasPerNight
  );
  const cover = villaCover(v, "");
  // Narrowed once here — closures below can't see the `!dates` guard above.
  const stay = dates;
  // Why these nights can no longer be taken, or "" while they still can. Same
  // checks the server runs at Confirm, worded the same way.
  const windowProblem = stayProblem(isoDate(stay.start), isoDate(stay.end), win);

  // The hours every part of the stay opens and closes on — the villa's own,
  // which is exactly what the booking freezes when it's taken. "" when the host
  // stated none, in which case the parts show their dates alone rather than
  // inventing a time the guest would then plan around.
  const arriveAt = v.checkInTime ? prettyTime(v.checkInTime) : "";
  const departAt = v.checkOutTime ? prettyTime(v.checkOutTime) : "";

  // --- The inline date editor's own rules, the same ones the villa page's
  // reservation card applies, so a stay that can be picked there can be picked
  // here and nowhere else. ---
  const checkInIso = isoDate(stay.start);
  const checkOutIso = isoDate(stay.end);
  // Before the window lands, fall back to the villa's own check-in time so the
  // calendar still can't open on a date that has already gone.
  const earliest = win
    ? win.firstDate
    : nowTick
      ? firstBookableDate(v.checkInTime, nowTick)
      : undefined;
  // What the editor's two fields are showing: the draft while one is being
  // made, the stay itself until then. No draft is created when the panel opens
  // — only when a date is actually picked — so opening and closing it again
  // changes nothing at all.
  const draftIn = draft?.checkIn ?? checkInIso;
  const draftOut = draft?.checkOut ?? checkOutIso;
  const draftDirty = draftIn !== checkInIso || draftOut !== checkOutIso;
  // Nights the draft would actually be charged for — the same split the real
  // stay goes through, so the count under the calendar is the count Done buys.
  const draftNights = draftDirty ? splitStay(draftIn, draftOut, win).nights : trip.nights;

  // And what those nights come to. Priced exactly as the summary beside it is —
  // same nightly rate, same extras, same fee and tax, same "welcome offer or
  // coupon, whichever takes more off, never both" rule — so the figure the
  // panel shows is the figure Done produces, not an estimate of it.
  //
  // The coupon is the one part that has to be asked for (see draftCoupon
  // above); `null` here means the answer hasn't landed yet, and the panel says
  // so rather than quoting a total that is about to move.
  const draftCouponDiscount = !applied
    ? 0
    : !draftDirty
      ? couponDiscount
      : draftCoupon?.nights === draftNights
        ? draftCoupon.discount
        : null;
  const draftRawSubtotal = Math.max(0, price * Math.max(0, draftNights));
  const draftWelcomeDiscount = welcome.available
    ? Math.round(draftRawSubtotal * (welcome.offer?.percentOff ?? 0)) / 100
    : 0;
  const draftPricing = computeStayPricing(
    price,
    draftNights,
    Math.max(draftWelcomeDiscount, draftCouponDiscount ?? 0),
    extrasPerNight
  );
  const draftTotal = draftPricing.total;
  // What Done would add to (or take off) the bill, so the guest reads the change
  // as well as the number — the summary on the right still holds the old total.
  const draftDelta = Number((draftTotal - total).toFixed(2));
  const draftPricePending = draftCouponDiscount === null;

  // Without a window there is nothing to cap the stay with — leaving these
  // undefined keeps the calendar open rather than pinning it to one night.
  const latestCheckOut = win ? maxCheckOutFor(draftIn, win) : undefined;

  function onCheckInPick(next: string) {
    let out = draftOut;
    // Check-out always stays after check-in, and inside what the host opened.
    if (out <= next) out = addIsoDays(next, 1);
    if (win) {
      const cap = maxCheckOutFor(next, win);
      if (out > cap) out = cap;
    }
    setDraft({ checkIn: next, checkOut: out });
  }

  // The Edit/Done control. Done is the only thing that applies a change — it
  // hands the two dates to `setStay`, which puts them in the URL and re-quotes
  // the page (and re-checks the coupon against the new night count).
  function toggleDateEditor() {
    if (!editingDates) {
      setEditingDates(true);
      return;
    }
    if (draft && draftDirty) {
      setStay(draft.checkIn, draft.checkOut);
      // Only when the dates actually moved: closing the panel on the stay it
      // opened with changes no figure, so nothing on the right should flash.
      setJustPriced(true);
    }
    setDraft(null);
    setEditingDates(false);
    // Done is what the "press Done first" message was asking for — clear it
    // here rather than leaving a red line under a panel that has just closed.
    if (errorField === "dates") {
      setError("");
      setErrorField("");
    }
  }

  // Back to the listing, carrying the stay. `stay` — not the draft: an
  // unapplied date change is exactly that, and Cancel is not a way to apply it.
  const backToVilla =
    `/villa/${id}?checkIn=${checkInIso}&checkOut=${checkOutIso}&guests=${trip.guests}` +
    (applied?.code || searchParams.get("coupon")
      ? `&coupon=${encodeURIComponent(applied?.code || searchParams.get("coupon") || "")}`
      : "");

  // The sliding cancellation scale, in this stay's own terms: the server's
  // ladder (REFUND_TIERS, mirrored in lib/booking) with each band's threshold
  // turned into the date it actually falls on for THESE dates. Every boundary
  // is the check-in hour on its day, which is what the deadline column says —
  // "15 days before check-in" is 2 PM that day, not midnight.
  const checkInDay = fmtShort(stay.start);
  const checkInAtText = prettyTime(v?.checkInTime || "14:00");
  const REFUND_LADDER = REFUND_TIERS.map(([hours, refund], i) => {
    const days = hours / 24;
    const prevDays = i === 0 ? 0 : REFUND_TIERS[i - 1][0] / 24;
    const on = (d: number) => `${checkInAtText} on ${fmtShort(addDays(stay.start, -d))}`;
    if (i === 0) return { refund, label: `${days} days ahead or more — up to ${on(days)}` };
    if (hours === 0)
      return { refund, label: `In the last 24 hours — after ${on(prevDays)}` };
    return { refund, label: `${days} to ${prevDays} days ahead — until ${on(days)}` };
  });

  function validate(): { field: FieldKey; message: string } | null {
    // An open date editor is an unfinished decision: the draft in it is not the
    // stay being charged, so paying now would buy the dates on screen while the
    // guest is still looking at different ones in the calendar. Done is the only
    // thing that applies a change, so Done is required before Confirm — even
    // when nothing was picked, since closing it is what says "these are final".
    if (editingDates)
      return {
        field: "dates",
        message: draftDirty
          ? "Press Done on your dates to apply them before confirming."
          : "Press Done to finish editing your dates before confirming.",
      };

    if (!method) return { field: "method", message: "Please choose a payment method." };

    // Each method validates only its own inputs — card fields for the card
    // brands, account credentials for PayPal / Google Pay. A guest paying the
    // way they paid last time has no inputs at all: there is nothing on this
    // page to check, and the server re-reads the details from their own
    // bookings rather than from anything sent up.
    if (useSaved) {
      // nothing to validate
    } else if (isCardMethod(method)) {
      if (!cardType.trim()) return { field: "cardType", message: "Please choose a card type." };
      const card = onlyDigits(cardNumber);
      if (card.length < 12 || !luhnValid(card))
        return { field: "cardNumber", message: "Enter a valid card number." };
      const brandBad = cardBrandError(method, card);
      if (brandBad) return { field: "cardNumber", message: brandBad };
      const expBad = expiryError(expiration);
      if (expBad) return { field: "expiration", message: expBad };
      const c = onlyDigits(cvv);
      if (c.length < 3 || c.length > 4) return { field: "cvv", message: "Enter a valid CVV." };
      // Billing address is only collected for card payments.
      if (!street.trim()) return { field: "street", message: "Enter your billing street name." };
      if (!city.trim()) return { field: "city", message: "Enter your billing city." };
      if (!country.trim())
        return { field: "country", message: "Select your billing country or region." };
    } else if (method === "PayPal") {
      if (!EMAIL_RE.test(paypalEmail.trim()))
        return { field: "paypalEmail", message: "Enter the e-mail for your PayPal account." };
      if (paypalPass.length < 6)
        return { field: "paypalPass", message: "Enter your PayPal password." };
    } else if (method === "Google Pay") {
      if (!isGpayId(gpayId))
        return { field: "gpayId", message: "Enter your UPI ID (name@bank) or Google account e-mail." };
    }

    if (!EMAIL_RE.test(email.trim()))
      return { field: "email", message: "Enter a valid e-mail address." };
    return null;
  }

  // What identifies the payment on the receipt: the card number for a card, or
  // the PayPal / Google Pay account for those. The server masks it before it's
  // ever stored — nothing sensitive is kept in full.
  const paymentDetail = isCardMethod(method)
    ? ""
    : method === "PayPal"
      ? paypalEmail.trim()
      : gpayId.trim();

  async function onConfirm() {
    const bad = validate();
    if (bad) {
      setErrorField(bad.field);
      setError(bad.message);
      return;
    }
    setError("");
    setErrorField("");
    setSubmitting(true);
    try {
      // A saved payment sends the method and nothing else: the card fields are
      // empty because there is nothing to send, and the server fills the
      // reference and billing address in from this guest's own history.
      const card = isCardMethod(method) && !useSaved;
      await createBooking({
        useSavedPayment: useSaved,
        villaId: id,
        checkIn: isoDate(stay.start),
        checkOut: isoDate(stay.end),
        guests: trip.guests,
        // What this page priced. The range can contain nights somebody else
        // holds — those are skipped and not charged — so the server can't get
        // the count from the two dates alone, and if availability moved while
        // the form was being filled in it re-quotes instead of charging for a
        // stay the guest never saw.
        expectedNights: trip.nights,
        // The actual method the guest chose (e.g. "PayPal"), not the card type.
        paymentMethod: method,
        // Card fields only for a card payment; the PayPal / Google Pay account
        // travels in paymentDetail instead.
        cardNumber: card ? cardNumber : "",
        expiration: card ? expiration : "",
        cvv: card ? cvv : "",
        paymentDetail: useSaved ? "" : paymentDetail,
        billingStreet: card ? street : "",
        billingApartment: card ? apartment : "",
        billingCity: card ? city : "",
        billingState: card ? state : "",
        billingZip: card ? zip : "",
        billingCountry: card ? country : "",
        contactEmail: email,
        contactPhone: joinContact(phoneCode, phone),
        couponCode: applied?.code || "",
        extraServices: selectedExtras,
      });
      // That was their first booking if the welcome offer was still live —
      // re-ask, so the placard stops appearing and the landing page hands its
      // on-load slot back to the host offers.
      welcome.refresh();
      // REPLACE, never push: the payment has gone through, so this page must
      // not be somewhere Back can return to. Pushing left the filled-in card
      // form one tap behind the confirmation, where pressing Confirm again
      // would try to buy the same nights twice. Replacing drops it from the
      // history entirely — Back from here goes to the villa, as it should.
      router.replace("/settings/bookings?booked=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be completed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="pb-20">
      {/* The site-wide page header — outside the content container so its
          background covers the full viewport width. */}
      <PageHeader
        crumbs={[
          { label: "Villas", href: "/search" },
          { label: v.title, href: `/villa/${id}`, truncate: true },
          { label: "Confirm Payment" },
        ]}
        title="Confirm Payment"
        subtitle={
          <>
            Fields marked <span className="text-red-500">*</span> are required.
          </>
        }
        action={
          // Cancel goes back to the listing with the stay still on it — the
          // dates the guest picked, and the coupon they arrived with. Landing on
          // a villa page whose calendar had reset to "tonight, one night" made
          // backing out of payment cost them the whole choice they had just
          // made; the reservation card seeds itself from these and scrolls
          // itself into view, so they come back to exactly what they left.
          <Link href={backToVilla} className={pageHeaderAction}>
            Cancel
          </Link>
        }
      />

      <div className="mx-auto max-w-body px-5 lg:px-7">
      <div className="mt-5 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px]">
        {/* ---------- Left: payment form ---------- */}
        <div>
          {/* The welcome offer, already applied. Stated before the guest starts
              typing card details, since it changes what they're about to pay. */}
          {welcomeWins && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
              <PartyPopper size={18} className="mt-0.5 shrink-0 text-green-600" aria-hidden />
              <div className="min-w-0">
                <p className="text-[13.5px] font-bold text-green-800">
                  First booking offer applied — {Math.round(welcome.offer?.percentOff ?? 0)}% off
                </p>
                <p className="mt-0.5 text-[12.5px] leading-5 text-green-700">
                  {money(welcomeDiscount)} off your stay, taken off automatically.
                  {couponDiscount > 0 && (
                    <>
                      {" "}
                      It beats your coupon{applied ? ` ${applied.code}` : ""} ({money(couponDiscount)}),
                      so we&apos;ve used this one — the two don&apos;t stack.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Trip details */}
          <h2 className="text-[15px] font-bold text-ink">Your Trip Details</h2>
          <TripRow
            label="Duration"
            onEdit={toggleDateEditor}
            editing={editingDates}
            value={
              <StayStrip
                checkIn={checkInIso}
                checkOut={checkOutIso}
                nights={trip.nights}
                arriveAt={arriveAt}
                departAt={departAt}
              />
            }
          />

          {/* Change the stay without leaving the page, right under the row —
              and under the control — that opened it: every price on the right
              is derived from these two dates, so it re-quotes as they change.
              There is nothing to save, so there is no button in here either;
              the Edit control above turned into Done and closing it is its job.
              A second Done down here was a second thing to hunt for, and it sat
              below whatever the split-stay notice had grown to. */}
          {/* It slides rather than appears: the panel is always in the page and
              a 0fr→1fr grid row animates its real height, so it opens and — the
              part a mount/unmount can never do — closes at the same measured
              pace. Nothing here is a fixed height (the date fields wrap on a
              narrow screen), which is exactly what the grid row handles and a
              max-height guess doesn't. `inert` while closed keeps the two date
              inputs out of the tab order when there is nothing to see. */}
          <div
            className={`grid transition-all duration-[420ms] ease-out ${
              editingDates ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
            inert={!editingDates}
          >
            <div className="overflow-hidden">
              <div
                ref={dateEditRef}
                className={`mt-3 rounded-xl border bg-white p-4 transition-colors ${
                  errorField === "dates"
                    ? "border-red-300 ring-2 ring-red-100"
                    : "border-line"
                }`}
              >
                <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-line">
                  <DateField
                    variant="plain"
                    label="Check - In"
                    value={draftIn}
                    min={earliest}
                    max={win?.lastDate}
                    disabledDates={win?.unavailableDates}
                    onChange={onCheckInPick}
                    className="border-r border-line"
                  />
                  <DateField
                    variant="plain"
                    label="Check - Out"
                    value={draftOut}
                    min={addIsoDays(draftIn, 1)}
                    max={latestCheckOut}
                    disabledDates={win?.unavailableDates.map((d) => addIsoDays(d, 1))}
                    onChange={(next) => setDraft({ checkIn: draftIn, checkOut: next })}
                  />
                </div>

                {/* What these two dates come to: the nights, and the money.
                    Dates are chosen against a price, so the price is here while
                    they are being chosen — the total Done would produce, what it
                    changes by, and the label saying which of the two figures on
                    screen is which. The summary on the right still holds the
                    stay that is actually booked until Done applies these. */}
                <div
                  className={`mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border px-3.5 py-3 transition-colors ${
                    draftDirty
                      ? "border-primary/30 bg-primary/[0.045]"
                      : "border-line bg-black/[0.015]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[13px] font-bold text-ink">
                      <Moon size={13} className="shrink-0 text-primary" aria-hidden />
                      {draftNights} night{draftNights === 1 ? "" : "s"}
                      <span className="font-normal text-muted">· {money(price)} / night</span>
                    </p>
                    <p className="mt-0.5 text-[11.5px] leading-4 text-muted">
                      {draftDirty
                        ? "Press Done to apply these dates"
                        : "The dates you're booking right now"}
                    </p>
                  </div>

                  {/* The money, live. It is recalculated on every pick, so the
                      guest is choosing dates against a price rather than finding
                      out what they cost after committing to them. Until Done,
                      this is the only place the new figure exists — the summary
                      on the right still holds the stay that is actually booked,
                      and two different totals under one heading would be worse
                      than one clearly labelled "New total". */}
                  <div className="ml-auto text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted">
                      {draftDirty ? "New total" : "Total"}
                    </p>
                    {draftDirty && draftPricePending ? (
                      // The coupon answer isn't back yet. A figure now would be
                      // one the discount is about to move, so it says so instead.
                      <p className="mt-0.5 text-[13px] font-semibold text-muted">
                        working it out…
                      </p>
                    ) : (
                      <>
                        <p className="text-[19px] font-extrabold leading-tight text-ink">
                          {money(draftDirty ? draftTotal : total)}
                        </p>
                        {draftDirty && draftDelta !== 0 && (
                          <p
                            className={`text-[11.5px] font-semibold leading-4 ${
                              draftDelta > 0 ? "text-ink" : "text-green-600"
                            }`}
                          >
                            {draftDelta > 0 ? "+" : "−"}
                            {money(Math.abs(draftDelta))} vs your current dates
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Confirm was pressed with this panel still open. The message
                    belongs here, next to the Done it is asking for — the one by
                    the Confirm button is a screen away from the control that
                    clears it, and this is where the page has just scrolled. */}
                {errorField === "dates" && (
                  <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-600">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* A stay booked around nights somebody else holds. Every arrival and
              departure is spelled out here, before any card details are typed:
              the guest is leaving the property and coming back, and that is not
              something to discover on the day. Skipped nights aren't charged —
              the price rows on the right count only what's listed here. */}
          {isSplit && split && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <p className="text-[13.5px] font-bold text-amber-900">
                Your stay is split into {split.segments.length} parts
              </p>
              <p className="mt-0.5 text-[12.5px] leading-5 text-amber-800">
                {skippedNightsText(split.skipped)}, so you check out and back in
                around {split.skipped.length === 1 ? "it" : "them"}. You&apos;re
                only charged for the {trip.nights} night
                {trip.nights === 1 ? "" : "s"} listed below.
              </p>
              <ol className="mt-2.5 space-y-1.5">
                {split.segments.map((s, i) => (
                  <li
                    key={s.checkIn}
                    className="flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white/70 px-3 py-2 text-[12.5px] text-amber-900"
                  >
                    <span className="font-bold">Part {i + 1}</span>
                    {/* The hours, not just the dates: on a stay you have to
                        vacate and come back to, "out by 11 AM, back in at
                        2 PM" is the part the guest has to plan around. */}
                    <span>
                      Check-in{" "}
                      <span className="font-semibold">
                        {prettyDate(s.checkIn)}
                        {arriveAt && `, ${arriveAt}`}
                      </span>{" "}
                      → Check-out{" "}
                      <span className="font-semibold">
                        {prettyDate(s.checkOut)}
                        {departAt && `, ${departAt}`}
                      </span>
                    </span>
                    <span className="ml-auto text-amber-800/80">
                      {s.nights} night{s.nights === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* No Edit here: it led to the same place as the one above it. */}
          <TripRow
            label="Guests"
            value={`${trip.guests} guest${trip.guests === 1 ? "" : "s"} (${trip.guests} adult${trip.guests === 1 ? "" : "s"})`}
          />

          {/* Extra services — chosen here in the roomy left column so the sticky
              summary on the right stays compact; the price there updates live. */}
          {offeredExtras.length > 0 && (
            <div className="mt-8">
              <h2 className="text-[19px] font-semibold text-ink">Extra services</h2>
              <p className="mt-1 text-[13px] text-muted">
                Optional add-ons, charged per night. Pick any you&apos;d like — your
                total updates as you go.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {offeredExtras.map((svc) => {
                  const on = selectedExtras.includes(svc.name);
                  return (
                    <button
                      key={svc.name}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleExtra(svc.name)}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors ${
                        on ? "border-primary bg-primary/[0.05]" : "border-line hover:border-primary/40"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          on ? "border-primary bg-primary text-white" : "border-line"
                        }`}
                      >
                        {on && <Check size={13} />}
                      </span>
                      <span className="flex-1 text-[14px] text-ink">{svc.name}</span>
                      <span className="shrink-0 text-[13px] font-semibold text-ink">
                        {money(svc.price)}
                        <span className="font-normal text-muted"> / night</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Pay using — the guest picks ONE of the methods this host offers,
              and the form below adapts to whichever is selected. These are the
              villa's own accepted methods, not a fixed row of logos. */}
          <div className="mt-8">
            <h2 className="text-[19px] font-semibold text-ink">Pay using</h2>

            {/* The way they paid last time, first — a returning guest should not
                have to retype a billing address the platform already has. Only
                the masked tail was ever stored, so there is nothing here to
                reveal; choosing one simply says "the same as before", and the
                server looks the rest up from this guest's own bookings. */}
            {savedChoices.length > 0 && (
              <div className="mt-4 space-y-2">
                {savedChoices.map((p) => {
                  const on = useSaved && method === p.method;
                  return (
                    <button
                      key={`${p.method}-${p.reference}`}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => {
                        setMethod(p.method);
                        setUseSaved(true);
                        setError("");
                        setErrorField("");
                      }}
                      className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                        on ? "border-primary bg-primary/[0.05]" : "border-line hover:border-primary/40"
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        <span className="flex h-6 shrink-0 items-center">
                          {CARD_BRANDS[p.method]}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-ink">
                            {p.method} {p.reference}
                          </span>
                          <span className="block truncate text-[12.5px] text-muted">
                            {[p.billingCity, p.billingCountry].filter(Boolean).join(", ") ||
                              "Saved from an earlier booking"}
                          </span>
                        </span>
                      </span>
                      <span
                        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${
                          on ? "border-primary bg-primary" : "border-line"
                        }`}
                        aria-hidden
                      >
                        {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                    </button>
                  );
                })}
                <p className="text-[12.5px] text-muted">
                  Or pay another way — your card details are never stored, only the
                  last four digits.
                </p>
              </div>
            )}
            {acceptedMethods.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-line bg-page px-4 py-4 text-[13.5px] text-muted">
                This host hasn&apos;t set up any payment methods for this villa yet.
                Please contact the host before booking.
              </p>
            ) : (
            <div role="radiogroup" aria-label="Payment method" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {acceptedMethods.map((m) => {
                const on = !useSaved && method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setMethod(m);
                      // Picking a method here is picking to enter it fresh —
                      // otherwise the form below would sit there greyed out
                      // with no way back to it.
                      setUseSaved(false);
                      if (error) {
                        setError("");
                        setErrorField("");
                      }
                    }}
                    className={`flex flex-col items-center justify-center gap-2 rounded-xl border px-3 py-4 transition-colors ${
                      on ? "border-primary bg-primary/[0.05]" : "border-line hover:border-primary/40"
                    }`}
                  >
                    <span className="flex h-6 items-center">{CARD_BRANDS[m]}</span>
                    <span className={`text-[13px] ${on ? "font-semibold text-ink" : "text-body"}`}>
                      {m}
                    </span>
                  </button>
                );
              })}
            </div>
            )}
            {errorField === "method" && (
              <p className="mt-2 text-[13px] text-red-600">Please choose a payment method.</p>
            )}
          </div>

          {/* ---------- Card payment (Visa / Mastercard) ---------- */}
          {!useSaved && isCardMethod(method) && (
          <>
          {/* Card type select */}
          <div className="mt-4">
            <SelectBox
              value={cardType}
              onChange={setCardType}
              label="Card type"
              required
              invalid={errorField === "cardType"}
            >
              <option>Credit Card or Debit Card</option>
              <option>Credit Card</option>
              <option>Debit Card</option>
            </SelectBox>
          </div>

          {/* Card number + expiration + cvv (connected group) */}
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <LabeledCell label="Card Number" htmlFor={`${uid}-card`} required>
              <input
                id={`${uid}-card`}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                inputMode="numeric"
                autoComplete="cc-number"
                maxLength={19}
                aria-invalid={errorField === "cardNumber" || undefined}
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
              />
            </LabeledCell>
            <div className="grid grid-cols-2 border-t border-line">
              <LabeledCell label="Expiration" htmlFor={`${uid}-exp`} required className="border-r border-line">
                <input
                  id={`${uid}-exp`}
                  value={expiration}
                  onChange={(e) => {
                    const next = formatExpiry(e.target.value, e.target.value.length < expiration.length);
                    setExpiration(next);
                    // Only judge a value the user has finished typing.
                    setExpError(next.length === 5 ? expiryError(next) : "");
                    if (errorField === "expiration") {
                      setErrorField("");
                      setError("");
                    }
                  }}
                  onBlur={() => setExpError(expiration ? expiryError(expiration) : "")}
                  placeholder="MM/YY"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  maxLength={5}
                  aria-invalid={!!expError || errorField === "expiration" || undefined}
                  aria-describedby={expError ? `${uid}-exp-err` : undefined}
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
                />
              </LabeledCell>
              <div className="flex items-center px-4 py-3">
                <input
                  id={`${uid}-cvv`}
                  value={cvv}
                  onChange={(e) => setCvv(onlyDigits(e.target.value).slice(0, 4))}
                  inputMode="numeric"
                  placeholder="CVV *"
                  aria-label="CVV"
                  autoComplete="cc-csc"
                  maxLength={4}
                  aria-invalid={errorField === "cvv" || undefined}
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
                />
              </div>
            </div>
          </div>
          {expError && (
            <p id={`${uid}-exp-err`} role="alert" className="mt-2 text-[13px] text-red-600">
              {expError}
            </p>
          )}

          {/* Billing address */}
          <h2 className="mt-8 text-[19px] font-semibold text-ink">Billing Address</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <PlainCell>
              <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street Name *" aria-label="Street Name" autoComplete="address-line1" aria-invalid={errorField === "street" || undefined} className={inputCls} />
            </PlainCell>
            <PlainCell className="border-t border-line">
              <input value={apartment} onChange={(e) => setApartment(e.target.value)} placeholder="Apartment Number" aria-label="Apartment Number" autoComplete="address-line2" className={inputCls} />
            </PlainCell>
            <PlainCell className="border-t border-line">
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City *" aria-label="City" autoComplete="address-level2" aria-invalid={errorField === "city" || undefined} className={inputCls} />
            </PlainCell>
            <div className="grid grid-cols-2 border-t border-line">
              <PlainCell className="border-r border-line">
                <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" aria-label="State" autoComplete="address-level1" className={inputCls} />
              </PlainCell>
              <PlainCell>
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Zip Code" aria-label="Zip Code" autoComplete="postal-code" className={inputCls} />
              </PlainCell>
            </div>
          </div>

          <div className="mt-3">
            <SelectBox
              value={country}
              onChange={setCountry}
              placeholder="Country or Region"
              autoComplete="country-name"
              invalid={errorField === "country"}
            >
              <option value="" disabled>
                Country or Region *
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
          </div>
          </>
          )}

          {/* ---------- PayPal ---------- */}
          {!useSaved && method === "PayPal" && (
            <PayPalPanel
              email={paypalEmail}
              setEmail={(val) => {
                setPaypalEmail(val);
                if (errorField === "paypalEmail") {
                  setErrorField("");
                  setError("");
                }
              }}
              password={paypalPass}
              setPassword={(val) => {
                setPaypalPass(val);
                if (errorField === "paypalPass") {
                  setErrorField("");
                  setError("");
                }
              }}
              amount={money(total)}
              emailInvalid={errorField === "paypalEmail"}
              passInvalid={errorField === "paypalPass"}
              uid={uid}
            />
          )}

          {/* ---------- Google Pay ---------- */}
          {!useSaved && method === "Google Pay" && (
            <GooglePayPanel
              value={gpayId}
              setValue={(val) => {
                setGpayId(val);
                if (errorField === "gpayId") {
                  setErrorField("");
                  setError("");
                }
              }}
              amount={money(total)}
              invalid={errorField === "gpayId"}
              uid={uid}
            />
          )}

          {/* Additional information */}
          <h2 className="mt-8 text-[19px] font-semibold text-ink">Additional Information</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <PlainCell>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail Address *" aria-label="E-mail Address" autoComplete="email" aria-invalid={errorField === "email" || undefined} className={inputCls} />
            </PlainCell>
            <div className="grid grid-cols-[104px_1fr] border-t border-line">
              <div className="border-r border-line">
                <select
                  value={phoneCode}
                  onChange={(e) => setPhoneCode(e.target.value)}
                  aria-label="Country code"
                  className="h-full w-full bg-transparent px-3 text-[14px] text-ink outline-none"
                >
                  <option value="">Code</option>
                  {DIAL_CODES.map((d) => (
                    <option key={`${d.code}-${d.country}`} value={d.code}>
                      {d.code}
                    </option>
                  ))}
                </select>
              </div>
              <PlainCell>
                <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))} inputMode="tel" placeholder="Phone Number" aria-label="Phone Number" autoComplete="tel" className={inputCls} />
              </PlainCell>
            </div>
          </div>

          {/* Cancellation policy */}
          <h2 className="mt-8 text-[15px] font-bold text-ink">Cancellation Policy</h2>
          <p className="mt-3 text-[13px] leading-6 text-body">
            What comes back depends on how near the stay is when you cancel — every
            deadline below is {checkInAtText}, this booking&apos;s own check-in hour.
          </p>
          <dl className="mt-2.5 divide-y divide-line overflow-hidden rounded-xl border border-line text-[13px]">
            {REFUND_LADDER.map((tier) => (
              <div
                key={tier.label}
                className="flex items-baseline justify-between gap-4 px-3.5 py-2"
              >
                <dt className="text-body">{tier.label}</dt>
                <dd
                  className={`shrink-0 font-semibold ${
                    tier.refund === 100
                      ? "text-green-600"
                      : tier.refund === 0
                        ? "text-red-600"
                        : "text-ink"
                  }`}
                >
                  {tier.refund}% refund
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 bg-page px-3.5 py-2">
              <dt className="text-body">
                From {checkInAtText} on {checkInDay}
              </dt>
              <dd className="shrink-0 font-semibold text-muted">Can no longer be cancelled</dd>
            </div>
          </dl>
          <p className="mt-3 text-[13px] leading-6 text-body">
            You don&apos;t have to give up the whole stay: from My Bookings you can hand
            back only the nights you no longer need — priced by the same scale — and keep
            the rest.
            <br />
            {/* TODO: link to the cancellation-policy page once it exists. */}
            <button type="button" className="font-semibold text-ink underline underline-offset-2">
              Learn More
            </button>
          </p>
          <p className="mt-3 text-[13px] leading-6 text-body">
            Our Extenuating Circumstances policy does not cover travel disruptions caused
            by COVID-19.
            <br />
            {/* TODO: link to the extenuating-circumstances page once it exists. */}
            <button type="button" className="font-semibold text-ink underline underline-offset-2">
              Learn More
            </button>
          </p>

          <hr className="my-5 border-line" />

          <p className="text-[12px] leading-5 text-muted">
            By selecting the button below, I agree to the{" "}
            <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-primary">
              Host&apos;s House Rules
            </Link>
            , MyVilla&apos;s{" "}
            <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-primary">
              COVID-19 Safety Requirements
            </Link>{" "}
            and the{" "}
            <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-primary">
              Guest Refund Policy
            </Link>
            .
          </p>

          {/* The stay stopped being bookable while this page was open — the
              check-in time went by, or somebody else took the nights. Said
              here rather than only after the guest presses Confirm. */}
          {windowProblem && (
            <div role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-[13px] text-red-600">
              <p className="font-semibold">These dates are no longer available</p>
              <p className="mt-0.5">{windowProblem}</p>
              {/* Straight to the calendar above, not back to the villa page —
                  nothing the guest has typed into this form is worth losing. */}
              <button
                type="button"
                onClick={openDateEditor}
                className="mt-1.5 inline-block font-medium underline underline-offset-2"
              >
                Pick new dates
              </button>
            </div>
          )}

          {/* The date-editor message has its own line inside the panel, beside
              the Done that clears it — showing it here as well would be the same
              sentence twice on one screen. */}
          {error && errorField !== "dates" && (
            <p ref={errorRef} role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={onConfirm}
            disabled={submitting || !!windowProblem}
            className="mt-5 rounded-xl bg-primary px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Processing…" : "Confirm and Pay"}
          </button>
        </div>

        {/* ---------- Right: summary card ---------- */}
        <aside>
          {/* Above the collapsed heading (z-30): the two sticky boxes overlap by
              a few pixels once the header shrinks, and the summary should win.
              The -mt only bites before the panel pins — it starts the summary
              level with the form's first field rather than one heading lower.
              80, not 65: on load, before the heading collapses, the card still
              sat a touch low against the form beside it. */}
          <div
            className="sticky-panel lg:-mt-[80px] lg:sticky lg:top-[165px] lg:z-40"
            style={{ ["--sticky-top" as string]: "165px" }}
          >
            <div className="rounded-2xl border border-line bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
              <div className="flex gap-4">
                <div className="img-frame h-[74px] w-[92px] flex-shrink-0 overflow-hidden rounded-xl">
                  <Img
                    src={cover}
                    alt={v.title}
                    fallback={PLACEHOLDER_IMG}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug text-ink">
                    {v.title}
                  </p>
                  {/* Ratings/reviews aren't part of the Villa payload, so nothing
                      is shown rather than inventing a score. */}
                  {v.propertyType && (
                    <p className="mt-1 text-[12px] text-muted">{v.propertyType}</p>
                  )}
                </div>
              </div>

              {/* my-4, not my-5, on both of the card's rules: 16px of slack so
                  a coupon message that runs to two lines is absorbed here
                  rather than tipping the card past the viewport and into a
                  scrollbar. Nothing else in the card gives height up cheaply. */}
              <hr className="my-4 border-line" />

              {/* Coupon */}
              <CouponBox
                value={couponInput}
                onChange={(val) => {
                  setCouponInput(val);
                  // Editing away from an applied code drops the discount until
                  // it's re-applied, so the total can't show a stale reduction.
                  if (applied && val.trim().toUpperCase() !== applied.code) {
                    setApplied(null);
                    setCouponMsg(null);
                  }
                }}
                onApply={() => applyCoupon(couponInput)}
                onRemove={() => {
                  setApplied(null);
                  setCouponInput("");
                  setCouponMsg(null);
                }}
                applied={applied}
                applying={applying}
                message={couponMsg}
              />

              <hr className="my-4 border-line" />

              <h3 className="text-[15px] font-bold text-ink">Price Details</h3>
              <div className="mt-4 space-y-3 text-[14px]">
                <div className="flex items-center justify-between text-body">
                  <span>
                    {money(price)} x {trip.nights} night{trip.nights === 1 ? "" : "s"}
                  </span>
                  <span className="text-ink">{money(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-body">
                  <span>
                    Discount
                    {welcomeWins
                      ? ` (first booking · ${Math.round(welcome.offer?.percentOff ?? 0)}%)`
                      : applied
                        ? ` (${applied.code})`
                        : ""}
                  </span>
                  <span className={discount > 0 ? "font-medium text-green-600" : "text-ink"}>
                    {discount > 0 ? `-${money(discount)}` : money(0)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-body">
                  <span className="underline underline-offset-2">Service fee</span>
                  <span className="text-ink">{money(serviceFee)}</span>
                </div>
                <div className="flex items-center justify-between text-body">
                  <span>Tax ({Math.round(TAX_RATE * 100)}%)</span>
                  <span className="text-ink">{money(tax)}</span>
                </div>
                {/* One constant line — the per-service breakdown lives in the
                    left column, so selecting more never grows this box. */}
                {extras > 0 && (
                  <div className="flex items-center justify-between text-body">
                    <span
                      className="min-w-0 truncate pr-2"
                      title={chosenExtras.map((s) => s.name).join(", ")}
                    >
                      Extra services{chosenExtras.length ? ` (${chosenExtras.length})` : ""}
                    </span>
                    <span className="shrink-0 text-ink">{money(extras)}</span>
                  </div>
                )}
              </div>

              <hr className="my-4 border-line" />

              {/* Done has just applied new dates: this is the figure that
                  changed because of it, and it says so for a couple of seconds.
                  Without it the guest presses Done at the top of the page and
                  the one number that matters re-renders silently over here. */}
              <div
                className={`-mx-2 flex items-center justify-between rounded-lg px-2 py-1.5 text-[15px] font-bold text-ink transition-colors duration-500 ${
                  justPriced ? "bg-primary/10 ring-1 ring-primary/25" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  Total (USD)
                  {justPriced && (
                    <span
                      role="status"
                      className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    >
                      Updated
                    </span>
                  )}
                </span>
                <span>{money(total)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
      </div>
    </div>
  );
}

/* ---------- small building blocks ---------- */

const inputCls =
  "w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70";

function CouponBox({
  value,
  onChange,
  onApply,
  onRemove,
  applied,
  applying,
  message,
}: {
  value: string;
  onChange: (v: string) => void;
  onApply: () => void;
  onRemove: () => void;
  applied: { code: string; discount: number; label: string } | null;
  applying: boolean;
  message: { ok: boolean; text: string } | null;
}) {
  if (applied) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-green-700">
              <span className="font-mono tracking-wide">{applied.code}</span>
              <span className="rounded bg-green-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                {applied.label}
              </span>
            </p>
            <p className="mt-0.5 text-[12px] text-green-700/80">Coupon applied to your stay.</p>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 text-[12px] font-medium text-green-700 underline underline-offset-2 hover:text-green-800"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }
  return (
    <div>
      {/* The answer takes the prompt's line rather than a new one of its own.
          The summary card is pinned to the height of the viewport, and it sits
          close enough to that ceiling that ONE extra 20px line of "that code
          isn't valid" was enough to hand the whole card an inner scrollbar —
          the guest typed a coupon and the price breakdown they were reading
          jumped and grew a scroll track. A label and its validation message
          are the same slot in every form: "Have a coupon?" has done its job by
          the time there is something to say about the one you tried, and the
          input below still names itself through its placeholder and its
          `aria-label`. Zero height added, so nothing below it moves. */}
      {message ? (
        <p
          role="status"
          className={`text-[12.5px] font-medium leading-5 ${
            message.ok ? "text-green-600" : "text-red-600"
          }`}
        >
          {message.text}
        </p>
      ) : (
        <label className="block text-[13px] font-semibold leading-5 text-ink">
          Have a coupon?
        </label>
      )}
      <div className="mt-2 flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApply();
            }
          }}
          placeholder="Enter code"
          aria-label="Coupon code"
          autoCapitalize="characters"
          maxLength={32}
          className="w-full rounded-lg border border-line bg-white px-3 py-2.5 font-mono text-[13px] tracking-wide text-ink outline-none focus:border-primary placeholder:font-sans placeholder:tracking-normal placeholder:text-muted/70"
        />
        <button
          type="button"
          onClick={onApply}
          disabled={applying || !value.trim()}
          className="shrink-0 rounded-lg border border-primary px-4 py-2.5 text-[13px] font-semibold text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
        >
          {applying ? "…" : "Apply"}
        </button>
      </div>
    </div>
  );
}

function PlainCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-3.5 ${className}`}>{children}</div>;
}

// A red asterisk marking a required field.
function Req() {
  return <span className="text-red-500"> *</span>;
}

function LabeledCell({
  label,
  htmlFor,
  children,
  className = "",
  required = false,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={`px-4 py-2.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-[11px] text-muted">
        {label}
        {required && <Req />}
      </label>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  children,
  placeholder,
  label,
  autoComplete,
  invalid,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  label?: string;
  autoComplete?: string;
  invalid?: boolean;
  required?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="mb-1 block text-[11px] text-muted">
          {label}
          {required && <Req />}
        </label>
      )}
      <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label || placeholder}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        className={`w-full appearance-none rounded-xl border border-line bg-white px-4 py-3.5 text-[14px] outline-none ${
          value ? "text-ink" : "text-muted/70"
        }`}
      >
        {children}
      </select>
      <ChevronDown
        size={18}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted"
      />
      </div>
    </div>
  );
}

function TripRow({
  label,
  value,
  onEdit,
  editing = false,
}: {
  label: string;
  /** A plain string gets the quiet one-line treatment; anything else is
      rendered as-is, for a row whose value is worth more room than that. */
  value: React.ReactNode;
  /** Omit on a row with nothing to change (the guest count is fixed here). */
  onEdit?: () => void;
  /** Whether this row's editor is open — the control says so and reads as a toggle. */
  editing?: boolean;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink">{label}</span>
        {/* One control, two jobs: it opens the editor and it closes it. A slim
            pill rather than the underlined word it was — an underline reads as
            a link to somewhere else, and this goes nowhere; it toggles the
            panel directly beneath it. Deliberately small and quiet: it sits
            beside a heading on a page whose one loud button is Pay.
            Editing, it fills in with the brand colour and takes a tick — the
            same shape, plainly switched on, so the guest sees the thing they
            pressed is the thing that ends it. */}
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            aria-expanded={editing}
            aria-label={editing ? `Done editing ${label.toLowerCase()}` : `Edit ${label.toLowerCase()}`}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-semibold leading-4 transition-colors ${
              editing
                ? "border-primary bg-primary text-white hover:bg-primary-dark"
                : "border-line text-body hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
            }`}
          >
            {editing ? (
              <Check size={13} aria-hidden />
            ) : (
              <Pencil size={12} aria-hidden />
            )}
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </div>
      {typeof value === "string" ? (
        <p className="mt-0.5 text-[12px] text-muted">{value}</p>
      ) : (
        value
      )}
    </div>
  );
}

/* The stay itself, laid out as the two ends it actually has.
 *
 * It replaced one muted line — "6 Nights (25/08/2026 to 31/08/2026)" — where
 * the dates were the same size and weight as everything around them, written
 * in a numeric format that means two different days depending on where the
 * guest reads it. This is the thing being bought, and the row above it is the
 * one with an Edit control, so it is worth looking like something: each end
 * labelled and dated in words, the day of the week and the hour underneath —
 * because "check in Tuesday at 2 PM" is what a guest plans around — and the
 * night count sitting on the line that joins them.
 */
function StayStrip({
  checkIn,
  checkOut,
  nights,
  arriveAt,
  departAt,
}: {
  checkIn: string;
  checkOut: string;
  nights: number;
  /** The villa's hours, or "" when the host stated none — no invented times. */
  arriveAt?: string;
  departAt?: string;
}) {
  return (
    <div className="mt-2 flex items-stretch overflow-hidden rounded-xl border border-line bg-gradient-to-r from-primary/[0.05] via-white to-primary/[0.05]">
      <StayEnd label="Check-in" iso={checkIn} at={arriveAt} atPrefix="from" />
      {/* The join. The hairline runs behind the badge rather than beside it,
          so the two ends read as one span at any width. */}
      <div className="relative flex w-[92px] shrink-0 items-center justify-center sm:w-[124px]">
        <span aria-hidden className="absolute inset-x-1 top-1/2 h-px bg-line" />
        <ArrowRight
          aria-hidden
          size={12}
          className="absolute right-0 top-1/2 -translate-y-1/2 text-muted/50"
        />
        <span className="relative inline-flex items-center gap-1 rounded-full border border-primary/25 bg-white px-2.5 py-1 text-[11.5px] font-bold leading-4 text-primary shadow-sm">
          <Moon size={11} aria-hidden />
          {nights}
          <span className="font-semibold">night{nights === 1 ? "" : "s"}</span>
        </span>
      </div>
      <StayEnd label="Check-out" iso={checkOut} at={departAt} atPrefix="until" align="right" />
    </div>
  );
}

function StayEnd({
  label,
  iso,
  at,
  atPrefix,
  align = "left",
}: {
  label: string;
  iso: string;
  at?: string;
  atPrefix: string;
  align?: "left" | "right";
}) {
  return (
    <div className={`min-w-0 flex-1 px-3.5 py-3 sm:px-4 ${align === "right" ? "text-right" : ""}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted">{label}</p>
      <p className="mt-1 text-[14px] font-bold leading-tight text-ink">{prettyDate(iso)}</p>
      <p className="mt-0.5 text-[11.5px] leading-4 text-muted">
        {fmtWeekday(iso)}
        {at ? ` · ${atPrefix} ${at}` : ""}
      </p>
    </div>
  );
}

function Centered({
  title,
  note,
  backHref = "/",
  backLabel = "Back to home",
  onRetry,
}: {
  title: string;
  note: string;
  backHref?: string;
  backLabel?: string;
  /** When set, the action becomes a retry instead of a way out. */
  onRetry?: () => void;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-body flex-col items-center justify-center px-5 text-center">
      <h1 className="text-[22px] font-bold text-ink">{title}</h1>
      <p className="mt-2 text-[14px] text-body">{note}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Try again
        </button>
      ) : (
        <Link
          href={backHref}
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          {backLabel}
        </Link>
      )}
    </div>
  );
}

/* Mirrors the real two-column layout so the form/summary don't snap in. */
function BookSkeleton() {
  return (
    <div className="mx-auto max-w-body px-5 pb-20 pt-5 lg:px-7">
      {/* Same rhythm as the real header: breadcrumb, then the 30px title. */}
      <div className="skeleton h-4 w-64" />
      <div className="skeleton mt-2 h-8 w-56" />
      <div className="mt-9 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_400px]">
        <div>
          <div className="skeleton h-4 w-40" />
          <div className="skeleton mt-4 h-12 w-full" />
          <div className="skeleton mt-3 h-12 w-full" />
          <div className="skeleton mt-8 h-5 w-32" />
          <div className="skeleton mt-4 h-[52px] w-full" />
          <div className="skeleton mt-3 h-[132px] w-full" />
          <div className="skeleton mt-8 h-5 w-40" />
          <div className="skeleton mt-4 h-[196px] w-full" />
          <div className="skeleton mt-5 h-11 w-44" />
        </div>
        <aside>
          <div className="rounded-2xl border border-line bg-white p-5">
            <div className="flex gap-4">
              <div className="skeleton h-[74px] w-[92px] flex-shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton mt-2 h-3 w-1/2" />
              </div>
            </div>
            <hr className="my-5 border-line" />
            <div className="skeleton h-4 w-28" />
            <div className="skeleton mt-4 h-4 w-full" />
            <div className="skeleton mt-3 h-4 w-full" />
            <hr className="my-4 border-line" />
            <div className="skeleton h-5 w-full" />
          </div>
        </aside>
      </div>
    </div>
  );
}

/* Self-contained card-brand marks (lucide dropped brand icons). */
const CARD_BRANDS: Record<string, React.ReactNode> = {
  Mastercard: (
    <span className="relative inline-flex h-5 w-8 items-center">
      <span className="absolute left-0 h-5 w-5 rounded-full bg-[#eb001b]" />
      <span className="absolute left-3 h-5 w-5 rounded-full bg-[#f79e1b] opacity-90 mix-blend-multiply" />
    </span>
  ),
  "Google Pay": (
    <span className="text-[13px] font-semibold">
      <span className="text-[#4285f4]">G</span>
      <span className="text-[#ea4335]">P</span>
      <span className="text-[#fbbc04]">a</span>
      <span className="text-[#34a853]">y</span>
    </span>
  ),
  PayPal: (
    <span className="text-[13px] font-bold italic">
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#009cde]">Pal</span>
    </span>
  ),
  Visa: (
    <span className="text-[14px] font-bold italic tracking-tight text-[#1a1f71]">
      VISA
    </span>
  ),
};

/**
 * The PayPal flow. Instead of a card, the guest signs in to the PayPal account
 * that will fund the stay — the same shape as PayPal's real hosted login. The
 * account e-mail is masked server-side before it's ever stored.
 */
function PayPalPanel({
  email,
  setEmail,
  password,
  setPassword,
  amount,
  emailInvalid,
  passInvalid,
  uid,
}: {
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  amount: string;
  emailInvalid: boolean;
  passInvalid: boolean;
  uid: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-line p-5">
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-bold italic">
          <span className="text-[#003087]">Pay</span>
          <span className="text-[#009cde]">Pal</span>
        </span>
        <span className="text-[13px] text-muted">
          Paying <span className="font-semibold text-ink">{amount}</span>
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        Log in to the PayPal account you&apos;d like to pay with.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <PlainCell>
          <input
            id={`${uid}-pp-email`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="PayPal e-mail *"
            aria-label="PayPal e-mail"
            autoComplete="email"
            aria-invalid={emailInvalid || undefined}
            className={inputCls}
          />
        </PlainCell>
        <PlainCell className="border-t border-line">
          <input
            id={`${uid}-pp-pass`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="PayPal password *"
            aria-label="PayPal password"
            autoComplete="current-password"
            aria-invalid={passInvalid || undefined}
            className={inputCls}
          />
        </PlainCell>
      </div>
      <p className="mt-3 text-[12.5px] text-muted">
        Your PayPal balance or linked bank will be charged when you confirm. We
        never see or store your PayPal password.
      </p>
    </div>
  );
}

/**
 * The Google Pay flow. The guest gives the UPI id or Google account the payment
 * comes from; confirming acts as approving the Google Pay prompt. Masked before
 * it is stored, just like the card and PayPal paths.
 */
function GooglePayPanel({
  value,
  setValue,
  amount,
  invalid,
  uid,
}: {
  value: string;
  setValue: (v: string) => void;
  amount: string;
  invalid: boolean;
  uid: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-line p-5">
      <div className="flex items-center justify-between">
        <span className="text-[18px] font-semibold">
          <span className="text-[#4285f4]">G</span>
          <span className="text-[#ea4335]">P</span>
          <span className="text-[#fbbc04]">a</span>
          <span className="text-[#34a853]">y</span>
        </span>
        <span className="text-[13px] text-muted">
          Paying <span className="font-semibold text-ink">{amount}</span>
        </span>
      </div>
      <p className="mt-1 text-[13px] text-muted">
        Enter the UPI ID or Google account to pay from. You&apos;ll approve the
        payment when you confirm.
      </p>
      <div className="mt-4 overflow-hidden rounded-xl border border-line">
        <PlainCell>
          <input
            id={`${uid}-gpay-id`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="UPI ID (name@bank) or Google e-mail *"
            aria-label="Google Pay UPI ID or e-mail"
            autoComplete="off"
            aria-invalid={invalid || undefined}
            className={inputCls}
          />
        </PlainCell>
      </div>
    </div>
  );
}
