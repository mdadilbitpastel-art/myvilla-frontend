"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { fetchWelcomeOffer, type WelcomeOffer } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * The first-booking welcome offer, fetched once and shared by everything that
 * mentions it: the placard that keeps appearing until it's used, the landing
 * page (which shows it ahead of any host offer), and the payment page (which
 * applies it to the total).
 *
 * One fetch, one answer — a popup promising 25% while checkout quotes something
 * else would be worse than no popup at all. The server re-checks eligibility
 * under a lock when the booking is actually taken, so this is only ever what to
 * show, never what to charge.
 */

type WelcomeState = {
  offer: WelcomeOffer | null;
  /** Still true while the first fetch is in flight — don't show anything yet. */
  loading: boolean;
  /** Advertise the offer? False once the guest has booked (or we can't tell). */
  available: boolean;
  /** Ask the server again — after a booking, or a sign-in/out. */
  refresh: () => void;
};

const Ctx = createContext<WelcomeState>({
  offer: null,
  loading: true,
  available: false,
  refresh: () => {},
});

export function WelcomeOfferProvider({ children }: { children: React.ReactNode }) {
  const { user, ready } = useAuth();
  const [offer, setOffer] = useState<WelcomeOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Wait for auth: asking before the token is restored would answer for a
    // signed-out visitor and wrongly offer the discount to someone who's used it.
    if (!ready) return;
    let active = true;
    fetchWelcomeOffer()
      .then((w) => {
        if (!active) return;
        setOffer(w);
        setLoading(false);
      })
      // Unreachable backend: say nothing rather than promise a discount we
      // can't stand behind.
      .catch(() => {
        if (!active) return;
        setOffer(null);
        setLoading(false);
      });
    return () => {
      active = false;
    };
    // `user?.id` and not `user`: the object identity changes on every profile
    // save, and none of those change who is asking.
  }, [ready, user?.id, nonce]);

  const value = useMemo<WelcomeState>(
    () => ({
      offer,
      loading,
      available: !loading && !!offer?.available,
      refresh,
    }),
    [offer, loading, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWelcomeOffer(): WelcomeState {
  return useContext(Ctx);
}
