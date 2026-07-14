// Content for the Terms & Condition and Privacy Policy pages.
// Reproduced from the design; brand name is MyVilla throughout.

export const termsIntro = {
  updated: "Last Updated: February 10, 2022",
  highlight:
    "Section 23 of these Terms contains an arbitration agreement and class action waiver that apply to all claims brought against MyVilla in the United States. Please read them carefully.",
  paragraphs: [
    "Thank you for using MyVilla!",
    'These Terms of Service ("Terms") are a binding legal agreement between you and MyVilla that govern your right to use the websites, applications, and other offerings from MyVilla (collectively, the "MyVilla Platform"). When used in these Terms, "MyVilla," "we," "us," or "our" refers to the MyVilla entity set out on Schedule 1 with whom you are contracting.',
    'The MyVilla Platform offers an online venue that enables users ("Members") to publish, offer, search for, and book services. Members who publish and offer services are "Hosts" and Members who search for, book, or use services are "Guests." Hosts offer accommodations ("Accommodations"), activities, excursions, and events ("Experiences"), and a variety of travel and other services (collectively, "Host Services"). You must register an account to access and use many features of the MyVilla Platform, and must keep your account information accurate.',
    "We maintain other terms and policies that supplement these Terms like our Privacy Policy, which describes our collection and use of personal data, and our Payments Terms, which govern any payment services provided to Members by the MyVilla payment entities.",
    "If you are a Host, you are responsible for understanding and complying with all laws, rules, regulations and contracts with third parties that apply to your Host Services.",
  ],
};

export const tableOfContents = [
  {
    group: "Guest Terms",
    items: [
      "1. Our Mission.",
      "2. Searching and Booking on MyVilla.",
      "3. Cancellations, Travel Issues, Refunds and Booking Modifications.",
      "4. Your Responsibilities and Assumption of Risk.",
    ],
  },
  {
    group: "Host Terms",
    items: [
      "5. Hosting on MyVilla.",
      "6. Managing Your Listing.",
      "7. Cancellations, Travel Issues, and Booking Modifications.",
      "8. Taxes.",
    ],
  },
  {
    group: "General Terms",
    items: [
      "9. Reviews.",
      "10. Content.",
      "11. Fees.",
      "12. MyVilla Platform Rules.",
      "13. Termination, Suspension and other Measures.",
      "14. Modification.",
      "15. Resolving Complaints and Damage Claims.",
      "16. MyVilla's Role.",
      "17. Member Accounts.",
    ],
  },
];

export type TermsItem = { number: string; title: string; text: string };
export type TermsGroup = { number: string; title: string; items: TermsItem[] };

