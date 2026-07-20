import SectionHeading from "./SectionHeading";
import VillaCard from "./VillaCard";
import Reveal from "@/components/ui/Reveal";
import type { VillaCardData } from "@/lib/home";

export default function VillaRow({
  title,
  highlight,
  data,
  variant = "overlay",
}: {
  title: string;
  highlight?: string;
  data: VillaCardData[];
  variant?: "overlay" | "card";
}) {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-8">
      <SectionHeading title={title} highlight={highlight} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {data.map((v, i) => (
          // Key by villa id so swapping the mock list for real backend data
          // remounts the cards instead of reusing them in place.
          <Reveal key={v.id ?? `placeholder-${i}`} delay={i * 90}>
            <VillaCard data={v} variant={variant} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
