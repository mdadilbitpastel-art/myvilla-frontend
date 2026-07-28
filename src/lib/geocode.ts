/**
 * Turning a listing's written address into a point on the map.
 *
 * The backend stores addresses as text, not coordinates, so the map has to
 * look them up. It uses OpenStreetMap's Nominatim, which is free and needs no
 * key but asks for at most one request a second — hence the queue below, and
 * the cache, so a returning visitor spends no requests at all.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const CACHE_KEY = "myvilla_geocache_v1";
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // a month — places don't move
/** Nominatim's usage policy: one request per second, absolute maximum. */
const GAP_MS = 1100;

export type LatLng = { lat: number; lng: number };

type CacheEntry = { at: number; point: LatLng | null };

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, CacheEntry>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* a full or blocked storage just means we look the address up again */
  }
}

// One shared chain: every lookup waits its turn, so several maps (or several
// villas) can never fire a burst at Nominatim.
let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  // Hold the next job back a beat, whatever this one did.
  queue = run.then(
    () => new Promise((r) => setTimeout(r, GAP_MS)),
    () => new Promise((r) => setTimeout(r, GAP_MS))
  );
  return run;
}

/**
 * The coordinates for a written place, or null when it can't be found.
 * Results — including "not found" — are cached for a month.
 */
export async function geocode(query: string): Promise<LatLng | null> {
  const key = query.trim().toLowerCase();
  if (!key) return null;

  const cache = readCache();
  const hit = cache[key];
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.point;

  const point = await enqueue(async () => {
    try {
      const url = `${ENDPOINT}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) return null;
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      const first = data[0];
      if (!first) return null;
      const lat = Number(first.lat);
      const lng = Number(first.lon);
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
      return null;
    }
  });

  const next = readCache();
  next[key] = { at: Date.now(), point };
  writeCache(next);
  return point;
}
