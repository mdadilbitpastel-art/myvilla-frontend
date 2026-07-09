// Minimal GraphQL client + auth service for the Django/Strawberry backend.

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/graphql/";

const ACCESS_KEY = "myvilla_access";
const REFRESH_KEY = "myvilla_refresh";
const USER_KEY = "myvilla_user";

export type AuthUser = {
  id: string;
  email: string;
  phoneNumber: string;
  country: string;
};

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
  } catch {
    throw new Error("Cannot reach the server. Is the backend running?");
  }

  const json = await res.json().catch(() => null);
  if (!json) throw new Error("Unexpected server response.");
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data as T;
}

const USER_FIELDS = "user { id email phoneNumber country }";

export async function loginUser(email: string, password: string): Promise<AuthResult> {
  const data = await gql<{ login: AuthResult }>(
    `mutation Login($email: String!, $password: String!) {
       login(email: $email, password: $password) {
         accessToken refreshToken ${USER_FIELDS}
       }
     }`,
    { email, password }
  );
  persistSession(data.login);
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
  persistSession(data.register);
  return data.register;
}

/* ---- session storage helpers ---- */

function persistSession(result: AuthResult) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCESS_KEY, result.accessToken);
  localStorage.setItem(REFRESH_KEY, result.refreshToken);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user));
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as AuthUser) : null;
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_KEY);
}

export function logout() {
  if (typeof window === "undefined") return;
  [ACCESS_KEY, REFRESH_KEY, USER_KEY].forEach((k) => localStorage.removeItem(k));
}
