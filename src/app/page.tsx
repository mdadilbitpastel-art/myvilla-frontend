"use client";

import { useEffect, useState } from "react";
import Hero from "@/components/home/Hero";
import VillaRow from "@/components/home/VillaRow";
import PromoGrid from "@/components/home/PromoGrid";
import PropertyMap from "@/components/home/PropertyMap";
import UniqueStays from "@/components/home/UniqueStays";
import Testimonials from "@/components/home/Testimonials";
import CouponPopup from "@/components/home/CouponPopup";
import ReviewPrompt from "@/components/reviews/ReviewPrompt";
import { topPicks, featuredVillas, villaGallery, type VillaCardData } from "@/lib/home";
import { fetchVillas, fetchPublicOffers, type Villa, type Offer } from "@/lib/api";
import { useWelcomeOffer } from "@/lib/welcome";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

// Once-per-session flag so the offer popup greets a visitor without nagging.
const POPUP_SEEN_KEY = "myvilla_offer_popup_seen";

// Real backend villa → the card shape the landing page renders. `offers` maps a
// villa id to its active coupon, so a card can carry an offer badge.
function toCard(v: Villa, offers: Map<string, Offer>): VillaCardData {
  const offer = offers.get(v.id);
  const image = v.coverImage || FALLBACK_IMG;
  return {
    id: v.id,
    image,
    images: villaGallery(v, image),
    city: v.city || v.title,
    country: v.country || v.propertyType || "",
    price: v.pricePerNight,
    distance: v.propertyType || "Villa",
    dates: `${v.bedrooms} BR · ${v.guests} guests`,
    offer: offer ? { code: offer.code, label: offer.label } : undefined,
  };
}

export default function Home() {
  // `null` = still loading: the rows show skeletons rather than the mock lists,
  // so a real visitor never sees stand-in villas flash before the real ones.
  // The mock lists are used only as a fallback when the backend can't answer.
  const [picks, setPicks] = useState<VillaCardData[] | null>(null);
  const [featured, setFeatured] = useState<VillaCardData[] | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [popupOffer, setPopupOffer] = useState<Offer | null>(null);
  // Whether this visitor still has their first-booking discount to spend. It
  // decides which popup gets the on-load slot (see the render below).
  const { available: welcomeAvailable, loading: welcomeLoading } = useWelcomeOffer();

  useEffect(() => {
    // Fetch villas and live offers together so cards can be tagged with their
    // coupon and the promo grid can show real properties.
    Promise.all([fetchVillas(24), fetchPublicOffers(8)])
      .then(([villas, liveOffers]) => {
        setOffers(liveOffers);
        const offerMap = new Map(liveOffers.map((o) => [o.villaId, o]));
        if (villas.length) {
          const cards = villas.map((v) => toCard(v, offerMap));
          setPicks(cards.slice(0, 4));
          setFeatured(cards.length > 4 ? cards.slice(4, 8) : cards.slice(0, 4));
        } else {
          // Backend answered but has no villas yet → show the mock lists so the
          // landing page still has something to show.
          setPicks(topPicks);
          setFeatured(featuredVillas);
        }

        // Show the offer popup once per session, if there's an offer to show.
        if (liveOffers.length && typeof window !== "undefined") {
          const seen = window.sessionStorage.getItem(POPUP_SEEN_KEY);
          if (!seen) setPopupOffer(liveOffers[0]);
        }
      })
      .catch(() => {
        // Backend unreachable → fall back to the mock lists (no popup).
        setPicks(topPicks);
        setFeatured(featuredVillas);
      });
  }, []);

  function dismissPopup() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(POPUP_SEEN_KEY, "1");
    }
    setPopupOffer(null);
  }

  return (
    <>
      <Hero />
      <VillaRow
        title="Top picks by myVilla"
        data={picks ?? []}
        loading={picks === null}
        variant="card"
      />
      <PromoGrid offers={offers} />
      <VillaRow
        title="Featured villas"
        data={featured ?? []}
        loading={featured === null}
        variant="card"
      />
      <PropertyMap />
      <UniqueStays />
      <Testimonials />
      {/* The first-booking offer comes first: while a visitor still has it, the
          placard (mounted in the root layout) greets them and this host-coupon
          popup stays out of the way. Once they've booked, `welcomeAvailable`
          goes false and the host offers take the slot instead. */}
      {popupOffer && !welcomeLoading && !welcomeAvailable && (
        <CouponPopup offer={popupOffer} onClose={dismissPopup} />
      )}
      <ReviewPrompt />
    </>
  );
}
