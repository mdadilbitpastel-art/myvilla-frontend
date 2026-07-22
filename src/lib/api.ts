// Minimal GraphQL client + auth service for the Django/Strawberry backend.

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
  "id email fullName phoneNumber country gender dateOfBirth address emergencyContact avatar";
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

export type VillaInput = {
  title: string;
  propertyType?: string;
  city?: string;
  country?: string;
  address?: string;
  description?: string;
  buildUpArea?: string;
  bedrooms?: number;
  bathrooms?: number;
  guests?: number;
  services?: string[];
  pricePerNight?: number;
  acceptedPayments?: string[];
  payoutMethod?: string;
  payoutAccount?: string;
  images?: string[]; // base64 data-URLs
};

export type VillaPhoto = { id: string; url: string };

export type Villa = {
  id: string;
  ownerId: string;
  title: string;
  propertyType: string;
  city: string;
  country: string;
  address: string;
  description: string;
  buildUpArea: string;
  bedrooms: number;
  bathrooms: number;
  guests: number;
  services: string[];
  pricePerNight: number;
  acceptedPayments: string[];
  payoutMethod: string;
  payoutAccount: string;
  images: string[];
  photos: VillaPhoto[];
  coverImage: string;
  createdAt: string;
};

const VILLA_SELECTION = `
  id ownerId title propertyType city country address description buildUpArea
  bedrooms bathrooms guests services pricePerNight
  acceptedPayments payoutMethod payoutAccount
  images photos { id url } coverImage createdAt`;

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
  minPrice?: number;
  maxPrice?: number;
  limit?: number;
};

// Public — filtered search (search page). Any subset of filters may be given.
export async function searchVillas(f: VillaFilters = {}): Promise<Villa[]> {
  const data = await gql<{ villas: Villa[] }>(
    `query SearchVillas(
       $search: String, $category: String, $guests: Int,
       $minPrice: Float, $maxPrice: Float, $limit: Int!
     ) {
       villas(
         search: $search, category: $category, guests: $guests,
         minPrice: $minPrice, maxPrice: $maxPrice, limit: $limit
       ) { ${VILLA_SELECTION} }
     }`,
    {
      search: f.search?.trim() || null,
      category: f.category?.trim() || null,
      guests: f.guests ?? null,
      minPrice: f.minPrice ?? null,
      maxPrice: f.maxPrice ?? null,
      limit: f.limit ?? 60,
    }
  );
  return data.villas;
}

// Public — a single villa by id (detail page). Returns null if not found.
export async function fetchVilla(id: string): Promise<Villa | null> {
  const data = await gql<{ villa: Villa | null }>(
    `query Villa($id: ID!) { villa(id: $id) { ${VILLA_SELECTION} } }`,
    { id }
  );
  return data.villa;
}

/* ---- Bookings ---- */

export type BookingInput = {
  villaId: string;
  checkIn: string; // "YYYY-MM-DD"
  checkOut: string; // "YYYY-MM-DD"
  guests: number;
  paymentMethod: string;
  cardNumber: string;
  expiration: string;
  cvv: string;
  billingStreet: string;
  billingApartment?: string;
  billingCity: string;
  billingState?: string;
  billingZip?: string;
  billingCountry: string;
  contactEmail: string;
  contactPhone?: string;
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
  guests: number;
  pricePerNight: number;
  subtotal: number;
  serviceFee: number;
  tax: number;
  total: number;
  paymentMethod: string;
  cardLast4: string;
  status: string;
  hostResponded: boolean;
  createdAt: string;
};

const BOOKING_SELECTION = `
  id villaId villaTitle villaCover villaCity villaCountry
  guestName guestAvatar guestEmail
  checkIn checkOut nights guests
  pricePerNight subtotal serviceFee tax total
  paymentMethod cardLast4 status hostResponded createdAt`;

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

export async function respondBooking(id: string): Promise<Booking> {
  const data = await gql<{ respondBooking: Booking }>(
    `mutation RespondBooking($id: ID!) {
       respondBooking(id: $id) { ${BOOKING_SELECTION} }
     }`,
    { id }
  );
  return data.respondBooking;
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
