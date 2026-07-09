import { Star, Share, Heart } from "lucide-react";

export default function PropertyHeader({
  title,
  rating,
  reviewsCount,
}: {
  title: string;
  rating: number;
  reviewsCount: number;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-[26px] font-bold leading-tight text-ink sm:text-[28px]">
          {title}
        </h1>
        <div className="mt-2 flex items-center gap-3 text-[15px]">
          <span className="flex items-center gap-1.5 font-medium text-ink">
            <Star size={18} className="fill-primary text-primary" />
            {rating}
          </span>
          <span className="text-muted">·</span>
          <span className="text-ink">{reviewsCount} Reviews</span>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button className="flex items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-primary">
          <Share size={18} strokeWidth={2} />
          Share
        </button>
        <button className="flex items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-primary">
          <Heart size={18} strokeWidth={2} />
          Save
        </button>
      </div>
    </div>
  );
}