export const termsGroups: TermsGroup[] = [
  {
    number: "2",
    title: "Searching and Booking on MyVilla.",
    items: [
      {
        number: "2.1",
        title: "Searching.",
        text: "You can search for Host Services by using criteria like the type of Host Services, travel destination, travel dates, and number of guests. You can also use filters to refine your search results. Search results are based on their relevance to your search and other criteria. Relevance considers factors like price, availability, Reviews, customer service and cancellation history, popularity, previous trips and saved Listings, Host requirements (e.g. minimum or maximum nights), and more.",
      },
      {
        number: "2.2",
        title: "Booking.",
        text: 'When you book a Listing, you are agreeing to pay all charges for your booking including the Listing price, applicable fees like MyVilla\'s service fee, offline fees, taxes, and any other items identified during checkout (collectively, "Total Price"). You are also agreeing to MyVilla\'s Payments Terms. When you receive the booking confirmation, a contract for Host Services is formed directly between you and the Host. In addition to these Terms, you will be subject to, and responsible for complying with, all of the terms of the Reservation.',
      },
      {
        number: "2.3",
        title: "Accommodation Reservations.",
        text: "An Accommodation Reservation is a limited license to enter, occupy, and use the Accommodation. The Host retains the right to re-enter the Accommodation during your stay, to the extent: (i) it is reasonably necessary, (ii) permitted by your contract with the Host, and (iii) consistent with applicable law. If you stay past checkout, the Host has the right to make you leave in a manner consistent with applicable law.",
      },
      {
        number: "2.4",
        title: "Reservations for Experiences and Other Host Services.",
        text: "An Experience or other Host Service Reservation entitles you to participate in, attend, or use that Host Service. You are responsible for confirming that you, and anyone you invite, meet minimum age, proficiency, fitness, or other requirements. You are responsible for informing the Host of any medical or physical conditions, or other circumstances that may impact your ability to participate, attend, or use the Host Service.",
      },
    ],
  },
  {
    number: "3",
    title: "Cancellations, Travel Issues, Refunds and Booking Modifications.",
    items: [
      {
        number: "3.1",
        title: "Cancellations, Travel Issues, and Refunds.",
        text: "In general, if as a Guest you cancel a Reservation, the amount refunded to you is determined by the cancellation policy that applies to that Reservation. But, in certain situations, other policies take precedence and determine what amount is refunded to you. If something outside your control forces you to cancel a Reservation, you may be eligible for a partial or full refund under our Extenuating Circumstances Policy.",
      },
      {
        number: "3.2",
        title: "Booking Modifications.",
        text: 'Guests and Hosts are responsible for any booking modifications they agree to make via the MyVilla Platform or direct MyVilla customer service to make on their behalf ("Booking Modifications"), and agree to pay any additional amounts, fees, or taxes associated with any Booking Modification.',
      },
    ],
  },
  {
    number: "4",
    title: "Your Responsibilities and Assumption of Risk.",
    items: [
      {
        number: "4.1",
        title: "Your Responsibilities.",
        text: "You are responsible and liable for your own acts and omissions and are also responsible for the acts and omissions of anyone you invite to join or provide access to any Accommodation, Experience or other Host Service. You are responsible for leaving an Accommodation (and related personal property) in the condition it was in when you arrived.",
      },
      {
        number: "4.2",
        title: "Your Assumption of Risk.",
        text: "You acknowledge that many activities carry inherent risks and agree that, to the maximum extent permitted by applicable law, you assume the entire risk arising out of your access to and use of the MyVilla Platform and any Content, or any Host Service, or any interaction you have with other Members whether in person or online. This means it is your responsibility to investigate a Host Service to determine whether it is suitable for you.",
      },
    ],
  },
  {
    number: "5",
    title: "Hosting on MyVilla.",
    items: [
      {
        number: "5.1",
        title: "Host.",
        text: "As a Host, MyVilla offers you the right to use the MyVilla Platform to share your Accommodation, Experience, or other Host Service with our vibrant community of Guests — and earn money doing it. It's easy to create a Listing and you are in control of how you host — set your price, availability, and rules for each stay.",
      },
      {
        number: "5.2",
        title: "Contracting with Guests.",
        text: "When you accept a booking request, or receive a booking confirmation through the MyVilla Platform, you are entering into a contract directly with the Guest, and are responsible for delivering your Host Service under the terms and at the price specified in your Listing. You are also agreeing to pay applicable fees like MyVilla's service fee for each booking.",
      },
      {
        number: "5.3",
        title: "Independence of Hosts.",
        text: "Your relationship with MyVilla is that of an independent individual or entity and not an employee, agent, joint venture, or partner of MyVilla, except that MyVilla Payments acts as a payment collection agent as described in the Payments Terms. MyVilla does not direct or control your Host Service, and you agree that you have complete discretion whether and how to provide Host Services.",
      },
    ],
  },
];

export const relatedTopics = [
  "Guest terms",
  "General terms",
  "Searching and booking",
  "Our mission",
  "Cancellation, Booking Issues and modification",
  "Content",
  "Payment booking",
  "Payment renting",
];

export const alsoCheck = [
  "Privacy Policy",
  "Help center",
  "Payment and legal information",
  "How to book a villa ?",
];

/* ---------------- Privacy Policy ---------------- */

export const privacyIntro =
  "Our Privacy Policy explains what personal information we collect, how we use personal information, how personal information is shared, and privacy rights.";

export type PrivacyRegion = { region: string; links: string[] };

export const privacyRegions: PrivacyRegion[] = [
  {
    region: "North America (excluding Mexico)",
    links: [
      "Privacy Policy for the United States",
      "Privacy Policy for outside of US (English)",
      "Privacy Policy for outside of US (French)",
    ],
  },
  {
    region: "Latin America (including Mexico, Central and South America and the Caribbean)",
    links: [
      "Privacy Policy for Latin America (English)",
      "Privacy Policy for Latin America (Spanish)",
      "Privacy Policy for Latin America (Portuguese)",
    ],
  },
  {
    region: "Europe, Middle East, and Africa",
    links: ["Privacy Policy for the Europe, Middle East, Africa and other countries"],
  },
  {
    region: "Asia Pacific",
    links: ["Privacy Policy for Asia Pacific (excluding China)"],
  },
  {
    region: "China",
    links: ["Privacy Policy for China"],
  },
];

export const privacySupplemental = [
  "Outside of United States",
  "California and Vermont",
  "Cookie Policy",
  "Enterprise Customers and MyVilla for Work",
];
