// Mock data for the landing page. Later served from the Django backend.

export type VillaCardData = {
  id?: string; // real villa id → links to its detail page
  title?: string; // villa's main title (shown as the card heading when present)
  image: string;
  city: string;
  country: string;
  price: number;
  distance: string;
  dates: string;
  liked?: boolean;
};

export type PlaceData = {
  image: string;
  title: string;
  highlight: string;
  description: string;
};

export type TestimonialData = {
  name: string;
  location: string;
  avatar: string;
  rating: number;
  text: string;
};

// Rotating hero background images (carousel)
export const heroSlides = [
  "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1519046904884-53103b34b206?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1544551763-46a013bb70d5?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=1600&q=80",
  "https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?auto=format&fit=crop&w=1600&q=80",
];

export const topPicks: VillaCardData[] = [
  {
    image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29",
  },
  {
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
  },
  {
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
  },
  {
    image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
  },
];

export const featuredVillas: VillaCardData[] = [
  {
    image: "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
  },
  {
    image: "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
  },
  {
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
  },
  {
    image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29",
  },
];

export const uniquePlaces: PlaceData[] = [
  {
    image: "https://images.unsplash.com/photo-1544644181-1484b3fdfc62?auto=format&fit=crop&w=700&q=80",
    title: "Stay among the atolls in", highlight: "Maldives",
    description:
      "From the 2nd century AD, the islands were known as the 'Money Isles' due to the abundance of cowry shells, a currency of the early ages.",
  },
  {
    image: "https://images.unsplash.com/photo-1539020140153-e479b8c22e70?auto=format&fit=crop&w=700&q=80",
    title: "Experience the Ourika Valley in", highlight: "Morocco",
    description:
      "Morocco's Hispano-Moorish architecture blends influences from Berber culture, Spain, and contemporary artistic currents in the Middle East.",
  },
  {
    image: "https://images.unsplash.com/photo-1533692328991-08159ff19fca?auto=format&fit=crop&w=700&q=80",
    title: "Live traditionally in", highlight: "Mongolia",
    description:
      "Traditional Mongolian yurts consists of an angled latticework of wood or bamboo for walls, ribs, and a wheel.",
  },
];

export const testimonials: TestimonialData[] = [
  {
    name: "Yifei Chen", location: "Seoul, South Korea | April 2019",
    avatar: "https://i.pravatar.cc/120?img=47", rating: 5,
    text: "What a great experience using MyVilla! I booked all of my resort for my gap year through MyVilla and never had any issues. When I had to cancel a resort because of an emergency, MyVilla support helped me",
  },
  {
    name: "Kaori Yamaguchi", location: "Honolulu, Hawaii | February 2017",
    avatar: "https://i.pravatar.cc/120?img=32", rating: 4,
    text: "My family and I visit Hawaii every year, and we usually book our resort using other services. MyVilla was recommended to us by a long time friend, and I'm so glad we tried it out! The process was easy and",
  },
  {
    name: "Anthony Lewis", location: "Berlin, Germany | April 2019",
    avatar: "https://i.pravatar.cc/120?img=12", rating: 5,
    text: "When I was looking to book my villa to Berlin from LAX, MyVilla had the best browsing experiece so I figured I'd give it a try. It was my first time using MyVilla, but I'd definitely recommend it to a friend and use it for",
  },
];

// Promo grid images
export const promo = {
  main: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=900&q=80",
  offer: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80",
  invite: "https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=800&q=80",
};
