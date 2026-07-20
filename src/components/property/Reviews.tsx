import Image from "next/image";
import { Star } from "lucide-react";
import type { Review, RatingRow } from "@/lib/villa";

export default function Reviews({
  reviews,
  breakdown,
  rating,
  reviewsCount,
}: {
  reviews: Review[];
  breakdown: RatingRow[];
  rating: number;
  reviewsCount: number;
}) {
  return (
    <section id="reviews" className="border-b border-line py-6">
      <h3 className="mb-6 text-[18px] font-semibold text-primary">Reviews</h3>

      <div className="grid grid-cols-1 gap-x-12 gap-y-8 lg:grid-cols-[1fr_320px]">
        {/* Reviewer list */}
        <div className="space-y-7">
          {reviews.map((r, i) => (
            <div key={i}>
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-full">
                  <Image src={r.avatar} alt={r.name} fill sizes="48px" className="object-cover" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">{r.name}</p>
                  <p className="text-[13px] text-muted">{r.date}</p>
                </div>
              </div>
              <p className="mt-3 text-[14px] leading-6 text-body">
                {r.text}{" "}
                <button
                  type="button"
                  aria-disabled="true"
                  className="font-medium text-primary underline underline-offset-2"
                >
                  See more.
                </button>
              </p>
            </div>
          ))}

          <button className="rounded-lg border border-primary/40 px-5 py-2.5 text-[14px] font-medium text-primary transition-colors hover:bg-primary/5">
            Show all {reviewsCount} Reviews
          </button>
        </div>

        {/* Rating breakdown */}
        <div className="lg:border-l lg:border-line lg:pl-10">
          <div className="mb-4 flex items-center gap-2 text-[15px]">
            <Star size={18} className="fill-primary text-primary" />
            <span className="font-semibold text-ink">{rating} Rating</span>
            <span className="text-muted">·</span>
            <span className="text-ink">{reviewsCount} reviews</span>
          </div>

          <div className="space-y-3">
            {breakdown.map((row) => (
              <div key={row.label} className="flex items-center gap-4">
                <span className="w-28 shrink-0 text-[14px] text-ink">{row.label}</span>
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${(row.score / 5) * 100}%` }}
                  />
                </div>
                <span className="w-8 shrink-0 text-right text-[14px] text-ink">{row.score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
