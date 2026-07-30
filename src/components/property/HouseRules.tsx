import { Clock, PawPrint, Cigarette, PartyPopper, CircleSlash } from "lucide-react";

// Each rule is worded by the backend off what the host set (see
// properties/api/types.py). The icon is picked from that wording, and a rule
// the host said "no" to is shown muted — the same list then reads as "what you
// can do" at a glance.
function iconFor(rule: string) {
  const t = rule.toLowerCase();
  if (t.includes("pet")) return PawPrint;
  if (t.includes("smok")) return Cigarette;
  if (t.includes("event") || t.includes("part")) return PartyPopper;
  if (t.includes("check") || t.includes("arrival")) return Clock;
  return CircleSlash;
}

const isNegative = (rule: string) =>
  /(^no\b|not allowed)/i.test(rule.trim());

/** "2:00 pm" — the same wording the backend gives the check-in/out rules. */
function prettyTime(minutesOfDay: number): string {
  const h = Math.floor(minutesOfDay / 60);
  const m = minutesOfDay % 60;
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

/**
 * The latest the property will still take an arrival: the host's check-in time
 * plus the grace period they set. Worth saying on the listing rather than only
 * on the booking — a guest whose flight lands late needs it while they're still
 * choosing, not after they've paid.
 *
 * "" when the host set no check-in time or no grace period, since then there's
 * no honest hour to name.
 */
function lastArrivalRule(checkInTime: string, graceMinutes: number): string {
  const at = /^(\d{1,2}):(\d{2})/.exec(checkInTime || "");
  if (!at || graceMinutes <= 0) return "";
  const total = Number(at[1]) * 60 + Number(at[2]) + graceMinutes;
  // A late check-in with a long grace period runs past midnight; say so, or
  // "Last arrival: 2:00 am" reads as the same afternoon and is 22 hours wrong.
  const nextDay = total >= 24 * 60;
  return `Last arrival: ${prettyTime(total % (24 * 60))}${nextDay ? " (next day)" : ""}`;
}

export default function HouseRules({
  rules,
  additional,
  checkInTime = "",
  graceMinutes = 0,
}: {
  rules: string[];
  additional: string;
  /** The host's check-in time, "HH:MM" — with `graceMinutes`, the two give the
   *  last hour a guest may still arrive. */
  checkInTime?: string;
  /** How long past check-in the host will still take an arrival, in minutes. */
  graceMinutes?: number;
}) {
  // Slotted in right under "Check-in: After …" rather than appended, so the
  // two hours that bracket an arrival are read together. The server-worded list
  // itself is left alone — this is the one rule derived on the client.
  const lastArrival = lastArrivalRule(checkInTime, graceMinutes);
  const shown = !lastArrival
    ? rules
    : (() => {
        const i = rules.findIndex((r) => /^check-?\s?in/i.test(r));
        return i < 0
          ? [...rules, lastArrival]
          : [...rules.slice(0, i + 1), lastArrival, ...rules.slice(i + 1)];
      })();

  if (!shown.length && !additional.trim()) return null;

  return (
    <section className="py-6">
      <h3 className="mb-5 text-[18px] font-semibold text-primary">House Rules</h3>

      <ul className="space-y-4">
        {shown.map((rule) => {
          const Icon = iconFor(rule);
          const negative = isNegative(rule);
          return (
            <li key={rule} className="flex items-center gap-3 text-[15px] text-ink">
              {/* No filled badge: the chip stays neutral on every row and the
                  icon's own colour is what separates an allowed rule from one
                  the host said no to. */}
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-page ${
                  negative ? "text-muted" : "text-ink"
                }`}
              >
                <Icon size={17} aria-hidden />
              </span>
              {rule}
            </li>
          );
        })}
      </ul>

      {additional.trim() && (
        <>
          <h3 className="mb-4 mt-8 text-[18px] font-semibold text-primary">
            Additional Rules
          </h3>
          <p className="whitespace-pre-line text-[15px] leading-7 text-body">
            {additional}
          </p>
        </>
      )}
    </section>
  );
}
