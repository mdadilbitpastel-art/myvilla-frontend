// Minimal GraphQL client + auth service for the Django/Strawberry backend.

import type { BookingWindow } from "./bookingWindow";

export type { BookingWindow };

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/graphql/";

const ACCESS_KEY = "myvilla_access";
const REFRESH_KEY = "myvilla_refresh";
const USER_KEY = "myvilla_user";
const REMEMBER_EMAIL_KEY = "myvilla_remember_email";

export type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  country: string;
  gender: string;
  dateOfBirth: string;
  address: string;
  emergencyContact: string;
  avatar: string;
  /** Bank payout details, shared across all the host's villas. payoutAccount is
   *  the masked account number ("•••• 1234"); "" until the host adds them. */
  payoutAccountName: string;
  payoutBankName: string;
  payoutIfsc: string;
  payoutAccount: string;
};

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  retried = false
): Promise<T> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  const json = await res.json().catch(() => null);
  if (!json) throw new Error("Unexpected server response.");
  if (json.errors?.length) {
    const err = json.errors[0];
    if (err.extensions?.code === "UNAUTHENTICATED" && typeof window !== "undefined") {
      // Access token expired → try a silent refresh once, then retry the call.
      if (!retried && (await tryRefresh())) {
        return gql<T>(query, variables, true);
      }
      // Refresh failed/unavailable → clear the session and bounce to sign in.
      logout();
      window.location.href = "/?auth=signin";
    }
    throw new Error(err.message);
  }
  return json.data as T;
}

// Silent token refresh: swaps the expired access token using the stored refresh
// token. Concurrent 401s share one in-flight refresh. Returns true on success.
let refreshInFlight: Promise<boolean> | null = null;
async function tryRefresh(): Promise<boolean> {
  const rt = readSession(REFRESH_KEY);
  if (!rt) return false;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query:
              "mutation($t:String!){refreshToken(refreshToken:$t){accessToken refreshToken}}",
            variables: { t: rt },
          }),
        });
        const json = await res.json().catch(() => null);
        const data = json?.data?.refreshToken;
        if (!data?.accessToken) return false;
        updateTokens(data.accessToken, data.refreshToken);
        return true;
      } catch {
        return false;
      }
    })();
  }
  const ok = await refreshInFlight;
  refreshInFlight = null;
  return ok;
}

// Overwrite the stored tokens in whichever store currently holds the session.
function updateTokens(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  const store =
    window.localStorage.getItem(ACCESS_KEY) != null
      ? window.localStorage
      : window.sessionStorage.getItem(ACCESS_KEY) != null
        ? window.sessionStorage
        : window.localStorage;
  store.setItem(ACCESS_KEY, accessToken);
  store.setItem(REFRESH_KEY, refreshToken);
}

const USER_SELECTION =
  "id email fullName phoneNumber country gender dateOfBirth address emergencyContact avatar " +
  "payoutAccountName payoutBankName payoutIfsc payoutAccount";
const USER_FIELDS = `user { ${USER_SELECTION} }`;

export async function loginUser(
  email: string,
  password: string,
  remember: boolean = true
): Promise<AuthResult> {
  const data = await gql<{ login: AuthResult }>(
    `mutation Login($email: String!, $password: String!) {
       login(email: $email, password: $password) {
         accessToken refreshToken ${USER_FIELDS}
       }
     }`,
    { email, password }
  );
  persistSession(data.login, remember);
  // Remember-me: keep the email around to pre-fill next time (never the password).
  if (remember) setRememberedEmail(email);
  else clearRememberedEmail();
  return data.login;
}

export async function googleLogin(credential: string): Promise<AuthResult> {
  const data = await gql<{ googleLogin: AuthResult }>(
    `mutation GoogleLogin($credential: String!) {
       googleLogin(credential: $credential) {
         accessToken refreshToken ${USER_FIELDS}
       }
     }`,
    { credential }
  );
  // Google sign-in is always "remember me": the user picked a persistent
  // identity provider, so dropping the session on tab close would surprise them.
  persistSession(data.googleLogin, true);
  return data.googleLogin;
}

export async function registerUser(input: {
  email: string;
  password: string;
  phoneNumber: string;
  country: string;
}): Promise<AuthResult> {
  const data = await gql<{ register: AuthResult }>(
    `mutation Register($email: String!, $password: String!, $phoneNumber: String!, $country: String!) {
       register(email: $email, password: $password, phoneNumber: $phoneNumber, country: $country) {
         accessToken refreshToken ${USER_FIELDS}
       }
     }`,
    input
  );
  persistSession(data.register, true);
  return data.register;
}

export async function fetchMe(): Promise<AuthUser> {
  const data = await gql<{ me: AuthUser }>(
    `query Me { me { ${USER_SELECTION} } }`,
    {}
  );
  persistUser(data.me);
  return data.me;
}

export type ProfileInput = {
  fullName: string;
  gender: string;
  email: string;
  dateOfBirth: string;
  address: string;
  emergencyContact: string;
};

export async function updateProfile(input: ProfileInput): Promise<AuthUser> {
  const data = await gql<{ updateProfile: AuthUser }>(
    `mutation UpdateProfile(
       $fullName: String!, $gender: String!, $email: String!,
       $dateOfBirth: String!, $address: String!, $emergencyContact: String!
     ) {
       updateProfile(
         fullName: $fullName, gender: $gender, email: $email,
         dateOfBirth: $dateOfBirth, address: $address, emergencyContact: $emergencyContact
       ) { ${USER_SELECTION} }
     }`,
    input
  );
  persistUser(data.updateProfile);
  return data.updateProfile;
}

/** Save the host's shared bank payout details. Leave accountNumber blank to
 *  keep the existing (masked) one. Returns the updated user (also persisted). */
