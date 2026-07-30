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
  variant?: "overlay" | "card" | "showcase" | "featured";
  // While the real villas are still loading, show placeholders instead of the
  // mock list, so the row never flashes stand-in data before the real data.
  loading?: boolean;
}) {
  return (
    <section className="mx-auto max-w-page px-6 py-8">
      <SectionHeading title={title} highlight={highlight} />
      {/* Wider gutters than a results grid: these cards lift on hover, and at
          gap-4 the raised one grazed its neighbour. */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
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
function VillaCardSkeleton({
  variant,
}: {
  variant: "overlay" | "card" | "showcase" | "featured";
}) {
  const featured = variant === "featured";
  const showcase = variant === "showcase";
  const ratio = variant === "overlay" ? "aspect-[4/5]" : "aspect-[4/3]";
  // The featured placeholder carries the ring already — the row is lit before
  // its villas land, so nothing about the shelf changes when they do.
  if (featured) {
    return (
      <div className="villa-featured relative flex h-full flex-col rounded-[24px] p-[2px] shadow-[0_8px_24px_-12px_rgba(160,112,16,0.45)]">
        <div className="flex h-full flex-col overflow-hidden rounded-[22px] bg-white">
          <div className={`skeleton w-full ${ratio}`} />
          <div className="flex flex-1 flex-col gap-2 p-4">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
            <div className="skeleton mt-1 h-3 w-2/3 rounded" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div
      className={`flex h-full flex-col overflow-hidden bg-white ${
        showcase
          ? "rounded-[22px] shadow-[0_2px_10px_rgba(20,20,45,0.05)] ring-1 ring-black/[0.05]"
          : "rounded-2xl shadow-sm"
      }`}
    >
      <div className={`skeleton w-full ${ratio}`} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="skeleton h-4 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
        <div className="skeleton mt-1 h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}
