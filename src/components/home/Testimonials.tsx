import Image from "next/image";
import { Star } from "lucide-react";
import { testimonials } from "@/lib/home";
import Reveal from "@/components/ui/Reveal";

export default function Testimonials() {
  return (
    <section className="mx-auto max-w-[1120px] px-6 py-14">
      <h2 className="mb-10 text-center text-[20px] font-semibold text-heading sm:text-[22px]">
        What <span>My</span>
        <span className="text-primary">Villa</span> users are saying
      </h2>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <Reveal key={t.name} delay={i * 120}>
            <div>
              <div className="flex items-center gap-3">
                <div className="relative h-11 w-11 overflow-hidden rounded-full">
                  <Image src={t.avatar} alt={t.name} fill sizes="44px" className="object-cover" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-ink">{t.name}</p>
                  <p className="text-[12px] text-muted">{t.location}</p>
                </div>
              </div>

              <div className="mt-3 flex gap-0.5">
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    size={15}
                    className={s < t.rating ? "fill-primary text-primary" : "fill-line text-line"}
                  />
                ))}
              </div>

              <p className="mt-3 text-[13px] leading-6 text-body">
                {t.text}{" "}
                <a href="#" className="font-medium text-primary">
                  read more...
                </a>
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
