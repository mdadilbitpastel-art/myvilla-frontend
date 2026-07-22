/**
 * The service labels the "Add your Villa" wizard offers, shared with the villa
 * detail page so what a host ticks is exactly what a guest sees.
 *
 * Both kinds live in one `services` array on the villa (the backend keeps a
 * single JSON list), so the split back into "Facilities Provided" and "Extra
 * Services" happens here, off this one list. A label the host typed themselves
 * via "Add More" is unknown to both lists and counts as a facility — that's the
 * block the "Add More" button sits in.
 */

export const EXTRA_SERVICES = [
  "Airport Pickup",
  "Daily Housekeeping",
  "Private Chef",
  "Guided Tours",
  "Car Rental",
  "Laundry Service",
  "Spa & Wellness",
  "Babysitting",
] as const;

const EXTRA_SET = new Set<string>(EXTRA_SERVICES.map((s) => s.toLowerCase()));

export function isExtraService(label: string): boolean {
  return EXTRA_SET.has(label.trim().toLowerCase());
}

/** Split a villa's saved `services` into the two blocks the detail page shows. */
export function splitServices(services: string[] = []): {
  facilities: string[];
  extras: string[];
} {
  const facilities: string[] = [];
  const extras: string[] = [];
  for (const raw of services) {
    const label = (raw || "").trim();
    if (!label) continue;
    (isExtraService(label) ? extras : facilities).push(label);
  }
  return { facilities, extras };
}
