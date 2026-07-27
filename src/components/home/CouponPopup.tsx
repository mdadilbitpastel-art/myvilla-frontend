"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Copy, Check, BadgePercent } from "lucide-react";
import Img from "@/components/ui/Img";
import type { Offer } from "@/lib/api";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=800&q=80";

/**
 * The on-load offer popup: a real villa with an active coupon. Shows once per
 * browser session (a dismissal is remembered in sessionStorage), so it greets a
 * visitor without nagging them on every navigation.
 */
export default function CouponPopup({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(offer.code);
    } catch {
      /* clipboard blocked — the code is on screen to copy by hand */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (typeof document === "undefined") return null;

  const place = [offer.city, offer.country].filter(Boolean).join(", ");

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Special offer"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="my-auto w-full max-w-[440px] overflow-hidden rounded-2xl bg-white shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        {/* Image header */}
        <div className="relative h-[200px] w-full">
          <Img
            src={offer.coverImage || FALLBACK_IMG}
            alt={offer.title}
            fallback={FALLBACK_IMG}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink shadow transition-colors hover:bg-white"
          >
            <X size={16} aria-hidden />
          </button>
          {/* Discount badge */}
          <div className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-[#ff2d2d] px-3 py-1.5 text-[13px] font-bold text-white shadow-lg">
            <BadgePercent size={15} aria-hidden />
            {offer.label}
          </div>
          <div className="absolute bottom-0 left-0 p-4 text-white">
            <p className="text-[17px] font-bold leading-snug">{offer.title}</p>
            {place && <p className="text-[12px] opacity-90">{place}</p>}
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-center text-[13px] text-body">
            Use this code at checkout and save on your stay
          </p>

          {/* Code + copy */}
          <button
            type="button"
            onClick={copy}
            className="group mt-3 flex w-full items-center justify-between gap-3 rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-3 transition-colors hover:border-primary"
            aria-label={`Copy coupon code ${offer.code}`}
          >
            <span className="font-mono text-[20px] font-bold tracking-widest text-primary">
              {offer.code}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] font-semibold text-primary">
              {copied ? (
                <>
                  <Check size={15} aria-hidden /> Copied
                </>
              ) : (
                <>
                  <Copy size={15} aria-hidden /> Copy
                </>
              )}
            </span>
          </button>

          <Link
            href={`/villa/${offer.villaId}?coupon=${encodeURIComponent(offer.code)}`}
            onClick={onClose}
            className="mt-4 block rounded-xl bg-primary px-6 py-3 text-center text-[14px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            View villa &amp; book
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="mt-2 block w-full text-center text-[12px] font-medium text-muted transition-colors hover:text-body"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
