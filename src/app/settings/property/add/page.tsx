"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Plus,
  X,
  Wifi,
  Car,
  AirVent,
  CalendarDays,
  AlarmSmoke,
  Waves,
  Bath,
  Flame,
  Tv,
  Lightbulb,
  Info,
  Clock,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import Img from "@/components/ui/Img";
import {
  createVilla,
  updateVilla,
  fetchMyVillas,
  type VillaInput,
} from "@/lib/api";
import { fileToResizedDataUrl } from "@/lib/image";
// Shared with the villa detail page, which splits a villa's saved `services`
// back into facilities vs extra services off this same list.
import { EXTRA_SERVICES } from "@/lib/services";
import VillaAvailabilityPanel from "@/components/settings/VillaAvailability";

// Height of the global navbar the sticky page header parks under.
const NAV_HEIGHT = 68;

const STEPS = [
  "Property Details",
  "Add Images",
  "Pricing",
  "Payment Method",
];

const VILLA_TYPES = [
  "Villa Living",
  "Combinative Villa",
  "Hotel",
  "Bungalow",
  "Others (specify)",
];

const FACILITIES = [
  { label: "Wifi", Icon: Wifi },
  { label: "Free Parking", Icon: Car },
  { label: "Air Conditioner", Icon: AirVent },
  { label: "Long Stays", Icon: CalendarDays },
  { label: "Smoke Alarm", Icon: AlarmSmoke },
  { label: "Swimming Pool", Icon: Waves },
  { label: "Jacuzzi", Icon: Bath },
  { label: "BBQ Corner", Icon: Flame },
  { label: "TV", Icon: Tv },
] as const;

const PAYMENT_METHODS = ["Mastercard", "Google Pay", "PayPal", "Visa"];
const ACCOUNT_TYPES = ["Credit Card", "Debit Card"];

// Steps with no mandatory fields (always "complete").
// Extra services now live inside "Property Details" as an optional block, so
// every remaining step is mandatory.
const OPTIONAL_STEPS = new Set<number>();

const digitsOf = (s: string) => s.replace(/\D/g, "");

// The check-in / check-out times most listings use, pre-filled so a host who
// keeps the industry-standard hours doesn't have to set anything. They're
// ordinary values in the form — changing them is one click.
const DEFAULT_CHECK_IN = "14:00"; // 2:00 pm
const DEFAULT_CHECK_OUT = "11:00"; // 11:00 am

// How far ahead a new listing is open for booking. The host moves it from the
// calendar on the edit page; five days is only where it starts.
const DEFAULT_AVAILABILITY_DAYS = 5;

// One room per bed, and what each bed sleeps. Mirrored by GUESTS_PER_SINGLE /
// GUESTS_PER_DOUBLE on the Villa model, which recomputes both server-side —
// these are for showing the host the result as they type, not for trusting.
const roomsOf = (single: number, double: number) => single + double;
const capacityOf = (single: number, double: number) => single * 1 + double * 2;

// An image in the wizard is either an already-saved photo (edit mode) or a
// freshly picked file encoded as a base64 data-URL. `key` is assigned once, on
// add, so React keeps every tile bound to its own photo when one is deleted.
type WizardImage = { key: string } & (
  | { kind: "existing"; id: string; url: string }
  | { kind: "new"; dataUrl: string }
);

let imageSeq = 0;
const nextImageKey = () => `img-${++imageSeq}`;

const imageSrc = (im: WizardImage) => (im.kind === "existing" ? im.url : im.dataUrl);

/* --- Per-section validation. Each returns null when complete, else the first
   missing field and its message. Shared by the Save/Publish gate AND the
   stepper's live complete/incomplete indicator, so the two never disagree. --- */

// Which field blocked the step, so the input itself can be marked invalid.
type FieldIssue = { field: string; message: string };

function villaError(v: VillaForm): FieldIssue | null {
  if (!v.title.trim()) return { field: "title", message: "Property name is required." };
  if (!v.description.trim())
    return { field: "description", message: "A property description is required." };
  if (!v.buildUpArea.trim())
    return { field: "buildUpArea", message: "Property dimensions are required." };
  if (!v.address.trim()) return { field: "address", message: "Property address is required." };
  // The bed counts are what the host fills in; the room count and the guest
  // capacity are read off them (see `roomsOf` / `capacityOf`), so these two are
  // the only ones that can be missing.
  if (v.singleBedRooms + v.doubleBedRooms < 1)
    return {
      field: "singleBedRooms",
      message: "Add at least one room — how many have a single bed, and how many a double.",
    };
  // Guests plan travel around these two, so a listing can't go up without them.
  if (!v.checkInTime)
    return { field: "checkInTime", message: "Set a check-in time." };
  if (!v.checkOutTime)
    return { field: "checkOutTime", message: "Set a check-out time." };
  if (v.availabilityDays < 1)
    return {
      field: "availabilityDays",
      message: "Open your calendar for at least one day.",
    };
  return null;
}

function imagesError(images: WizardImage[]): FieldIssue | null {
  return images.length ? null : { field: "images", message: "Please add at least one image." };
}

function pricingError(price: string): FieldIssue | null {
  return Number(price) > 0
    ? null
    : { field: "price", message: "Please enter a valid price per night." };
}

