"use client";

import { useState } from "react";
import { Star } from "lucide-react";

/**
 * Five stars — read-only when no `onChange` is given, an interactive picker when
 * it is (hover to preview, click to set). Used for the aggregate, each review,
 * and the review form.
 */
export default function StarRating({
  value,
  onChange,
  size = 18,
  className = "",
}: {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  className?: string;
}) {
  const [hover, setHover] = useState(0);
  const interactive = !!onChange;
  const shown = hover || value;

  return (
    <div
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? "Choose a rating" : `${value} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= shown;
        const star = (
          <Star
            size={size}
            strokeWidth={1.5}
            className={filled ? "fill-star text-star" : "fill-transparent text-line"}
            aria-hidden
          />
        );
        if (!interactive) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            className="cursor-pointer p-0.5 transition-transform hover:scale-110"
          >
            {star}
          </button>
        );
      })}
    </div>
  );
}
