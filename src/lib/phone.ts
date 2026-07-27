/**
 * A contact number is stored as one string with its country code in front —
 * e.g. "+91 9876543210". These helpers split it for the two-field UI (a code
 * picker + a number box) and join it back for storage, so the profile page and
 * the checkout page treat a saved number the exact same way.
 */

export type DialCode = { code: string; country: string };

// Common dialling codes, roughly aligned with the checkout's country list.
export const DIAL_CODES: DialCode[] = [
  { code: "+1", country: "United States / Canada" },
  { code: "+44", country: "United Kingdom" },
  { code: "+91", country: "India" },
  { code: "+61", country: "Australia" },
  { code: "+49", country: "Germany" },
  { code: "+33", country: "France" },
  { code: "+34", country: "Spain" },
  { code: "+39", country: "Italy" },
  { code: "+31", country: "Netherlands" },
  { code: "+971", country: "United Arab Emirates" },
  { code: "+65", country: "Singapore" },
  { code: "+81", country: "Japan" },
  { code: "+86", country: "China" },
  { code: "+55", country: "Brazil" },
  { code: "+52", country: "Mexico" },
  { code: "+27", country: "South Africa" },
  { code: "+64", country: "New Zealand" },
  { code: "+41", country: "Switzerland" },
  { code: "+46", country: "Sweden" },
  { code: "+47", country: "Norway" },
  { code: "+353", country: "Ireland" },
  { code: "+351", country: "Portugal" },
  { code: "+57", country: "Colombia" },
  { code: "+54", country: "Argentina" },
  { code: "+92", country: "Pakistan" },
  { code: "+880", country: "Bangladesh" },
  { code: "+234", country: "Nigeria" },
  { code: "+7", country: "Russia" },
  { code: "+90", country: "Turkey" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+20", country: "Egypt" },
  { code: "+62", country: "Indonesia" },
  { code: "+60", country: "Malaysia" },
  { code: "+63", country: "Philippines" },
  { code: "+66", country: "Thailand" },
  { code: "+84", country: "Vietnam" },
  { code: "+82", country: "South Korea" },
];

/** Split a stored contact into its "+code" and its bare digits. */
export function splitContact(full: string): { code: string; number: string } {
  const s = (full || "").trim();
  const m = s.match(/^(\+\d{1,4})\D*(.*)$/);
  if (m) return { code: m[1], number: m[2].replace(/\D/g, "") };
  return { code: "", number: s.replace(/\D/g, "") };
}

/** Recombine a code + number for storage. Empty number → empty string. */
export function joinContact(code: string, number: string): string {
  const n = (number || "").replace(/\D/g, "");
  if (!n) return "";
  return code ? `${code} ${n}` : n;
}

/** "+91 9876543210" — for display. Falls back to the number alone. */
export function formatContact(full: string): string {
  const { code, number } = splitContact(full);
  if (!number) return "";
  return code ? `${code} ${number}` : number;
}