export async function updatePayoutDetails(
  accountName: string,
  bankName: string,
  accountNumber: string,
  ifsc: string
): Promise<AuthUser> {
  const data = await gql<{ updatePayoutDetails: AuthUser }>(
    `mutation UpdatePayout($accountName: String!, $bankName: String!, $accountNumber: String!, $ifsc: String!) {
       updatePayoutDetails(accountName: $accountName, bankName: $bankName, accountNumber: $accountNumber, ifsc: $ifsc) {
         ${USER_SELECTION}
       }
     }`,
    { accountName, bankName, accountNumber, ifsc }
  );
  persistUser(data.updatePayoutDetails);
  return data.updatePayoutDetails;
}

export async function updateAvatar(image: string): Promise<AuthUser> {
  const data = await gql<{ updateAvatar: AuthUser }>(
    `mutation UpdateAvatar($image: String!) {
       updateAvatar(image: $image) { ${USER_SELECTION} }
     }`,
    { image }
  );
  persistUser(data.updateAvatar);
  return data.updateAvatar;
}

// Clears the picture; the UI then falls back to the placeholder avatar.
export async function removeAvatar(): Promise<AuthUser> {
  const data = await gql<{ removeAvatar: AuthUser }>(
    `mutation RemoveAvatar { removeAvatar { ${USER_SELECTION} } }`,
    {}
  );
  persistUser(data.removeAvatar);
  return data.removeAvatar;
}

/* ---- Villas / "Add your Villa" ---- */

/** A premium add-on: a name and its price, charged per night. */
export type ExtraService = { name: string; price: number };

export type VillaInput = {
  title: string;
  propertyType?: string;
  city?: string;
  country?: string;
  address?: string;
  description?: string;
  buildUpArea?: string;
  bedrooms?: number;
  guests?: number;
  singleBedRooms?: number;
  doubleBedRooms?: number;
  /** How many days ahead the villa is open for booking. Default 5. */
  availabilityDays?: number;
  /** Nights the host closed on the calendar, "YYYY-MM-DD". */
  blockedDates?: string[];
  services?: string[];
  /** Premium add-ons with a per-night price each. */
  extraServices?: ExtraService[];
  // House rules. Times are "HH:MM" (an <input type="time"> value); "" = unset.
  checkInTime?: string;
  checkOutTime?: string;
  /** Minutes of grace after check-in time before a stay becomes a no-show.
   *  Omit / 0 to keep the platform default. */
  gracePeriodMinutes?: number;
  petsAllowed?: boolean;
  smokingAllowed?: boolean;
  eventsAllowed?: boolean;
  additionalRules?: string;
  pricePerNight?: number;
  acceptedPayments?: string[];
  /** Host bank payout details. payoutAccount = account number (masked server-side). */
  payoutAccountName?: string;
  payoutBankName?: string;
  payoutIfsc?: string;
  payoutMethod?: string;
  payoutAccount?: string;
  images?: string[]; // base64 data-URLs
  /** Unified display order: each entry is an existing image id or "new" for the
   *  next uploaded image. */
  imageOrder?: string[];
  /** Which photo (0-based index into imageOrder) is the cover. */
  coverIndex?: number;
};

export type VillaPhoto = { id: string; url: string; isCover: boolean };

export type Villa = {
  id: string;
  ownerId: string;
  /** The host, for the "Hosted by" panel. Avatar is a base64 data-URL or ""
   *  (empty → a gender-based placeholder is drawn). */
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  hostAvatar: string;
  hostGender: string;
  title: string;
  propertyType: string;
  city: string;
  country: string;
  address: string;
  description: string;
  buildUpArea: string;
  bedrooms: number;
  guests: number;
  singleBedRooms: number;
  doubleBedRooms: number;
  availabilityDays: number;
  /** Last date the host's window allows, "YYYY-MM-DD". */
  bookableUntil: string;
  /** Nights the host has closed by hand, from today forward. */
  blockedDates: string[];
  services: string[];
  /** Premium add-ons the host offers, each with a per-night price. */
  extraServices: ExtraService[];
  checkInTime: string;
  checkOutTime: string;
  /** Minutes after check-in time that a late guest can still be checked in;
   *  past it the booking becomes a no-show. */
  gracePeriodMinutes: number;
  petsAllowed: boolean;
  smokingAllowed: boolean;
  eventsAllowed: boolean;
  additionalRules: string;
  // The same rules already worded by the backend, for the detail page.
  houseRules: string[];
  pricePerNight: number;
  /** Live review aggregate: average stars (1 decimal, 0 when none) + count. */
  rating: number;
  reviewsCount: number;
  acceptedPayments: string[];
  /** Host bank payout details; payoutAccount is the masked account number. */
  payoutAccountName: string;
  payoutBankName: string;
  payoutIfsc: string;
  payoutMethod: string;
  payoutAccount: string;
  images: string[];
  photos: VillaPhoto[];
  coverImage: string;
  createdAt: string;
  // Whether the villa can take the stay the query asked about. With no dates
  // in the query the backend still answers for tonight, so a plain name search
  // can show an honest "Not available" mark.
  isAvailable: boolean;
  unavailableReason: string;
  /** Decided by the server from the caller's token, not by comparing ids. */
  isOwner: boolean;
};

const VILLA_SELECTION = `
  id ownerId hostName hostEmail hostPhone hostAvatar hostGender
  title propertyType city country address description buildUpArea
  bedrooms guests singleBedRooms doubleBedRooms services pricePerNight
  extraServices { name price }
  availabilityDays bookableUntil blockedDates
  checkInTime checkOutTime gracePeriodMinutes petsAllowed smokingAllowed eventsAllowed
  additionalRules houseRules
  acceptedPayments payoutAccountName payoutBankName payoutIfsc payoutMethod payoutAccount
  images photos { id url isCover } coverImage createdAt
  rating reviewsCount
  isAvailable unavailableReason isOwner`;

