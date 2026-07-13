// Mock data for the villa detail page.
// Later this will be replaced by data fetched from the Django backend.

export type Facility = {
  label: string;
  icon:
    | "ac"
    | "parking"
    | "calendar"
    | "smoke"
    | "tv"
    | "wifi"
    | "pool"
    | "jacuzzi"
    | "bbq";
};

export type Review = {
  name: string;
  date: string;
  avatar: string;
  text: string;
};

export type RatingRow = {
  label: string;
  score: number;
};

export const villa = {
  breadcrumb: ["Home", "All Topics", "Legal Terms", "Terms of Service"],
  title: "Casa Hotel El Encanto de Villa - Gondava",
  rating: 4.69,
  reviewsCount: 26,
  images: {
    hero: "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?auto=format&fit=crop&w=1200&q=80",
    thumbs: [
      "https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=600&q=80",
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80",
    ],
  },
  subtitle: "Private Room in residential home hosted by Tatiana",
  overview: ["4 guests", "1 Bedroom", "2 Beds", "1 Private Bath"],
  description:
    "Accommodation located three blocks from the main square, consisting of kitchen, patio, green area, living room, dining room, pets are acceptable. Due to the location of the house it is easy and close to have access to public parking. Near the sights of Villa de Leyva.",
  bedroom: {
    image:
      "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=800&q=80",
    title: "Bedroom",
    detail: "2 double beds",
  },
  facilities: [
    { label: "Air Conditioned", icon: "ac" },
    { label: "Paid parking on premises", icon: "parking" },
    { label: "Long Stays Available", icon: "calendar" },
    { label: "Smoke Alarm", icon: "smoke" },
    { label: "TV", icon: "tv" },
    { label: "Wifi", icon: "wifi" },
  ] as Facility[],
  reviews: [
    {
      name: "Germán D.",
      date: "December 2019",
      avatar: "https://i.pravatar.cc/120?img=13",
      text: "Tatiana was very kind, form the very beginning, giving us very accurate directions and such. Then, Mireya welcomed us at the property and woke us up with a delicious cup of...",
    },
    {
      name: "Alena James",
      date: "November 2019",
      avatar: "https://i.pravatar.cc/120?img=45",
      text: "I had an amazing stay. The bed was excellent, as was the shower. The wifi is pretty good too. Tatiana is an amazing host, she even made me an aromática de frutas! I highly...",
    },
    {
      name: "Alex P.",
      date: "October 2019",
      avatar: "https://i.pravatar.cc/120?img=32",
      text: "Tatiana was very kind, form the very beginning, giving us very accurate directions and such. Then, Mireya welcomed us at the property and woke us up with a delicious cup of...",
    },
  ] as Review[],
  ratingBreakdown: [
    { label: "Cleanliness", score: 4.8 },
    { label: "Communication", score: 4.6 },
    { label: "Check-in", score: 4.8 },
    { label: "Accuracy", score: 4.3 },
    { label: "Location", score: 4.5 },
    { label: "Value", score: 5 },
  ] as RatingRow[],
  host: {
    name: "Tatiana",
    avatar: "https://i.pravatar.cc/160?img=13",
    joined: "Joined in April 2018",
    reviews: 55,
    responseRate: "100%",
    responseTime: "within an hour",
  },
  houseRules: [
    "Check-in: After 1:00 pm",
    "Checkout: 12:00 pm",
    "Pets are allowed",
  ],
  additionalRules:
    "The use of the kitchen is for light meals (dinners or breakfasts) and is shared with guests in the other rooms.\nKitchen should be left in the same condition as delivered to them.\nFeatures: gas stove, microwave oven, fridge and basic utensils.",
  pricing: {
    price: 298,
    period: "month",
    ratingReviews: 13,
    checkIn: "02 - February - 2022",
    checkOut: "16 - February - 2022",
    guests: "2 guests",
    breakdown: [
      { label: "Accomodation", value: 426 },
      { label: "Monthly Discount", value: 426 },
      { label: "Service Fee", value: 426 },
    ],
    total: 426,
  },
};

export type Villa = typeof villa;
