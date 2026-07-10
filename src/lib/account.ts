// Mock data for the "My Account" page.
// Later this will be replaced by data fetched from the Django backend.

import type { VillaCardData } from "./home";
import type { Review, RatingRow } from "./villa";

export const accountProfile = {
  name: "Tatiana David",
  joined: "Joined in April 2018",
  avatar: "https://i.pravatar.cc/160?img=15",
  reviewsCount: 55,
  identityVerified: true,
  responseRate: "100%",
  responseTime: "within an hour",
  email: "SashaSaloon1@myvilla.com",
  phone: "+1-300-2590-212",
};

export const myVillas: VillaCardData[] = [
  {
    image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80",
    city: "The Bund", country: "Shanghai", price: 137, distance: "110 Kilometers away", dates: "Feb 18 - 29", liked: true,
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

export const accountReviews: Review[] = [
  {
    name: "Germán D.",
    date: "December 2019",
    avatar: "https://i.pravatar.cc/120?img=11",
    text: "Tatiana was very kind, form the very beginning, giving us very accurate directions and such. Then, Mireya welcomed us at the property and woke us up with a delicious cup of…",
  },
  {
    name: "Alena James",
    date: "November 2019",
    avatar: "https://i.pravatar.cc/120?img=45",
    text: "I had an amazing stay. The bed was excellent, as was the shower. The wifi is pretty good too. Tatiana is an amazing host, she even made me an aromática de frutas! I highly…",
  },
  {
    name: "Alex P.",
    date: "October 2019",
    avatar: "https://i.pravatar.cc/120?img=33",
    text: "Tatiana was very kind, form the very beginning, giving us very accurate directions and such. Then, Mireya welcomed us at the property and woke us up with a delicious cup of…",
  },
];

export const accountRating = {
  rating: 4.69,
  reviewsCount: 26,
  breakdown: [
    { label: "Cleanliness", score: 4.8 },
    { label: "Communication", score: 4.6 },
    { label: "Check-in", score: 4.8 },
    { label: "Accuracy", score: 4.3 },
    { label: "Location", score: 4.5 },
    { label: "Value", score: 5 },
  ] as RatingRow[],
};
