"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import StarRating from "@/components/ui/StarRating";
import type { Review } from "@/lib/api";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
function fmtMonth(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Reviews({
  reviews,
  rating,
  reviewsCount,
}: {
  reviews: Review[];
  rating: number;
  reviewsCount: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? reviews : reviews.slice(0, 6);

  // Star distribution from the loaded reviews (5★ … 1★).
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }));
  const maxCount = Math.max(1, ...dist.map((d) => d.count));

  return (
    <section id="reviews" className="border-b border-line py-6">
      <div className="mb-6 flex items-center gap-2">
        <Star size={20} className="fill-star text-star" aria-hidden />
        <h3 className="text-[18px] font-semibold text-ink">
          {rating > 0 ? `${rating.toFixed(1)} · ` : ""}
          {reviewsCount > 0
            ? `${reviewsCount} review${reviewsCount === 1 ? "" : "s"}`
            : "Reviews"}
        </h3>
      </div>

      {reviewsCount === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-5 py-8 text-center">
          <p className="text-[14px] font-medium text-ink">No reviews yet</p>
          <p className="mt-1 text-[13px] text-muted">
            Be the first to review this villa after your stay.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[1fr_300px]">
          {/* Reviewer list */}
          <div className="space-y-7 lg:order-1">
            {shown.map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-3">
                  <Avatar src={r.authorAvatar} name={r.authorName} gender={r.authorGender} size={44} />
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">{r.authorName}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <StarRating value={r.rating} size={13} />
                      <span className="text-[12.5px] text-muted">{fmtMonth(r.createdAt)}</span>
                    </div>
                  </div>
                </div>
                {r.comment && (
                  <p className="mt-3 text-[14px] leading-6 text-body">{r.comment}</p>
                )}
              </div>
            ))}

            {reviews.length > 6 && (
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className="rounded-lg border border-primary/40 px-5 py-2.5 text-[14px] font-medium text-primary transition-colors hover:bg-primary/5"
              >
                {showAll ? "Show fewer" : `Show all ${reviews.length} reviews`}
              </button>
            )}
          </div>

          {/* Aggregate + distribution */}
          <div className="lg:order-2 lg:border-l lg:border-line lg:pl-10">
            <div className="flex items-end gap-3">
              <span className="text-[40px] font-extrabold leading-none text-ink">
                {rating.toFixed(1)}
              </span>
              <div className="pb-1">
                <StarRating value={Math.round(rating)} size={15} />
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {reviewsCount} review{reviewsCount === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-2">
              {dist.map((row) => (
                <div key={row.star} className="flex items-center gap-3">
                  <span className="flex w-8 shrink-0 items-center gap-0.5 text-[12.5px] text-ink">
                    {row.star}
                    <Star size={11} className="fill-star text-star" aria-hidden />
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-star"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-[12.5px] text-muted">
                    {row.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