function paymentError(
  accepted: string[],
  accountType: string,
  cardNumber: string,
  editMode: boolean
): FieldIssue | null {
  if (accepted.length === 0)
    return { field: "acceptedPayments", message: "Select at least one payment method." };
  if (!accountType) return { field: "accountType", message: "Please choose Credit or Debit Card." };
  const d = digitsOf(cardNumber);
  // In edit mode a blank card means "keep the existing one".
  if (editMode && d.length === 0) return null;
  if (d.length < 12) return { field: "cardNumber", message: "Enter a valid card number." };
  return null;
}

export default function AddVillaPage() {
  const { user, ready } = useAuth();

  if (!ready) return <div className="min-h-[60vh]" />;
  if (!user) return <SignInGate />;
  // `useSearchParams` inside the wizard makes it client-rendered, so it needs
  // a boundary of its own.
  return (
    <Suspense fallback={<WizardSkeleton />}>
      <Wizard />
    </Suspense>
  );
}

/* ================================================================== */
/* Wizard                                                             */
/* ================================================================== */

function Wizard() {
  const router = useRouter();
  useAuth();

  // Edit mode when the URL carries ?edit=<villaId>. Read through the router
  // hook: `window.location` doesn't exist on the server, so the page would
  // render "Add your Property" and then flip to "Edit your Property" on hydration.
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const editMode = !!editId;

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingVilla, setLoadingVilla] = useState(editMode);
  // Set when an existing villa can't be loaded — that must not fall through to
  // a blank create form.
  const [loadFailed, setLoadFailed] = useState("");

  // Collapse the sticky page header once it's actually stuck. Watched via a
  // sentinel that sits BEFORE the header in the flow, so the header shrinking
  // can't move it — a window.scrollY threshold fed its own height change back
  // into the trigger and flickered open/shut.
  //
  // Attached through a callback ref, not an effect: in edit mode the wizard
  // renders <WizardSkeleton /> first, so on mount the sentinel doesn't exist
  // yet and an effect would silently observe nothing — which is why edit mode
  // never collapsed while add mode did.
  const [scrolled, setScrolled] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const headerSentinel = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: `-${NAV_HEIGHT}px 0px 0px 0px`, threshold: 0 }
    );
    observer.current.observe(node);
  }, []);
  const [reloadKey, setReloadKey] = useState(0);
  const errorRef = useRef<HTMLParagraphElement>(null);

  // Step 1 — villa details.
  const [villa, setVilla] = useState({
    title: "",
    propertyType: "Villa Living",
    buildUpArea: "",
    address: "",
    description: "",
    bedrooms: 1,
    guests: 1,
    singleBedRooms: 0,
    doubleBedRooms: 0,
    availabilityDays: DEFAULT_AVAILABILITY_DAYS,
    checkInTime: DEFAULT_CHECK_IN,
    checkOutTime: DEFAULT_CHECK_OUT,
    petsAllowed: false,
    smokingAllowed: false,
    eventsAllowed: false,
    additionalRules: "",
  });
  const [villaTypeOther, setVillaTypeOther] = useState("");

  // Step 2–5.
  const [images, setImages] = useState<WizardImage[]>([]);
  const [services, setServices] = useState<string[]>([]);
  // Nights the host has closed on the calendar. Draft state like every other
  // field: nothing reaches the server until the listing itself is saved.
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [acceptedPayments, setAcceptedPayments] = useState<string[]>([...PAYMENT_METHODS]);
  const [accountType, setAccountType] = useState("");
  const [cardNumber, setCardNumber] = useState("");

  // Edit mode — load the villa and pre-fill every section.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    fetchMyVillas()
      .then((list) => {
        if (cancelled) return;
        const v = list.find((x) => x.id === editId);
        if (!v) {
          setLoadFailed("That villa could not be found.");
          setLoadingVilla(false);
          return;
        }
        const knownType = VILLA_TYPES.includes(v.propertyType);
        setVilla({
          title: v.title,
          propertyType: knownType ? v.propertyType : "Others (specify)",
          buildUpArea: v.buildUpArea,
          address: v.address,
          description: v.description,
          bedrooms: v.bedrooms || 1,
          guests: v.guests || 1,
          singleBedRooms: v.singleBedRooms || 0,
          doubleBedRooms: v.doubleBedRooms || 0,
          availabilityDays: v.availabilityDays || DEFAULT_AVAILABILITY_DAYS,
          // Villas listed before times existed have none stored; fall back to
          // the standard hours rather than showing the host an empty required
          // field they never left blank.
          checkInTime: v.checkInTime || DEFAULT_CHECK_IN,
          checkOutTime: v.checkOutTime || DEFAULT_CHECK_OUT,
          petsAllowed: v.petsAllowed,
          smokingAllowed: v.smokingAllowed,
          eventsAllowed: v.eventsAllowed,
          additionalRules: v.additionalRules || "",
        });
        if (!knownType) setVillaTypeOther(v.propertyType);
        setServices(v.services || []);
        setBlockedDates(v.blockedDates || []);
        setPrice(v.pricePerNight ? String(v.pricePerNight) : "");
        setAcceptedPayments(
          v.acceptedPayments?.length ? v.acceptedPayments : [...PAYMENT_METHODS]
        );
        setAccountType(v.payoutMethod || "");
        setCardNumber(""); // blank = keep existing card on save
        setImages(
          (v.photos || []).map((p) => ({
            key: nextImageKey(),
            kind: "existing" as const,
            id: p.id,
            url: p.url,
          }))
        );
        setLoadingVilla(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadFailed(e instanceof Error ? e.message : "Could not load the villa.");
          setLoadingVilla(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editId, reloadKey]);
  // Publishing jumps back to the first incomplete section, so the banner can
  // appear on a step the user isn't looking at — bring it into view.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [error]);

  // Live per-section validation — recomputed every render from current state,
  // so the stepper's complete/incomplete badges stay correct from ANY step.
  const stepIssues = [
    villaError(villa),
    imagesError(images),
    pricingError(price),
    paymentError(acceptedPayments, accountType, cardNumber, editMode),
  ];
  const stepComplete = stepIssues.map((e) => e === null);
  // The next section that still needs something — this one doesn't count.
  // Whatever is missing *here* is reported in place rather than by sending the
  // host somewhere else, so the button only steps on when the gap is elsewhere.
  const otherIncomplete = stepComplete.findIndex((done, i) => !done && i !== step);
  // As long as some OTHER section is missing something, this button's job is
  // still to move on to it — whether or not this one is finished yet. It only
  // becomes the final save when this section is the last thing left.
  const stepsOn = otherIncomplete !== -1;

  function goto(target: number) {
    // Any step is freely clickable — jump around the wizard like tabs.
    setError("");
    setInvalidField("");
    setStep(target);
  }

  // A new section always starts at its top — landing halfway down it, at the
  // scroll position the last one was left at, reads as a broken page.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  async function handleNext() {
    setError("");
    setInvalidField("");

    // Whatever is missing here is said here, on the field that's missing it.
    const issue = stepIssues[step];
    if (issue) {
      setError(issue.message);
      setInvalidField(issue.field);
      return;
    }

    // This section is done. If another isn't, go there — in order, whether it
    // is ahead of here or behind.
    if (otherIncomplete !== -1) {
      const blocking = stepIssues[otherIncomplete]!;
      setStep(otherIncomplete);
      setError(`"${STEPS[otherIncomplete]}" is incomplete — ${blocking.message}`);
      setInvalidField(blocking.field);
      return;
    }

    // Everything is filled in, from wherever the host happens to be standing.
    await publish();
  }

  async function publish() {
    setError("");
    setBusy(true);
    try {
      const propertyType =
        villa.propertyType === "Others (specify)"
          ? villaTypeOther.trim() || "Others"
          : villa.propertyType;
      // Split images into brand-new uploads (base64) and existing ones to keep.
      const newImages = images
        .filter((im): im is WizardImage & { kind: "new"; dataUrl: string } => im.kind === "new")
        .map((im) => im.dataUrl);
      const keepImageIds = images
        .filter((im): im is WizardImage & { kind: "existing"; id: string } => im.kind === "existing")
        .map((im) => im.id);

      const input: VillaInput = {
        title: villa.title,
        propertyType,
        address: villa.address,
        description: villa.description,
        buildUpArea: villa.buildUpArea,
        bedrooms: roomsOf(villa.singleBedRooms, villa.doubleBedRooms),
        guests: capacityOf(villa.singleBedRooms, villa.doubleBedRooms),
        singleBedRooms: villa.singleBedRooms,
        doubleBedRooms: villa.doubleBedRooms,
        availabilityDays: villa.availabilityDays,
        services,
        blockedDates,
        checkInTime: villa.checkInTime,
        checkOutTime: villa.checkOutTime,
        petsAllowed: villa.petsAllowed,
        smokingAllowed: villa.smokingAllowed,
        eventsAllowed: villa.eventsAllowed,
        additionalRules: villa.additionalRules,
        pricePerNight: Number(price) || 0,
        acceptedPayments,
        payoutMethod: accountType,
        payoutAccount: cardNumber,
        images: newImages,
      };

      if (editId) {
        await updateVilla(editId, input, keepImageIds);
        router.push("/settings/property?updated=1");
      } else {
        await createVilla(input);
        router.push("/settings/property?added=1");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save your villa.");
    } finally {
      setBusy(false);
    }
  }

  if (loadingVilla) return <WizardSkeleton />;

  // Terminal: an edit link whose villa never arrived must not quietly turn into
  // a blank "Add your Property" form.
  if (loadFailed) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1120px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">Couldn&apos;t load this villa</h1>
        <p className="mt-2 text-[14px] text-body">{loadFailed}</p>
        <div className="mt-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => {
              setLoadFailed("");
              setLoadingVilla(true);
              setReloadKey((k) => k + 1);
            }}
            className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
          >
            Try again
          </button>
          <Link
            href="/settings/property"
            className="text-[14px] text-ink underline underline-offset-2 hover:text-primary"
          >
            Back to my properties
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-20 lg:px-7">
      {/* Watched by the observer above: once it scrolls under the navbar the
          header below is stuck, so it collapses. */}
      <div ref={headerSentinel} aria-hidden className="h-px" />

      {/* Sticky page header — breadcrumb + title + Back. Bleeds to the viewport
          edges (-mx / px) so its background covers the full width while the
          content stays on the page's grid. */}
      <div
        // Fully opaque: a translucent header let the form scroll through it,
        // and the blur was never enough to keep the heading readable over it.
        className={`sticky top-[68px] z-30 -mx-5 border-b bg-page px-5 transition-all duration-200 lg:-mx-7 lg:px-7 ${
          scrolled ? "border-line py-3" : "border-transparent pb-5 pt-8"
        }`}
      >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-[13px] text-body">
        {/* No "Settings" step: this area is "Manage Account" now, and the
            layout's own breadcrumb already names it. */}
        <Link href="/" className="underline underline-offset-2 hover:text-primary">Home</Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="/settings" className="underline underline-offset-2 hover:text-primary">Manage Account</Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="/settings/property" className="underline underline-offset-2 hover:text-primary">My Property</Link>
        <span className="mx-1.5 text-muted">/</span>
        <span className="text-muted">{editMode ? "Edit your Property" : "Add your Property"}</span>
      </nav>

      {/* Title + Back */}
      <div
        className={`flex items-center justify-between transition-all duration-200 ${
          scrolled ? "mt-1" : "mt-5"
        }`}
      >
        <h1
          className={`font-extrabold text-ink transition-all duration-200 ${
            scrolled ? "text-[20px]" : "text-[30px]"
          }`}
        >
          {editMode ? "Edit your Property" : "Add your Property"}
        </h1>
        <Link
          href="/settings/property"
          className="text-[16px] font-medium text-ink underline underline-offset-4 hover:text-primary"
        >
          Back
        </Link>
      </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        {/* Stepper */}
        <Stepper step={step} complete={stepComplete} onSelect={goto} />

        {/* Card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {step === 0 && (
            <VillaDetailsStep
              values={villa}
              onChange={(k, v) => setVilla((p) => ({ ...p, [k]: v }))}
              villaTypeOther={villaTypeOther}
              setVillaTypeOther={setVillaTypeOther}
              services={services}
              setServices={setServices}
              invalidField={invalidField}
              editVillaId={editId}
              blockedDates={blockedDates}
              onToggleBlocked={(date) =>
                setBlockedDates((prev) =>
                  prev.includes(date)
                    ? prev.filter((d) => d !== date)
                    : [...prev, date].sort()
                )
              }
            />
          )}
          {step === 1 && (
            <ImagesStep images={images} setImages={setImages} setError={setError} />
          )}
          {step === 2 && (
            <PricingStep price={price} setPrice={setPrice} invalidField={invalidField} />
          )}
          {step === 3 && (
            <PaymentStep
              accepted={acceptedPayments}
              setAccepted={setAcceptedPayments}
              accountType={accountType}
              setAccountType={setAccountType}
              cardNumber={cardNumber}
              setCardNumber={setCardNumber}
              invalidField={invalidField}
            />
          )}

          {error && (
            <p
              ref={errorRef}
              role="alert"
              className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600"
            >
              {error}
            </p>
          )}

          {/* Primary action — right-aligned while it still steps forward, left
              once it has become the final save. */}
          <div className={`mt-7 flex ${stepsOn ? "justify-end" : "justify-start"}`}>
            <button
              type="button"
              onClick={handleNext}
              disabled={busy}
              className="rounded-lg bg-primary px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy
                ? "Please wait…"
                : stepsOn
                  ? editMode
                    ? "Update & Next"
                    : "Save and Next"
                  : editMode
                    ? "Update Property"
                    : "Host your Property"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Stepper                                                            */
