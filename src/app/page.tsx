import Hero from "@/components/home/Hero";
import VillaRow from "@/components/home/VillaRow";
import PromoGrid from "@/components/home/PromoGrid";
import UniqueStays from "@/components/home/UniqueStays";
import Testimonials from "@/components/home/Testimonials";
import { topPicks, featuredVillas } from "@/lib/home";

export default function Home() {
  return (
    <>
      <Hero />
      <VillaRow title="Top picks by myVilla" data={topPicks} variant="card" />
      <PromoGrid />
      <VillaRow title="Featured villas" data={featuredVillas} variant="card" />
      <UniqueStays />
      <Testimonials />
    </>
  );
}
