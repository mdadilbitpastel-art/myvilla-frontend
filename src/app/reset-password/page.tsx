"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resetPassword } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  validatePassword,
  validateConfirm,
  isValid,
  type FieldErrors,
} from "@/lib/validation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { openAuth } = useAuth();

  // Go to the home page and pop the sign-in modal open.
  function goSignin() {
    router.push("/");
    openAuth("signin");
  }

  // uid + token arrive in the emailed link (?uid=..&token=..).
  const [creds, setCreds] = useState<{ uid: string; token: string } | null>(null);
  const [linkChecked, setLinkChecked] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors<"password" | "confirm">>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(redirectTimer.current), []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const uid = params.get("uid");
    const token = params.get("token");
    if (uid && token) setCreds({ uid, token });
    setLinkChecked(true);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!creds) return;

    const next: FieldErrors<"password" | "confirm"> = {
      password: validatePassword(password),
      confirm: validateConfirm(password, confirm),
    };
    setErrors(next);
    if (!isValid(next)) return;

    setLoading(true);
    try {
      await resetPassword(creds.uid, creds.token, password);
      setDone(true);
      redirectTimer.current = setTimeout(goSignin, 1600);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const invalidLink = linkChecked && !creds;

  return (
    <div className="mx-auto w-full max-w-[840px] px-5 py-10 lg:py-14">
      <div className="flex min-h-[440px] items-center justify-center rounded-2xl bg-white px-6 py-12 shadow-sm">
        <div className="w-full max-w-[300px]">
          {!linkChecked ? (
            // The uid/token live in the query string and are only readable
            // after mount; showing the form first would flash it away.
            <div className="space-y-4" aria-busy="true">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-11 w-full" />
              <div className="skeleton h-11 w-full" />
            </div>
          ) : done ? (
            <div role="status" className="text-center">
              <h1 className="text-[18px] font-bold text-ink">Password updated</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-body">
                Your password has been reset. Redirecting you to sign in…
              </p>
              <button
                type="button"
                onClick={goSignin}
                className="mt-5 inline-block rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Sign in
              </button>
            </div>
          ) : invalidLink ? (
            <div className="text-center">
              <h1 className="text-[18px] font-bold text-ink">Invalid reset link</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-body">
                This link is invalid or has expired. Please request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="mt-5 inline-block rounded-lg bg-primary px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Recover password
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <h1 className="text-[18px] font-bold text-ink">Reset your password</h1>
              <p className="mt-1.5 text-[13px] leading-5 text-body">
                Reset your password with a new one!
              </p>

              <div className="mt-5 space-y-4">
                <PasswordField
                  label="New Password"
                  value={password}
                  onChange={(v) => {
                    setPassword(v);
                    setErrors((e) => ({ ...e, password: undefined }));
                    setError("");
                  }}
                  error={errors.password}
                />
                <PasswordField
                  label="Confirm Password"
                  value={confirm}
                  onChange={(v) => {
                    setConfirm(v);
                    setErrors((e) => ({ ...e, confirm: undefined }));
                    setError("");
                  }}
                  error={errors.confirm}
                />

                {error && (
                  <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  aria-busy={loading}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-3 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading && <span className="spinner" aria-hidden />}
                  {loading ? "Please wait…" : "Create Password"}
                </button>

                <p className="text-center text-[13px] text-ink">
                  Already have an Account?{" "}
                  <button
                    type="button"
                    onClick={goSignin}
                    className="text-primary underline underline-offset-2"
                  >
                    Sign in
                  </button>
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-[14px] font-semibold text-ink"
      >
        {label}
      </label>
      <input
        id={id}
        type="password"
        autoComplete="new-password"
        placeholder="Min 8 chars, letters & numbers"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-ink transition-colors placeholder:text-muted focus:outline-none focus:ring-2 ${
          error
            ? "border-red-400 focus:border-red-400 focus:ring-red-500/15"
            : "border-line focus:border-primary focus:ring-primary/15"
        }`}
      />
      {error && (
        <p id={errorId} className="mt-1 text-[12px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