export async function createVilla(input: VillaInput): Promise<Villa> {
  const data = await gql<{ createVilla: Villa }>(
    `mutation CreateVilla($data: VillaInput!) {
       createVilla(data: $data) { ${VILLA_SELECTION} }
     }`,
    { data: input }
  );
  return data.createVilla;
}

export async function updateVilla(
  id: string,
  input: VillaInput,
  keepImageIds: string[]
): Promise<Villa> {
  const data = await gql<{ updateVilla: Villa }>(
    `mutation UpdateVilla($id: ID!, $data: VillaInput!, $keepImageIds: [ID!]!) {
       updateVilla(id: $id, data: $data, keepImageIds: $keepImageIds) { ${VILLA_SELECTION} }
     }`,
    { id, data: input, keepImageIds }
  );
  return data.updateVilla;
}

export async function deleteVilla(id: string): Promise<boolean> {
  const data = await gql<{ deleteVilla: boolean }>(
    `mutation DeleteVilla($id: ID!) { deleteVilla(id: $id) }`,
    { id }
  );
  return data.deleteVilla;
}

export async function fetchMyVillas(): Promise<Villa[]> {
  const data = await gql<{ myVillas: Villa[] }>(
    `query MyVillas { myVillas { ${VILLA_SELECTION} } }`,
    {}
  );
  return data.myVillas;
}

// How many villas the current user owns. Cheap — used by the account sidebar to
// decide whether the host-only sections (Rent Requests, Coupons) are shown.
export async function fetchMyVillasCount(): Promise<number> {
  const data = await gql<{ myVillasCount: number }>(
    `query MyVillasCount { myVillasCount }`,
    {}
  );
  return data.myVillasCount;
}

/* ---- Coupons (host-created discount codes) ---- */

export type CouponDiscountType = "percent" | "fixed";

/**
 * What a coupon is doing right now. Always taken from the server, never
 * re-derived here: the backend runs in UTC and a browser hours ahead of it
 * would disagree about which day it is and call a live coupon expired.
 */
export type CouponStatus = "active" | "scheduled" | "expired" | "inactive";

export type Coupon = {
  id: string;
  /** "" for a common coupon (all the host's villas), else a specific villa id. */
  villaId: string;
  villaTitle: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  active: boolean;
  /** "all" (every villa) or "villa" (one listing). */
  scope: "all" | "villa";
  label: string;
  createdAt: string;
  /** Validity period, "YYYY-MM-DD" or "" when unset. Both ends inclusive. */
  validFrom: string;
  validUntil: string;
  status: CouponStatus;
  /** The period in one line ("Valid until 30 Sep 2026"), "" when it has none. */
  validityLabel: string;
  /** Whole days left including today; -1 when it never expires. */
  daysLeft: number;
};

export type CouponInput = {
  villaId?: string; // "" = applies to all of the host's villas
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  active: boolean;
  /** Both optional: "" = starts now / never expires. */
  validFrom?: string;
  validUntil?: string;
};

const COUPON_SELECTION = `
  id villaId villaTitle code discountType discountValue active scope label createdAt
  validFrom validUntil status validityLabel daysLeft`;

export async function fetchMyCoupons(): Promise<Coupon[]> {
  const data = await gql<{ myCoupons: Coupon[] }>(
    `query MyCoupons { myCoupons { ${COUPON_SELECTION} } }`,
    {}
  );
  return data.myCoupons;
}

export async function createCoupon(input: CouponInput): Promise<Coupon> {
  const data = await gql<{ createCoupon: Coupon }>(
    `mutation CreateCoupon($data: CouponInput!) {
       createCoupon(data: $data) { ${COUPON_SELECTION} }
     }`,
    { data: input }
  );
  return data.createCoupon;
}

export async function updateCoupon(id: string, input: CouponInput): Promise<Coupon> {
  const data = await gql<{ updateCoupon: Coupon }>(
    `mutation UpdateCoupon($id: ID!, $data: CouponInput!) {
       updateCoupon(id: $id, data: $data) { ${COUPON_SELECTION} }
     }`,
    { id, data: input }
  );
  return data.updateCoupon;
}

export async function deleteCoupon(id: string): Promise<boolean> {
  const data = await gql<{ deleteCoupon: boolean }>(
    `mutation DeleteCoupon($id: ID!) { deleteCoupon(id: $id) }`,
    { id }
  );
  return data.deleteCoupon;
}

/* ---- Public offers (landing page) + coupon preview (payment page) ---- */

export type Offer = {
  villaId: string;
  title: string;
  city: string;
  country: string;
  coverImage: string;
  pricePerNight: number;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  label: string;
};

/**
 * The platform's first-booking welcome offer. `available` says whether to
 * advertise it — true for signed-out visitors too, since they haven't booked
 * either. `claimed` is only ever true for a signed-in guest who already has a
 * booking, which is what stops the popup nagging them.
 */
export type WelcomeOffer = {
  available: boolean;
  claimed: boolean;
  percentOff: number;
  headline: string;
  blurb: string;
  signedIn: boolean;
};

// Public. Sent with the session when there is one, so the answer is about this
// guest; `createBooking` re-checks eligibility under a lock before charging.
export async function fetchWelcomeOffer(): Promise<WelcomeOffer> {
  const data = await gql<{ welcomeOffer: WelcomeOffer }>(
    `query WelcomeOffer {
       welcomeOffer { available claimed percentOff headline blurb signedIn }
     }`,
    {}
  );
  return data.welcomeOffer;
}

// Public — real villas paired with an active coupon, for the landing page.
export async function fetchPublicOffers(limit = 8): Promise<Offer[]> {
  const data = await gql<{ publicOffers: Offer[] }>(
    `query PublicOffers($limit: Int!) {
       publicOffers(limit: $limit) {
         villaId title city country coverImage pricePerNight
         code discountType discountValue label
       }
     }`,
    { limit }
  );
  return data.publicOffers;
}

