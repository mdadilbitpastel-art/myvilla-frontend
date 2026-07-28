import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { uniquePlaces } from "@/lib/home";
import SectionHeading from "./SectionHeading";
import UniqueStayCard from "./UniqueStayCard";
import Reveal from "@/components/ui/Reveal";

export default function UniqueStays() {
  return (
    <section className="mx-auto max-w-[1320px] px-6 py-10">
      <SectionHeading title="Explore unique" highlight="places to stay" actionLabel="All" />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {uniquePlaces.map((place, i) => (
          <Reveal key={place.highlight} delay={i * 120} className="h-full">
            <UniqueStayCard place={place} />
          </Reveal>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        {/* The section's one call to action, so it's given the full treatment:
            a pill that lifts on hover, a primary-tinted shadow instead of a
            grey one, and an arrow that leans towards the page it opens. */}
        <Link
          href="/search"
          className="group relative inline-flex items-center gap-2.5 overflow-hidden rounded-full bg-gradient-to-r from-primary to-[#8a7dff] px-7 py-3 text-[14.5px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(99,91,255,0.75)] ring-1 ring-inset ring-white/20 transition-all duration-300 hover:-translate-y-0.5 hover:brightness-[1.06] hover:shadow-[0_16px_32px_-12px_rgba(99,91,255,0.9)] active:translate-y-0 active:scale-[0.98]"
        >
          {/* The same glint that runs across the account pill in the header, so
              the site's two primary buttons behave the same way. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/25 blur-[3px] transition-transform duration-700 ease-out group-hover:translate-x-[400%]"
          />
          <span className="relative">Explore more stays</span>
          <ArrowRight
            size={17}
            aria-hidden
            className="relative transition-transform duration-300 group-hover:translate-x-1"
          />
        </Link>
      </div>
    </section>
  );
}
