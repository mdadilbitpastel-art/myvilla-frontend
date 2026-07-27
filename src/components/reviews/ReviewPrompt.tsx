"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import Img from "@/components/ui/Img";
import ReviewForm from "@/components/reviews/ReviewForm";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { fetchPendingReview, submitReview, type Booking } from "@/lib/api";

// Once per booking per browser session — skipping shouldn't nag on every visit.
const SEEN_KEY = "myvilla_review_prompt_seen";

/**
 * Landing-page prompt: when a signed-in guest has a completed-but-unreviewed
 * stay, invite them to rate it. They can review right here or skip. Renders
 * nothing until there's something to ask about.
 */
export default function ReviewPrompt() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const checkedFor = useRef<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!ready || !user) {
      checkedFor.current = null;
      return;
    }
    if (checkedFor.current === user.id) return;
    checkedFor.current = user.id;

    let cancelled = false;
    fetchPendingReview()
      .then((b) => {
        if (cancelled || !b) return;
        const seen = window.sessionStorage.getItem(`${SEEN_KEY}:${b.id}`);
        if (!seen) setBooking(b);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ready, user]);

  function dismiss() {
    if (booking) window.sessionStorage.setItem(`${SEEN_KEY}:${booking.id}`, "1");
    setBooking(null);
  }

  async function submit(rating: number, comment: string) {
    if (!booking) return;
    setBusy(true);
    try {
      await submitReview(booking.id, rating, comment);
      toast.success("Thanks for your review!");
      dismiss();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your review.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted || !booking) return null;

  const place = [booking.villaCity, booking.villaCountry].filter(Boolean).join(", ");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Rate your stay"
      className="fixed inset-0 z-[110] flex items-center justify-center px-5"
    >
      <div
        aria-hidden
        onClick={dismiss}
        className="animate-fade-in absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
      />
      <div className="animate-toast-in relative w-full max-w-[440px] overflow-hidden rounded-2xl border border-line bg-white shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/80 p-1.5 text-body transition-colors hover:bg-page hover:text-ink"
        >
          <X size={17} aria-hidden />
        </button>

        {/* Villa header */}
        <div className="flex items-center gap-3 border-b border-line p-4">
          <div className="img-frame h-[52px] w-[76px] shrink-0 overflow-hidden rounded-lg bg-page">
            <Img
              src={booking.villaCover}
              alt={booking.villaTitle}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-primary">
              How was your stay?
            </p>
            <Link
              href={`/villa/${booking.villaId}`}
              className="block truncate text-[15px] font-bold text-ink hover:text-primary"
            >
              {booking.villaTitle}
            </Link>
            {place && <p className="truncate text-[12px] text-muted">{place}</p>}
          </div>
        </div>

        <div className="p-4">
          <ReviewForm onSubmit={submit} busy={busy} submitLabel="Submit review" />
          <button
            type="button"
            onClick={dismiss}
            className="mt-3 w-full text-center text-[12.5px] text-muted underline underline-offset-2 hover:text-ink"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