export type CouponPreview = {
  valid: boolean;
  message: string;
  code: string;
  discountType: string;
  discountValue: number;
  discount: number;
  label: string;
};

// Public — the payment page's live check of a code against a villa + nights.
export async function validateCoupon(
  code: string,
  villaId: string,
  nights: number
): Promise<CouponPreview> {
  const data = await gql<{ validateCoupon: CouponPreview }>(
    `query ValidateCoupon($code: String!, $villaId: ID!, $nights: Int!) {
       validateCoupon(code: $code, villaId: $villaId, nights: $nights) {
         valid message code discountType discountValue discount label
       }
     }`,
    { code, villaId, nights }
  );
  return data.validateCoupon;
}

// Wishlist — add/remove a villa; returns the new saved state (true = saved).
export async function toggleFavorite(villaId: string): Promise<boolean> {
  const data = await gql<{ toggleFavorite: boolean }>(
    `mutation ToggleFavorite($villaId: ID!) { toggleFavorite(villaId: $villaId) }`,
    { villaId }
  );
  return data.toggleFavorite;
}

export async function fetchMyFavorites(): Promise<Villa[]> {
  const data = await gql<{ myFavorites: Villa[] }>(
    `query MyFavorites { myFavorites { ${VILLA_SELECTION} } }`,
    {}
  );
  return data.myFavorites;
}

// Public — all listed villas (landing page). No auth required.
export async function fetchVillas(limit = 24): Promise<Villa[]> {
  const data = await gql<{ villas: Villa[] }>(
    `query Villas($limit: Int!) { villas(limit: $limit) { ${VILLA_SELECTION} } }`,
    { limit }
  );
  return data.villas;
}

export type VillaFilters = {
  search?: string;
  category?: string;
  guests?: number;
  // Nights wanted, "YYYY-MM-DD". They never remove a villa from the results —
  // they decide which ones come back marked unavailable.
  checkIn?: string;
  checkOut?: string;
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
};

// Public — filtered search (search page). Any subset of filters may be given.
export async function searchVillas(f: VillaFilters = {}): Promise<Villa[]> {
  const data = await gql<{ villas: Villa[] }>(
    `query SearchVillas(
       $search: String, $category: String, $guests: Int,
       $checkIn: String, $checkOut: String,
       $minPrice: Float, $maxPrice: Float, $limit: Int!
     ) {
       villas(
         search: $search, category: $category, guests: $guests,
         checkIn: $checkIn, checkOut: $checkOut,
         minPrice: $minPrice, maxPrice: $maxPrice, limit: $limit
       ) { ${VILLA_SELECTION} }
     }`,
    {
      search: f.search?.trim() || null,
      category: f.category?.trim() || null,
      guests: f.guests ?? null,
      checkIn: f.checkIn || null,
      checkOut: f.checkOut || null,
      minPrice: f.minPrice ?? null,
      maxPrice: f.maxPrice ?? null,
      limit: f.limit ?? 60,
    }
  );
  return data.villas;
}

// Public — a single villa by id (detail page). Returns null if not found.
// Pass the stay being considered to have `isAvailable` answered for exactly
// those nights; without it the backend answers for tonight.
export async function fetchVilla(
  id: string,
  stay: { checkIn?: string; checkOut?: string; guests?: number } = {}
): Promise<Villa | null> {
  const data = await gql<{ villa: Villa | null }>(
    `query Villa($id: ID!, $checkIn: String, $checkOut: String, $guests: Int) {
       villa(id: $id, checkIn: $checkIn, checkOut: $checkOut, guests: $guests) {
         ${VILLA_SELECTION}
       }
     }`,
    {
      id,
      checkIn: stay.checkIn || null,
      checkOut: stay.checkOut || null,
      guests: stay.guests ?? null,
    }
  );
  return data.villa;
}

/* ---- Booking window (public — what the guest's calendar may offer) ---- */

// Public and deliberately thinner than `villaAvailability`: it names no guests
// and says only "you can't have that date", which is all a calendar needs.
export async function fetchBookingWindow(villaId: string): Promise<BookingWindow> {
  const data = await gql<{ bookingWindow: Omit<BookingWindow, "fetchedAt"> }>(
    `query BookingWindow($villaId: ID!) {
       bookingWindow(villaId: $villaId) {
         villaId availabilityDays checkInTime serverNow
         firstDate lastDate maxCheckOut unavailableDates
       }
     }`,
    { villaId }
  );
  // Stamped on arrival: the window turns over on the SERVER's clock, and this
  // is what lets the page advance that clock instead of reading its own (which
  // may be in another time zone entirely). See slideWindow.
  return { ...data.bookingWindow, fetchedAt: Date.now() };
}

/* ---- Villa availability (owner view) ---- */

export type BookedRange = {
  bookingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  guestName: string;
  /** The runs this stay really occupies. Several when the guest booked around
   *  nights that were already taken, leaving that gap open for whoever holds
   *  it — checkIn/checkOut above only bracket them. */
  segments: StaySegment[];
};

export type VillaAvailability = {
  villaId: string;
  windowStart: string;
  windowEnd: string;
  /** The host's booking window: days ahead, and the last date it allows. */
  availabilityDays: number;
  bookableUntil: string;
  isAvailableNow: boolean;
  /** The date it frees up when occupied today; "" when it's free. */
  freeFrom: string;
  /** Every night already taken inside the window, "YYYY-MM-DD". */
  bookedDates: string[];
  /** Nights the host closed by hand — distinct from a guest's booking. */
  blockedDates: string[];
  upcoming: BookedRange[];
  /** Largest party already booked in — capacity can't drop below it. */
  maxBookedGuests: number;
};

