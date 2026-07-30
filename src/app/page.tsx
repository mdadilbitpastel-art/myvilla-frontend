"use client";

import { useEffect, useRef, useState } from "react";
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
import { useAuth } from "@/lib/auth";
import { useWelcomeOffer } from "@/lib/welcome";

const FALLBACK_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

// Where the "you've had the offer popup" flag lives.
//
// For a signed-in guest it is once and only once: the flag is kept per account
// in localStorage, so it survives reloads, new tabs and coming back tomorrow.
// A signed-out visitor has no account to remember, so theirs falls back to the
// session — the popup greets them on arrival and then leaves them alone.
const POPUP_SEEN_KEY = "myvilla_offer_popup_seen";

// How long after the page knows its answer the popup comes up.
const POPUP_DELAY_MS = 900;

function popupSeenStore(userId?: string): { store: Storage; key: string } | null {
  if (typeof window === "undefined") return null;
  return userId
    ? { store: window.localStorage, key: `${POPUP_SEEN_KEY}:${userId}` }
    : { store: window.sessionStorage, key: POPUP_SEEN_KEY };
}

function popupSeen(userId?: string): boolean {
  const at = popupSeenStore(userId);
  try {
    return !!at?.store.getItem(at.key);
  } catch {
    // Storage blocked (private mode, cookies off): treat it as already seen
    // rather than showing the popup on every single visit.
    return true;
  }
}

function markPopupSeen(userId?: string) {
  const at = popupSeenStore(userId);
  try {
    at?.store.setItem(at.key, "1");
  } catch {
    // Nothing to do — the popup simply won't be remembered.
  }
}

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
  // Whether the welcome placard is going to greet this visitor. It decides
  // which popup gets the on-load slot, so it has to match the placard's own
  // rule exactly: signed-out, and still eligible.
  const { user, ready } = useAuth();
  const { available: welcomeAvailable, loading: welcomeLoading } = useWelcomeOffer();
  // The popup is offered at most once per visit to the page. Signing in while
  // here must not summon a second one, so the decision is made once and kept.
  const popupDecided = useRef(false);
  const popupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Fetch villas and live offers together so cards can be tagged with their
    // coupon and the promo grid can show real properties.
    Promise.all([fetchVillas(24), fetchPublicOffers(8)])
      .then(([villas, liveOffers]) => {
        // Half the popup's answer: which offers exist. The other half is who
        // is asking, so the decision itself waits for the effect below.
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
      })
      .catch(() => {
        // Backend unreachable → fall back to the mock lists (no popup).
        setPicks(topPicks);
        setFeatured(featuredVillas);
      });
  }, []);

  // Decide the on-load popup once both halves of the answer are in: which
  // offers exist, and who is asking. Waiting matters — deciding before the
  // session is restored would spend a signed-in guest's one and only showing
  // against the signed-out flag, and they'd get it again next visit.
  useEffect(() => {
    if (popupDecided.current || !ready || welcomeLoading || !offers.length) return;
    popupDecided.current = true;
    // A signed-out visitor who still has the welcome gift gets the placard
    // instead; the host coupon would be the second advert on the same screen.
    if (!user && welcomeAvailable) return;
    if (popupSeen(user?.id)) return;
    // Counted as seen the moment it's promised, not when it's dismissed:
    // closing the tab on it is still having been shown it, and once means once.
    markPopupSeen(user?.id);
    const offer = offers[0];
    // A beat after the page settles, so it arrives on top of a landing page
    // rather than racing the hero into view. Deliberately not cleared when the
    // deps change — the decision has been made and spent, and dropping the
    // timer here would cost the guest the one showing they were owed.
    popupTimer.current = setTimeout(() => setPopupOffer(offer), POPUP_DELAY_MS);
  }, [ready, welcomeLoading, welcomeAvailable, user, offers]);

  // Leaving the page before it appears simply cancels it.
  useEffect(
    () => () => {
      if (popupTimer.current) clearTimeout(popupTimer.current);
    },
    []
  );

  function dismissPopup() {
    markPopupSeen(user?.id);
    setPopupOffer(null);
  }

  return (
    <>
      <Hero />
      <VillaRow
        title="Top picks by myVilla"
        data={picks ?? []}
        loading={picks === null}
        variant="showcase"
      />
      <PromoGrid offers={offers} />
      {/* The one row on the page that is meant to be looked at rather than
          scanned — its own card variant, ringed and lit and moving. */}
      <VillaRow
        title="Featured villas"
        data={featured ?? []}
        loading={featured === null}
        variant="featured"
      />
      <PropertyMap />
      <UniqueStays />
      <Testimonials />
      {/* Whether this appears at all was settled by the effect above. */}
      {popupOffer && <CouponPopup offer={popupOffer} onClose={dismissPopup} />}
      <ReviewPrompt />
    </>
  );
}
