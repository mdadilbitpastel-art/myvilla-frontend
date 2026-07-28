"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useWelcomeOffer } from "@/lib/welcome";
import WelcomeOfferPlacard, { type PlacardCorner } from "./WelcomeOfferPlacard";

/**
 * Keeps the first-booking placard turning up around the site until the guest
 * actually books — on the landing page as soon as it loads, and every so often
 * elsewhere, from a different corner each time.
 *
 * Mounted once in the root layout so it survives navigation: the timers are
 * about how long someone has been on the SITE, not on a page, and remounting
 * per route would restart them on every click.
 */

// How long after a page settles the sign is carried in. The landing page is
// where a visitor arrives, so it greets them; anywhere else it waits until
// they've had a chance to read something first.
const LANDING_DELAY_MS = 1_400;
const ELSEWHERE_DELAY_MS = 22_000;
// Between appearances, and after a dismissal (dismissing buys a longer rest —
// "not now" should be respected for more than one page).
const REPEAT_AFTER_MS = 4 * 60_000;
const SNOOZE_AFTER_DISMISS_MS = 12 * 60_000;
// How long it stays up on its own before wandering off again.
const VISIBLE_MS = 14_000;

// Different corner each time, so it never reads as the same box reappearing.
const CORNERS: PlacardCorner[] = ["bottom-left", "bottom-right", "top-right", "bottom-left"];

// Pages where an advert would be in the way rather than helpful: the checkout
// (the discount is already applied and itemised right there), and the auth-less
// password flows.
const MUTED_PATHS = [/^\/villa\/[^/]+\/book$/, /^\/forgot-password/, /^\/reset-password/];

export default function WelcomeOfferHost() {
  const pathname = usePathname() ?? "/";
  const { available } = useWelcomeOffer();
  const [shown, setShown] = useState(false);
  const [round, setRound] = useState(0);
  // When the sign may next appear, and how many times it has already. Refs, not
  // state: changing them must not re-render or the timers below would reset.
  const nextAt = useRef(0);
  const seen = useRef(0);

  const muted = MUTED_PATHS.some((re) => re.test(pathname));
  const isLanding = pathname === "/";

  // Schedule the next appearance whenever the route changes (or the sign comes
  // down). One timer at a time; navigating away simply reschedules.
  useEffect(() => {
    if (!available || muted || shown) return;

    const now = Date.now();
    // First ever appearance on the landing page is prompt; everything after
    // that waits out the repeat interval no matter which page we're on.
    const earliest = Math.max(
      now + (isLanding && seen.current === 0 ? LANDING_DELAY_MS : ELSEWHERE_DELAY_MS),
      nextAt.current
    );
    const timer = setTimeout(() => {
      setShown(true);
      seen.current += 1;
    }, earliest - now);
    return () => clearTimeout(timer);
  }, [available, muted, shown, isLanding, pathname, round]);

  // Take it down again on its own, so a guest who ignores it isn't left with a
  // corner of their screen permanently occupied.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => close(REPEAT_AFTER_MS), VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  // The moment the guest books, `available` flips false — pull the sign
  // immediately rather than letting the current one run out.
  useEffect(() => {
    if (!available && shown) setShown(false);
  }, [available, shown]);

  function close(restMs: number) {
    nextAt.current = Date.now() + restMs;
    setShown(false);
    // Nudges the scheduling effect to run again now that `shown` is false.
    setRound((r) => r + 1);
  }

  if (!available || !shown || muted) return null;

  return (
    <WelcomeOfferPlacard
      corner={CORNERS[(seen.current - 1) % CORNERS.length]}
      onClose={() => close(SNOOZE_AFTER_DISMISS_MS)}
    />
  );
}
