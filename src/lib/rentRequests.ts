// Mock data for the "Rent Requests" settings page.
// Later this will be replaced by data fetched from the Django backend.

export type RentRequest = {
  tenant: string;
  avatar: string;
  property: string;
  stay: string;
  guests: number;
  responded: boolean;
};

export const rentRequests: RentRequest[] = [
  {
    tenant: "Alena James",
    avatar: "https://i.pravatar.cc/80?img=45",
    property: "The Bund, Shanghai",
    stay: "13 Feb-16 Feb",
    guests: 3,
    responded: false,
  },
  {
    tenant: "Rachiel Simen",
    avatar: "https://i.pravatar.cc/80?img=12",
    property: "The Bund, Shanghai",
    stay: "19 Feb-21 Feb",
    guests: 4,
    responded: true,
  },
  {
    tenant: "Micheal Han",
    avatar: "https://i.pravatar.cc/80?img=33",
    property: "Hunza Luxus",
    stay: "05 Feb-15 Feb",
    guests: 1,
    responded: false,
  },
  {
    tenant: "Alex Whitmen",
    avatar: "https://i.pravatar.cc/80?img=8",
    property: "Hunza Luxus",
    stay: "15 Mar-16 Mar",
    guests: 5,
    responded: false,
  },
  {
    tenant: "Alena James",
    avatar: "https://i.pravatar.cc/80?img=47",
    property: "The Bund, Shanghai",
    stay: "13 Feb-16 Feb",
    guests: 2,
    responded: false,
  },
];
