import Image from "next/image";
import Link from "next/link";
import { uniquePlaces } from "@/lib/home";
import SectionHeading from "./SectionHeading";
import Reveal from "@/components/ui/Reveal";

export default function UniqueStays() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-10">
      <SectionHeading title="Explore unique" highlight="places to stay" actionLabel="All" />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {uniquePlaces.map((place, i) => (
          <Reveal key={place.highlight} delay={i * 120}>
            <div className="group overflow-hidden rounded-2xl bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
              <div className="relative aspect-[4/3]">
                <Image
                  src={place.image}
                  alt={place.highlight}
                  fill
                  sizes="(max-width: 768px) 90vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </div>
              <div className="p-5">
                <h3 className="text-[16px] font-semibold text-ink">
                  {place.title} <span className="text-primary">{place.highlight}</span>
                </h3>
                <p className="mt-2 text-[13px] leading-6 text-muted">{place.description}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <div className="mt-8 flex justify-center">
        <Link
          href="#"
          className="rounded-lg bg-primary px-6 py-3 text-[14px] font-medium text-white shadow-sm transition-all hover:bg-primary-dark hover:shadow-md"
        >
          Explore more stays
        </Link>
      </div>
    </section>
  );
}
