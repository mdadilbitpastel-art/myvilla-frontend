"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Lock, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import Avatar from "@/components/ui/Avatar";
import { fileToResizedDataUrl } from "@/lib/image";
import {
  fetchMe,
  updateProfile,
  updateAvatar,
  removeAvatar,
  type ProfileInput,
} from "@/lib/api";

const GENDERS = ["Male", "Female", "Others"];

// Oldest date the birthday picker will accept — anything before this is a typo.
const MIN_DOB = "1900-01-01";

const EMPTY: ProfileInput = {
  fullName: "",
  gender: "",
  email: "",
  dateOfBirth: "",
  address: "",
  emergencyContact: "",
};

function todayStr(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The stored birthday may predate the date picker (older rows are "DD/MM/YYYY").
// `<input type="date">` only speaks YYYY-MM-DD, so normalise on the way in.
function toDateInput(value: string): string {
  const v = (value || "").trim();
  if (!v) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return "";
}

// Older rows can hold values the dropdown doesn't list ("Other", "Prefer not
// to say", lowercase). Map them onto the three options instead of dropping
// them on the floor when the select can't match.
function normalizeGender(value: string): string {
  const v = (value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "male") return "Male";
  if (v === "female") return "Female";
  return "Others";
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 15);
}

// Open the native calendar from anywhere in the field, not just the icon.
function openPicker(e: React.MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  try {
    el.showPicker?.();
  } catch {
    // No user gesture / unsupported — the built-in icon still works.
  }
}

// The stored user → an editable draft, normalising the two fields whose old
// values may not match what the controls accept.
function fromUser(u: {
  fullName?: string;
  gender?: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  emergencyContact?: string;
}): ProfileInput {
  return {
    fullName: u.fullName || "",
    gender: normalizeGender(u.gender || ""),
    email: u.email || "",
    dateOfBirth: toDateInput(u.dateOfBirth || ""),
    address: u.address || "",
    emergencyContact: u.emergencyContact || "",
  };
}

