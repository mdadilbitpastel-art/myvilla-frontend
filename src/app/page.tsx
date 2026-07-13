"use client";

import { useEffect, useState } from "react";
import Hero from "@/components/home/Hero";
import VillaRow from "@/components/home/VillaRow";
import PromoGrid from "@/components/home/PromoGrid";
import UniqueStays from "@/components/home/UniqueStays";
import Testimonials from "@/components/home/Testimonials";
import { topPicks, featuredVillas, type VillaCardData } from "@/lib/home";
import { fetchVillas, type Villa } from "@/lib/api";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

// Real backend villa → the card shape the landing page renders.
function toCard(v: Villa): VillaCardData {
  return {
    id: v.id,
    image: v.coverImage || FALLBACK_IMG,
    city: v.city || v.title,
    country: v.country || v.propertyType || "",
    price: v.pricePerNight,
    distance: v.propertyType || "Villa",
    dates: `${v.bedrooms} BR · ${v.guests} guests`,
  };
}

export default function Home() {
  // Start from the mock lists so the page is never empty, then swap in the
  // real villas from the backend as soon as they load.
  const [picks, setPicks] = useState<VillaCardData[]>(topPicks);
  const [featured, setFeatured] = useState<VillaCardData[]>(featuredVillas);

  useEffect(() => {
    fetchVillas(24)
      .then((villas) => {
        if (!villas.length) return; // keep the mock fallback
        const cards = villas.map(toCard);
        setPicks(cards.slice(0, 4));
        setFeatured(cards.length > 4 ? cards.slice(4, 8) : cards.slice(0, 4));
      })
      .catch(() => {
        /* backend unreachable → keep the mock fallback */
      });
  }, []);

  return (
    <>
      <Hero />
      <VillaRow title="Top picks by myVilla" data={picks} variant="card" />
      <PromoGrid />
      <VillaRow title="Featured villas" data={featured} variant="card" />
      <UniqueStays />
      <Testimonials />
    </>
  );
}