// Owner-only: it names guests, and the backend refuses anyone else's villa.
export async function fetchVillaAvailability(
  villaId: string,
  days = 120
): Promise<VillaAvailability> {
  const data = await gql<{ villaAvailability: VillaAvailability }>(
    `query VillaAvailability($villaId: ID!, $days: Int!) {
       villaAvailability(villaId: $villaId, days: $days) {
         villaId windowStart windowEnd availabilityDays bookableUntil
         isAvailableNow freeFrom
         bookedDates blockedDates maxBookedGuests
         upcoming { bookingId checkIn checkOut nights guests guestName
                    segments { index checkIn checkOut nights checkInAt checkOutAt checkedInAt checkedOutAt } }
       }
     }`,
    { villaId, days }
  );
  return data.villaAvailability;
}

/* ---- Bookings ---- */

/**
 * One unbroken run of a stay: arrive, sleep `nights`, leave. A stay booked
 * around nights another guest holds has several — the guest checks out the
 * morning the other booking starts and back in the morning it ends.
 */
export type StaySegment = {
  /** 1-based, as shown: "Part 2 of 3". */
  index: number;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  nights: number;
  /** When this part opens and closes, as wall-clock moments at the property —
   *  NAIVE (no offset), so they show the hours the host set and compare
   *  directly against `serverNow`. Never parse these as real instants. */
  checkInAt: string;
  checkOutAt: string;
  /** When the host actually recorded this part's arrival and departure — a
   *  PIN-verified check-in and a checklist-confirmed check-out. "" until each
   *  happens. Real instants, so unlike the scheduled pair these do localise. */
  checkedInAt: string;
  checkedOutAt: string;
};

export type BookingInput = {
  villaId: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  guests: number;
  /** How many nights the page priced. A range can contain nights somebody else
   *  holds — those are skipped and not charged — so this is not checkOut minus
   *  checkIn, and the server re-quotes rather than charge a different stay. */
  expectedNights?: number;
  paymentMethod: string;
  cardNumber: string;
  expiration: string;
  cvv: string;
  /** PayPal / Google Pay account the guest pays from; masked on the server.
   *  Empty for card payments (the card number carries that). */
  paymentDetail?: string;
  billingStreet: string;
  billingApartment?: string;
  billingCity: string;
  billingState?: string;
  billingZip?: string;
  billingCountry: string;
  contactEmail: string;
  contactPhone?: string;
  /** Optional discount code; re-validated and applied on the server. */
  couponCode?: string;
  /** Names of the extra services the guest ticked; priced on the server. */
  extraServices?: string[];
};

