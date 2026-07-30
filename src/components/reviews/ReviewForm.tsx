"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import StarRating from "@/components/ui/StarRating";

/**
 * How long a review may be.
 *
 * 2000 characters is the going rate for a stay review — Booking.com's own
 * limit, and roughly double Airbnb's 1000. It is also exactly what the server
 * keeps: `submit_review` truncates at [:2000]. The two MUST stay in step —
 * a box that accepts more than the server stores loses the tail of a long
 * review silently, which is the one failure a reviewer never finds out about.
 */
const COMMENT_MAX = 2000;

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
  rows = 6,
  compact = false,
}: {
  initialRating?: number;
  initialComment?: string;
  onSubmit: (rating: number, comment: string) => void | Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  submitLabel?: string;
  /**
   * How tall the comment box starts. Six rows suits a page that exists to
   * collect the review; somewhere the form is a guest inside something else —
   * an expanded booking row — two is enough, and the rest of the panel stays
   * reachable. The box scrolls either way; nothing is capped but the height.
   */
  rows?: number;
  /** Stars, counter and buttons on one line under the box. See below. */
  compact?: boolean;
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

  // Near the cap, the counter appears. Compact keeps no empty line reserved
  // for it — it can push the buttons down the 16px on the rare occasion it
  // shows, which costs nothing next to holding the space on every render.
  const counter = comment.length >= COMMENT_MAX - 200 && (
    <span
      className={`text-[11.5px] ${
        comment.length >= COMMENT_MAX ? "font-semibold text-red-600" : "text-muted"
      }`}
    >
      {COMMENT_MAX - comment.length} characters left
    </span>
  );

  // Compact: everything on ONE band — stars at the left, the box beside them,
  // the buttons at the right. Stacked, the same three pieces are three bands
  // of height; side by side they cost the height of the tallest, which is the
  // box itself. It exists for the expanded booking row, where this form is a
  // guest inside a panel that is already long. Wraps to stacked on narrow
  // screens, where there is no width to put them beside each other anyway.
  if (compact) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="flex shrink-0 flex-col gap-0.5">
            <StarRating value={rating} onChange={(v) => { setRating(v); setError(""); }} size={20} />
            <span className="text-[11px] font-medium text-muted">
              {rating > 0 ? `${rating} / 5` : "Tap to rate"}
            </span>
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={rows}
            maxLength={COMMENT_MAX}
            placeholder="Share a few words about your stay (optional)…"
            className="min-w-[150px] flex-1 resize-none rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] leading-5 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary"
          />

          {/* Centred against the box beside it rather than pinned to its top —
              the band reads as one line with the action sitting on its axis. */}
          <div className="flex shrink-0 flex-col gap-1.5 self-center">
            {/* The rating's own gold, not the app's purple: this button belongs
                to the stars it submits. Dark ink on the gold rather than white
                — white on #f5b301 is barely legible at this size. */}
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              aria-busy={busy}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-b from-star to-[#e29c00] px-3.5 py-1.5 text-[12.5px] font-bold text-[#3f2d00] shadow-[0_4px_12px_-3px_rgba(245,179,1,0.7)] ring-1 ring-[#c98b00]/30 transition-[filter,box-shadow] hover:brightness-[1.06] hover:shadow-[0_6px_16px_-3px_rgba(245,179,1,0.85)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? (
                <>
                  <span className="spinner" aria-hidden /> Saving…
                </>
              ) : (
                <>
                  <Star size={13} className="fill-current" aria-hidden />
                  {submitLabel}
                </>
              )}
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-lg border border-line px-3.5 py-1 text-[12px] font-medium text-body transition-colors hover:border-primary/40 hover:text-ink"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
        {(counter || error) && (
          <div className="flex items-center justify-between gap-3">
            {error ? <p className="text-[12px] text-red-600">{error}</p> : <span />}
            {counter}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <StarRating value={rating} onChange={(v) => { setRating(v); setError(""); }} size={26} />
        <span className="text-[13px] font-medium text-muted">
          {rating > 0 ? `${rating} / 5` : "Tap to rate"}
        </span>
      </div>
      {/* Fixed height, not a drag-to-resize box: the handle only ever let
          someone reshape the panel around it. How many rows is the caller's
          call — a page devoted to the review can afford six; a form folded
          into an expanded row cannot. */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={rows}
        maxLength={COMMENT_MAX}
        placeholder="Share a few words about your stay (optional)…"
        className="w-full resize-none rounded-xl border border-line bg-white px-3.5 py-2.5 text-[13.5px] leading-6 text-ink outline-none transition-colors placeholder:text-muted/70 focus:border-primary"
      />
      {/* Only once they're near the cap — a counter on an empty box reads as a
          length requirement, and the comment is optional. */}
      <div className="flex min-h-[16px] items-center justify-end">{counter}</div>
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
