"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { fetchVilla, type Villa } from "@/lib/api";
import { villa as dummy, type Facility } from "@/lib/villa";
import Breadcrumb from "@/components/property/Breadcrumb";
import PropertyHeader from "@/components/property/PropertyHeader";
import Gallery from "@/components/property/Gallery";
import Overview from "@/components/property/Overview";
import Description from "@/components/property/Description";
import BedroomSection from "@/components/property/BedroomSection";
import Facilities from "@/components/property/Facilities";
import Reviews from "@/components/property/Reviews";
import LocationMap from "@/components/property/LocationMap";
import HostSection from "@/components/property/HostSection";
import HouseRules from "@/components/property/HouseRules";
import ReservationCard from "@/components/property/ReservationCard";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// Map a real service label to one of the facility icons.
function serviceIcon(s: string): Facility["icon"] {
  const t = s.toLowerCase();
  if (t.includes("wifi")) return "wifi";
  if (t.includes("parking")) return "parking";
  if (t.includes("air") || t === "ac") return "ac";
  if (t.includes("tv")) return "tv";
  if (t.includes("smoke")) return "smoke";
  if (t.includes("long stay")) return "calendar";
  if (t.includes("pool") || t.includes("swim")) return "pool";
  if (t.includes("jacuzzi") || t.includes("jaccuzzi") || t.includes("bath")) return "jacuzzi";
  if (t.includes("bbq") || t.includes("barbe") || t.includes("grill")) return "bbq";
  return "wifi";
}

export default function VillaDetailPage() {
  const params = useParams();
  const id = String(params.id);
  // undefined = loading, null = not found, Villa = loaded
  const [v, setV] = useState<Villa | null | undefined>(undefined);

  useEffect(() => {
    fetchVilla(id)
      .then(setV)
      .catch(() => setV(null));
  }, [id]);

  if (v === undefined) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] items-center justify-center px-5 text-[14px] text-muted">
        Loading villa…
      </div>
    );
  }

  if (v === null) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-[1200px] flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">Villa not found</h1>
        <p className="mt-2 text-[14px] text-body">This listing may have been removed.</p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // --- Build the display data from real fields (+ dummy where noted) ---
  const photoUrls =
    v.photos.length > 0
      ? v.photos.map((p) => p.url)
      : v.coverImage
        ? [v.coverImage]
        : [dummy.images.hero];
  const hero = photoUrls[0];
  const thumbs = photoUrls.slice(1);

  const overview = [
    plural(v.guests, "guest"),
    plural(v.bedrooms, "Bedroom"),
    plural(v.bedrooms, "Bed"),
    plural(v.bathrooms, "Bath"),
  ];

  const location = [v.city, v.country].filter(Boolean).join(", ");
  const subtitle = `${v.propertyType || "Villa"}${location ? " in " + location : ""} hosted by ${dummy.host.name}`;

  const facilities: Facility[] = (v.services.length ? v.services : ["Free Wifi"]).map(
    (s) => ({ label: s, icon: serviceIcon(s) })
  );

  const descriptionParts = [
    v.description,
    v.buildUpArea ? `Total build-up area: ${v.buildUpArea}.` : "",
    v.address ? `Address: ${v.address}.` : "",
  ].filter(Boolean);
  const description = descriptionParts.join(" ") || dummy.description;

  // Pricing: real price/guests, keep the dummy breakdown template.
  const pricing = {
    ...dummy.pricing,
    price: v.pricePerNight,
    period: "night",
    guests: plural(v.guests, "guest"),
  };

  const breadcrumb = ["Home", "Villas", v.country || "Listing", v.title];

  return (
    <div className="mx-auto max-w-[1200px] px-5 pb-20 pt-6">
      <Breadcrumb items={breadcrumb} />
      <PropertyHeader
        title={v.title}
        rating={dummy.rating}
        reviewsCount={dummy.reviewsCount}
      />
      <Gallery hero={hero} thumbs={thumbs} />

      {/* Full-width overview under the gallery */}
      <div className="mt-8">
        <Overview subtitle={subtitle} items={overview} />
      </div>

      {/* Two-column: details (left) + sticky reservation (right) */}
      <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-[1fr_360px]">
        <div>
          <Description text={description} />
          <BedroomSection
            image={thumbs[0] || hero}
            title="Bedroom"
            detail={plural(v.bedrooms, "bed")}
          />
          <Facilities facilities={facilities} />
          {/* Reviews / rating are public/demo content — kept as-is */}
          <Reviews
            reviews={dummy.reviews}
            breakdown={dummy.ratingBreakdown}
            rating={dummy.rating}
            reviewsCount={dummy.reviewsCount}
          />
          <LocationMap />
          <HostSection host={dummy.host} />
          <HouseRules rules={dummy.houseRules} additional={dummy.additionalRules} />
        </div>

        {/* Reservation sidebar */}
        <aside className="lg:col-start-2 lg:row-start-1">
          <div className="pt-6 lg:sticky lg:top-[88px]">
            <ReservationCard pricing={pricing} rating={dummy.rating} />
          </div>
        </aside>
      </div>
    </div>
  );
}
