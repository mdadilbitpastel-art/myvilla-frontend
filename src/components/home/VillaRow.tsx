import SectionHeading from "./SectionHeading";
import VillaCard from "./VillaCard";
import Reveal from "@/components/ui/Reveal";
import type { VillaCardData } from "@/lib/home";

export default function VillaRow({
  title,
  highlight,
  data,
  variant = "overlay",
  loading = false,
}: {
  title: string;
  highlight?: string;
  data: VillaCardData[];
  variant?: "overlay" | "card";
  // While the real villas are still loading, show placeholders instead of the
  // mock list, so the row never flashes stand-in data before the real data.
  loading?: boolean;
}) {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-8">
      <SectionHeading title={title} highlight={highlight} />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }, (_, i) => (
              <VillaCardSkeleton key={`skeleton-${i}`} variant={variant} />
            ))
          : data.map((v, i) => (
              // Key by villa id so swapping the mock list for real backend data
              // remounts the cards instead of reusing them in place.
              // `h-full` so every card fills its grid row: the row is as tall as
              // its tallest card, and the rest stretch to match it.
              <Reveal key={v.id ?? `placeholder-${i}`} delay={i * 90} className="h-full">
                <VillaCard data={v} variant={variant} />
              </Reveal>
            ))}
      </div>
    </section>
  );
}

// Placeholder shaped like a real VillaCard (same ratio + text block), so the
// row holds its exact height and layout doesn't jump when the villas arrive.
function VillaCardSkeleton({ variant }: { variant: "overlay" | "card" }) {
  const ratio = variant === "card" ? "aspect-[4/3]" : "aspect-[4/5]";
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className={`skeleton w-full ${ratio}`} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton mt-1 h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}
