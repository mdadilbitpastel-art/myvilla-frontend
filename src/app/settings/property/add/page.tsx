"use client";

import { Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Check,
  Plus,
  Minus,
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
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import Img from "@/components/ui/Img";
import {
  createVilla,
  updateVilla,
  fetchMyVillas,
  loginUser,
  getRememberedEmail,
  type VillaInput,
} from "@/lib/api";
import { fileToResizedDataUrl } from "@/lib/image";

// Height of the global navbar the sticky page header parks under.
const NAV_HEIGHT = 68;

const STEPS = [
  "Villa Details",
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

const EXTRA_SERVICES = [
  "Airport Pickup",
  "Daily Housekeeping",
  "Private Chef",
  "Guided Tours",
  "Car Rental",
  "Laundry Service",
  "Spa & Wellness",
  "Babysitting",
];

const PAYMENT_METHODS = ["Mastercard", "Google Pay", "PayPal", "Visa"];
const ACCOUNT_TYPES = ["Credit Card", "Debit Card"];

// Steps with no mandatory fields (always "complete").
// Extra services now live inside "Villa Details" as an optional block, so
// every remaining step is mandatory.
const OPTIONAL_STEPS = new Set<number>();

const digitsOf = (s: string) => s.replace(/\D/g, "");

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
  if (!v.title.trim()) return { field: "title", message: "Villa name is required." };
  if (!v.description.trim())
    return { field: "description", message: "A villa description is required." };
  if (!v.buildUpArea.trim())
    return { field: "buildUpArea", message: "Villa dimensions are required." };
  if (!v.address.trim()) return { field: "address", message: "Villa address is required." };
  if (v.bedrooms < 1) return { field: "bedrooms", message: "Number of rooms must be at least 1." };
  if (v.bathrooms < 1)
    return { field: "bathrooms", message: "Number of bathrooms must be at least 1." };
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
  // render "Add your Villa" and then flip to "Edit your Villa" on hydration.
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
    bathrooms: 1,
  });
  const [villaTypeOther, setVillaTypeOther] = useState("");

  // Step 2–5.
  const [images, setImages] = useState<WizardImage[]>([]);
  const [services, setServices] = useState<string[]>([]);
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
          bathrooms: v.bathrooms || 1,
        });
        if (!knownType) setVillaTypeOther(v.propertyType);
        setServices(v.services || []);
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

  function goto(target: number) {
    // Any step is freely clickable — jump around the wizard like tabs.
    setError("");
    setInvalidField("");
    setStep(target);
  }

  function advance() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    setError("");
    setInvalidField("");
  }

  async function handleNext() {
    setError("");
    setInvalidField("");

    // Block leaving the current section until its mandatory fields are filled.
    const issue = stepIssues[step];
    if (issue) {
      setError(issue.message);
      setInvalidField(issue.field);
      return;
    }

    if (step < STEPS.length - 1) {
      advance();
      return;
    }

    // Final step — only publish when EVERY section is complete.
    const firstIncomplete = stepComplete.findIndex((c) => !c);
    if (firstIncomplete !== -1) {
      const blocking = stepIssues[firstIncomplete]!;
      setStep(firstIncomplete);
      setError(`"${STEPS[firstIncomplete]}" is incomplete — ${blocking.message}`);
      setInvalidField(blocking.field);
      return;
    }
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
        bedrooms: villa.bedrooms,
        bathrooms: villa.bathrooms,
        services,
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

  const isLast = step === STEPS.length - 1;

  if (loadingVilla) return <WizardSkeleton />;

  // Terminal: an edit link whose villa never arrived must not quietly turn into
  // a blank "Add your Villa" form.
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
          edges (-mx / px) so the blurred backdrop covers the full width while
          the content stays on the page's grid. */}
      <div
        className={`sticky top-[68px] z-30 -mx-5 border-b bg-page/90 px-5 backdrop-blur transition-all duration-200 lg:-mx-7 lg:px-7 ${
          scrolled ? "border-line py-3" : "border-transparent pb-5 pt-8"
        }`}
      >
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-[13px] text-body">
        <Link href="/" className="underline underline-offset-2 hover:text-primary">Home</Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="/settings" className="underline underline-offset-2 hover:text-primary">Settings</Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="/settings/property" className="underline underline-offset-2 hover:text-primary">My Properties</Link>
        <span className="mx-1.5 text-muted">/</span>
        <span className="text-muted">{editMode ? "Edit your Villa" : "Add your Villa"}</span>
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
          {editMode ? "Edit your Villa" : "Add your Villa"}
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

          {/* Primary action (matches each mock: right-aligned, left for the final step) */}
          <div className={`mt-7 flex ${isLast ? "justify-start" : "justify-end"}`}>
            <button
              type="button"
              onClick={handleNext}
              disabled={busy}
              className="rounded-lg bg-primary px-6 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {busy
                ? "Please wait…"
                : isLast
                  ? editMode
                    ? "Update Villa"
                    : "Host your Villa"
                  : editMode
                    ? "Update & Next"
                    : "Save and Next"}
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
/* Step 1 — Villa Details (Screenshot_1 + _2)                         */
/* ================================================================== */

