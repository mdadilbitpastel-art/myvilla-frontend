"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import StarRating from "@/components/ui/StarRating";
import { fetchLatestReviews, type Review } from "@/lib/api";

function ReviewCard({ review }: { review: Review }) {
  const where = [review.villaTitle, review.villaCity].filter(Boolean).join(" · ");
  return (
    <div className="mr-5 w-[340px] shrink-0 whitespace-normal">
      <div className="flex h-full flex-col rounded-2xl border border-line bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          <Avatar src={review.authorAvatar} name={review.authorName} gender={review.authorGender} size={44} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{review.authorName}</p>
            {where && <p className="truncate text-[12px] text-muted">{where}</p>}
          </div>
        </div>
        <div className="mt-3">
          <StarRating value={review.rating} size={15} />
        </div>
        <p className="mt-3 line-clamp-4 text-[13px] leading-6 text-body">{review.comment}</p>
      </div>
    </div>
  );
}

export default function Testimonials() {
  // `null` = still loading; [] = loaded, nothing to show (section hides).
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchLatestReviews(24)
      .then((rs) => active && setReviews(rs))
      .catch(() => active && setReviews([]));
    return () => {
      active = false;
    };
  }, []);

  // Nothing to show yet, or no reviews at all — don't render an empty section.
  if (!reviews || reviews.length === 0) return null;

  // Reviews with more written text lead; the shorter ones follow after — a
  // fuller testimonial is the one worth showing first.
  const ordered = [...reviews].sort((a, b) => b.comment.length - a.comment.length);

  // Auto infinite-slide only once there's more than a rowful (3) to scroll.
  const slide = ordered.length > 3;
  // Constant per-card speed regardless of how many there are — slow and calm.
  const duration = Math.max(24, ordered.length * 7);

  return (
    <section className="mx-auto max-w-[1320px] px-6 py-14">
      <h2 className="mb-10 text-center text-[20px] font-semibold text-heading sm:text-[22px]">
        What <span>My</span>
        <span className="text-primary">Villa</span> users are saying
      </h2>

      {slide ? (
        // A gentle fade at both edges so cards ease in and out of view rather
        // than getting cut off hard at the container.
        <div
          className="marquee-mask relative overflow-hidden"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
          }}
        >
          <div
            className="animate-marquee flex w-max"
            style={{ ["--marquee-duration" as string]: `${duration}s` }}
          >
            {ordered.map((r) => (
              <ReviewCard key={r.id} review={r} />
            ))}
            {/* A second, identical copy makes the -50% loop seamless. */}
            {ordered.map((r) => (
              <ReviewCard key={`dup-${r.id}`} review={r} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-6">
          {ordered.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
        </div>
      )}
    </section>
  );
}
