"use client";

import { useEffect, useRef, useState } from "react";
import { googleLogin } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const SCOPES = "openid email profile";

type TokenResponse = { access_token?: string; error?: string };

type TokenClient = { requestAccessToken: () => void };

type GoogleOAuth2Api = {
  initTokenClient: (config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: unknown) => void;
  }) => TokenClient;
};

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2Api } };
  }
}

/** Loads the Google Identity Services script once per page. */
function loadGsi(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gsi")));
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("gsi"));
    document.head.appendChild(script);
  });
}

/**
 * "Continue with Google", styled like the rest of the form.
 *
 * Uses the OAuth popup token client rather than Google's own rendered button:
 * that's what lets the control keep our design instead of Google's iframe. The
 * access token goes to the backend, which checks it was minted for our client
 * id before trusting the email.
 */
export default function GoogleSignInButton({ onSuccess }: { onSuccess: () => void }) {
  const { setUser } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const clientRef = useRef<TokenClient | null>(null);
  // The token client's callback is registered once, so it must not close over
  // the first render's props.
  const handlers = useRef({ setUser, onSuccess });

  useEffect(() => {
    handlers.current = { setUser, onSuccess };
  });

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;

    loadGsi()
      .then(() => {
        const oauth2 = window.google?.accounts?.oauth2;
        if (cancelled || !oauth2) return;
        clientRef.current = oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: async (response: TokenResponse) => {
            if (!response.access_token) {
              setBusy(false);
              setError("Google sign-in was cancelled.");
              return;
            }
            try {
              const { user } = await googleLogin(response.access_token);
              handlers.current.setUser(user);
              handlers.current.onSuccess();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Google sign-in failed.");
            } finally {
              setBusy(false);
            }
          },
          error_callback: () => {
            setBusy(false);
            setError("Google sign-in was cancelled.");
          },
        });
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't reach Google. Check your connection.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function onClick() {
    setError("");
    if (!CLIENT_ID) {
      // Says which knob is missing rather than a dead end — this only ever
      // shows up in an environment nobody has set the client id in.
      setError(
        "Google sign-in needs NEXT_PUBLIC_GOOGLE_CLIENT_ID to be set, then a restart."
      );
      return;
    }
    if (!clientRef.current) {
      setError("Google is still loading — try again in a moment.");
      return;
    }
    setBusy(true);
    clientRef.current.requestAccessToken();
  }

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        aria-busy={busy}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-line bg-white px-4 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-page disabled:cursor-not-allowed disabled:opacity-70"
      >
        {busy ? <span className="spinner" aria-hidden /> : <GoogleGlyph />}
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-center text-[12px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

/** Google's four-colour "G". */
function GoogleGlyph() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
