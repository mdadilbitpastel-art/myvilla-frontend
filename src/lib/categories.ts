// The property types a host can choose when listing a villa. Every category
// filter in the app — the hero tabs on the landing page, the chips on the
// search page — has to come from this list, or it filters on a value no
// listing can ever have.
export const PROPERTY_TYPES = [
  "Villa Living",
  "Bungalow",
  "Combinative Villa",
] as const;

/** "All" is the only exclusive entry — it means "no filter at all". */
export const ALL_CATEGORY = "All";
/** Everything a host named themselves. Combines with the types like any chip. */
export const OTHERS_CATEGORY = "Others";

export const SEARCH_CATEGORIES: string[] = [
  ALL_CATEGORY,
  ...PROPERTY_TYPES,
  OTHERS_CATEGORY,
];

/**
 * What a listing calls itself in prose — "the whole ___ is yours for the stay".
 *
 * "" for a hotel, deliberately: you take a room in a hotel, not the building,
 * so the sentence has no true form and the line is dropped instead of being
 * reworded into something that isn't the case. Hotel is no longer a category a
 * host can pick, but one can still type it under "Others", so the case stays.
 * Host-typed types are used as written, just lowercased.
 */
export function propertyNoun(propertyType: string): string {
  const type = (propertyType || "").trim();
  if (!type) return "property";
  if (type.toLowerCase() === "hotel") return "";
  // "Villa Living" is the category's name, not the thing itself.
  if (type === "Villa Living") return "villa";
  return type.toLowerCase();
}

/**
 * Does a listing's own property type fall under the picked categories?
 * "Others" is everything a host typed in themselves, so it is defined as
 * "none of the known types" rather than as a literal value.
 */
export function matchesCategories(propertyType: string, picked: string[]): boolean {
  if (!picked.length || picked.includes(ALL_CATEGORY)) return true;
  const type = (propertyType || "").trim();
  const known = (PROPERTY_TYPES as readonly string[]).includes(type);
  return picked.some((c) => (c === OTHERS_CATEGORY ? !known : c === type));
}
