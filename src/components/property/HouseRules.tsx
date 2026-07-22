import { Clock, PawPrint, Cigarette, PartyPopper, CircleSlash } from "lucide-react";

// Each rule is worded by the backend off what the host set (see
// properties/api/types.py). The icon is picked from that wording, and a rule
// the host said "no" to is shown muted rather than in the primary badge — the
// same list then reads as "what you can do" at a glance.
function iconFor(rule: string) {
  const t = rule.toLowerCase();
  if (t.includes("pet")) return PawPrint;
  if (t.includes("smok")) return Cigarette;
  if (t.includes("event") || t.includes("part")) return PartyPopper;
  if (t.includes("check")) return Clock;
  return CircleSlash;
}

const isNegative = (rule: string) =>
  /(^no\b|not allowed)/i.test(rule.trim());

export default function HouseRules({
  rules,
  additional,
}: {
  rules: string[];
  additional: string;
}) {
  if (!rules.length && !additional.trim()) return null;

  return (
    <section className="py-6">
      <h3 className="mb-5 text-[18px] font-semibold text-primary">House Rules</h3>

      <ul className="space-y-4">
        {rules.map((rule) => {
          const Icon = iconFor(rule);
          const negative = isNegative(rule);
          return (
            <li key={rule} className="flex items-center gap-3 text-[15px] text-ink">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  negative ? "bg-page text-muted" : "bg-primary text-white"
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