export type Booking = {
  id: string;
  villaId: string;
  villaTitle: string;
  villaCover: string;
  villaCity: string;
  villaCountry: string;
  guestName: string;
  guestAvatar: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  /** The runs this stay is actually made of. One entry for an ordinary stay;
   *  several when the guest booked around nights somebody else held, in which
   *  case checkIn/checkOut only bracket them and `nights` counts what was
   *  slept — not the days between the two. */
  segments: StaySegment[];
  guests: number;
  pricePerNight: number;
  subtotal: number;
  discount: number;
  couponCode: string;
  /** What the discount was for, worded for a receipt: a coupon code, or
   *  "First booking offer". "" when nothing came off. */
  discountLabel: string;
  serviceFee: number;
  tax: number;
  /** Extra services the guest chose (name + per-night price), and their summed
   *  cost (price × nights). Frozen at booking time. */
  extraServices: ExtraService[];
  extrasTotal: number;
  total: number;
  paymentMethod: string;
  cardLast4: string;
  status: string;
  /** ISO timestamps set by the host on arrival/departure; "" until then. */
  checkedInAt: string;
  checkedOutAt: string;
  createdAt: string;
  /** The host — shown to the guest on their own booking's detail panel. */
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  hostAvatar: string;
  hostGender: string;
  /** The guest's contact phone — shown to the host on the rent-request panel. */
  guestPhone: string;
  /** Scheduled start/end datetimes (villa's check-in/out time on those dates),
   *  ISO-8601. What "late" and "no-show" are measured against. */
  checkInAt: string;
  checkOutAt: string;
  /** The server's wall clock when this was answered, same naive form as the
   *  two above. The host's check-in button opens at an exact hour and it's the
   *  SERVER that decides when — the browser may be in another time zone, so it
   *  must not judge that from its own clock (see useServerWallClock). */
  serverNow: string;
  /** Derived live on the server: upcoming | awaiting_checkin | staying |
   *  completed | no_show | cancelled. */
  lifecycleStatus: string;
  /** Hours past the scheduled check-in with the guest still not checked in
   *  (0 unless awaiting_checkin). */
  hoursLate: number;
  /** The flexible cancellation policy, read on the server at `serverNow`:
   *  free more than 24 hours before check-in, allowed but wholly
   *  non-refundable inside those last 24 hours, and closed from the check-in
   *  time onward. `cancellationMessage` is the line to show ("Free
   *  cancellation available." / the 24-hour non-refundable notice /
   *  "Cancellation period has expired."), and cancelFeeNow / refundAmountNow
   *  are that split in currency. */
  canCancel: boolean;
  refundPercentage: number;
  penaltyPercentage: number;
  cancellationMessage: string;
  cancelFeeNow: number;
  refundAmountNow: number;
  /** For CANCELLED bookings: what was actually charged, and what went back. */
  cancellationFee: number;
  refundAmount: number;
  /** The host's check-in button, decided on the server (see Booking.
   *  check_in_gate): "grey" before the check-in time, "green" once the window
   *  opens, "yellow" through its closing stretch, "hidden" after it shuts. */
  bookingStatus: string;
  checkinAvailable: boolean;
  buttonState: string;
  buttonVisible: boolean;
  gracePeriodRemainingMinutes: number;
  otpRequired: boolean;
  checkinMessage: string;
  /** When the check-in window shuts — naive wall-clock, like checkInAt. */
  graceEndsAt: string;
  /** Stamped when that window closed with nobody checked in ("" until then),
   *  and whether the host has since chosen to take the guest in regardless. */
  noShowAt: string;
  lateCheckInAllowed: boolean;
  /** The live check-in PIN. `checkinPin` / `checkinPinExpiresIn` are filled in
   *  for the GUEST alone — the host reading the same booking gets "" and 0, by
   *  design: they have to be told the code. The host's half is the two below. */
  checkinPin: string;
  checkinPinExpiresIn: number;
  checkinPinPending: boolean;
  checkinPinAttemptsLeft: number;
  /** The departure, decided on the server (see Booking.check_out_gate): whether
   *  the host may close this stay right now, and the line both sides are shown
   *  about what leaving at this moment would mean — including that it would be
   *  early and how many nights that hands back. */
  checkoutAvailable: boolean;
  checkoutMessage: string;
  /** Whether closing the stay right now would be an early departure — what
   *  turns `checkoutMessage` from a reminder into a warning worth showing. */
  checkoutEarlyNow: boolean;
  /** And what a departure actually did. A guest who left before the booked
   *  check-out gets no refund, and the nights they didn't use go back on the
   *  calendar for other guests. 0 / false until that happens. */
  earlyCheckOut: boolean;
  releasedNights: number;
  /** The live check-out PIN — the same arrangement as the check-in one above,
   *  and never both at once: a booking has one live code, for whichever end of
   *  the stay it is at. */
  checkoutPin: string;
  checkoutPinExpiresIn: number;
  checkoutPinPending: boolean;
  checkoutPinAttemptsLeft: number;
  /** Reviews: whether the guest may review this (completed) stay, and their
   *  review if they've left one (rating 0 / "" comment when not). */
  canReview: boolean;
  reviewRating: number;
  reviewComment: string;
  /** When the review was posted (ISO instant, "" when there isn't one) —
   *  shown to guest and host alike. */
  reviewCreatedAt: string;
  /** Whether the guest may still change it: editing closes 24 hours after
   *  posting, and the Edit control goes with it. */
  canEditReview: boolean;
  reviewEditableUntil: string;
  /** Nights the guest may still choose to give up — every night of a stay part
   *  nobody has arrived for and whose check-in hour hasn't passed. Empty when
   *  there is nothing left to drop, which is what hides the "selected dates"
   *  option instead of opening an empty picker. ISO dates. */
  cancellableNights: string[];
  /** Nights already given up, how many are still held, and whether this is a
   *  stay that was trimmed rather than called off (a trimmed booking is still
   *  ACTIVE — it goes ahead, shorter). */
  cancelledNights: string[];
  /** The whole stay laid out night by night — every date the booking was made
   *  for, held or already given up — each carrying what cancelling it right now
   *  would hand back, or why it can't go. What the cancel screen is drawn from,
   *  so the dates, their disabled state and their reason all come from the
   *  server rather than being guessed at in the browser. */
  nightOptions: BookingNightOption[];
  activeNights: number;
  partiallyCancelled: boolean;
  /** One receipt per cancellation event, oldest first, and their total refund. */
  cancellations: BookingCancellation[];
  refundedTotal: number;
};

/** One night of a stay as the cancel screen sees it: whether it may still be
 *  given up, what that would hand back, and the line explaining either. */
export type BookingNightOption = {
  /** The night slept, ISO date, and which part of the stay holds it. */
  date: string;
  partIndex: number;
  /** "open" — it may go right now — or why not: "started" (that part is under
   *  way), "expired" (its check-in hour has passed), "cancelled" (already
   *  given up). `cancellable` is "open" said plainly. */
  state: "open" | "started" | "expired" | "cancelled" | string;
  cancellable: boolean;
  /** What this ONE night is worth and how it splits at its part's tier —
   *  indicative, for the chip's label. The binding figure is the quote for the
   *  whole selection. On a cancelled night, what it actually got back. */
  refundPercentage: number;
  stayValue: number;
  refundAmount: number;
  cancellationFee: number;
  /** The policy line for this night, in the guest's words. */
  message: string;
};

/** One cancellation event on a booking — the whole stay, or nights of it. */
export type BookingCancellation = {
  id: string;
  /** "full" — the stay was called off — or "partial", some of its nights. */
  kind: string;
  nights: string[];
  nightsCount: number;
  /** stayValue = cancellationFee + refundAmount, always. */
  stayValue: number;
  cancellationFee: number;
  refundAmount: number;
  refundPercentage: number;
  /** The policy line the guest was shown as they confirmed it. */
  message: string;
  createdAt: string;
};

/** What giving up a chosen set of nights would cost and hand back, priced by
 *  the server with the same code that performs the cancellation. `allowed`
 *  false means the selection can't go through and `error` says why. */
export type NightsCancellationQuote = {
  nights: string[];
  nightsCount: number;
  stayValue: number;
  cancellationFee: number;
  refundAmount: number;
  refundPercentage: number;
  /** The selection is every night still held — a whole-stay cancellation. */
  full: boolean;
  allowed: boolean;
  message: string;
  error: string;
};

