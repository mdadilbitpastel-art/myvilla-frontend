import Image from "next/image";
import Link from "next/link";
import { BadgePercent } from "lucide-react";
import { promo } from "@/lib/home";
import type { Offer } from "@/lib/api";
import Img from "@/components/ui/Img";
import Reveal from "@/components/ui/Reveal";
import InviteCard from "@/components/home/InviteCard";

// A static marketing card (used when there are no live offers to show).
function PromoCard({
  image,
  title,
  href,
  className = "",
  big = false,
}: {
  image: string;
  title: string;
  /** Where the card leads. Without one it stays a plain, unclickable poster. */
  href?: string;
  className?: string;
  big?: boolean;
}) {
  const boxClass = `group relative block overflow-hidden rounded-2xl ${className}`;
  const inner = (
    <>
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
    </>
  );
  // A card with a destination is a Link; without one it's a plain poster.
  return href ? (
    <Link href={href} className={boxClass}>
      {inner}
    </Link>
  ) : (
    <div className={boxClass}>{inner}</div>
  );
}

// A real villa on offer: its photo, the discount, and its coupon code. Links
// through to the villa carrying the code, so it's already applied at checkout.
function OfferCard({
  offer,
  className = "",
  big = false,
}: {
  offer: Offer;
  className?: string;
  big?: boolean;
}) {
  const place = [offer.city, offer.country].filter(Boolean).join(", ");
  return (
    <Link
      href={`/villa/${offer.villaId}?coupon=${encodeURIComponent(offer.code)}`}
      className={`group relative block overflow-hidden rounded-2xl ${className}`}
    >
      <Img
        src={offer.coverImage}
        alt={offer.title}
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />

      {/* Discount pill */}
      <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-[#ff2d2d] px-3 py-1.5 text-[13px] font-bold text-white shadow-lg">
        <BadgePercent size={15} aria-hidden />
        {offer.label}
      </span>

      <div className="absolute inset-x-0 bottom-0 p-5 text-white">
        <h3 className={`font-bold leading-snug ${big ? "text-[22px]" : "text-[17px]"}`}>
          {offer.title}
        </h3>
        {place && <p className="mt-0.5 text-[12px] opacity-90">{place}</p>}
        <span className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white/15 px-2.5 py-1 text-[12px] font-semibold backdrop-blur-sm">
          Code: <span className="font-mono tracking-wide">{offer.code}</span>
        </span>
      </div>
    </Link>
  );
}

export default function PromoGrid({ offers = [] }: { offers?: Offer[] }) {
  const [a, b, c] = offers;

  return (
    <Reveal className="mx-auto max-w-page px-6 py-10">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Big left card — first real offer, else the static resorts promo. */}
        {a ? (
          <OfferCard offer={a} className="min-h-[300px] lg:min-h-[340px]" big />
        ) : (
          <PromoCard
            image={promo.main}
            title="Explore best resorts in your area"
            className="min-h-[300px] lg:min-h-[340px]"
            big
          />
        )}

        {/* Right stacked cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-rows-2">
          {b ? (
            <OfferCard offer={b} className="min-h-[150px] sm:col-span-2" />
          ) : (
            <PromoCard
              image={promo.offer}
              title="Upto 25% off on your first booking"
              href="/search"
              className="min-h-[150px] sm:col-span-2"
            />
          )}
          {c ? (
            <OfferCard offer={c} className="min-h-[150px] sm:col-span-2" />
          ) : (
            // Not a poster: this one actually invites someone, by handing the
            // site link to WhatsApp.
            <InviteCard
              image={promo.invite}
              title="Invite your friends to get discounts"
              className="min-h-[150px] sm:col-span-2"
            />
          )}
        </div>
      </div>
    </Reveal>
  );
}
