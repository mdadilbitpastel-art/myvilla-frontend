import type { StayPart, StayProgress } from "@/lib/booking";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "12–14 Sep", collapsing the month when both dates share one. */
function range(checkIn: string, checkOut: string): string {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  if (Number.isNaN(+a) || Number.isNaN(+b)) return "";
  const month = (d: Date) => MONTHS[d.getMonth()];
  const same = a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  return same
    ? `${a.getDate()}–${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
}

// One look per state. The mark carries the meaning at a glance — a tick is done,
// a filled dot is happening, a hollow one hasn't started, a cross never will —
// and the colour only reinforces it, so the strip still reads in grayscale.
const LOOK: Record<StayPart["status"], { mark: string; cls: string; word: string }> = {
  completed: {
    mark: "✓",
    cls: "border-green-200 bg-green-50 text-green-700",
    word: "Completed",
  },
  current: {
    mark: "●",
    cls: "border-primary/25 bg-primary/10 text-primary",
    word: "Guest is in this part now",
  },
  awaiting: {
    mark: "●",
    cls: "border-amber-200 bg-amber-50 text-amber-800",
    word: "Check-in not confirmed yet",
  },
  upcoming: {
    mark: "○",
    cls: "border-line bg-page text-muted",
    word: "Still to come",
  },

  missed: {
    mark: "✕",
    cls: "border-red-200 bg-red-50 text-red-600",
    word: "Nobody checked in — this part was missed",
  },
  cancelled: {
    mark: "✕",
    cls: "border-line bg-page text-muted",
    word: "Cancelled",
  },
};

/**
 * The look for the part the guest is next due back for — the one chip in the
 * strip that breathes.
 *
 * Amber, and specifically the amber the check-in countdown is drawn in
 * (#e8912a), because it is the same fact said a second way: this is the arrival
 * that is coming. Left at the ordinary "still to come" grey, the one chip
 * pulsing for attention was also the palest thing on the row — movement saying
 * "look here" and colour saying "nothing to see".
 */
const LIVE_UPCOMING = "border-[#e8912a]/35 bg-[#e8912a]/[0.14] text-[#94560c]";

/**
 * The parts of a split stay, one chip each — what the single "1/2 parts done"
 * count used to stand in for. The count said how many were behind us; this says
 * which, and where the stay is now, in the same width.
 *
 * Each chip's dates and state are on its tooltip rather than in the row: a
 * booking table has four of these side by side, and the whole point of the strip
 * is that it reads without being read closely. The full part-by-part breakdown
 * is still in the expanded panel below the row.
 */
export default function StayPartChips({
  progress,
  className = "",
}: {
  progress: StayProgress;
  className?: string;
}) {
  if (!progress.isSplit) return null;
  // The one chip that is LIVE: the part being stayed in, the one whose hour has
  // come and is waiting on a check-in, or — when the guest is away between parts
  // — the one they are due back for. Only ever one, and only ever ahead of or
  // under the guest: a strip where three chips breathe at once is a strip nobody
  // can read past, and it would be pointing at nothing in particular.
  const live =
    progress.parts.find(
      (p) => p.status === "current" || p.status === "awaiting"
    )?.index ?? progress.parts.find((p) => p.status === "upcoming")?.index ?? 0;
  return (
    <span className={`mt-1 flex flex-wrap items-center gap-1 ${className}`}>
      {progress.parts.map((p) => {
        const look = LOOK[p.status];
        const isLive = p.index === live;
        // A part still to come that is the NEXT one takes the arrival colour;
        // the ones behind it in the queue stay grey.
        const cls = isLive && p.status === "upcoming" ? LIVE_UPCOMING : look.cls;
        const dates = range(p.checkIn, p.checkOut);
        return (
          <span
            key={p.index}
            title={
              `Part ${p.index} of ${progress.parts.length}` +
              (dates ? ` · ${dates}` : "") +
              ` (${p.nights} night${p.nights === 1 ? "" : "s"}) — ${look.word}`
            }
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10.5px] font-semibold ${cls} ${
              isLive ? "animate-soft-pulse" : ""
            }`}
          >
            <span aria-hidden>{look.mark}</span>
            Part {p.index}
          </span>
        );
      })}
    </span>
  );
}
