// Mock data for the "My Property" (Property Owned) settings page.
// Later this will be replaced by data fetched from the Django backend.

export type OwnedProperty = {
  image: string;
  city: string;
  country: string;
  price: number;
  rating: number;
  reviews: number;
  posted: string;
};

export const ownedProperties: OwnedProperty[] = [
  {
    image: "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80",
    city: "The Bund",
    country: "Shanghai",
    price: 137,
    rating: 4.69,
    reviews: 32,
    posted: "Posted 3 weeks ago",
  },
  {
    image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=600&q=80",
    city: "The Bund",
    country: "Shanghai",
    price: 137,
    rating: 4.69,
    reviews: 32,
    posted: "Posted 2 months ago",
  },
  {
    image: "https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=600&q=80",
    city: "The Bund",
    country: "Shanghai",
    price: 137,
    rating: 4.69,
    reviews: 32,
    posted: "Posted 4 months ago",
  },
];
