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

// The amber a chip that is WAITING is drawn in — the part whose hour has come
// with nobody checked in, and the part the guest is next due back for.
//
// Amber for both, and specifically the amber the check-in countdown already
// uses (#e8912a), because they are the same fact said twice: an arrival is
// owed. The current part is NOT one of these — see LIVE_GREEN. It used to be
// drawn in the brand blue, which matched nothing else on the row.
const LIVE_AMBER = "border-[#e8912a]/35 bg-[#e8912a]/[0.14] text-[#94560c]";

// And the part the guest is actually IN. Green, because that is what green
// means everywhere else in this app — the check-in window standing open, the
// "Staying" status, a stay going right — and an arrival that is owed is a
// different thing from an arrival that has happened.
//
// Deeper than the `completed` green beside it (green-100 over green-50, a
// darker edge and darker text), so the part being slept in doesn't read as one
// more part behind us. The marks separate them anyway: ● against ✓.
const LIVE_GREEN = "border-green-600/45 bg-green-100 text-green-800";

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
    cls: LIVE_GREEN,
    word: "Guest is in this part now",
  },
  awaiting: {
    mark: "●",
    cls: LIVE_AMBER,
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
 * The look for the part the guest is next due back for — the same `LIVE_AMBER`
 * as `awaiting`, and for the same reason: both are an arrival that is owed.
 *
 * It needs naming separately only because it is a state that is NOT live by
 * default — an upcoming part is grey until it turns out to be the next one.
 * Left at that grey, the one chip pulsing for attention was also the palest
 * thing on the row: movement saying "look here" and colour saying "nothing to
 * see".
 */
const LIVE_UPCOMING = LIVE_AMBER;

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
  //
  // `null` when the stay has nothing live left — every part checked out, missed
  // or cancelled. This used to fall back to the first chip, which is how a
  // no-showed stay sat in Booking History with part 1 still breathing for
  // attention: movement is a claim that something is happening, and on a stay
  // that is over there is nothing left for it to be about.
  const live =
    progress.parts.find(
      (p) => p.status === "current" || p.status === "awaiting"
    )?.index ??
    progress.parts.find((p) => p.status === "upcoming")?.index ??
    null;
  return (
    <span className={`mt-1 flex flex-wrap items-center gap-1 ${className}`}>
      {progress.parts.map((p) => {
        const look = LOOK[p.status];
        const isLive = live !== null && p.index === live;
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
