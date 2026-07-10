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

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
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
    // Session invalid/expired → clear it and bounce to sign in.
    if (err.extensions?.code === "UNAUTHENTICATED" && typeof window !== "undefined") {
      logout();
      window.location.href = "/?auth=signin";
    }
    throw new Error(err.message);
  }
  return json.data as T;
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
