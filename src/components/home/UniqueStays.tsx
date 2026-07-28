import Link from "next/link";
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
        <Link
          href="/search"
          className="rounded-lg bg-primary px-6 py-3 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-md"
        >
          Explore more stays
        </Link>
      </div>
    </section>
  );
}