type VillaForm = {
  title: string;
  propertyType: string;
  buildUpArea: string;
  address: string;
  description: string;
  bedrooms: number;
  bathrooms: number;
};

function VillaDetailsStep({
  values,
  onChange,
  villaTypeOther,
  setVillaTypeOther,
  services,
  setServices,
  invalidField,
}: {
  values: VillaForm;
  onChange: (k: keyof VillaForm, v: string | number) => void;
  villaTypeOther: string;
  setVillaTypeOther: (v: string) => void;
  services: string[];
  setServices: React.Dispatch<React.SetStateAction<string[]>>;
  invalidField: string;
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
      <h2 className="text-[16px] font-bold text-ink">What kind of a villa are you hosting?</h2>
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
        <LabeledInput label="Name of your Villa" required placeholder="Complete Name" value={values.title} onChange={(v) => onChange("title", v)} invalid={invalidField === "title"} />
        <div>
          <FieldLabel htmlFor={`${uid}-description`} required>Describe your Villa (Max 150 words)</FieldLabel>
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
        <NumberInput label="Number of Rooms" required value={values.bedrooms} onChange={(n) => onChange("bedrooms", n)} invalid={invalidField === "bedrooms"} />
        <NumberInput label="Number of Bathrooms" required value={values.bathrooms} onChange={(n) => onChange("bathrooms", n)} invalid={invalidField === "bathrooms"} />

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
  const n = Number(price) || 0;
  const bump = (delta: number) => setPrice(String(Math.max(0, n + delta)));

  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">Set your price according to your place.</h2>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-[14px] text-body">
            <span>You are offering</span>
            <button
              type="button"
              onClick={() => bump(5)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
              aria-label="Increase price"
            >
              <Plus size={18} />
            </button>
            <div className="flex items-center rounded-md border border-primary px-3 py-1.5">
              <span className="mr-0.5 text-[15px] font-semibold text-ink">$</span>
              <input
                type="number"
                min={0}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="135"
                aria-label="Price per night in US dollars"
                aria-invalid={invalidField === "price" || undefined}
                className="w-16 bg-transparent text-[15px] font-semibold text-ink placeholder:font-normal placeholder:text-muted focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => bump(-5)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-line/60"
              aria-label="Decrease price"
            >
              <Minus size={18} />
            </button>
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
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
  invalid?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <FieldLabel htmlFor={id} required={required}>{label}</FieldLabel>
      <input
        id={id}
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        aria-invalid={invalid || undefined}
        className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink focus:border-primary focus:outline-none"
      />
    </div>
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
/* Not-signed-in gate (Screenshot_11)                                 */
/* ================================================================== */

function SignInGate() {
  const { setUser } = useAuth();
  const uid = useId();
  const [email, setEmail] = useState(getRememberedEmail());
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    try {
      const { user } = await loginUser(email.trim(), password, true);
      setUser(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 py-12 lg:px-7">
      <div className="mx-auto w-full max-w-[820px] rounded-2xl bg-white px-6 py-16 sm:px-10">
        <div className="mx-auto w-full max-w-[340px]">
          <h1 className="text-center text-[22px] font-bold text-ink">
            To add your villa you must be signed in first.
          </h1>
          <p className="mt-1.5 text-center text-[14px] text-body">
            Login to your account to start hosting right now!
          </p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            <div>
              <label htmlFor={`${uid}-email`} className="mb-1.5 block text-[14px] font-semibold text-ink">Email</label>
              <input
                id={`${uid}-email`}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="someone@example.com"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label htmlFor={`${uid}-password`} className="mb-1.5 block text-[14px] font-semibold text-ink">Password</label>
              <input
                id={`${uid}-password`}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-3 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? "Please wait…" : "Sign in"}
            </button>

            <p className="text-center text-[13px] text-body">
              Don&apos;t have an Account?{" "}
              <Link href="/?auth=register" className="text-primary underline underline-offset-2">
                Sign up
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
