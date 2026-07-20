"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fetchMyFavorites, toggleFavorite as apiToggle } from "@/lib/api";
import { useAuth } from "@/lib/auth";

type FavoritesCtx = {
  /** villa ids the current user has saved */
  ids: Set<string>;
  /** false until the first load of the saved set has settled */
  ready: boolean;
  isSaved: (villaId: string) => boolean;
  /** toggle a villa; opens sign-in if logged out. Returns new saved state. */
  toggle: (villaId: string) => Promise<boolean>;
  refresh: () => void;
};

const Ctx = createContext<FavoritesCtx | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user, ready, openAuth } = useAuth();
  const [ids, setIds] = useState<Set<string>>(new Set());
  // Consumers that cross-reference `ids` with their own data need to know when
  // the set is real and not just the empty initial value.
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(() => {
    if (!user) {
      setIds(new Set());
      setLoaded(true);
      return;
    }
    fetchMyFavorites()
      .then((v) => setIds(new Set(v.map((x) => String(x.id)))))
      .catch(() => {
        /* keep whatever we have */
      })
      .finally(() => setLoaded(true));
  }, [user]);

  // Load the saved set once the session is known / changes.
  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  const isSaved = useCallback((villaId: string) => ids.has(String(villaId)), [ids]);

  const toggle = useCallback(
    async (villaId: string) => {
      if (!user) {
        openAuth("signin");
        return false;
      }
      const key = String(villaId);
      // Optimistic update, reconciled with the server's authoritative result.
      const wasSaved = ids.has(key);
      setIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(key);
        else next.add(key);
        return next;
      });
      try {
        const nowSaved = await apiToggle(villaId);
        setIds((prev) => {
          const next = new Set(prev);
          if (nowSaved) next.add(key);
          else next.delete(key);
          return next;
        });
        return nowSaved;
      } catch {
        // Roll back on failure.
        setIds((prev) => {
          const next = new Set(prev);
          if (wasSaved) next.add(key);
          else next.delete(key);
          return next;
        });
        return wasSaved;
      }
    },
    [ids, user, openAuth]
  );

  return (
    <Ctx.Provider value={{ ids, ready: loaded, isSaved, toggle, refresh }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFavorites(): FavoritesCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Safe fallback if used outside the provider (SSR/edge cases).
    return {
      ids: new Set(),
      // Nothing will ever load here, so callers shouldn't wait on it.
      ready: true,
      isSaved: () => false,
      toggle: async () => false,
      refresh: () => {},
    };
  }
  return ctx;
}
