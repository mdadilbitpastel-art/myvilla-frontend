"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Star, BadgeCheck, Lock, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import VillaCard from "@/components/home/VillaCard";
import Avatar from "@/components/ui/Avatar";
import { fetchMyVillas, type Villa } from "@/lib/api";
import type { VillaCardData } from "@/lib/home";
import {
  accountProfile,
  accountReviews,
  accountRating,
} from "@/lib/account";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

function villaToCard(v: Villa): VillaCardData {
  return {
    id: v.id,
    image: v.photos[0]?.url || v.coverImage || FALLBACK_IMG,
    city: v.city || v.title,
    country: v.country || v.propertyType || "",
    price: v.pricePerNight,
    distance: v.propertyType || "Villa",
    dates: `${v.bedrooms} BR · ${v.guests} guests`,
  };
}

export default function AccountPage() {
  const { user, ready } = useAuth();

  // Guard: only signed-in users can view their account.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[1200px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your account.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 pb-16 pt-7 lg:px-7">
      {/* Breadcrumb */}
      <nav className="text-[14px] text-ink">
        <Link href="/" className="underline underline-offset-2 hover:text-primary">
          Home
        </Link>
        <span className="mx-1.5 text-muted">/</span>
        <Link href="/settings" className="underline underline-offset-2 hover:text-primary">
          Settings
        </Link>
        <span className="mx-1.5 text-muted">/</span>
        <span className="text-muted">Profile</span>
      </nav>

      <h1 className="mt-5 text-[30px] font-bold text-ink">My Account</h1>

      {/* Top: profile (left) + My Villas (right) */}
      <div className="mt-5 grid grid-cols-1 gap-x-12 gap-y-12 lg:grid-cols-[360px_1fr]">
        <ProfileCard user={user} />
        <MyVillas />
      </div>

      {/* Bottom: reviews (left) + rating breakdown (right) */}
      <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-[1fr_360px]">
        <ReviewsList />
        <RatingBreakdown />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile card                                                        */
/* ------------------------------------------------------------------ */

function ProfileCard({ user }: { user: import("@/lib/api").AuthUser }) {
  const p = accountProfile;
  // Real identity from the signed-in user; stats (reviews/response) stay demo.
  const name = user.fullName?.trim() || user.email;
  const email = user.email;
  const phone = user.phoneNumber?.trim() || "—";
  return (
    <div>
      {/* Avatar + name */}
      <div className="flex items-center gap-4">
        <Avatar src={user.avatar} name={name} gender={user.gender} size={74} />
        <div>
          <p className="text-[18px] font-bold text-ink">{name}</p>
          <p className="mt-0.5 text-[14px] text-muted">{p.joined}</p>
        </div>
      </div>

      {/* Reviews + identity */}
      <div className="mt-6 flex items-center gap-8">
        <div className="flex items-center gap-2">
          <Star size={18} className="fill-star text-star" />
          <span className="text-[15px] font-semibold text-ink">
            {p.reviewsCount} Reviews
          </span>
        </div>
        {p.identityVerified && (
          <div className="flex items-center gap-2">
            <BadgeCheck size={18} className="fill-primary text-white" />
            <span className="text-[15px] font-semibold text-ink">Identity Verified</span>
          </div>
        )}
      </div>

      {/* Details */}
      <div className="mt-5 space-y-1 text-[14px] text-body">
        <p>Response rate: {p.responseRate}</p>
        <p>Response time: {p.responseTime}</p>
        <p>Email: {email}</p>
        <p>Phone: {phone}</p>
      </div>

      <Link
        href="/settings/profile"
        className="mt-6 inline-block rounded-lg border border-primary/50 px-5 py-2 text-[14px] font-medium text-primary transition-colors hover:bg-primary/5"
      >
        Edit Profile
      </Link>

      {/* Payment protection note */}
      <div className="mt-8 flex items-start gap-3">
        <span className="flex h-8 w-7 shrink-0 items-center justify-center rounded-md bg-ink text-white">
          <Lock size={14} />
        </span>
        <p className="max-w-[320px] text-[13px] leading-6 text-body">
          To protect your payment, never transfer money or communicate outside of
          the MyVilla website or app.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* My Villas                                                           */
/* ------------------------------------------------------------------ */

function MyVillas() {
  const { user, ready } = useAuth();
  const [villas, setVillas] = useState<Villa[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    setVillas(null);
    fetchMyVillas()
      .then(setVillas)
      // "No villas yet" would be a lie when the request never came back.
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-heading">My Villas</h2>
        <Link
          href="/settings/property"
          className="flex items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-ink"
        >
          View all <ArrowRight size={16} />
        </Link>
      </div>

      {villas === null && !failed ? (
        /* Placeholders match the scroll-row card box so nothing shifts later. */
        <div className="mt-5 -mr-5 flex gap-5 overflow-hidden pb-2 pr-5 lg:-mr-7 lg:pr-7">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-[280px] shrink-0 overflow-hidden rounded-2xl bg-white shadow-sm">
              <div className="skeleton aspect-[4/3] rounded-none" />
              <div className="p-4">
                <div className="skeleton h-[14px] w-3/4" />
                <div className="skeleton mt-2 h-[12px] w-1/2" />
                <div className="skeleton mt-2.5 h-[12px] w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : failed ? (
        <div
          role="alert"
          className="mt-5 flex flex-col items-start rounded-xl border border-dashed border-line px-5 py-8"
        >
          <p className="text-[15px] font-semibold text-ink">Couldn&apos;t load your villas</p>
          <p className="mt-1 text-[13px] text-muted">
            Something went wrong while fetching your listings.
          </p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Try again
          </button>
        </div>
      ) : (villas ?? []).length === 0 ? (
        <div className="mt-5 flex flex-col items-start rounded-xl border border-dashed border-line px-5 py-8">
          <p className="text-[15px] font-semibold text-ink">No villas yet</p>
          <p className="mt-1 text-[13px] text-muted">
            You haven&apos;t listed any villa.
          </p>
          <Link
            href="/settings/property/add"
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
          >
            Add Property
          </Link>
        </div>
      ) : (
        /* Horizontal scroll row — cards bleed off the right edge like the mock. */
        <div className="mt-5 -mr-5 flex snap-x gap-5 overflow-x-auto scroll-smooth pb-2 pr-5 lg:-mr-7 lg:pr-7">
          {(villas ?? []).map((v) => (
            <div key={v.id} className="w-[280px] shrink-0 snap-start">
              <VillaCard data={villaToCard(v)} variant="card" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Reviews list                                                        */
/* ------------------------------------------------------------------ */

function ReviewsList() {
  return (
    <div>
      <h2 className="mb-7 text-[18px] font-semibold text-primary">Reviews</h2>
      <div className="space-y-8">
        {accountReviews.map((r) => (
          <div key={`${r.name}-${r.date}`}>
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                <Image src={r.avatar} alt={r.name} fill sizes="48px" className="object-cover" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-heading">{r.name}</p>
                <p className="mt-0.5 text-[13px] text-muted">{r.date}</p>
                <div className="mt-1 flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} size={13} className="fill-star text-star" />
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-3 text-[14px] leading-6 text-body">
              {r.text}{" "}
              {/* TODO: expand the full review text — no target exists yet, so
                  this stays a no-op rather than an <a href="#"> that scrolls
                  the page back to the top. */}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-2"
              >
                See more.
              </button>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rating breakdown                                                    */
/* ------------------------------------------------------------------ */

function RatingBreakdown() {
  const { rating, reviewsCount, breakdown } = accountRating;
  return (
    <div>
      <div className="mb-5 flex items-center gap-2 text-[15px]">
        <Star size={18} className="fill-star text-star" />
        <span className="font-semibold text-ink">{rating} Rating</span>
        <span className="text-muted">·</span>
        <span className="text-ink">{reviewsCount} reviews</span>
      </div>

      <div className="space-y-3.5">
        {breakdown.map((row) => (
          <div key={row.label} className="flex items-center gap-4">
            <span className="w-28 shrink-0 text-[14px] text-ink">{row.label}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(row.score / 5) * 100}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right text-[14px] text-ink">{row.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
