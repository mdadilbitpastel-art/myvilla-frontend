"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
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
  { key: "email", label: "Email Adress" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "address", label: "Address" },
  { key: "emergencyContact", label: "Emergency Contact" },
];

// Downscale a picked image to ≤maxPx and return a small JPEG data-URL.
function fileToResizedDataUrl(file: File, maxPx = 512): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error("Could not read the image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxPx) {
          height = Math.round((height * maxPx) / width);
          width = maxPx;
        } else if (height > maxPx) {
          width = Math.round((width * maxPx) / height);
          height = maxPx;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas is not supported."));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ProfileSettingsPage() {
  const { user, ready, setUser } = useAuth();

  const [values, setValues] = useState<ProfileInput | null>(null);
  const [editing, setEditing] = useState<keyof ProfileInput | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Pull fresh data from the backend once we know a user is signed in.
  useEffect(() => {
    if (ready && user) fetchMe().then(setUser).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

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

  if (!values) return <div className="min-h-[60vh]" />;

  function startEdit(key: keyof ProfileInput) {
    setMsg("");
    setEditing(key);
    setDraft(values![key]);
  }

  function saveField(key: keyof ProfileInput) {
    setValues((v) => (v ? { ...v, [key]: draft } : v));
    setEditing(null);
    setDraft("");
  }

  async function applyChanges() {
    if (!values) return;
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
          <SettingsSidebar active="Profile Settings" />
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
                  return (
                    <div key={key}>
                      <p className="mb-1.5 text-[13px] font-medium text-primary">
                        {label}
                      </p>
                      <div className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-2.5 transition-colors focus-within:border-primary">
                        {isEditing ? (
                          <>
                            <input
                              autoFocus
                              type={key === "email" ? "email" : "text"}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  saveField(key);
                                }
                              }}
                              className="w-full bg-transparent text-[14px] text-ink placeholder:text-muted focus:outline-none"
                              placeholder={`Enter ${label.toLowerCase()}`}
                            />
                            <button
                              type="button"
                              onClick={() => saveField(key)}
                              className="shrink-0 text-[13px] font-semibold text-primary underline underline-offset-2"
                            >
                              Save
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
                  className={`mt-4 rounded-lg px-3 py-2 text-[13px] ${
                    error ? "bg-red-50 text-red-600" : "bg-primary/5 text-primary"
                  }`}
                >
                  {error || msg}
                </p>
              )}

              <div className="mt-6 flex justify-end">
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
              <div className="relative h-[110px] w-[110px] overflow-hidden rounded-full bg-page">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarSrc}
                  alt={values.fullName || "Profile picture"}
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
