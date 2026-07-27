"use client";

import { useState } from "react";
import StarRating from "@/components/ui/StarRating";

/**
 * The star-picker + comment box used everywhere a guest can leave a review:
 * the booking detail panel, the booking list, and the landing-page prompt.
 * `onSubmit` does the actual GraphQL call; this component only gathers input.
 */
export default function ReviewForm({
  initialRating = 0,
  initialComment = "",
  onSubmit,
  onCancel,
  busy = false,
  submitLabel = "Submit review",
}: {
  initialRating?: number;
  initialComment?: string;
  onSubmit: (rating: number, comment: string) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  submitLabel?: string;
}) {
  const [rating, setRating] = useState(initialRating);
  const [comment, setComment] = useState(initialComment);
  const [error, setError] = useState("");

  async function submit() {
    if (rating < 1) {
      setError("Please pick a star rating.");
      return;
    }
    setError("");
    await onSubmit(rating, comment.trim());
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <StarRating value={rating} onChange={(v) => { setRating(v); setError(""); }} size={26} />
        <span className="text-[13px] font-medium text-muted">
          {rating > 0 ? `${rating} / 5` : "Tap to rate"}
        </span>
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Share a few words about your stay (optional)…"
        className="w-full resize-y rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary"
      />
      {error && <p className="text-[12.5px] text-red-600">{error}</p>}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          aria-busy={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? <><span className="spinner" aria-hidden /> Saving…</> : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-body transition-colors hover:border-primary/40 hover:text-ink"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
