import Image from "next/image";
import { promo } from "@/lib/home";
import Reveal from "@/components/ui/Reveal";

function PromoCard({
  image,
  title,
  className = "",
  big = false,
}: {
  image: string;
  title: string;
  className?: string;
  big?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-2xl ${className}`}
    >
      <Image
        src={image}
        alt={title}
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <h3
        className={`absolute bottom-0 left-0 p-5 font-bold text-white ${
          big ? "max-w-[240px] text-[22px] leading-snug" : "max-w-[200px] text-[18px] leading-snug"
        }`}
      >
        {title}
      </h3>
    </div>
  );
}

export default function PromoGrid() {
  return (
    <Reveal className="mx-auto max-w-[1120px] px-6 py-10">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Big left card */}
        <PromoCard
          image={promo.main}
          title="Explore best resorts in your area"
          className="min-h-[300px] lg:min-h-[340px]"
          big
        />

        {/* Right stacked cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-rows-2">
          <PromoCard
            image={promo.offer}
            title="Upto 25% off on your first purchase"
            className="min-h-[150px] sm:col-span-2"
          />
          <PromoCard
            image={promo.invite}
            title="Invite your friends to get discounts"
            className="min-h-[150px] sm:col-span-2"
          />
        </div>
      </div>
    </Reveal>
  );
}
