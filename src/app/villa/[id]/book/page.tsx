"use client";

import { Suspense, useEffect, useId, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Breadcrumb from "@/components/property/Breadcrumb";
import Img from "@/components/ui/Img";
import { useAuth } from "@/lib/auth";
import { fetchVilla, createBooking, type Villa } from "@/lib/api";
import { computeStayPricing, TAX_RATE } from "@/lib/pricing";

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

function fmtDate(d: Date) {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

// Which field a validation message belongs to, so it can be marked invalid.
type FieldKey =
  | "cardType"
  | "cardNumber"
  | "expiration"
  | "cvv"
  | "street"
  | "city"
  | "country"
  | "email";

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
  const trip = {
    guests,
    nights: dates
      ? Math.max(1, Math.round((dates.end.getTime() - dates.start.getTime()) / 86_400_000))
      : 0,
  };

  // Both results are tagged with the id they belong to, so a slow response for
  // a previous id can neither win nor leak into the next one.
  // `undefined` = still loading, `null` = the villa genuinely doesn't exist.
  const [loaded, setLoaded] = useState<{ id: string; villa: Villa | null } | null>(null);
  const [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const v = loaded?.id === id ? loaded.villa : undefined;
  const loadError = failure?.id === id ? failure.message : "";

  // Payment form state
  const [cardType, setCardType] = useState("Credit Card or Debit Card");
  const [cardNumber, setCardNumber] = useState("");
  const [expiration, setExpiration] = useState("");
  const [cvv, setCvv] = useState("");
  const [street, setStreet] = useState("");
  const [apartment, setApartment] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState<FieldKey | "">("");
  const [submitting, setSubmitting] = useState(false);
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
            message: e instanceof Error ? e.message : "Could not load this villa.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  // Prefill the e-mail from the signed-in user.
  useEffect(() => {
    if (user?.email) setEmail((e) => e || user.email);
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
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  if (loadError) {
    return (
      <Centered
        title="Couldn't load this villa"
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

  // --- Price details ---
  const price = v.pricePerNight || 0;
  const { subtotal, serviceFee, tax, total } = computeStayPricing(price, trip.nights);
  const cover = v.photos[0]?.url || v.coverImage || "";
  // Narrowed once here — closures below can't see the `!dates` guard above.
  const stay = dates;
  // Free cancellation until noon the day before arrival; partial refund until
  // noon on the arrival day itself.
  const freeUntil = fmtShort(addDays(stay.start, -1));
  const partialUntil = fmtShort(stay.start);

  function validate(): { field: FieldKey; message: string } | null {
    if (!cardType.trim()) return { field: "cardType", message: "Please choose a card type." };
    const card = onlyDigits(cardNumber);
    if (card.length < 12 || !luhnValid(card))
      return { field: "cardNumber", message: "Enter a valid card number." };
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(expiration.trim()))
      return { field: "expiration", message: "Enter a valid expiration (MM/YY)." };
    const c = onlyDigits(cvv);
    if (c.length < 3 || c.length > 4) return { field: "cvv", message: "Enter a valid CVV." };
    if (!street.trim()) return { field: "street", message: "Enter your billing street name." };
    if (!city.trim()) return { field: "city", message: "Enter your billing city." };
    if (!country.trim())
      return { field: "country", message: "Select your billing country or region." };
    if (!EMAIL_RE.test(email.trim()))
      return { field: "email", message: "Enter a valid e-mail address." };
    return null;
  }

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
      await createBooking({
        villaId: id,
        checkIn: isoDate(stay.start),
        checkOut: isoDate(stay.end),
        guests: trip.guests,
        paymentMethod: cardType,
        cardNumber,
        expiration,
        cvv,
        billingStreet: street,
        billingApartment: apartment,
        billingCity: city,
        billingState: state,
        billingZip: zip,
        billingCountry: country,
        contactEmail: email,
        contactPhone: phone,
      });
      router.push("/settings/bookings?booked=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment could not be completed.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-6">
      <Breadcrumb items={["Home", "All Topics", "Legal Terms", "Privacy Policy"]} />

      <div className="flex items-start justify-between">
        <h1 className="text-[26px] font-bold text-ink">Confirm Payment</h1>
        <Link
          href={`/villa/${id}`}
          className="text-[14px] text-ink underline underline-offset-2 hover:text-primary"
        >
          Cancel
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
        {/* ---------- Left: payment form ---------- */}
        <div>
          {/* Trip details */}
          <h2 className="text-[15px] font-bold text-ink">Your Trip Details</h2>
          <TripRow
            label="Duration"
            value={`${trip.nights} Days (${fmtDate(dates.start)} to ${fmtDate(dates.end)})`}
            editHref={`/villa/${id}`}
          />
          <TripRow
            label="Guests"
            value={`${trip.guests} guest${trip.guests === 1 ? "" : "s"} (${trip.guests} adult${trip.guests === 1 ? "" : "s"})`}
            editHref={`/villa/${id}`}
          />

          {/* Pay using */}
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-[19px] font-semibold text-ink">Pay using</h2>
            <CardBrands />
          </div>

          {/* Card type select */}
          <div className="mt-4">
            <SelectBox
              value={cardType}
              onChange={setCardType}
              label="Card type"
              invalid={errorField === "cardType"}
            >
              <option>Credit Card or Debit Card</option>
              <option>Credit Card</option>
              <option>Debit Card</option>
            </SelectBox>
          </div>

          {/* Card number + expiration + cvv (connected group) */}
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <LabeledCell label="Card Number" htmlFor={`${uid}-card`}>
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
              <LabeledCell label="Expiration" htmlFor={`${uid}-exp`} className="border-r border-line">
                <input
                  id={`${uid}-exp`}
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  placeholder="MM/YY"
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  maxLength={7}
                  aria-invalid={errorField === "expiration" || undefined}
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
                />
              </LabeledCell>
              <div className="flex items-center px-4 py-3">
                <input
                  id={`${uid}-cvv`}
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  inputMode="numeric"
                  placeholder="CVV"
                  aria-label="CVV"
                  autoComplete="cc-csc"
                  maxLength={4}
                  aria-invalid={errorField === "cvv" || undefined}
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
                />
              </div>
            </div>
          </div>

          {/* Billing address */}
          <h2 className="mt-8 text-[19px] font-semibold text-ink">Billing Address</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <PlainCell>
              <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street Name" aria-label="Street Name" autoComplete="address-line1" aria-invalid={errorField === "street" || undefined} className={inputCls} />
            </PlainCell>
            <PlainCell className="border-t border-line">
              <input value={apartment} onChange={(e) => setApartment(e.target.value)} placeholder="Apartment Number" aria-label="Apartment Number" autoComplete="address-line2" className={inputCls} />
            </PlainCell>
            <PlainCell className="border-t border-line">
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" aria-label="City" autoComplete="address-level2" aria-invalid={errorField === "city" || undefined} className={inputCls} />
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
                Country or Region
              </option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectBox>
          </div>

          {/* Additional information */}
          <h2 className="mt-8 text-[19px] font-semibold text-ink">Additional Information</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <PlainCell>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail Address" aria-label="E-mail Address" autoComplete="email" aria-invalid={errorField === "email" || undefined} className={inputCls} />
            </PlainCell>
            <div className="grid grid-cols-[64px_1fr] border-t border-line">
              <div className="flex items-center justify-center border-r border-line text-[14px] text-muted">
                +00
              </div>
              <PlainCell>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone Number" aria-label="Phone Number" autoComplete="tel" className={inputCls} />
              </PlainCell>
            </div>
          </div>

          {/* Cancellation policy */}
          <h2 className="mt-8 text-[15px] font-bold text-ink">Cancellation Policy</h2>
          <p className="mt-3 text-[13px] leading-6 text-body">
            Free cancellation before 12:00 PM on {freeUntil}. After that, cancel before 12:00
            PM on {partialUntil} and get a full refund, minus the first night and service fee.
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

          {error && (
            <p ref={errorRef} role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-600">
              {error}
            </p>
          )}

          <button
            onClick={onConfirm}
            disabled={submitting}
            className="mt-5 rounded-xl bg-primary px-6 py-3 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Processing…" : "Confirm and Pay"}
          </button>
        </div>

        {/* ---------- Right: summary card ---------- */}
        <aside>
          <div className="lg:sticky lg:top-[88px]">
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

              <hr className="my-5 border-line" />

              <h3 className="text-[15px] font-bold text-ink">Price Details</h3>
              <div className="mt-4 space-y-3 text-[14px]">
                <div className="flex items-center justify-between text-body">
                  <span>
                    {money(price)} x {trip.nights} night{trip.nights === 1 ? "" : "s"}
                  </span>
                  <span className="text-ink">{money(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-body">
                  <span>Discount</span>
                  <span className="text-ink">{money(0)}</span>
                </div>
                <div className="flex items-center justify-between text-body">
                  <span className="underline underline-offset-2">Service fee</span>
                  <span className="text-ink">{money(serviceFee)}</span>
                </div>
                <div className="flex items-center justify-between text-body">
                  <span>Tax ({Math.round(TAX_RATE * 100)}%)</span>
                  <span className="text-ink">{money(tax)}</span>
                </div>
              </div>

              <hr className="my-4 border-line" />

              <div className="flex items-center justify-between text-[15px] font-bold text-ink">
                <span>Total (USD)</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- small building blocks ---------- */

const inputCls =
  "w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70";

function PlainCell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`px-4 py-3.5 ${className}`}>{children}</div>;
}

function LabeledCell({
  label,
  htmlFor,
  children,
  className = "",
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 py-2.5 ${className}`}>
      <label htmlFor={htmlFor} className="block text-[11px] text-muted">
        {label}
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
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
  label?: string;
  autoComplete?: string;
  invalid?: boolean;
}) {
  return (
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
  );
}

function TripRow({
  label,
  value,
  editHref,
}: {
  label: string;
  value: string;
  editHref: string;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-semibold text-ink">{label}</span>
        <Link href={editHref} className="text-[13px] text-ink underline underline-offset-2 hover:text-primary">
          Edit
        </Link>
      </div>
      <p className="mt-0.5 text-[12px] text-muted">{value}</p>
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
    <div className="mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-center justify-center px-5 text-center">
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
    <div className="mx-auto max-w-[1120px] px-5 pb-20 pt-6">
      <div className="skeleton h-4 w-64" />
      <div className="skeleton mt-6 h-7 w-56" />
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_380px]">
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
function CardBrands() {
  return (
    <div className="flex items-center gap-2.5">
      {/* Mastercard */}
      <span className="relative inline-flex h-5 w-8 items-center">
        <span className="absolute left-0 h-5 w-5 rounded-full bg-[#eb001b]" />
        <span className="absolute left-3 h-5 w-5 rounded-full bg-[#f79e1b] opacity-90 mix-blend-multiply" />
      </span>
      {/* Google Pay */}
      <span className="text-[13px] font-semibold">
        <span className="text-[#4285f4]">G</span>
        <span className="text-[#ea4335]">P</span>
        <span className="text-[#fbbc04]">a</span>
        <span className="text-[#34a853]">y</span>
      </span>
      {/* PayPal */}
      <span className="text-[13px] font-bold italic">
        <span className="text-[#003087]">Pay</span>
        <span className="text-[#009cde]">Pal</span>
      </span>
      {/* Visa */}
      <span className="text-[14px] font-bold italic tracking-tight text-[#1a1f71]">
        VISA
      </span>
    </div>
  );
}
