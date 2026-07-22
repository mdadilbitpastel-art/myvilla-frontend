"use client";

// Client-side auth state shared across the app (Navbar, account page, …).
// Backed by the localStorage session written in `lib/api.ts`.
// Also owns the sign-in / register modal state so any page can open it.

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, logout as clearSession, type AuthUser } from "./api";
import { useToast } from "./toast";
import type { AuthMode } from "@/components/auth/AuthModal";

type AuthContextValue = {
  user: AuthUser | null;
  /** false until the stored session has been read on the client (avoids hydration flash) */
  ready: boolean;
  setUser: (user: AuthUser | null) => void;
  signOut: () => void;
  /** which auth modal is open (null = closed) */
  authMode: AuthMode | null;
  openAuth: (mode: AuthMode) => void;
  closeAuth: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  const openAuth = (mode: AuthMode) => setAuthMode(mode);
  const closeAuth = () => setAuthMode(null);

  useEffect(() => {
    setUser(getStoredUser());
    setReady(true);

    // Open the modal from a `?auth=signin|register` link on a full page load,
    // then strip the param from the URL.
    const params = new URLSearchParams(window.location.search);
    const auth = params.get("auth");
    if (auth === "signin" || auth === "register") {
      setAuthMode(auth);
      params.delete("auth");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        window.location.pathname + (qs ? `?${qs}` : "")
      );
    }

    // Keep tabs/windows in sync when the session changes elsewhere.
    function onStorage() {
      setUser(getStoredUser());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function signOut() {
    clearSession();
    setUser(null);
    // Home, with the sign-in popup up. Staying put would often mean sitting on
    // a page the user can no longer see — every account page bounces a signed
    // out visitor anyway, so send them somewhere that works.
    router.push("/");
    setAuthMode("signin");
    toast.success("Logged out successfully");
  }

  return (
    <AuthContext.Provider
      value={{ user, ready, setUser, signOut, authMode, openAuth, closeAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