const BOOKING_SELECTION = `
  id villaId villaTitle villaCover villaCity villaCountry
  guestName guestAvatar guestEmail
  checkIn checkOut nights segments { index checkIn checkOut nights checkInAt checkOutAt checkedInAt checkedOutAt } guests
  pricePerNight subtotal discount couponCode discountLabel serviceFee tax
  extraServices { name price } extrasTotal total
  hostName hostEmail hostPhone hostAvatar hostGender guestPhone
  checkInAt checkOutAt serverNow lifecycleStatus hoursLate
  canCancel refundPercentage penaltyPercentage cancellationMessage
  cancelFeeNow refundAmountNow cancellationFee refundAmount
  cancellableNights cancelledNights activeNights partiallyCancelled refundedTotal
  nightOptions { date partIndex state cancellable refundPercentage stayValue refundAmount cancellationFee message }
  cancellations { id kind nights nightsCount stayValue cancellationFee refundAmount refundPercentage message createdAt }
  bookingStatus checkinAvailable buttonState buttonVisible
  gracePeriodRemainingMinutes otpRequired checkinMessage graceEndsAt
  noShowAt lateCheckInAllowed
  checkinPin checkinPinExpiresIn checkinPinPending checkinPinAttemptsLeft
  checkoutAvailable checkoutMessage checkoutEarlyNow earlyCheckOut releasedNights
  checkoutPin checkoutPinExpiresIn checkoutPinPending checkoutPinAttemptsLeft
  canReview reviewRating reviewComment reviewCreatedAt canEditReview reviewEditableUntil
  paymentMethod cardLast4 status checkedInAt checkedOutAt createdAt`;

export async function createBooking(input: BookingInput): Promise<Booking> {
  const data = await gql<{ createBooking: Booking }>(
    `mutation CreateBooking($data: BookingInput!) {
       createBooking(data: $data) { ${BOOKING_SELECTION} }
     }`,
    { data: input }
  );
  return data.createBooking;
}

export async function fetchMyBookings(): Promise<Booking[]> {
  const data = await gql<{ myBookings: Booking[] }>(
    `query MyBookings { myBookings { ${BOOKING_SELECTION} } }`,
    {}
  );
  return data.myBookings;
}

// Host-side: bookings made on villas the current user owns (rent requests).
export async function fetchVillaBookings(): Promise<Booking[]> {
  const data = await gql<{ myVillaBookings: Booking[] }>(
    `query MyVillaBookings { myVillaBookings { ${BOOKING_SELECTION} } }`,
    {}
  );
  return data.myVillaBookings;
}

export async function cancelBooking(id: string): Promise<Booking> {
  const data = await gql<{ cancelBooking: Booking }>(
    `mutation CancelBooking($id: ID!) {
       cancelBooking(id: $id) { ${BOOKING_SELECTION} }
     }`,
    { id }
  );
  return data.cancelBooking;
}

/**
 * Give up SOME of a booking's nights. The stay goes ahead, shorter, and the
 * nights go back on the villa's calendar.
 *
 * Passing every night still held is a whole-stay cancellation and the server
 * records it as one — the guest reaches the same place from either door.
 * Re-priced server-side at its own clock, so a picker left open across a tier
 * boundary is charged what is true when the button is pressed, not what was
 * quoted a minute ago.
 */
export async function cancelBookingNights(
  id: string,
  nights: string[]
): Promise<Booking> {
  const data = await gql<{ cancelBookingNights: Booking }>(
    `mutation CancelBookingNights($id: ID!, $nights: [String!]!) {
       cancelBookingNights(id: $id, nights: $nights) { ${BOOKING_SELECTION} }
     }`,
    { id, nights }
  );
  return data.cancelBookingNights;
}

/** Price a set of nights before giving them up — the picker's live summary.
 *  Read-only, so it is safe to call on every change of the selection. */
export async function fetchNightsCancellationQuote(
  id: string,
  nights: string[]
): Promise<NightsCancellationQuote> {
  const data = await gql<{ nightsCancellationQuote: NightsCancellationQuote }>(
    `query NightsCancellationQuote($id: ID!, $nights: [String!]!) {
       nightsCancellationQuote(id: $id, nights: $nights) {
         nights nightsCount stayValue cancellationFee refundAmount
         refundPercentage full allowed message error
       }
     }`,
    { id, nights }
  );
  return data.nightsCancellationQuote;
}

/**
 * Host-side check-in, step 1: ask the server for a PIN.
 *
 * The digits are NOT in this response — they appear on the GUEST's own booking
 * page, and the host has to ask for them. Any PIN the booking already had stops
 * working here, so calling this again is how a host recovers from an expired or
 * locked code.
 */
export async function startCheckIn(id: string): Promise<Booking> {
  const data = await gql<{ startCheckIn: Booking }>(
    `mutation StartCheckIn($id: ID!) {
       startCheckIn(id: $id) { ${BOOKING_SELECTION} }
     }`,
    { id }
  );
  return data.startCheckIn;
}

/**
 * Step 2: the host types back the PIN the guest read out. Correct → the guest
 * is checked in and the code is spent. Three wrong tries lock that code and
 * email the guest a security alert; `startCheckIn` issues a fresh one.
 */
export async function verifyCheckIn(id: string, pin: string): Promise<Booking> {
  const data = await gql<{ verifyCheckIn: Booking }>(
    `mutation VerifyCheckIn($id: ID!, $pin: String!) {
       verifyCheckIn(id: $id, pin: $pin) { ${BOOKING_SELECTION} }
     }`,
    { id, pin }
  );
  return data.verifyCheckIn;
}

/**
 * Take a no-show guest in anyway. Re-opens the (still PIN-verified) check-in
 * button; the booking stays a no-show on the record and the refund stays 0%.
 */
export async function allowLateCheckIn(id: string): Promise<Booking> {
  const data = await gql<{ allowLateCheckIn: Booking }>(
    `mutation AllowLateCheckIn($id: ID!) {
       allowLateCheckIn(id: $id) { ${BOOKING_SELECTION} }
     }`,
    { id }
  );
  return data.allowLateCheckIn;
}

/**
 * Host-side check-out, step 1 — the mirror of `startCheckIn`.
 *
 * The digits are NOT in this response: they appear on the GUEST's own booking
 * page, so a stay can only be closed with the guest there to read them out.
 * Refused unless somebody is actually checked in.
 */
