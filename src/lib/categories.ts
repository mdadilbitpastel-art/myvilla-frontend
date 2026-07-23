// The property types a host can choose when listing a villa. Every category
// filter in the app — the hero tabs on the landing page, the chips on the
// search page — has to come from this list, or it filters on a value no
// listing can ever have.
export const PROPERTY_TYPES = [
  "Villa Living",
  "Hotel",
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
