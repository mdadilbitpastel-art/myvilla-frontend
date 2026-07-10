"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { requestPasswordReset } from "@/lib/api";
import { validateEmail } from "@/lib/validation";
import { useAuth } from "@/lib/auth";

const RESEND_COOLDOWN = 60; // seconds

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { user, ready } = useAuth();

  // A signed-in user has no business here — send them home.
  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  // Count the cooldown down to zero, one second at a time.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function send() {
    if (loading || cooldown > 0) return; // locked while the timer runs
    setError("");
    const err = validateEmail(email);
    setFieldError(err);
    if (err) return;

    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSent(true);
      setCooldown(RESEND_COOLDOWN); // start the 1-minute lock
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    send();
  }

  // Don't flash the form while we resolve the session / redirect a signed-in user.
  if (!ready || user) return <div className="min-h-[60vh]" />;

  return (
    <div className="mx-auto w-full max-w-[840px] px-5 py-10 lg:py-14">
      <div className="flex min-h-[440px] items-center justify-center rounded-2xl bg-white px-6 py-12 shadow-sm">
        <form onSubmit={submit} noValidate className="w-full max-w-[270px]">
          <h1 className="text-[18px] font-bold text-ink">Recover your password</h1>
          <p className="mt-1.5 text-[13px] leading-5 text-body">
            We will send you a confirmation code on your email assigned to our
            platform.
          </p>

          <div className="mt-6">
            <label className="mb-1.5 block text-[14px] font-semibold text-ink">
              Enter Email
            </label>
            <input
              type="email"
              autoComplete="email"
              placeholder="someone@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldError(undefined);
                setError("");
              }}
              aria-invalid={!!fieldError}
              className={`w-full rounded-lg border bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted focus:outline-none focus:ring-2 ${
                fieldError
                  ? "border-red-400 focus:border-red-400 focus:ring-red-500/15"
                  : "border-line focus:border-primary focus:ring-primary/15"
              }`}
            />
            {fieldError && (
              <p className="mt-1 text-[12px] text-red-600">{fieldError}</p>
            )}
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-600">
              {error}
            </p>
          )}

          {sent && !error && (
            <p className="mt-3 rounded-lg bg-primary/5 px-3 py-2 text-[13px] text-primary">
              If that email is registered, we&apos;ve sent a reset link to your
              inbox. It stays active for 15 minutes.
            </p>
          )}

          <button
            type="submit"
            disabled={loading || cooldown > 0}
            className="mt-4 w-full rounded-lg bg-primary py-3 text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading
              ? "Please wait…"
              : cooldown > 0
                ? `Resend in ${cooldown}s`
                : sent
                  ? "Resend Link"
                  : "Send Link"}
          </button>

          <p className="mt-3 text-center text-[13px] text-ink">
            Didn&apos;t recieve a code?{" "}
            <button
              type="button"
              onClick={send}
              disabled={loading || cooldown > 0}
              className="text-primary underline underline-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend"}
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