export async function startCheckOut(id: string): Promise<Booking> {
  const data = await gql<{ startCheckOut: Booking }>(
    `mutation StartCheckOut($id: ID!) {
       startCheckOut(id: $id) { ${BOOKING_SELECTION} }
     }`,
    { id }
  );
  return data.startCheckOut;
}

/**
 * Step 2: the host types back the PIN the guest read out, and the stay closes.
 * A guest leaving before their booked check-out also hands the unused nights
 * back to the calendar — with no refund, since the stay was paid for in full.
 */
export async function verifyCheckOut(id: string, pin: string): Promise<Booking> {
  const data = await gql<{ verifyCheckOut: Booking }>(
    `mutation VerifyCheckOut($id: ID!, $pin: String!) {
       verifyCheckOut(id: $id, pin: $pin) { ${BOOKING_SELECTION} }
     }`,
    { id, pin }
  );
  return data.verifyCheckOut;
}

/* ---- Reviews ---- */

export type Review = {
  id: string;
  villaId: string;
  /** The villa this review is for — shown on landing-page testimonial cards. */
  villaTitle: string;
  villaCity: string;
  rating: number;
  comment: string;
  authorName: string;
  authorAvatar: string;
  authorGender: string;
  createdAt: string;
  /** True when the signed-in viewer wrote this review. */
  isMine: boolean;
};

const REVIEW_SELECTION = `
  id villaId villaTitle villaCity rating comment
  authorName authorAvatar authorGender createdAt isMine`;

/** Public: the reviews left on one villa, newest first. */
export async function fetchVillaReviews(villaId: string, limit = 50): Promise<Review[]> {
  const data = await gql<{ villaReviews: Review[] }>(
    `query VillaReviews($villaId: ID!, $limit: Int!) {
       villaReviews(villaId: $villaId, limit: $limit) { ${REVIEW_SELECTION} }
     }`,
    { villaId, limit }
  );
  return data.villaReviews;
}

/** Public: the most recent reviews across all villas (with written text), for
 *  the landing-page testimonials. */
export async function fetchLatestReviews(limit = 24): Promise<Review[]> {
  const data = await gql<{ latestReviews: Review[] }>(
    `query LatestReviews($limit: Int!) {
       latestReviews(limit: $limit) { ${REVIEW_SELECTION} }
     }`,
    { limit }
  );
  return data.latestReviews;
}

/** The guest's oldest completed-but-unreviewed stay, or null. Drives the
 *  landing-page "rate your stay" popup. */
export async function fetchPendingReview(): Promise<Booking | null> {
  const data = await gql<{ pendingReviewBooking: Booking | null }>(
    `query PendingReview { pendingReviewBooking { ${BOOKING_SELECTION} } }`,
    {}
  );
  return data.pendingReviewBooking;
}

/** Leave or update the guest's review for a completed booking. Returns the
 *  booking with its review fields refreshed. */
export async function submitReview(
  bookingId: string,
  rating: number,
  comment: string
): Promise<Booking> {
  const data = await gql<{ submitReview: Booking }>(
    `mutation SubmitReview($bookingId: ID!, $rating: Int!, $comment: String!) {
       submitReview(bookingId: $bookingId, rating: $rating, comment: $comment) {
         ${BOOKING_SELECTION}
       }
     }`,
    { bookingId, rating, comment }
  );
  return data.submitReview;
}

export async function requestPasswordReset(email: string): Promise<void> {
  await gql<{ requestPasswordReset: boolean }>(
    `mutation RequestPasswordReset($email: String!) {
       requestPasswordReset(email: $email)
     }`,
    { email }
  );
}

export async function resetPassword(
  uid: string,
  token: string,
  newPassword: string
): Promise<void> {
  await gql<{ resetPassword: boolean }>(
    `mutation ResetPassword($uid: String!, $token: String!, $newPassword: String!) {
       resetPassword(uid: $uid, token: $token, newPassword: $newPassword)
     }`,
    { uid, token, newPassword }
  );
}

/* ---- session storage helpers ----
   "Remember me" ON  → localStorage   (survives a browser restart)
   "Remember me" OFF → sessionStorage (cleared when the tab/browser closes) */

const SESSION_KEYS = [ACCESS_KEY, REFRESH_KEY, USER_KEY];

function persistSession(result: AuthResult, remember: boolean) {
  if (typeof window === "undefined") return;
  const store = remember ? window.localStorage : window.sessionStorage;
  const other = remember ? window.sessionStorage : window.localStorage;
  store.setItem(ACCESS_KEY, result.accessToken);
  store.setItem(REFRESH_KEY, result.refreshToken);
  store.setItem(USER_KEY, JSON.stringify(result.user));
  // Drop any stale copy in the other store so only one session exists.
  SESSION_KEYS.forEach((k) => other.removeItem(k));
}

function readSession(key: string): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key) ?? window.sessionStorage.getItem(key);
}

// Update just the stored user object in whichever store holds the session.
function persistUser(user: AuthUser) {
  if (typeof window === "undefined") return;
  const store =
    window.localStorage.getItem(USER_KEY) != null
      ? window.localStorage
      : window.sessionStorage.getItem(USER_KEY) != null
        ? window.sessionStorage
        : window.localStorage;
  store.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): AuthUser | null {
  const raw = readSession(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function getAccessToken(): string | null {
  return readSession(ACCESS_KEY);
}

/* ---- "Remember me" email (persists across logout so the form pre-fills) ---- */

export function setRememberedEmail(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REMEMBER_EMAIL_KEY, email);
}

export function clearRememberedEmail() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(REMEMBER_EMAIL_KEY);
}

export function getRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
}

export function logout() {
  if (typeof window === "undefined") return;
  SESSION_KEYS.forEach((k) => {
    window.localStorage.removeItem(k);
    window.sessionStorage.removeItem(k);
  });
}
