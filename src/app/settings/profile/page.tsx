"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import Img from "@/components/ui/Img";
import { fileToResizedDataUrl } from "@/lib/image";
import { validateEmail } from "@/lib/validation";
import {
  fetchMe,
  updateProfile,
  updateAvatar,
  type ProfileInput,
} from "@/lib/api";

const FALLBACK_AVATAR = "https://i.pravatar.cc/220?img=15";

const FIELDS: { key: keyof ProfileInput; label: string }[] = [
  { key: "fullName", label: "Full name" },
  { key: "gender", label: "Gender" },
  { key: "email", label: "Email Address" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "address", label: "Address" },
  { key: "emergencyContact", label: "Emergency Contact" },
];

export default function ProfileSettingsPage() {
  const { user, ready, setUser } = useAuth();

  const [values, setValues] = useState<ProfileInput | null>(null);
  const [editing, setEditing] = useState<keyof ProfileInput | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<keyof ProfileInput | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();

  // Fields hold local edits until "Apply Changes" — compare against the user
  // object to know whether anything is still unsaved.
  const dirty =
    !!values &&
    FIELDS.some(({ key }) => values[key] !== ((user?.[key] as string | undefined) || ""));

  // Pull fresh data from the backend once we know a user is signed in.
  useEffect(() => {
    if (!ready || !user) return;
    let alive = true;
    fetchMe()
      .then((fresh) => {
        if (alive) setUser(fresh);
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : "Could not load your profile.");
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

  // Seed the editable form from the user object.
  useEffect(() => {
    if (user) {
      setValues({
        fullName: user.fullName || "",
        gender: user.gender || "",
        email: user.email || "",
        dateOfBirth: user.dateOfBirth || "",
        address: user.address || "",
        emergencyContact: user.emergencyContact || "",
      });
    }
  }, [user]);

  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1000px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your profile settings.
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

  // Placeholders shaped like the real card so it resolves instead of popping.
  if (!values) return <ProfileSkeleton />;

  function startEdit(key: keyof ProfileInput) {
    setMsg("");
    setEditing(key);
    setDraft(values![key]);
  }

  function confirmField(key: keyof ProfileInput) {
    setValues((v) => (v ? { ...v, [key]: draft } : v));
    if (invalidField === key) setInvalidField(null);
    setEditing(null);
    setDraft("");
  }

  async function applyChanges() {
    if (!values) return;
    const emailError = validateEmail(values.email);
    if (emailError) {
      setMsg("");
      setInvalidField("email");
      setError(emailError);
      return;
    }
    setInvalidField(null);
    setError("");
    setMsg("");
    setSaving(true);
    try {
      const updated = await updateProfile(values);
      setUser(updated);
      setMsg("Your changes have been saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setError("");
    setMsg("");
    setAvatarBusy(true);
    try {
      const dataUrl = await fileToResizedDataUrl(file, 512);
      const updated = await updateAvatar(dataUrl);
      setUser(updated);
      setMsg("Profile picture updated.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the picture.");
    } finally {
      setAvatarBusy(false);
    }
  }

  const avatarSrc = user.avatar || FALLBACK_AVATAR;

  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — profile card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-12">
            {/* Form fields */}
            <div>
              <div className="space-y-4">
                {FIELDS.map(({ key, label }) => {
                  const val = values[key];
                  const isEditing = editing === key;
                  const inputId = `${fieldId}-${key}`;
                  return (
                    <div key={key}>
                      <label
                        // The input only exists while this field is being
                        // edited; the rest of the time there's nothing to point at.
                        htmlFor={isEditing ? inputId : undefined}
                        className="mb-1.5 block text-[13px] font-medium text-primary"
                      >
                        {label}
                      </label>
                      <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-2.5 transition-colors focus-within:border-primary">
                        {isEditing ? (
                          <>
                            <input
                              autoFocus
                              id={inputId}
                              type={key === "email" ? "email" : "text"}
                              value={draft}
                              aria-invalid={invalidField === key || undefined}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  confirmField(key);
                                }
                              }}
                              className="w-full bg-transparent text-[14px] text-ink placeholder:text-muted focus:outline-none"
                              placeholder={`Enter ${label.toLowerCase()}`}
                            />
                            {/* "Done" — this only closes the inline editor;
                                nothing persists until "Apply Changes". */}
                            <button
                              type="button"
                              onClick={() => confirmField(key)}
                              aria-label={`Done editing ${label}`}
                              className="shrink-0 text-[13px] font-semibold text-primary underline underline-offset-2"
                            >
                              Done
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              className={`truncate text-[14px] ${
                                val ? "text-ink" : "text-muted"
                              }`}
                            >
                              {val || "Not Provided"}
                            </span>
                            <button
                              type="button"
                              onClick={() => startEdit(key)}
                              aria-label={`${val ? "Edit" : "Add"} ${label}`}
                              className="shrink-0 text-[13px] font-semibold text-ink underline underline-offset-2"
                            >
                              {val ? "Edit" : "Add"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {(msg || error) && (
                <p
                  role={error ? "alert" : "status"}
                  className={`mt-4 rounded-lg px-3 py-2 text-[13px] ${
                    error ? "bg-red-50 text-red-600" : "bg-primary/5 text-primary"
                  }`}
                >
                  {error || msg}
                </p>
              )}

              <div className="mt-6 flex items-center justify-end gap-4">
                {dirty && (
                  <p className="text-[12px] text-muted">
                    You have unsaved changes — apply them to save.
                  </p>
                )}
                <button
                  type="button"
                  onClick={applyChanges}
                  disabled={saving}
                  className="rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {saving ? "Saving…" : "Apply Changes"}
                </button>
              </div>
            </div>

            {/* Avatar */}
            <div className="order-first flex flex-col items-center lg:order-none lg:pt-1">
              <div className="img-frame relative h-[110px] w-[110px] overflow-hidden rounded-full bg-page">
                <Img
                  src={avatarSrc}
                  alt={values.fullName || "Profile picture"}
                  fallback={FALLBACK_AVATAR}
                  className="h-full w-full object-cover"
                />
                {avatarBusy && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-[11px] font-medium text-white">
                    Uploading…
                  </div>
                )}
              </div>
              <p className="mt-3 text-[15px] font-bold text-ink">
                {values.fullName || "Your name"}
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                className="mt-1 text-[13px] text-ink underline underline-offset-2 disabled:opacity-70"
              >
                Change Picture
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onPickAvatar}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mirrors the card's real structure so the page doesn't jump when the profile
// arrives.
function ProfileSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 pb-16 pt-10 lg:px-7">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[190px_1fr]">
        <aside>
          <SettingsSidebar />
        </aside>

        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_200px] lg:gap-12">
            <div className="space-y-4">
              {FIELDS.map(({ key }) => (
                <div key={key}>
                  <div className="skeleton mb-1.5 h-[18px] w-[110px]" />
                  <div className="skeleton h-[45px] w-full" />
                </div>
              ))}
              <div className="flex justify-end pt-2">
                <div className="skeleton h-[42px] w-[140px]" />
              </div>
            </div>

            <div className="order-first flex flex-col items-center lg:order-none lg:pt-1">
              <div className="skeleton h-[110px] w-[110px] rounded-full" />
              <div className="skeleton mt-3 h-[20px] w-[130px]" />
              <div className="skeleton mt-2 h-[16px] w-[100px]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
