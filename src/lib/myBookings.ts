// Mock data for the "My Bookings" settings page.
// Later this will be replaced by data fetched from the Django backend.

export type Booking = {
  villa: string;
  posted: string;
  stay: string;
  guests: number;
};

export const activeBookings: Booking[] = [
  {
    villa: "The Bund, Shanghai",
    posted: "3 days ago",
    stay: "13 Feb-16 Feb",
    guests: 3,
  },
  {
    villa: "Iris Villa, Shanghai",
    posted: "2 days ago",
    stay: "19 Feb-21 Feb",
    guests: 4,
  },
];

export const bookingHistory: Booking[] = [
  {
    villa: "The Bund, Shanghai",
    posted: "2 weeks ago",
    stay: "13 Jan-16 Jan",
    guests: 3,
  },
  {
    villa: "Iris Villa, Shanghai",
    posted: "2 months ago",
    stay: "19 Dec-21 Dec",
    guests: 4,
  },
];
