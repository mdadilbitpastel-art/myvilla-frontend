"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, Star } from "lucide-react";
import Breadcrumb from "@/components/property/Breadcrumb";
import { useAuth } from "@/lib/auth";
import { fetchVilla, createBooking, type Villa } from "@/lib/api";

// Platform service fee — must match the backend (SERVICE_FEE_RATE).
const SERVICE_FEE_RATE = 0.141;

const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia",
  "Germany", "France", "Spain", "Italy", "Netherlands", "United Arab Emirates",
  "Singapore", "Japan", "China", "Brazil", "Mexico", "South Africa",
  "New Zealand", "Switzerland", "Sweden", "Norway", "Ireland", "Portugal",
  "Colombia", "Argentina", "Other",
];

const money = (n: number) => `$${n.toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

function fmtDate(d: Date) {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}
const isoDate = (d: Date) => {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const onlyDigits = (s: string) => s.replace(/\D/g, "");

export default function BookVillaPage() {
  const params = useParams();
  const id = String(params.id);
  const router = useRouter();
  const { user, ready, openAuth } = useAuth();

  // Trip params come from the Reserve button (?guests=&nights=).
  const trip = useMemo(() => {
    const sp =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();
    const guests = Math.max(1, parseInt(sp.get("guests") || "1", 10) || 1);
    const nights = Math.max(1, parseInt(sp.get("nights") || "3", 10) || 3);
    return { guests, nights };
  }, []);

  // Real check-in / check-out: today → today + nights.
  const dates = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + trip.nights);
    return { start, end };
  }, [trip.nights]);

  const [v, setV] = useState<Villa | null | undefined>(undefined);

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
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchVilla(id).then(setV).catch(() => setV(null));
  }, [id]);

  // Prefill the e-mail from the signed-in user.
  useEffect(() => {
    if (user?.email) setEmail((e) => e || user.email);
  }, [user]);

  // Not signed in → surface the sign-in modal (Reserve normally guards this).
  useEffect(() => {
    if (ready && !user) openAuth("signin");
  }, [ready, user, openAuth]);

  if (!ready || v === undefined) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-5 text-[14px] text-muted">
        Loading…
      </div>
    );
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
  const subtotal = round2(price * trip.nights);
  const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
  const total = round2(subtotal + serviceFee);
  const cover = v.photos[0]?.url || v.coverImage || "";

  function validate(): string {
    if (!cardType.trim()) return "Please choose a card type.";
    if (onlyDigits(cardNumber).length < 12) return "Enter a valid card number.";
    if (!expiration.trim()) return "Enter the card expiration date.";
    const c = onlyDigits(cvv);
    if (c.length < 3 || c.length > 4) return "Enter a valid CVV.";
    if (!street.trim()) return "Enter your billing street name.";
    if (!city.trim()) return "Enter your billing city.";
    if (!country.trim()) return "Select your billing country or region.";
    if (!email.includes("@") || !email.includes(".")) return "Enter a valid e-mail address.";
    return "";
  }

  async function onConfirm() {
    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await createBooking({
        villaId: id,
        checkIn: isoDate(dates.start),
        checkOut: isoDate(dates.end),
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
            <SelectBox value={cardType} onChange={setCardType}>
              <option>Credit Card or Debit Card</option>
              <option>Credit Card</option>
              <option>Debit Card</option>
            </SelectBox>
          </div>

          {/* Card number + expiration + cvv (connected group) */}
          <div className="mt-3 overflow-hidden rounded-xl border border-line">
            <LabeledCell label="Card Number">
              <input
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                inputMode="numeric"
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
              />
            </LabeledCell>
            <div className="grid grid-cols-2 border-t border-line">
              <LabeledCell label="Expiration" className="border-r border-line">
                <input
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value)}
                  placeholder="MM/YY"
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
                />
              </LabeledCell>
              <div className="flex items-center px-4 py-3">
                <input
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  inputMode="numeric"
                  placeholder="CVV"
                  className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-muted/70"
                />
              </div>
            </div>
          </div>

          {/* Billing address */}
          <h2 className="mt-8 text-[19px] font-semibold text-ink">Billing Adress</h2>
          <div className="mt-4 overflow-hidden rounded-xl border border-line">
            <PlainCell>
              <input value={street} onChange={(e) => setStreet(e.target.value)} placeholder="Street Name" className={inputCls} />
            </PlainCell>
            <PlainCell className="border-t border-line">
              <input value={apartment} onChange={(e) => setApartment(e.target.value)} placeholder="Apartment Number" className={inputCls} />
            </PlainCell>
            <PlainCell className="border-t border-line">
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className={inputCls} />
            </PlainCell>
            <div className="grid grid-cols-2 border-t border-line">
              <PlainCell className="border-r border-line">
                <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className={inputCls} />
              </PlainCell>
              <PlainCell>
                <input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="Zip Code" className={inputCls} />
              </PlainCell>
            </div>
          </div>

          <div className="mt-3">
            <SelectBox value={country} onChange={setCountry} placeholder="Country or Region">
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
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail Adress" className={inputCls} />
            </PlainCell>
            <div className="grid grid-cols-[64px_1fr] border-t border-line">
              <div className="flex items-center justify-center border-r border-line text-[14px] text-muted">
                +00
              </div>
              <PlainCell>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="Phone Number" className={inputCls} />
              </PlainCell>
            </div>
          </div>

          {/* Cancellation policy */}
          <h2 className="mt-8 text-[15px] font-bold text-ink">Cancellation Policy</h2>
          <p className="mt-3 text-[13px] leading-6 text-body">
            Free cancellation before 12:00 PM on Feb 01. After that, cancel before 12:00
            PM on Feb 02 and get a full refund, minus the first night and service fee.
            <br />
            <a href="#" className="font-semibold text-ink underline underline-offset-2">
              Learn More
            </a>
          </p>
          <p className="mt-3 text-[13px] leading-6 text-body">
            Our Extenuating Circumstances policy does not cover travel disruptions caused
            by COVID-19.
            <br />
            <a href="#" className="font-semibold text-ink underline underline-offset-2">
              Learn More
            </a>
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
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-[13px] text-red-600">
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cover}
                  alt={v.title}
                  className="h-[74px] w-[92px] flex-shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold leading-snug text-ink">
                    {v.title}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">Private room</p>
                  <p className="mt-2 flex items-center gap-1.5 text-[12px]">
                    <Star size={13} className="fill-primary text-primary" />
                    <span className="font-medium text-ink">4.69 Rating</span>
                    <span className="text-muted">· 26 reviews</span>
                  </p>
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
                  <span className="underline underline-offset-2">Service fee</span>
                  <span className="text-ink">{money(serviceFee)}</span>
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
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`px-4 py-2.5 ${className}`}>
      <span className="block text-[11px] text-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  children,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      {placeholder && !value && <span className="sr-only">{placeholder}</span>}
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
}: {
  title: string;
  note: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-center justify-center px-5 text-center">
      <h1 className="text-[22px] font-bold text-ink">{title}</h1>
      <p className="mt-2 text-[14px] text-body">{note}</p>
      <Link
        href={backHref}
        className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
      >
        {backLabel}
      </Link>
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
