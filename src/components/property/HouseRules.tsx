import { Clock, PawPrint } from "lucide-react";

export default function HouseRules({
  rules,
  additional,
}: {
  rules: string[];
  additional: string;
}) {
  return (
    <section className="py-6">
      <h3 className="mb-5 text-[18px] font-semibold text-primary">House Rules</h3>

      <ul className="space-y-4">
        {rules.map((rule) => {
          const isPets = rule.toLowerCase().includes("pet");
          return (
            <li key={rule} className="flex items-center gap-3 text-[15px] text-ink">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  isPets ? "" : "bg-primary text-white"
                }`}
              >
                {isPets ? (
                  <PawPrint size={20} className="text-primary" />
                ) : (
                  <Clock size={17} />
                )}
              </span>
              {rule}
            </li>
          );
        })}
      </ul>

      <h3 className="mb-4 mt-8 text-[18px] font-semibold text-primary">Additional Rules</h3>
      <p className="whitespace-pre-line text-[15px] leading-7 text-body">{additional}</p>
    </section>
  );
}