export default function ProfileSettingsPage() {
  const { user, ready, setUser } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();

  const [values, setValues] = useState<ProfileInput | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<keyof ProfileInput | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  // Computed once per mount. Safe to read during render: nothing is signed in
  // on the server, so the form itself is never server-rendered.
  const [today] = useState(todayStr);

  // Nothing is persisted until "Apply changes" — compare the draft against the
  // stored user to know whether edits are still unsaved. Both sides go through
  // `fromUser`, so the normalising of legacy values doesn't read as an edit.
  const saved = user ? fromUser(user) : null;
  const dirty =
    !!values &&
    !!saved &&
    (Object.keys(EMPTY) as (keyof ProfileInput)[]).some((key) => values[key] !== saved[key]);

  // True until the first fetch settles, so the card arrives filled in rather
  // than painting cached values and correcting itself a moment later.
  const [loading, setLoading] = useState(true);

  // Pull fresh data from the backend once we know a user is signed in.
  useEffect(() => {
    // Signed out never reaches the form — that branch returns its own page.
    if (!ready || !user) return;
    let alive = true;
    fetchMe()
      .then((fresh) => {
        if (alive) setUser(fresh);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not load your profile.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Warn before leaving with edits that were never applied.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Seed the form from the user object — done during render (React's "adjust
  // state when props change" pattern) rather than in an effect, so the form is
  // never painted with stale values. While editing, a background refresh must
  // not overwrite what the user is typing.
  const [seededFrom, setSeededFrom] = useState<typeof user>(null);
  if (user && !editing && user !== seededFrom) {
    setSeededFrom(user);
    setValues(fromUser(user));
  }

  if (!ready) return <ProfileSkeleton />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">Please sign in to view your profile settings.</p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // Placeholders shaped like the real card so it resolves instead of popping.
  if (!values || loading) return <ProfileSkeleton />;

  const v = values;
  const set = (key: keyof ProfileInput, next: string) => {
    setValues((prev) => (prev ? { ...prev, [key]: next } : prev));
    if (invalidField === key) {
      setInvalidField(null);
      setError("");
    }
  };

  function fail(key: keyof ProfileInput, message: string) {
    setInvalidField(key);
    setError(message);
  }

  async function applyChanges() {
    if (!values) return;
    if (!values.fullName.trim()) return fail("fullName", "Please enter your full name.");
    if (values.dateOfBirth && today && values.dateOfBirth > today)
      return fail("dateOfBirth", "Date of birth cannot be in the future.");
    if (values.emergencyContact && values.emergencyContact.length < 7)
      return fail("emergencyContact", "Enter a valid contact number.");

    setInvalidField(null);
    setError("");

    // Nothing changed — treat "Apply changes" as "done editing".
    if (!dirty) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile({ ...values, fullName: values.fullName.trim() });
      setUser(updated);
      setEditing(false);
      toast.success("Your changes have been saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  function cancelEdit() {
    if (user) setValues(fromUser(user));
    setInvalidField(null);
    setError("");
    setEditing(false);
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError("");
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 512);
      const updated = await updateAvatar(dataUrl);
      setUser(updated);
      toast.success("Profile picture updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removePhoto() {
    const ok = await confirm({
      title: "Remove profile photo?",
      message: "Your profile will go back to the default picture.",
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setError("");
    setAvatarBusy(true);
    try {
      const updated = await removeAvatar();
      setUser(updated);
      toast.success("Profile picture removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  const id = (key: string) => `${fieldId}-${key}`;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        <aside>
          <SettingsSidebar />
        </aside>

        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {/* Static on purpose: anything that changes with `editing` would
              resize the card when the mode flips. */}
          {/* Own band across the top of the card, with the card's top padding
              cancelled and an even py-4 in its place — same rhythm as the
              other account tabs. */}
          <div className="-mx-6 -mt-6 mb-6 border-b border-line px-6 py-4 sm:-mx-8 sm:-mt-8 sm:px-8">
            <h2 className="text-[18px] font-bold text-ink">Profile</h2>
            <p className="mt-1 text-[13px] text-body">
              Your personal details as they appear on bookings.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12">
            {/* Form fields — all of them visible from the first view. */}
            <div>
              <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
                <Field label="Full name" htmlFor={id("fullName")}>
                  <input
                    id={id("fullName")}
                    value={v.fullName}
                    disabled={!editing}
                    onChange={(e) => set("fullName", e.target.value)}
                    placeholder={editing ? "Enter your full name" : "Not provided"}
                    aria-invalid={invalidField === "fullName" || undefined}
                    className={inputCls(editing, invalidField === "fullName")}
                  />
                </Field>

                <Field label="Contact number" htmlFor={id("contact")}>
                  <input
                    id={id("contact")}
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={v.emergencyContact}
                    disabled={!editing}
                    onChange={(e) => set("emergencyContact", digitsOnly(e.target.value))}
                    onKeyDown={(e) => {
                      // Block the characters `type="tel"` still lets through.
                      if (["e", "E", "+", "-", ".", ","].includes(e.key)) e.preventDefault();
                    }}
                    placeholder={editing ? "Numbers only" : "Not provided"}
                    aria-invalid={invalidField === "emergencyContact" || undefined}
                    className={inputCls(editing, invalidField === "emergencyContact")}
                  />
                </Field>

                <Field label="Gender" htmlFor={id("gender")}>
                  <select
                    id={id("gender")}
                    value={GENDERS.includes(v.gender) ? v.gender : ""}
                    disabled={!editing}
                    onChange={(e) => set("gender", e.target.value)}
                    className={`${inputCls(editing, false)} appearance-none bg-[length:16px] pr-9 ${
                      editing ? "cursor-pointer" : ""
                    }`}
                    style={editing ? caret : undefined}
                  >
                    <option value="">{editing ? "Select gender" : "Not provided"}</option>
                    {GENDERS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Date of birth" htmlFor={id("dob")}>
                  <input
                    id={id("dob")}
                    type="date"
                    value={v.dateOfBirth}
                    min={MIN_DOB}
                    max={today || undefined}
                    disabled={!editing}
                    onClick={openPicker}
                    onChange={(e) => set("dateOfBirth", e.target.value)}
                    aria-invalid={invalidField === "dateOfBirth" || undefined}
                    className={`${inputCls(editing, invalidField === "dateOfBirth")} ${
                      editing ? "cursor-pointer" : ""
                    }`}
                  />
                </Field>

                {/* Email is the account identity — never editable here. Given
                    the full row so the whole address fits on one line; an
                    unusually long one scrolls rather than wrapping. */}
                <Field className="sm:col-span-2" label="Email address">
                  {/* The cursor says what the note used to: this row is not
                      something you can type into. */}
                  <div
                    title="Email can’t be changed"
                    className="flex h-[43px] cursor-not-allowed items-center gap-2 rounded-lg border border-[#ececf0] bg-[#fafafb] px-3.5"
                  >
                    <span className="overflow-x-auto whitespace-nowrap text-[14px] text-[#9a9aa2]">
                      {v.email}
                    </span>
                    <Lock size={14} aria-hidden className="ml-auto shrink-0 text-[#b9b9c0]" />
                  </div>
                </Field>

                <Field className="sm:col-span-2" label="Address" htmlFor={id("address")}>
                  <textarea
                    id={id("address")}
                    rows={2}
                    value={v.address}
                    disabled={!editing}
                    onChange={(e) => set("address", e.target.value)}
                    placeholder={editing ? "House / street, city, postcode" : "Not provided"}
                    className={`${inputCls(editing, false)} resize-none leading-relaxed`}
                  />
                </Field>
              </div>

              {error && (
                <p
                  role="alert"
                  className="mt-5 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600"
                >
                  {error}
                </p>
              )}
            </div>

            {/* Avatar + the single action button that drives the whole form.
                The card stretches to the form's height so the button lines up
                with the bottom of the last field. */}
            <div className="order-first lg:order-none">
              <div className="flex h-full flex-col rounded-xl border border-line bg-page/60 p-5 text-center">
                <div className="relative mx-auto w-fit">
                  <Avatar
                    src={user.avatar}
                    name={v.fullName || user.email}
                    // The draft value, not the saved one: switching the gender
                    // dropdown updates the placeholder straight away.
                    gender={v.gender}
                    size={112}
                    className="ring-2 ring-white"
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={avatarBusy}
                    aria-label={user.avatar ? "Change profile photo" : "Add profile photo"}
                    className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-primary text-white shadow-sm transition-colors hover:bg-primary-dark disabled:opacity-70"
                  >
                    <Camera size={16} aria-hidden />
                  </button>
                  {avatarBusy && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-[11px] font-medium text-white">
                      Uploading…
                    </div>
                  )}
                </div>

                {/* The camera badge handles add/change; this slot is the
                    destructive counterpart once a photo exists. */}
                {user.avatar ? (
                  <button
                    type="button"
                    onClick={removePhoto}
                    disabled={avatarBusy}
                    className="mt-3 text-[13px] font-semibold text-red-600 underline underline-offset-2 transition-colors hover:text-red-700 disabled:opacity-70"
                  >
                    Remove
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={avatarBusy}
                      className="mt-3 text-[13px] font-semibold text-primary underline underline-offset-2 disabled:opacity-70"
                    >
                      Add photo
                    </button>
                    <p className="mt-1 text-[12px] text-muted">JPG or PNG, up to 5 MB</p>
                  </>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickAvatar}
                  className="hidden"
                />

                <div className="mt-auto border-t border-line pt-4">
                  <button
                    type="button"
                    onClick={editing ? applyChanges : () => setEditing(true)}
                    disabled={saving}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {!editing && <Pencil size={15} aria-hidden />}
                    {editing ? (saving ? "Saving…" : "Apply changes") : "Edit profile"}
                  </button>
                  {/* Cancel and the unsaved-changes note keep their space when
                      they're not shown. The block is bottom-anchored, so
                      letting them appear would shove the primary button up. */}
                  <button
                    type="button"
                    onClick={cancelEdit}
                    disabled={saving || !editing}
                    aria-hidden={!editing}
                    tabIndex={editing ? undefined : -1}
                    className={`mt-2 w-full rounded-lg border border-line px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-page disabled:opacity-70 ${
                      editing ? "" : "invisible"
                    }`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- field primitives ---------- */

// Native select arrow varies per platform; this keeps one caret everywhere.
const caret: React.CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 12px center",
};

// One element per field in both modes — locked fields are the same control,
// just disabled and restyled. Anything that swapped elements would change the
// card's height the moment "Edit profile" is pressed.
function inputCls(editing: boolean, invalid: boolean): string {
  const base =
    "w-full rounded-lg border px-3.5 py-2.5 text-[14px] text-ink transition-colors placeholder:text-muted focus:outline-none disabled:cursor-default disabled:opacity-100";
  if (!editing) return `${base} border-transparent bg-page`;
  return `${base} bg-white ${
    invalid ? "border-red-400 focus:border-red-500" : "border-line focus:border-primary"
  }`;
}

function Field({
  label,
  htmlFor,
  className = "",
  children,
}: {
  label: string;
  /** Omitted for the email row, which has no form control of its own. */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = "mb-1.5 block text-[13px] font-medium text-primary";
  return (
    <div className={className}>
      {htmlFor ? (
        <label htmlFor={htmlFor} className={cls}>
          {label}
        </label>
      ) : (
        <span className={cls}>{label}</span>
      )}
      {children}
    </div>
  );
}

// Mirrors the card's real structure so the page doesn't jump when the profile
// arrives.
function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
        <aside>
          <SettingsSidebar />
        </aside>

        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="mb-6 border-b border-line pb-5">
            <div className="skeleton h-[22px] w-[90px]" />
            <div className="skeleton mt-2 h-[16px] w-[240px]" />
          </div>

          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12">
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {/* The last two (email, address) take the full row — see the
                  real form above. */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className={i >= 4 ? "sm:col-span-2" : ""}>
                  <div className="skeleton mb-1.5 h-[18px] w-[110px]" />
                  <div className="skeleton h-[43px] w-full" />
                </div>
              ))}
            </div>

            <div className="order-first lg:order-none">
              <div className="rounded-xl border border-line bg-page/60 p-5">
                <div className="skeleton mx-auto h-[112px] w-[112px] rounded-full" />
                <div className="skeleton mx-auto mt-3 h-[20px] w-[130px]" />
                <div className="skeleton mx-auto mt-2 h-[16px] w-[150px]" />
                <div className="skeleton mt-6 h-[42px] w-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
