"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import {
  fetchMe,
  updateProfile,
  updateAvatar,
  createVilla,
  updateVilla,
  fetchMyVillas,
  loginUser,
  getRememberedEmail,
  type VillaInput,
} from "@/lib/api";
import { fileToResizedDataUrl } from "@/lib/image";
import { validateEmail } from "@/lib/validation";

const STEPS = [
  "Personal Details",
  "Villa Details",
  "Add Images",
  "Extra Services",
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
  { label: "Jaccuzzi", Icon: Bath },
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

const FALLBACK_AVATAR = "https://i.pravatar.cc/220?img=15";

// Steps with no mandatory fields (always "complete").
const OPTIONAL_STEPS = new Set([3]); // Extra Services

const digitsOf = (s: string) => s.replace(/\D/g, "");

// An image in the wizard is either an already-saved photo (edit mode) or a
// freshly picked file encoded as a base64 data-URL.
type WizardImage =
  | { kind: "existing"; id: string; url: string }
  | { kind: "new"; dataUrl: string };

const imageSrc = (im: WizardImage) => (im.kind === "existing" ? im.url : im.dataUrl);

/* --- Per-section validation. Each returns "" when complete, else the first
   missing-field message. Shared by the Save/Publish gate AND the stepper's
   live complete/incomplete indicator, so the two never disagree. --- */

function personalError(p: Personal): string {
  if (!p.fullName.trim()) return "Full name is required.";
  if (!p.gender.trim()) return "Please select your gender.";
  if (validateEmail(p.email)) return "A valid email address is required.";
  if (!p.dateOfBirth.trim()) return "Date of birth is required.";
  return "";
}

function villaError(v: VillaForm): string {
  if (!v.title.trim()) return "Villa name is required.";
  if (!v.description.trim()) return "A villa description is required.";
  if (!v.buildUpArea.trim()) return "Villa dimensions are required.";
  if (!v.address.trim()) return "Villa address is required.";
  if (v.bedrooms < 1) return "Number of rooms must be at least 1.";
  if (v.bathrooms < 1) return "Number of bathrooms must be at least 1.";
  return "";
}

function imagesError(images: WizardImage[]): string {
  return images.length ? "" : "Please add at least one image.";
}

function pricingError(price: string): string {
  return Number(price) > 0 ? "" : "Please enter a valid price per night.";
}

function paymentError(
  accepted: string[],
  accountType: string,
  cardNumber: string,
  editMode: boolean
): string {
  if (accepted.length === 0) return "Select at least one payment method.";
  if (!accountType) return "Please choose Credit or Debit Card.";
  const d = digitsOf(cardNumber);
  // In edit mode a blank card means "keep the existing one".
  if (editMode && d.length === 0) return "";
  if (d.length < 12) return "Enter a valid card number.";
  return "";
}

export default function AddVillaPage() {
  const { user, ready } = useAuth();

  if (!ready) return <div className="min-h-[60vh]" />;
  if (!user) return <SignInGate />;
  return <Wizard />;
}

/* ================================================================== */
/* Wizard                                                             */
/* ================================================================== */

function Wizard() {
  const router = useRouter();
  const { user, setUser } = useAuth();

  // Edit mode when the URL carries ?edit=<villaId>.
  const editId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("edit");
  }, []);
  const editMode = !!editId;

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingVilla, setLoadingVilla] = useState(editMode);

  // Step 1 — personal details (persisted to the user profile).
  const [personal, setPersonal] = useState({
    fullName: "",
    gender: "",
    email: "",
    dateOfBirth: "",
    address: "",
    emergencyContact: "",
  });

  // Step 2 — villa details.
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

  // Step 3–6.
  const [images, setImages] = useState<WizardImage[]>([]);
  const [services, setServices] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [acceptedPayments, setAcceptedPayments] = useState<string[]>([...PAYMENT_METHODS]);
  const [accountType, setAccountType] = useState("");
  const [cardNumber, setCardNumber] = useState("");

  // Pull fresh profile once, then seed the personal-details form.
  useEffect(() => {
    if (user) fetchMe().then(setUser).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edit mode — load the villa and pre-fill every section.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    fetchMyVillas()
      .then((list) => {
        if (cancelled) return;
        const v = list.find((x) => x.id === editId);
        if (!v) {
          setError("That villa could not be found.");
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
          (v.photos || []).map((p) => ({ kind: "existing" as const, id: p.id, url: p.url }))
        );
        setLoadingVilla(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Could not load the villa.");
          setLoadingVilla(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);
  useEffect(() => {
    if (user) {
      setPersonal({
        fullName: user.fullName || "",
        gender: user.gender || "",
        email: user.email || "",
        dateOfBirth: user.dateOfBirth || "",
        address: user.address || "",
        emergencyContact: user.emergencyContact || "",
      });
    }
  }, [user]);

  // Live per-section validation — recomputed every render from current state,
  // so the stepper's complete/incomplete badges stay correct from ANY step.
  const stepErrors = [
    personalError(personal),
    villaError(villa),
    imagesError(images),
    "", // Extra Services — optional
    pricingError(price),
    paymentError(acceptedPayments, accountType, cardNumber, editMode),
  ];
  const stepComplete = stepErrors.map((e) => e === "");

  function goto(target: number) {
    // Any step is freely clickable — jump around the wizard like tabs.
    setError("");
    setStep(target);
  }

  function advance() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    setError("");
  }

  async function handleNext() {
    setError("");

    // Block leaving the current section until its mandatory fields are filled.
    if (stepErrors[step]) {
      setError(stepErrors[step]);
      return;
    }

    if (step === 0) {
      // Persist personal details, then move on.
      setBusy(true);
      try {
        const updated = await updateProfile(personal);
        setUser(updated);
        advance();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save your details.");
      } finally {
        setBusy(false);
      }
      return;
    }

    if (step < STEPS.length - 1) {
      advance();
      return;
    }

    // Final step — only publish when EVERY section is complete.
    const firstIncomplete = stepComplete.findIndex((c) => !c);
    if (firstIncomplete !== -1) {
      setStep(firstIncomplete);
      setError(
        `"${STEPS[firstIncomplete]}" is incomplete — ${stepErrors[firstIncomplete]}`
      );
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
        .filter((im): im is Extract<WizardImage, { kind: "new" }> => im.kind === "new")
        .map((im) => im.dataUrl);
      const keepImageIds = images
        .filter((im): im is Extract<WizardImage, { kind: "existing" }> => im.kind === "existing")
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

  if (loadingVilla) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1120px] items-center justify-center px-5 text-[14px] text-muted">
        Loading your villa…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1120px] px-5 pb-20 pt-8 lg:px-7">
      {/* Breadcrumb */}
      <nav className="text-[13px] text-body">
        <Link href="/" className="underline underline-offset-2 hover:text-primary">Home</Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="#" className="underline underline-offset-2 hover:text-primary">All Topics</Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="#" className="underline underline-offset-2 hover:text-primary">Legal Terms</Link>
        <span className="mx-1.5 text-muted">/</span>
        <span className="text-muted">Privacy Policy</span>
      </nav>

      {/* Title + Back */}
      <div className="mt-5 flex items-center justify-between">
        <h1 className="text-[30px] font-extrabold text-ink">
          {editMode ? "Edit your Villa" : "Add your Villa"}
        </h1>
        <Link
          href="/settings/property"
          className="text-[16px] font-medium text-ink underline underline-offset-4 hover:text-primary"
        >
          Back
        </Link>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        {/* Stepper */}
        <Stepper step={step} complete={stepComplete} onSelect={goto} />

        {/* Card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {step === 0 && (
            <PersonalStep
              values={personal}
              onChange={(k, v) => setPersonal((p) => ({ ...p, [k]: v }))}
              user={user}
              setUser={setUser}
            />
          )}
          {step === 1 && (
            <VillaDetailsStep
              values={villa}
              onChange={(k, v) => setVilla((p) => ({ ...p, [k]: v }))}
              villaTypeOther={villaTypeOther}
              setVillaTypeOther={setVillaTypeOther}
              services={services}
              setServices={setServices}
            />
          )}
          {step === 2 && (
            <ImagesStep images={images} setImages={setImages} setError={setError} />
          )}
          {step === 3 && (
            <ServicesStep selected={services} setSelected={setServices} />
          )}
          {step === 4 && <PricingStep price={price} setPrice={setPrice} />}
          {step === 5 && (
            <PaymentStep
              accepted={acceptedPayments}
              setAccepted={setAcceptedPayments}
              accountType={accountType}
              setAccountType={setAccountType}
              cardNumber={cardNumber}
              setCardNumber={setCardNumber}
            />
          )}

          {error && (
            <p className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
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
    <nav className="lg:pt-1">
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
/* Step 1 — Personal Details                                          */
/* ================================================================== */

type Personal = {
  fullName: string;
  gender: string;
  email: string;
  dateOfBirth: string;
  address: string;
  emergencyContact: string;
};

function PersonalStep({
  values,
  onChange,
  user,
  setUser,
}: {
  values: Personal;
  onChange: (k: keyof Personal, v: string) => void;
  user: ReturnType<typeof useAuth>["user"];
  setUser: ReturnType<typeof useAuth>["setUser"];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarSrc = user?.avatar || FALLBACK_AVATAR;

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 512, 0.85);
      const updated = await updateAvatar(dataUrl);
      setUser(updated);
    } catch {
      /* avatar optional */
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">
        First time hosting? You must add your personal details first to start hosting
      </h2>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-12">
        <div className="space-y-4">
          <LabeledInput label="Full name" required placeholder="Add Full name" value={values.fullName} onChange={(v) => onChange("fullName", v)} />
          <div>
            <FieldLabel required>Gender</FieldLabel>
            <SelectBox value={values.gender} onChange={(v) => onChange("gender", v)} placeholder="Select your gender." options={["Male", "Female", "Other", "Prefer not to say"]} />
          </div>
          <LabeledInput label="Email Adress" required type="email" placeholder="Example1@myvilla.com" value={values.email} onChange={(v) => onChange("email", v)} />
          <LabeledInput label="Date of Birth" required placeholder="DD/MM/YYYY" value={values.dateOfBirth} onChange={(v) => onChange("dateOfBirth", v)} />
          <LabeledInput label="Address" placeholder="Not Provided" value={values.address} onChange={(v) => onChange("address", v)} />
          <LabeledInput label="Emergency Contact" placeholder="Not Provided" value={values.emergencyContact} onChange={(v) => onChange("emergencyContact", v)} />
        </div>

        <div className="order-first flex flex-col items-center lg:order-none lg:pt-2">
          <div className="relative h-[120px] w-[120px] overflow-hidden rounded-full bg-page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={avatarSrc} alt="Profile" className="h-full w-full object-cover" />
            {avatarBusy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[11px] font-medium text-white">
                Uploading…
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={avatarBusy}
            className="mt-3 text-center text-[13px] text-ink underline underline-offset-2 disabled:opacity-70"
          >
            Upload your profile
            <br />
            picture
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPickAvatar} className="hidden" />
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 2 — Villa Details (Screenshot_1 + _2)                         */
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
}: {
  values: VillaForm;
  onChange: (k: keyof VillaForm, v: string | number) => void;
  villaTypeOther: string;
  setVillaTypeOther: (v: string) => void;
  services: string[];
  setServices: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  function toggleFacility(label: string) {
    setServices((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label]
    );
  }

  function addCustomFacility() {
    const value = typeof window !== "undefined" ? window.prompt("Add a facility") : null;
    const label = value?.trim();
    if (label && !services.includes(label)) setServices((prev) => [...prev, label]);
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
          className="mt-3 w-full max-w-[360px] rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
      )}

      {/* Details */}
      <h3 className="mt-7 text-[16px] font-bold text-ink">Details</h3>
      <div className="mt-4 space-y-4">
        <LabeledInput label="Name of your Villa" required placeholder="Complete Name" value={values.title} onChange={(v) => onChange("title", v)} />
        <div>
          <FieldLabel required>Describe your Villa (Max 150 words)</FieldLabel>
          <textarea
            value={values.description}
            onChange={(e) => onChange("description", e.target.value.split(/\s+/).slice(0, 150).join(" "))}
            rows={4}
            placeholder="Description"
            className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
          />
        </div>
        <LabeledInput label="Villa Dimensions" required placeholder="Total Build up Area (in Square Yards)" value={values.buildUpArea} onChange={(v) => onChange("buildUpArea", v)} />
        <LabeledInput label="Villa Address" required placeholder="Registered Address of Villa" value={values.address} onChange={(v) => onChange("address", v)} />
        <NumberInput label="Number of Rooms" required value={values.bedrooms} onChange={(n) => onChange("bedrooms", n)} />
        <NumberInput label="Number of Bathrooms" required value={values.bathrooms} onChange={(n) => onChange("bathrooms", n)} />

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
            <button
              type="button"
              onClick={addCustomFacility}
              className="flex items-center gap-1 rounded-full border border-dashed border-line px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:border-primary hover:text-primary"
            >
              <Plus size={14} /> Add More
            </button>
          </div>
        </div>

        {/* Map */}
        <div>
          <FieldLabel>Villa Location on Map</FieldLabel>
          <div className="overflow-hidden rounded-lg border border-line">
            <iframe
              title="Villa location"
              className="h-[240px] w-full"
              loading="lazy"
              src="https://www.openstreetmap.org/export/embed.html?bbox=-74.014%2C40.700%2C-73.960%2C40.730&layer=mapnik&marker=40.715%2C-73.99"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 3 — Add Images                                                */
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
      const added: WizardImage[] = encoded.map((dataUrl) => ({ kind: "new", dataUrl }));
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
          <div key={i} className="group relative aspect-[4/3] overflow-hidden rounded-lg border border-line bg-page">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(im)} alt={`Villa ${i + 1}`} className="h-full w-full object-cover" />
            {i === 0 && (
              <span className="absolute left-2 top-2 rounded bg-primary px-2 py-0.5 text-[10px] font-semibold text-white">
                Cover
              </span>
            )}
            <button
              type="button"
              onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
              aria-label="Remove image"
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
/* Step 4 — Extra Services                                            */
/* ================================================================== */

function ServicesStep({
  selected,
  setSelected,
}: {
  selected: string[];
  setSelected: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  function toggle(s: string) {
    setSelected((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }
  return (
    <div>
      <h2 className="text-[16px] font-bold text-ink">Any extra services on offer?</h2>
      <p className="mt-1 text-[13px] text-muted">Optional — pick the premium services guests can add.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {EXTRA_SERVICES.map((s) => {
          const on = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-[13px] transition-colors ${
                on ? "border-primary bg-primary/[0.06] text-primary" : "border-line text-ink hover:border-primary/40"
              }`}
            >
              <span
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                  on ? "border-primary bg-primary text-white" : "border-line"
                }`}
              >
                {on && <Check size={12} />}
              </span>
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Step 5 — Pricing (Screenshot_3)                                    */
/* ================================================================== */

function PricingStep({
  price,
  setPrice,
}: {
  price: string;
  setPrice: (s: string) => void;
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
/* Step 6 — Payment Method (Screenshot_4 / _5)                        */
/* ================================================================== */

function PaymentStep({
  accepted,
  setAccepted,
  accountType,
  setAccountType,
  cardNumber,
  setCardNumber,
}: {
  accepted: string[];
  setAccepted: React.Dispatch<React.SetStateAction<string[]>>;
  accountType: string;
  setAccountType: (v: string) => void;
  cardNumber: string;
  setCardNumber: (v: string) => void;
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
          className="w-full rounded-md border border-line px-3.5 py-3 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none"
        />
      </div>

      <p className="mt-4 max-w-[640px] text-[12px] leading-5 text-body">
        By clicking the button below, I agree to the{" "}
        <span className="text-ink underline underline-offset-2">Host&apos;s House Rules</span>,{" "}
        <span className="text-ink underline underline-offset-2">MyVilla&apos;s COVID-19 Safety Requirements</span>{" "}
        and the <span className="text-ink underline underline-offset-2">Guest Refund Policy.</span>
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
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <p className="mb-1.5 text-[13px] font-medium text-primary">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </p>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
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
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel required={required}>{label}</FieldLabel>
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
        className="w-full rounded-md border border-line px-3.5 py-2.5 text-[14px] text-ink focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function SelectBox({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full appearance-none rounded-md border border-line bg-white px-3.5 py-2.5 pr-10 text-[14px] focus:border-primary focus:outline-none ${
          value ? "text-ink" : "text-muted"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o} className="text-ink">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}

/* ================================================================== */
/* Not-signed-in gate (Screenshot_11)                                 */
/* ================================================================== */

function SignInGate() {
  const { setUser } = useAuth();
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
              <label className="mb-1.5 block text-[14px] font-semibold text-ink">Email</label>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="someone@example.com"
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[14px] font-semibold text-ink">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="w-full rounded-lg border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{error}</p>
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