/* ================================================================== */

function Stepper({
  step,
  complete,
  onSelect,
}: {
  step: number;
  complete: boolean[];
  onSelect: (i: number) => void;
}) {
  return (
    // Sticky below the collapsed page header, so only the step's own panel
    // scrolls. `self-start` is required, not cosmetic: this <nav> IS the grid
    // item, and a stretched item fills its whole grid area, leaving sticky no
    // room to travel. (The settings sidebar differs — its nav sits inside an
    // <aside>, which does the stretching for it.)
    <nav className="lg:sticky lg:top-[148px] lg:self-start lg:pt-1">
      <ol className="relative">
        {STEPS.map((label, i) => {
          const active = i === step;
          const optional = OPTIONAL_STEPS.has(i);
          const isDone = complete[i]; // includes optional steps (always true)
          const incomplete = !isDone;
          return (
            <li key={label} className="relative flex items-start gap-4 pb-8 last:pb-0">
              {i < STEPS.length - 1 && (
                <span
                  className={`absolute left-[15px] top-8 h-[calc(100%-16px)] w-px ${
                    complete[i] ? "bg-primary" : "bg-line"
                  }`}
                />
              )}
              <button
                type="button"
                onClick={() => onSelect(i)}
                // A completed circle renders an icon only, so name the step
                // rather than announcing an empty button.
                aria-label={`Step ${i + 1}: ${label}${isDone && !optional ? " (completed)" : ""}`}
                aria-current={active ? "step" : undefined}
                className={`relative z-10 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
                  isDone
                    ? "bg-primary text-white"
                    : active
                      ? "bg-primary text-white ring-2 ring-primary/30"
                      : "bg-[#c9cdd6] text-white"
                }`}
              >
                {isDone && !optional ? <Check size={16} /> : i + 1}
              </button>
              <button
                type="button"
                onClick={() => onSelect(i)}
                className="cursor-pointer pt-0.5 text-left"
              >
                <span
                  className={`block text-[15px] ${
                    active ? "font-semibold text-primary" : "text-ink"
                  } hover:text-primary`}
                >
                  {label}
                </span>
                <span
                  className={`mt-0.5 flex items-center gap-1 text-[11px] font-medium ${
                    optional
                      ? "text-muted"
                      : incomplete
                        ? "text-red-500"
                        : "text-emerald-600"
                  }`}
                >
                  {optional ? (
                    "Optional"
                  ) : incomplete ? (
                    <>
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                      Incomplete
                    </>
                  ) : (
                    <>
                      <Check size={11} /> Completed
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ================================================================== */
/* Step 1 — Property Details (Screenshot_1 + _2)                      */
/* ================================================================== */

type VillaForm = {
  title: string;
  propertyType: string;
  buildUpArea: string;
  address: string;
  description: string;
  bedrooms: number;
  guests: number;
  singleBedRooms: number;
  doubleBedRooms: number;
  availabilityDays: number;
  checkInTime: string;
  checkOutTime: string;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  eventsAllowed: boolean;
  additionalRules: string;
};

function VillaDetailsStep({
  values,
  onChange,
  villaTypeOther,
  setVillaTypeOther,
  services,
  setServices,
  invalidField,
  editVillaId,
  blockedDates,
  onToggleBlocked,
}: {
  values: VillaForm;
  onChange: (k: keyof VillaForm, v: string | number | boolean) => void;
  villaTypeOther: string;
  setVillaTypeOther: (v: string) => void;
  services: string[];
  setServices: React.Dispatch<React.SetStateAction<string[]>>;
  invalidField: string;
  /** Set when editing an existing villa — unlocks its live calendar. */
  editVillaId?: string | null;
  blockedDates: string[];
  onToggleBlocked: (date: string) => void;
}) {
  const uid = useId();
  // `null` = the "Add More" button is showing; a string = the inline input is.
  const [customFacility, setCustomFacility] = useState<string | null>(null);
  // Escape unmounts the input, which also fires blur — this stops the cancelled
  // value from being committed on the way out.
  const facilityCancelled = useRef(false);

  // The map is a network iframe: rebuilding its src on every keystroke reloads
  // and flickers it, so it follows the address only once typing pauses.
  const [mapQuery, setMapQuery] = useState(values.address.trim());
  useEffect(() => {
    const t = setTimeout(() => setMapQuery(values.address.trim()), 500);
    return () => clearTimeout(t);
  }, [values.address]);

  const words = values.description.trim() ? values.description.trim().split(/\s+/).length : 0;

  function onDescriptionChange(next: string) {
    // Only rewrite the value once the cap is actually exceeded — normalising on
    // every keystroke collapses double spaces and jumps the caret to the end.
    const parts = next.trim().split(/\s+/);
    onChange("description", parts.length > 150 ? parts.slice(0, 150).join(" ") : next);
  }

  function toggleFacility(label: string) {
    setServices((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  }

  function commitCustomFacility() {
    const label = customFacility?.trim();
    if (label && !services.includes(label)) setServices((prev) => [...prev, label]);
    setCustomFacility(null);
  }

  return (
    <div>
      {/* Villa type */}
      <h2 className="text-[16px] font-bold text-ink">What kind of a property are you hosting?</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        {VILLA_TYPES.map((t) => {
          const on = values.propertyType === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => onChange("propertyType", t)}
              className={`rounded-lg border px-6 py-2.5 text-[14px] font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-white"
                  : "border-primary/60 text-primary hover:bg-primary/[0.04]"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
      {values.propertyType === "Others (specify)" && (
        <input
          value={villaTypeOther}
          onChange={(e) => setVillaTypeOther(e.target.value)}
          placeholder="Specify your villa type"
          aria-label="Specify your villa type"
          className="mt-3 w-full max-w-[360px] rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
      )}

      {/* Details */}
      <h3 className="mt-7 text-[16px] font-bold text-ink">Details</h3>
      <div className="mt-4 space-y-4">
        <LabeledInput label="Name of your Property" required placeholder="Complete Name" value={values.title} onChange={(v) => onChange("title", v)} invalid={invalidField === "title"} />
        <div>
          <FieldLabel htmlFor={`${uid}-description`} required>Describe your Property (Max 150 words)</FieldLabel>
          <textarea
            id={`${uid}-description`}
            value={values.description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            rows={4}
            placeholder="Description"
            aria-invalid={invalidField === "description" || undefined}
            className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
          <p className="mt-1.5 text-[12px] text-muted">{words} / 150 words</p>
        </div>
        <LabeledInput label="Villa Dimensions" required placeholder="Total Build up Area (in Square Yards)" value={values.buildUpArea} onChange={(v) => onChange("buildUpArea", v)} invalid={invalidField === "buildUpArea"} />
        <LabeledInput label="Villa Address" required placeholder="Registered Address of Villa" value={values.address} onChange={(v) => onChange("address", v)} invalid={invalidField === "address"} />
        {/* Rooms. The host counts the beds; the room total and the guest
            capacity follow from them, so the two can never disagree — which is
            why the derived pair is shown as a result, not as an input. */}
        <div>
          <FieldLabel required>Rooms and Beds</FieldLabel>
          <p className="mb-2 text-[12px] text-muted">
            One room per bed. A single bed sleeps 1 guest, a double sleeps 2.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumberInput label="Rooms with a single bed" value={values.singleBedRooms} onChange={(n) => onChange("singleBedRooms", n)} invalid={invalidField === "singleBedRooms"} />
            <NumberInput label="Rooms with a double bed" value={values.doubleBedRooms} onChange={(n) => onChange("doubleBedRooms", n)} invalid={invalidField === "doubleBedRooms"} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <DerivedValue
              label="Number of Rooms"
              value={roomsOf(values.singleBedRooms, values.doubleBedRooms)}
            />
            <DerivedValue
              label="Guest Capacity"
              value={capacityOf(values.singleBedRooms, values.doubleBedRooms)}
            />
          </div>

          {/* The same calendar whether the villa exists yet or not. On a new
              listing it simply has no bookings to show — the host still sets
              the window and closes dates before publishing. */}
          <div className="mt-4">
            <VillaAvailabilityPanel
              villaId={editVillaId}
              plannedCapacity={capacityOf(values.singleBedRooms, values.doubleBedRooms)}
              days={values.availabilityDays}
              onDaysChange={(n) => onChange("availabilityDays", n)}
              blockedDates={blockedDates}
              onToggleBlocked={onToggleBlocked}
            />
          </div>
        </div>

        {/* Facilities */}
        <div>
          <FieldLabel>Select Facilities Provided</FieldLabel>
          <div className="mt-1 flex flex-wrap gap-2.5">
            {FACILITIES.map(({ label, Icon }) => {
              const on = services.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleFacility(label)}
                  className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
                    on
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-transparent bg-page text-body hover:bg-line/60"
                  }`}
                >
                  <Icon size={15} strokeWidth={1.7} />
                  {label}
                </button>
              );
            })}
            {customFacility === null ? (
              <button
                type="button"
                onClick={() => setCustomFacility("")}
                className="flex items-center gap-1 rounded-full border border-dashed border-line px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:border-primary hover:text-primary"
              >
                <Plus size={14} /> Add More
              </button>
            ) : (
              <input
                autoFocus
                value={customFacility}
                onChange={(e) => setCustomFacility(e.target.value)}
                onBlur={() => {
                  if (facilityCancelled.current) {
                    facilityCancelled.current = false;
                    return;
                  }
                  commitCustomFacility();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCustomFacility();
                  } else if (e.key === "Escape") {
                    facilityCancelled.current = true;
                    setCustomFacility(null);
                  }
                }}
                placeholder="Facility name"
                aria-label="Add a facility"
                className="rounded-full border border-primary px-3.5 py-1.5 text-[13px] text-ink placeholder:text-muted focus:outline-none"
              />
            )}
          </div>
        </div>

        {/* Extra services — optional, and deliberately below the required
            fields so it never looks like something the host must fill in. */}
        <div>
          <FieldLabel>
            Extra Services{" "}
            <span className="font-normal text-muted">(Optional)</span>
          </FieldLabel>
          <p className="mb-2 text-[12px] text-muted">
            Premium services guests can add to their stay.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {EXTRA_SERVICES.map((service) => {
              const on = services.includes(service);
              return (
                <button
                  key={service}
                  type="button"
                  onClick={() => toggleFacility(service)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${
                    on
                      ? "border-primary bg-primary/[0.06] text-primary"
                      : "border-line text-ink hover:border-primary/40"
                  }`}
                >
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                      on ? "border-primary bg-primary text-white" : "border-line"
                    }`}
                  >
                    {on && <Check size={12} />}
                  </span>
                  {service}
                </button>
              );
            })}
          </div>
        </div>

        {/* House Rules — whatever the host sets here is exactly what the villa
            detail page shows a guest. Nothing is assumed on their behalf. */}
        <div>
          <FieldLabel>House Rules</FieldLabel>
          <p className="mb-3 text-[12px] text-muted">
            Guests see these on your listing, worded as you set them.
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TimeInput
              label="Check-in time"
              required
              value={values.checkInTime}
              onChange={(v) => onChange("checkInTime", v)}
              invalid={invalidField === "checkInTime"}
              hint="Guests can arrive from this time."
            />
            <TimeInput
              label="Check-out time"
              required
              value={values.checkOutTime}
              onChange={(v) => onChange("checkOutTime", v)}
              invalid={invalidField === "checkOutTime"}
              hint="Guests must leave by this time."
            />
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <RuleToggle
              label="Pets allowed"
              checked={values.petsAllowed}
              onChange={(b) => onChange("petsAllowed", b)}
            />
            <RuleToggle
              label="Smoking allowed"
              checked={values.smokingAllowed}
              onChange={(b) => onChange("smokingAllowed", b)}
            />
            <RuleToggle
              label="Events / parties allowed"
              checked={values.eventsAllowed}
              onChange={(b) => onChange("eventsAllowed", b)}
            />
          </div>

          <div className="mt-4">
            <FieldLabel>
              Additional Rules{" "}
              <span className="font-normal text-muted">(Optional)</span>
            </FieldLabel>
            <textarea
              rows={4}
              value={values.additionalRules}
              onChange={(e) => onChange("additionalRules", e.target.value)}
              placeholder="Anything else guests should know — kitchen use, quiet hours, and so on."
              className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Map — follows the address / city / country the host types above */}
        <div>
          <FieldLabel>Villa Location on Map</FieldLabel>
          <div className="overflow-hidden rounded-lg border border-line">
            <iframe
              title="Villa location"
              className="h-[240px] w-full"
              loading="lazy"
              src={`https://maps.google.com/maps?q=${encodeURIComponent(mapQuery || "villa")}&z=12&output=embed`}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {mapQuery
              ? `Showing: ${mapQuery}`
              : "Type the villa address above to set the map location."}
          </p>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 2 — Add Images                                                */
/* ================================================================== */

function ImagesStep({
  images,
  setImages,
  setError,
}: {
  images: WizardImage[];
  setImages: React.Dispatch<React.SetStateAction<WizardImage[]>>;
  setError: (s: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setError("");
    setBusy(true);
    try {
      const encoded = await Promise.all(files.map((f) => fileToResizedDataUrl(f, 1280, 0.82)));
      const added: WizardImage[] = encoded.map((dataUrl) => ({
        key: nextImageKey(),
        kind: "new",
        dataUrl,
      }));
      setImages((prev) => [...prev, ...added].slice(0, 15));
    } catch {
      setError("One of the images could not be read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">Add photos of your villa</h2>
      <p className="mt-1 text-[13px] text-muted">
        Add up to 15 images. The first one becomes the cover photo.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {images.map((im, i) => (
          <div key={im.key} className="img-frame group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-page">
            <Img src={imageSrc(im)} alt={`Villa ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => setImages((prev) => prev.filter((x) => x.key !== im.key))}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Remove image ${i + 1}`}
            >
              <X size={14} />
            </button>
          </div>
        ))}

        {images.length < 15 && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-muted transition-colors hover:border-primary hover:text-primary disabled:opacity-60"
          >
            <Plus size={22} />
            <span className="text-[12px]">{busy ? "Adding…" : "Add image"}</span>
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />
    </div>
  );
}

/* ================================================================== */
/* Step 3 — Pricing (Screenshot_3)                                    */
/* ================================================================== */

function PricingStep({
  price,
  setPrice,
  invalidField,
}: {
  price: string;
  setPrice: (s: string) => void;
  invalidField: string;
}) {
  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">Set your price according to your place.</h2>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-[14px] text-body">
            <span>You are offering</span>
            {/* Typed, not stepped: the +/- pair only got in the way of the one
                thing a host actually does here, which is type a price. */}
            <div className="flex items-center rounded-md border border-primary px-3 py-1.5">
              <span className="mr-0.5 text-[15px] font-semibold text-ink">$</span>
              <input
                inputMode="numeric"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="135"
                aria-label="Price per night in US dollars"
                aria-invalid={invalidField === "price" || undefined}
                className="w-16 bg-transparent text-[15px] font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:outline-none"
              />
            </div>
            <span>per night for your villa!</span>
          </div>

          <p className="mt-5 flex items-center gap-2 text-[13px] text-muted">
            <Info size={15} className="text-primary" />
            Places like yours have an average price range from $130 to $200.
          </p>
        </div>

        {/* Tip */}
        <div className="lg:pt-1">
          <Lightbulb size={26} className="text-primary" />
          <div className="mt-2 rounded-md border border-line px-3.5 py-3 text-[12px] leading-5 text-body">
            Offer discount to your first 3 guests to help your villa get booked faster!
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 4 — Payment Method (Screenshot_4 / _5)                        */
/* ================================================================== */

function PaymentStep({
  accepted,
  setAccepted,
  accountType,
  setAccountType,
  cardNumber,
  setCardNumber,
  invalidField,
}: {
  accepted: string[];
  setAccepted: React.Dispatch<React.SetStateAction<string[]>>;
  accountType: string;
  setAccountType: (v: string) => void;
  cardNumber: string;
  setCardNumber: (v: string) => void;
  invalidField: string;
}) {
  function toggle(m: string) {
    setAccepted((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">Add payment method for guests.</h2>
      <p className="mt-4 text-[14px] text-ink">Guests can pay using:</p>

      <div className="mt-3 grid max-w-[420px] grid-cols-2 gap-3">
        {PAYMENT_METHODS.map((m) => {
          const on = accepted.includes(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => toggle(m)}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                on ? "border-primary" : "border-line"
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border ${
                  on ? "border-primary bg-primary text-white" : "border-line"
                }`}
              >
                {on && <Check size={13} />}
              </span>
              <PaymentLogo name={m} />
            </button>
          );
        })}
      </div>

      <p className="mt-6 text-[14px] text-ink">Add your account details:</p>
      <div className="mt-3 max-w-[720px] space-y-3">
        <div className="relative">
          <select
            value={accountType}
            onChange={(e) => setAccountType(e.target.value)}
            aria-label="Account type"
            aria-invalid={invalidField === "accountType" || undefined}
            className={`w-full appearance-none rounded-md border border-line bg-white px-3.5 py-3 pr-10 text-[14px] focus:border-primary focus:outline-none ${
              accountType ? "text-ink" : "text-muted"
            }`}
          >
            <option value="">Credit Card or Debit Card</option>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t} value={t} className="text-ink">{t}</option>
            ))}
          </select>
          <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
        </div>
        <input
          value={cardNumber}
          onChange={(e) => setCardNumber(e.target.value)}
          inputMode="numeric"
          placeholder="Card Number"
          aria-label="Card Number"
          autoComplete="cc-number"
          maxLength={19}
          aria-invalid={invalidField === "cardNumber" || undefined}
          className="w-full rounded-md border border-line px-3.5 py-3 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <p className="mt-4 max-w-[640px] text-[12px] leading-5 text-body">
        By clicking the button below, I agree to the{" "}
        <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-primary">Host&apos;s House Rules</Link>,{" "}
        <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-primary">MyVilla&apos;s COVID-19 Safety Requirements</Link>{" "}
        and the <Link href="/terms" className="text-ink underline underline-offset-2 hover:text-primary">Guest Refund Policy.</Link>
      </p>
    </div>
  );
}

// Lightweight, self-contained brand marks (no external image assets).
function PaymentLogo({ name }: { name: string }) {
  if (name === "Mastercard") {
    return (
      <span className="flex items-center">
        <span className="h-5 w-5 rounded-full bg-[#eb001b]" />
        <span className="-ml-2 h-5 w-5 rounded-full bg-[#f79e1b]/90" />
      </span>
    );
  }
  if (name === "Google Pay") {
    return (
      <span className="text-[15px] font-medium">
        <span className="text-[#4285F4]">G</span>
        <span className="text-ink"> Pay</span>
      </span>
    );
  }
  if (name === "PayPal") {
    return <span className="text-[15px] font-bold italic text-[#003087]">Pay<span className="text-[#009cde]">Pal</span></span>;
  }
  return <span className="text-[16px] font-bold italic tracking-wide text-[#1a1f71]">VISA</span>;
}

/* ================================================================== */
/* Shared field building blocks                                       */
/* ================================================================== */

function FieldLabel({
  children,
  required,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium text-primary">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </label>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  required,
  invalid,
  hint,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  const id = useId();
  // While the field has focus the typed text is kept as-is, so backspacing the
  // last digit leaves an empty box instead of a "0" that can't be deleted. The
  // form still reads a number the whole time; on blur the box shows it again.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value ? String(value) : "");
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      {/* Plain text with a numeric keypad rather than `type="number"`: the
          spinner, the scroll-wheel edits and the "e"/"+"/"-" it accepts are
          all things this field never wanted. */}
      <input
        id={id}
        inputMode="numeric"
        value={shown}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
          setDraft(digits);
          onChange(Number(digits) || 0);
        }}
        onBlur={() => setDraft(null)}
        placeholder="0"
        aria-invalid={invalid || undefined}
        className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
      />
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/* A value the host doesn't type — it's computed from what they did type.
   Shown, not editable, so there's one place the number can come from. */
function DerivedValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-dashed border-line bg-page px-3.5 py-2.5">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="mt-0.5 text-[15px] font-semibold text-ink">
        {value}
        <span className="ml-1 text-[12px] font-normal text-muted">auto</span>
      </p>
    </div>
  );
}

/* "14:00" -> "2:00 pm" — how the villa page words the same time back to a
   guest, so the host sees exactly what they're publishing. */
function prettyTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

/* Same idea as the search page's DateField: the native <input type="time">
   stays — keyboard, clock picker and all — but it's laid transparently over a
   field that shows the time the way a guest will read it, and a click anywhere
   in the field opens the picker instead of only the little clock icon. */
function TimeInput({
  label,
  value,
  onChange,
  required,
  invalid,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  invalid?: boolean;
  hint?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);

  function openPicker() {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    try {
      el?.showPicker?.();
    } catch {
      // Refused without a gesture, or unsupported — typing still works.
    }
  }

  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <div
        onClick={openPicker}
        aria-invalid={invalid || undefined}
        className={`group relative flex cursor-pointer items-center gap-2.5 rounded-md border px-3.5 py-2.5 transition-colors focus-within:border-primary ${
          invalid ? "border-red-400" : "border-line hover:border-primary/40"
        }`}
      >
        <Clock size={17} className="shrink-0 text-primary" aria-hidden />
        <span
          className={`text-[14px] ${
            value ? "font-medium text-ink" : "text-muted"
          }`}
        >
          {value ? prettyTime(value) : "Select a time"}
        </span>
        <input
          ref={ref}
          id={id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      {hint && <p className="mt-1.5 text-[12px] text-muted">{hint}</p>}
    </div>
  );
}

/* A house rule is a yes/no answer, and "no" is as much an answer as "yes" —
   so this reads as a stated position either way, not an unticked box. */
function RuleToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-left text-[13px] transition-colors ${
        checked ? "border-primary bg-primary/[0.06] text-primary" : "border-line text-ink"
      }`}
    >
      <span>{label}</span>
      <span
        className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-primary" : "bg-line"
        }`}
      >
        <span
          className={`h-4 w-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </span>
    </button>
  );
}

/* Approximates the stepper + card so the two-column layout doesn't snap in. */
function WizardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-20 pt-8 lg:px-7">
      <div className="skeleton h-4 w-72" />
      <div className="skeleton mt-5 h-9 w-64" />
      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        <div className="lg:pt-1">
          {STEPS.map((label) => (
            <div key={label} className="flex items-start gap-4 pb-8 last:pb-0">
              <div className="skeleton h-8 w-8 shrink-0 rounded-full" />
              <div className="flex-1 pt-0.5">
                <div className="skeleton h-4 w-28" />
                <div className="skeleton mt-1.5 h-3 w-16" />
              </div>
            </div>
          ))}
        </div>
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="skeleton h-5 w-2/3" />
          <div className="mt-6 space-y-4">
            <div className="skeleton h-[62px] w-full" />
            <div className="skeleton h-[62px] w-full" />
            <div className="skeleton h-[62px] w-full" />
            <div className="skeleton h-[62px] w-full" />
          </div>
          <div className="mt-7 flex justify-end">
            <div className="skeleton h-10 w-36" />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Not-signed-in gate                                                 */
/* ================================================================== */

/**
 * Not signed in. There is exactly one way into an account in this app — the
 * popup — so this doesn't render a sign-in screen of its own; it sends the
 * visitor home and opens the popup there, the same place logging out lands.
 */
function SignInGate() {
  const router = useRouter();
  const { openAuth } = useAuth();

  useEffect(() => {
    router.replace("/");
    openAuth("signin");
    // Once, on arrival — re-running would re-open a popup the user dismissed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="min-h-[60vh]" />;
}
