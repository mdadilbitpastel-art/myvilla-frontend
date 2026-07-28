"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, PartyPopper } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWelcomeOffer } from "@/lib/welcome";

/**
 * The first-booking offer, carried on-screen like a cardboard sign on a stick.
 * Only ever shown to signed-out visitors (see WelcomeOfferHost), so it asks for
 * one thing: an account to land the discount on.
 *
 * It comes up from a corner, swings as if someone just planted it there, then
 * settles — the whole point is that it reads as a person holding up a placard
 * rather than a dialog opening. Corners rotate between appearances so it never
 * feels like the same box in the same place.
 *
 * Nothing about it blocks the page: no backdrop, no scroll lock, no focus trap.
 * It's an advert, and an advert that traps you is a bug.
 */

export type PlacardCorner = "bottom-left" | "bottom-right" | "top-right" | "top-left";

// Where each corner parks, and which way the sign leans while it's being
// carried in — a sign coming from the left tilts the other way to one from the
// right, exactly as it would if a hand were behind it.
const CORNER: Record<PlacardCorner, { place: string; from: string; lean: number }> = {
  "bottom-left": { place: "bottom-5 left-5", from: "translate-y-[130%] -translate-x-6", lean: -12 },
  "bottom-right": { place: "bottom-5 right-5", from: "translate-y-[130%] translate-x-6", lean: 12 },
  "top-right": { place: "top-[86px] right-5", from: "-translate-y-[130%] translate-x-6", lean: 10 },
  "top-left": { place: "top-[86px] left-5", from: "-translate-y-[130%] -translate-x-6", lean: -10 },
};

export default function WelcomeOfferPlacard({
  corner = "bottom-left",
  onClose,
}: {
  corner?: PlacardCorner;
  onClose: () => void;
}) {
  const { openAuth } = useAuth();
  const { offer } = useWelcomeOffer();
  // Two stages: carried in (tilted, off-screen) → planted (upright). Kicked off
  // a frame after mount so the browser has the "before" state to animate from.
  const [planted, setPlanted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPlanted(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !offer) return null;

  const spot = CORNER[corner];
  const percent = Math.round(offer.percentOff);

  function act() {
    // The offer is real, but it needs an account to land on.
    onClose();
    openAuth("signin");
  }

  return createPortal(
    <div
      // No backdrop and no pointer-events on the wrapper: the page underneath
      // stays fully usable while the sign is up.
      className={`pointer-events-none fixed z-[95] ${spot.place}`}
      role="complementary"
      aria-label="First booking offer"
    >
      <div
        className={`pointer-events-auto origin-bottom transition-all duration-[700ms] ${
          planted ? "translate-x-0 translate-y-0 opacity-100" : `${spot.from} opacity-0`
        }`}
        style={{
          // A spring: overshoots slightly, then comes back — the little bounce a
          // sign makes when it's set down.
          transitionTimingFunction: "cubic-bezier(.18,.89,.32,1.28)",
          transform: planted ? undefined : `rotate(${spot.lean}deg)`,
        }}
      >
        <div className={planted ? "animate-placard-settle" : ""}>
          {/* The stick it's carried on — behind the board, poking out below. */}
          <div className="relative">
            <span
              aria-hidden
              className="absolute left-1/2 top-[92%] h-9 w-[9px] -translate-x-1/2 rounded-b-sm bg-gradient-to-b from-[#b98a52] to-[#8f652f] shadow-sm"
            />

            {/* The board: corrugated card, taped at the corners. */}
            <div className="relative w-[264px] overflow-hidden rounded-[14px] border-[3px] border-[#c08b4e] bg-[linear-gradient(135deg,#e8c48f_0%,#dcb178_45%,#e5c08a_100%)] p-4 shadow-[0_16px_38px_rgba(0,0,0,0.28)]">
              {/* Corrugation — faint ruled lines, like real cardboard. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.18]"
                style={{
                  backgroundImage:
                    "repeating-linear-gradient(90deg, transparent 0 6px, rgba(120,72,20,.55) 6px 7px)",
                }}
              />
              {/* Sticky tape across the top-left corner. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -left-5 top-3 h-5 w-20 -rotate-45 bg-white/45"
              />

              <button
                type="button"
                onClick={onClose}
                aria-label="Dismiss this offer"
                className="absolute right-2 top-2 z-10 rounded-full p-1 text-[#7a4f18] transition-colors hover:bg-black/10"
              >
                <X size={15} aria-hidden />
              </button>

              <div className="relative">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ff2d2d] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-sm">
                  <PartyPopper size={12} aria-hidden />
                  Welcome gift
                </span>

                <p className="mt-2.5 text-[34px] font-extrabold leading-none text-[#5c3a0c] drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]">
                  {percent}%<span className="ml-1 text-[19px] font-bold">OFF</span>
                </p>
                <p className="mt-1 text-[13px] font-bold leading-snug text-[#6b4512]">
                  on your first booking
                </p>
                <p className="mt-1.5 text-[11.5px] leading-4 text-[#7a5822]">
                  Applied automatically at checkout — no code to type.
                </p>

                <button
                  type="button"
                  onClick={act}
                  className="mt-3 w-full rounded-lg bg-[#5c3a0c] py-2 text-[12.5px] font-bold text-[#ffe9c4] transition-colors hover:bg-[#734a12]"
                >
                  Sign in to claim
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
