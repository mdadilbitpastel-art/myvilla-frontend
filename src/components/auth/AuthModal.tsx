"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { X, ChevronDown } from "lucide-react";
import { loginUser, registerUser, getRememberedEmail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  validateEmail,
  validatePassword,
  validateConfirm,
  validatePhone,
  validateRequired,
  isValid,
  type FieldErrors,
} from "@/lib/validation";

export type AuthMode = "signin" | "register";

type RegisterField = "email" | "phone" | "country" | "password" | "confirm";

const PANEL_IMAGE: Record<AuthMode, string> = {
  signin:
    "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
  register:
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80",
};

export default function AuthModal({
  mode,
  onClose,
  onSwitch,
}: {
  mode: AuthMode;
  onClose: () => void;
  onSwitch: (mode: AuthMode) => void;
}) {
  const [mounted, setMounted] = useState(false);

  // Lock body scroll while the modal is open.
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  if (!mounted) return null;

  return createPortal(
    // Backdrop — sits BELOW the 68px header and dims the page.
    // Clicking it does NOT close (only the cross does).
    <div className="fixed inset-x-0 bottom-0 top-[68px] z-[60] overflow-y-auto bg-black/50">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative grid w-full max-w-[960px] overflow-hidden rounded-2xl bg-white shadow-2xl lg:grid-cols-[1.6fr_1fr]">
        {/* Left — image with cancel + heading (desktop only) */}
        <div className="relative hidden lg:block">
          <Image
            src={PANEL_IMAGE[mode]}
            alt=""
            fill
            sizes="480px"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-black/40" />

          <button
            onClick={onClose}
            className="absolute left-5 top-5 flex items-center gap-2 text-[15px] text-white transition-opacity hover:opacity-80"
          >
            <X size={20} strokeWidth={2} />
            <span className="underline underline-offset-2">Cancel</span>
          </button>

          <div className="absolute inset-x-7 top-16 text-white">
            <h3 className="text-[28px] font-bold leading-tight">
              Book best villas around you
            </h3>
            <p className="mt-2 max-w-[300px] text-[14px] leading-6 text-white/85">
              Create an account and let&apos;s help you find a better place to enjoy.
            </p>
          </div>
        </div>

        {/* Mobile close (image is hidden on small screens) */}
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute left-4 top-4 z-10 flex items-center gap-2 text-[15px] text-ink lg:hidden"
        >
          <X size={20} strokeWidth={2} />
          <span className="underline underline-offset-2">Cancel</span>
        </button>

        {/* Right — form (no inner scroll; height is driven by content) */}
        <div className="p-7 pt-14 sm:p-9 lg:pt-9">
          <div className="mx-auto w-full max-w-[340px]">
            {mode === "signin" ? (
              <SigninForm onSwitch={() => onSwitch("register")} onSuccess={onClose} />
            ) : (
              <RegisterForm onSwitch={() => onSwitch("signin")} onSuccess={onClose} />
            )}
          </div>
        </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

function SigninForm({
  onSwitch,
  onSuccess,
}: {
  onSwitch: () => void;
  onSuccess: () => void;
}) {
  const { setUser } = useAuth();
  // Pre-fill the last "remembered" email so returning users just type a password.
  const savedEmail = getRememberedEmail();
  const [email, setEmail] = useState(savedEmail);
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<FieldErrors<"email" | "password">>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function clear(field: "email" | "password") {
    setErrors((e) => ({ ...e, [field]: undefined }));
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const nextErrors: FieldErrors<"email" | "password"> = {
      email: validateEmail(email),
      password: password ? undefined : "Password is required.",
    };
    setErrors(nextErrors);
    if (!isValid(nextErrors)) return;

    setLoading(true);
    try {
      const { user } = await loginUser(email.trim(), password, remember);
      setUser(user);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="text-[20px] font-bold text-ink">Welcome back!</h2>
      <p className="mt-1 text-[13px] text-body">
        Continue with your MyVilla credentials
      </p>

      <div className="mt-5 space-y-4">
        <Field label="Email" type="email" autoComplete="email" placeholder="someone@example.com" value={email} onChange={(v) => { setEmail(v); clear("email"); }} error={errors.email} />
        <Field label="Password" type="password" autoComplete="current-password" placeholder="Use a strong password" value={password} onChange={(v) => { setPassword(v); clear("password"); }} error={errors.password} />

        <div className="flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-body">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 rounded accent-primary"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            onClick={onSuccess}
            className="text-[13px] text-ink underline underline-offset-2"
          >
            Forget Password?
          </Link>
        </div>

        <FormError message={error} />
        <SubmitButton loading={loading}>Sign in</SubmitButton>
        <OrDivider />
        <SocialButton>Continue with facebook</SocialButton>
        <SocialButton>Continue with Google</SocialButton>

        <p className="text-center text-[13px] text-body">
          New to MyVilla?{" "}
          <button type="button" onClick={onSwitch} className="text-primary underline underline-offset-2">
            Create an account
          </button>
        </p>
      </div>
    </form>
  );
}

function RegisterForm({
  onSwitch,
  onSuccess,
}: {
  onSwitch: () => void;
  onSuccess: () => void;
}) {
  const { setUser } = useAuth();
  const [email, setEmail] = useState("");
  const [dialCode, setDialCode] = useState("+00");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors<RegisterField>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function clear(field: RegisterField) {
    setErrors((e) => ({ ...e, [field]: undefined }));
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const nextErrors: FieldErrors<RegisterField> = {
      email: validateEmail(email),
      phone: validatePhone(phone),
      country: validateRequired(country, "Country or region"),
      password: validatePassword(password),
      confirm: validateConfirm(password, confirm),
    };
    setErrors(nextErrors);
    if (!isValid(nextErrors)) return;

    setLoading(true);
    try {
      const { user } = await registerUser({
        email: email.trim(),
        password,
        phoneNumber: `${dialCode} ${phone.trim()}`,
        country,
      });
      setUser(user);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <h2 className="text-[20px] font-bold text-ink">Welcome to MyVilla</h2>
      <p className="mt-1 text-[13px] text-body">Create your account to continue</p>

      <div className="mt-4 space-y-3">
        <Field label="Email" type="email" autoComplete="email" placeholder="someone@example.com" value={email} onChange={(v) => { setEmail(v); clear("email"); }} error={errors.email} />

        {/* Phone number with dial-code prefix */}
        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-ink">Phone Number</label>
          <div className="flex gap-2">
            <input
              value={dialCode}
              onChange={(e) => setDialCode(e.target.value)}
              className="w-16 rounded-lg border border-line bg-white px-3 py-2.5 text-center text-[14px] text-ink focus:border-primary focus:outline-none"
            />
            <input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); clear("phone"); }}
              placeholder="000 - 0000 - 000"
              inputMode="tel"
              aria-invalid={!!errors.phone}
              className={`flex-1 rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:outline-none ${
                errors.phone ? "border-red-400 focus:border-red-400" : "border-line focus:border-primary"
              }`}
            />
          </div>
          {errors.phone && <p className="mt-1 text-[12px] text-red-600">{errors.phone}</p>}
        </div>

        {/* Country select */}
        <div>
          <label className="mb-1.5 block text-[14px] font-semibold text-ink">Country or Region</label>
          <div className="relative">
            <select
              value={country}
              onChange={(e) => { setCountry(e.target.value); clear("country"); }}
              aria-invalid={!!errors.country}
              className={`w-full appearance-none rounded-lg border bg-white px-3.5 py-2.5 pr-10 text-[14px] focus:outline-none ${
                errors.country ? "border-red-400 focus:border-red-400" : "border-line focus:border-primary"
              } ${country ? "text-ink" : "text-muted"}`}
            >
              <option value="">Choose country or region</option>
              {COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <ChevronDown
              size={18}
              className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-primary"
            />
          </div>
          {errors.country && <p className="mt-1 text-[12px] text-red-600">{errors.country}</p>}
        </div>

        <Field label="Password" type="password" autoComplete="new-password" placeholder="Min 8 chars, letters & numbers" value={password} onChange={(v) => { setPassword(v); clear("password"); }} error={errors.password} />
        <Field label="Confirm Password" type="password" autoComplete="new-password" placeholder="Re-enter your password" value={confirm} onChange={(v) => { setConfirm(v); clear("confirm"); }} error={errors.confirm} />

        <FormError message={error} />
        <SubmitButton loading={loading}>Register</SubmitButton>

        <p className="text-center text-[11px] leading-5 text-muted">
          By clicking <span className="text-primary">Register</span> I agree to the{" "}
          <span className="font-semibold text-ink underline underline-offset-2">
            Terms &amp; Condition
          </span>{" "}
          of MyVilla
        </p>

        <OrDivider />
        <SocialButton>Continue with facebook</SocialButton>
        <SocialButton>Continue with Google</SocialButton>

        <p className="text-center text-[13px] text-body">
          Already have an account?{" "}
          <button type="button" onClick={onSwitch} className="text-primary underline underline-offset-2">
            Sign in
          </button>
        </p>
      </div>
    </form>
  );
}

const COUNTRIES = [
  "United States",
  "United Kingdom",
  "India",
  "United Arab Emirates",
  "Australia",
  "Canada",
  "Germany",
  "France",
  "Singapore",
  "Japan",
];

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

function Field({
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  autoComplete,
}: {
  label: string;
  type?: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[14px] font-semibold text-ink">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={!!error}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 ${
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-500/15"
            : "border-line focus:border-primary focus:ring-primary/15"
        }`}
      />
      {error && <p className="mt-1 text-[12px] text-red-600">{error}</p>}
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">{message}</p>
  );
}

function SubmitButton({
  children,
  loading = false,
}: {
  children: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="w-full rounded-lg bg-primary py-3 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

function SocialButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      className="w-full rounded-lg border border-line bg-white px-4 py-2.5 text-left text-[14px] text-body transition-colors hover:bg-page"
    >
      {children}
    </button>
  );
}

function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-line" />
      <span className="text-[13px] text-muted">Or</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
