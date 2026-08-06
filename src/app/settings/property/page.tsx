"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { X, Pencil, Eye, Trash2, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useConfirm } from "@/lib/confirm";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import CountPill from "@/components/ui/CountPill";
import Img from "@/components/ui/Img";
import { setVillaCount } from "@/lib/useProperty";
import {
  fetchMyVillas,
  fetchVillaAvailability,
  deleteVilla,
  type Villa,
} from "@/lib/api";

const PLACEHOLDER_IMG =
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=600&q=80";

// A row shape derived from the user's real villas.
type Row = {
  id: string; // enables View / Edit / Remove
  title: string;
  image: string;
  /** What KIND of listing this is — "Villa Living", "Bungalow", whatever the
   *  host typed under "Others". A column of its own now: a host with eight
   *  properties sorts them in their head by type long before they read a name,
   *  and the value was already on the villa, shown everywhere except the one
   *  page belonging to the person who set it. */
  type: string;
  /** The street address the host typed. This is what the Location column
   *  actually shows: city/country are optional on a listing and were empty on
   *  most of them, leaving the column blank on a page whose whole job is to
   *  tell the host which property is which. The address is always there. */
  address: string;
  city: string;
  country: string;
  price: number;
  posted: string;
  /** For the sort — `posted` above is already worded for reading. */
  createdAt: string;
  // Live booking status, the same answer a guest browsing today gets: "" when
  // the villa is free right now, otherwise why it isn't.
  unavailable: string;
  rooms: string;
};

// The list is the same kind of object every other page in Manage Account shows:
// one row per thing, the same facts in the same column on every row, read down
// rather than across. It is built exactly like the Bookings and Rent Requests
// tables — one grid template shared by the headings and every row, a minimum
// width so the columns keep their proportions, and the whole thing scrolling
// sideways inside its card rather than crushing itself on a narrow screen.
// No rating anywhere on this page. This is the owner's own listing — what they
// come here to do is check, edit and price their properties, and a score is a
// verdict guests pass on one, read where guests read it. A column of "4.8" and
// "New" only bought width from the two columns that actually truncate.
// "Availability" and not "Occupancy": the cell under it counts what is still
// FREE, and a heading pointing the other way would have every figure in the
// column reading backwards.
const COLUMNS = ["Property", "Listing Type", "Location", "Price", "Availability", ""];

//        property  type   location  price availability actions
// Two kinds of track, deliberately:
//
// The flexible ones are `minmax(0, …fr)` rather than a bare `…fr`, because a
// bare fr track refuses to go narrower than its content — one long villa name
// would push its own column wider on that row alone and every heading would
// stop lining up with the cells under it. With a 0 floor each track is exactly
// its share on every row.
//
// The rest are fixed pixels. The headings are their own grid container, so an
// `auto` track would be measured separately there and the columns would drift
// apart; a pixel width is the only kind that is identical in both. Type and
// price are sized to hold their longest real value outright, and the actions
// track is exactly the three 32px buttons plus their gaps — the column used to
// take a share of the row and spend it on empty space to the left of the icons.
//
// The rating column's 92px went to the property column, which is one of the two
// that actually truncate, and the rest came off the row's floor.
const ROW_GRID =
  "grid-cols-[minmax(0,2.5fr)_150px_minmax(0,1.7fr)_86px_minmax(0,1.25fr)_112px]";
const ROW_MINW = "min-w-[990px]";
// Each column after the first is nudged off the one before it — headings and
// cells alike, never one without the other, or the two drift apart.
const CELL_PAD = "pl-4";

function ColumnHeadings() {
  return (
    // `border border-transparent`: every row below is a bordered card, so its
    // cells start one pixel in from where a borderless heading's would. An
    // invisible border of the same width gives the heading the identical box.
    <div
      className={`mt-6 grid ${ROW_MINW} ${ROW_GRID} border border-transparent px-4 text-[11px] font-semibold uppercase tracking-wide text-muted`}
    >
      {COLUMNS.map((c, i) => (
        <span key={c || `col-${i}`} className={c === "" ? "text-right" : i > 0 ? CELL_PAD : ""}>
          {c || "Action"}
        </span>
      ))}
    </div>
  );
}

function SortDropdown({ sort, onToggle }: { sort: "desc" | "asc"; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] text-body transition-colors hover:border-primary/40"
    >
      Sort: {sort === "desc" ? "Newest first" : "Oldest first"}
      <ChevronDown size={14} className="text-muted" />
    </button>
  );
}

/**
 * How much of a listing's booking window is still open: what is free, against
 * the nights already booked and the ones the host has closed by hand. This is
 * the one fact about a property a host cannot get from anywhere else on the
 * page — "Available" only ever answered for tonight, which is a yes on almost
 * every row and says nothing about how much of the window is left to sell.
 *
 * `undefined` while the window is still being read, `null` when it couldn't be.
 */
type Occupancy = { booked: number; blocked: number; total: number };

/**
 * How much of the window is still FREE, banded by colour — green with plenty of
 * dates left, amber around half, red when there is barely anything left to sell.
 *
 * Judged on the free nights and not the booked ones, so the colour and the
 * figure beside it always point the same way: everything coloured on this cell
 * is talking about what is still open. Ordered high to low and read with
 * `.find`, so the first band whose floor the figure clears is the one that
 * applies.
 */
const OCCUPANCY_BANDS = [
  { from: 67, word: "High", track: "bg-green-500", text: "text-green-600" },
  { from: 34, word: "Medium", track: "bg-amber-400", text: "text-amber-600" },
  { from: 0, word: "Low", track: "bg-red-400", text: "text-red-500" },
];

function OccupancyCell({ load }: { load: Occupancy | null | undefined }) {
  if (load === undefined) {
    return (
      <span className={`flex min-w-0 flex-col gap-1.5 ${CELL_PAD}`}>
        <span className="skeleton h-3 w-16 rounded" />
        <span className="skeleton h-1.5 w-full rounded-full" />
      </span>
    );
  }
  if (load === null || load.total <= 0) {
    return <span className={`text-[13px] text-muted/60 ${CELL_PAD}`}>—</span>;
  }
  const { booked, blocked, total } = load;
  const pct = Math.round((booked / total) * 100);
  const blockedPct = Math.round((blocked / total) * 100);
  const free = Math.max(0, total - booked - blocked);
  const freePct = Math.round((free / total) * 100);
  const band = OCCUPANCY_BANDS.find((b) => freePct >= b.from) ?? OCCUPANCY_BANDS[2];
  return (
    <span
      className={`flex min-w-0 flex-col gap-1 ${CELL_PAD}`}
      title={`${band.word} availability — next ${total} nights: ${free} free · ${booked} booked · ${blocked} closed by you`}
    >
      {/* Colour-coded by how much is still free: green with plenty of dates
          left to sell, amber around half, red when the window is nearly gone.
          Only the two ends get a word instead of a figure — a calendar with
          nothing left and one with nothing on it are the two readings worth
          naming outright. */}
      <span className={`truncate text-[12.5px] font-semibold ${band.text}`}>
        {free === 0
          ? "Nothing free"
          : free === total
            ? "All nights free"
            : `${freePct}% free`}
      </span>
      {/* The bar says the same thing the colour does. The nights taken are dark
          and quiet — booked, then the ones the host closed themselves, which are
          not free either but nobody is paying for them — and what is left
          showing through IS the free stretch, in the band's colour. */}
      <span className={`flex h-1.5 w-full overflow-hidden rounded-full ${band.track}`}>
        <span className="h-full bg-ink/55" style={{ width: `${Math.min(100, pct)}%` }} />
        <span
          className="h-full bg-ink/20"
          style={{ width: `${Math.min(100 - Math.min(100, pct), blockedPct)}%` }}
        />
      </span>
      <span className="truncate text-[11px] text-muted">
        {booked} of {total} booked
      </span>
    </span>
  );
}

/**
 * One listing, as the table prints it. The same row anatomy as the booking
 * tables: a photo and the name carrying the row, a quieter second line under
 * each cell for the fact that qualifies it, and the actions gathered at the
 * right-hand end.
 */
function PropertyRow({
  p,
  load,
  onRemove,
  removing,
}: {
  p: Row;
  load: Occupancy | null | undefined;
  onRemove: (id: string, label: string) => void;
  removing: boolean;
}) {
  const label = `${p.city}${p.country ? ", " + p.country : ""}`;
  // The address is what the column shows; city/country only stand in for a
  // listing that has no address on it at all.
  const place = p.address || [p.city, p.country].filter(Boolean).join(", ");
  return (
    <div
      // Only the state worth interrupting for is marked: a taken villa keeps a
      // red rail down its left edge. An available one is simply a row — being
      // bookable is the normal state of nearly every listing here, and a rail
      // repeated down the whole list marked nothing at all.
      className={`${ROW_MINW} rounded-xl border border-line bg-white transition-all duration-200 hover:border-ink/20 hover:shadow-[0_3px_14px_-9px_rgba(20,20,45,0.4)] ${
        p.unavailable ? "border-l-[3px] border-l-red-400" : ""
      }`}
    >
      <div className={`grid ${ROW_GRID} items-center px-4 py-4 text-[13px]`}>
        {/* The property: thumbnail, name, and what it holds. The name is the
            row's identity, so it carries the weight and the link. */}
        <Link
          href={`/villa/${p.id}`}
          // The listing's age lives here now rather than in a column of its
          // own: it is a thing a host looks up occasionally, not something to
          // read down a whole page for.
          title={`${p.title} · ${p.posted}`}
          className="group flex min-w-0 items-center gap-3 pr-3"
        >
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl bg-page ring-1 ring-ink/[0.07]">
            <Img
              src={p.image}
              alt={p.title}
              fallback={PLACEHOLDER_IMG}
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.12]"
            />
          </span>
          <span className="flex min-w-0 flex-col gap-[3px]">
            <span className="truncate text-[13.5px] font-semibold text-ink transition-colors group-hover:text-primary">
              {p.title}
            </span>
            {/* What the villa holds, in full. NOT truncated: this line is a
                list of the property's own rooms and beds, and cutting it at
                "3 rooms · 2 single be…" hides the one part that differs from
                the row above. It wraps onto a second line instead — the row is
                a little taller and the fact is all there. */}
            {p.rooms && (
              <span className="text-[11.5px] leading-[15px] text-muted">{p.rooms}</span>
            )}
          </span>
        </Link>

        {/* Listing type — a chip, because it is one of a small set of values
            and reads as a tag rather than as a sentence. The whole value is
            shown, always: a host who typed their own type under "Others" gets
            a chip two lines tall rather than one with the end cut off. The
            column is sized to hold the longest of the built-in types outright,
            so wrapping is the exception and not the look of the page. */}
        <span className={`flex min-w-0 ${CELL_PAD}`}>
          <span className="w-fit max-w-full whitespace-normal break-words rounded-md border border-line bg-page px-2 py-[3px] text-[11.5px] font-medium leading-[15px] text-body">
            {p.type}
          </span>
        </span>

        {/* Where it is — the address the host typed, which is the only line
            that reliably has anything in it. Two lines at most, since an
            address is a sentence and this is a table; the full text is on the
            hover. A listing with no address at all falls back to city/country,
            and says nothing rather than printing a stray ", India". */}
        <span className={`min-w-0 ${CELL_PAD}`}>
          {place ? (
            <span className="line-clamp-2 text-[12.5px] leading-[16px] text-body" title={place}>
              {place}
            </span>
          ) : (
            <span className="text-[13px] text-muted/60">—</span>
          )}
        </span>

        {/* The nightly rate, with its unit under it rather than trailing it —
            the number is what the eye is scanning down this column for. */}
        <span className={`flex min-w-0 flex-col gap-[3px] ${CELL_PAD}`}>
          <span className="truncate text-[13.5px] font-semibold text-ink">${p.price}</span>
          <span className="text-[11.5px] text-muted">per night</span>
        </span>

        {/* How much of the booking window is spoken for. This replaced a
            "Status" column that read "Available" on nearly every row: it
            answered only for tonight, so it was the same word almost all of the
            time and told a host nothing about how their property is doing.
            Whether a villa is free RIGHT NOW is still marked — it is the red
            rail down the left edge of the row. */}
        <OccupancyCell load={load} />

        {/* Icon buttons. Three text links on every row read as a paragraph of
            controls; the icons are the conventional ones for these actions, and
            each keeps its name for screen readers and as a hover tooltip. */}
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          <Link
            href={`/settings/property/add?edit=${p.id}`}
            aria-label={`Edit ${label || p.title}`}
            title="Edit"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Pencil size={15} aria-hidden />
          </Link>
          <Link
            href={`/villa/${p.id}`}
            aria-label={`View ${label || p.title}`}
            title="View"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-body transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
          >
            <Eye size={15} aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => onRemove(p.id, label || p.title)}
            disabled={removing}
            aria-busy={removing}
            aria-label={`Remove ${label || p.title}`}
            title="Remove"
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-line text-body transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
          >
            {removing ? (
              <span className="spinner block" aria-hidden />
            ) : (
              <Trash2 size={15} aria-hidden />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// "3 weeks ago" style relative time from an ISO string.
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "Just now";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  const units: [number, string][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.345, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = secs;
  let unit = "second";
  for (const [size, name] of units) {
    if (value < size) { unit = name; break; }
    value = Math.floor(value / size);
    unit = name;
  }
  if (unit === "second" && value < 30) return "Just now";
  const rounded = Math.max(1, value);
  return `Posted ${rounded} ${unit}${rounded > 1 ? "s" : ""} ago`;
}

function villaToRow(v: Villa): Row {
  return {
    id: v.id,
    title: v.title,
    image: v.coverImage || PLACEHOLDER_IMG,
    // Older listings predate the field; "Villa" is what the rest of the site
    // shows for them, so the table says the same thing rather than an empty
    // cell that reads as a missing answer.
    type: v.propertyType || "Villa",
    address: v.address || "",
    // The city only. It used to fall back to the title, which printed the
    // property's name a second time directly under itself on any listing with
    // no city set — the line simply goes quiet instead.
    city: v.city || "",
    country: v.country || "",
    price: v.pricePerNight,
    posted: timeAgo(v.createdAt),
    createdAt: v.createdAt,
    unavailable: v.isAvailable ? "" : v.unavailableReason || "Booked",
    rooms: [
      `${v.bedrooms} room${v.bedrooms === 1 ? "" : "s"}`,
      v.singleBedRooms
        ? `${v.singleBedRooms} single bed${v.singleBedRooms === 1 ? "" : "s"}`
        : "",
      v.doubleBedRooms
        ? `${v.doubleBedRooms} double bed${v.doubleBedRooms === 1 ? "" : "s"}`
        : "",
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export default function MyPropertyPage() {
  const { user, ready } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [villas, setVillas] = useState<Villa[] | null>(null);
  // A failed load is not the same thing as "you have no listings".
  const [loadError, setLoadError] = useState("");
  const [banner, setBanner] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  // Per-villa occupancy, keyed by villa id. A key that is absent means "still
  // reading" and a `null` value means "couldn't read it" — the two look
  // different in the row, and neither holds the rest of the table up.
  const [loads, setLoads] = useState<Record<string, Occupancy | null>>({});
  // Newest listing first by default — the one just added is the one the host
  // came back to look at.
  const [sort, setSort] = useState<"desc" | "asc">("desc");

  // Take a villa off the platform, after confirming. On success drop it from
  // this list.
  //
  // The confirmation says what actually happens, which is not a deletion: the
  // listing stops being findable and bookable, and the stays already booked on
  // it carry on to their end — the host still checks those guests in and out
  // from Rent Requests. Telling a host their property will be "permanently
  // deleted" while their calendar still holds paid stays would be a promise
  // the platform can't keep, and would talk hosts out of a removal that is in
  // fact safe to make.
  async function handleRemove(id: string, label: string) {
    if (removingId) return;
    const ok = await confirm({
      title: "Remove this property?",
      message:
        `"${label}" will stop appearing in search and on MyVilla, and no one ` +
        `will be able to book it. Any stays already booked go ahead as normal ` +
        `— you'll still check those guests in and out from Rent Requests. ` +
        `Its discount codes will be switched off.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    setRemovingId(id);
    try {
      await deleteVilla(id);
      setVillas((prev) => {
        const next = prev ? prev.filter((v) => v.id !== id) : prev;
        // Keep the sidebar's host-only sections in sync: removing the last
        // property hides Rent Requests + Coupons right away.
        if (next && user) setVillaCount(user.id, next.length);
        return next;
      });
      toast.success("Property removed.");
    } catch {
      setBanner({ kind: "error", text: "Could not remove the property. Please try again." });
    } finally {
      setRemovingId(null);
    }
  }

  // One-time toast after publishing (?added=1) or editing (?updated=1).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("added") === "1") {
      toast.success("Your villa has been published successfully.");
    } else if (params.get("updated") === "1") {
      toast.success("Your villa has been updated successfully.");
    }
    if (params.has("added") || params.has("updated")) {
      // Clean the URL so a refresh doesn't re-show the toast.
      window.history.replaceState({}, "", "/settings/property");
    }
    // Runs once on mount — `toast` is stable, and re-running would double-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the user's real villas from the backend.
  const load = useCallback(() => {
    fetchMyVillas()
      .then((vs) => {
        setVillas(vs);
        // Refresh the sidebar's host-only sections off the real count.
        if (user) setVillaCount(user.id, vs.length);
      })
      .catch((e) =>
        setLoadError(e instanceof Error ? e.message : "Could not load your properties.")
      );
  }, [user]);

  useEffect(() => {
    if (ready && user) load();
  }, [ready, user, load]);

  // How much of each villa's window is taken. A second read, on purpose: the
  // list itself must not wait on it — every other column is already on screen
  // while these land, and each row shows a placeholder bar until its own
  // answer arrives. One request per property, in parallel; a host has a handful
  // of them, and the alternative is a booking-shaped calculation done in the
  // browser off data the list query doesn't carry.
  useEffect(() => {
    if (!villas || villas.length === 0) return;
    let cancelled = false;
    Promise.all(
      villas.map((v) => {
        // The host's own window, which is what "how booked is it" has to be
        // measured against — a 30-day window half full is not the same property
        // as a 365-day one half full. Clamped so a wild value can't ask the
        // server for years of dates.
        const days = Math.min(Math.max(v.availabilityDays || 30, 7), 365);
        return fetchVillaAvailability(v.id, days)
          .then((a) => {
            // `total` is the window the server actually answered for, counted
            // off its own two ends rather than assumed from `days` — the two
            // differ whenever the host's bookable-until date lands first.
            const start = new Date(a.windowStart).getTime();
            const end = new Date(a.windowEnd).getTime();
            const nights =
              Number.isNaN(start) || Number.isNaN(end)
                ? days
                : Math.max(1, Math.round((end - start) / 86_400_000));
            const load: Occupancy = {
              booked: a.bookedDates?.length ?? 0,
              blocked: a.blockedDates?.length ?? 0,
              total: nights,
            };
            return [v.id, load] as const;
          })
          .catch(() => [v.id, null] as const);
      })
    ).then((entries) => {
      if (!cancelled) setLoads(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [villas]);

  function retryLoad() {
    setLoadError("");
    setVillas(null);
    load();
  }

  // Guard: only signed-in users can view their properties.
  if (!ready) return <div className="min-h-[60vh]" />;

  if (!user) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-body flex-col items-center justify-center px-5 text-center">
        <h1 className="text-[22px] font-bold text-ink">You&apos;re signed out</h1>
        <p className="mt-2 text-[14px] text-body">
          Please sign in to view your properties.
        </p>
        <Link
          href="/"
          className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-primary-dark"
        >
          Back to home
        </Link>
      </div>
    );
  }

  // Only the user's real villas — no dummy fallback. `null` = still loading.
  // Ordered by when each was listed. An unreadable date sorts as 0 rather than
  // returning NaN from the comparator, which would leave the order undefined.
  const stamp = (r: Row) => {
    const t = new Date(r.createdAt).getTime();
    return Number.isNaN(t) ? 0 : t;
  };
  const rows: Row[] | null = villas
    ? villas
        .map(villaToRow)
        .sort((a, b) => (sort === "desc" ? stamp(b) - stamp(a) : stamp(a) - stamp(b)))
    : null;

  return (
    <div className="mx-auto w-full max-w-body px-5 pb-16 pt-4 lg:px-7">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]">
        {/* Left sidebar */}
        <aside>
          <SettingsSidebar />
        </aside>

        {/* Right — property owned card */}
        <div className="w-full rounded-2xl border border-line bg-white p-6 sm:p-8">
          {banner && (
            <div
              role={banner.kind === "error" ? "alert" : "status"}
              className={`mb-5 flex items-start justify-between gap-3 rounded-lg px-3.5 py-2.5 text-[13px] font-medium ${
                banner.kind === "error"
                  ? "bg-red-50 text-red-600"
                  : "bg-primary/5 text-primary"
              }`}
            >
              <span>{banner.text}</span>
              <button
                type="button"
                onClick={() => setBanner(null)}
                aria-label="Dismiss message"
                className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          )}

          {/* Header — sticks flush against the pinned "Manage Account" bar
              (navbar 68px + its collapsed 51px = 119px), NOT lower: any gap
              between the two becomes a slot the scrolling list is visible
              through, which is exactly what 135px left. Erring a few px UNDER
              that 119 is the safe direction — the bar is z-30 against this
              z-20, so the overlap simply tucks behind it, while erring over
              re-opens the slot. It cancels the card's own top padding (-mt)
              and carries its own even py-4 instead, so the title and button
              sit centred in the band rather than pushed down by two paddings
              stacked. */}
          <div
            className={`sticky top-[116px] z-20 -mx-6 flex items-center justify-between rounded-t-2xl border-b border-line bg-white px-6 py-4 sm:-mx-8 sm:px-8 ${
              // Only reach up into the card's padding when nothing is above it —
              // with a banner showing, that pull would ride over it.
              banner ? "" : "-mt-6 sm:-mt-8"
            }`}
          >
            {/* Label first, count as a pill after it — the same heading shape
                the Bookings and Rent Requests tables carry. */}
            <h2 className="flex items-center gap-2 text-[16px] font-bold text-ink">
              Property Owned
              {rows !== null && <CountPill value={rows.length} />}
            </h2>
            <div className="flex items-center gap-2.5">
              {/* Nothing to order until there is more than one listing. */}
              {rows !== null && rows.length > 1 && (
                <SortDropdown
                  sort={sort}
                  onToggle={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
                />
              )}
              <Link
                href="/settings/property/add"
                className="rounded-lg bg-primary px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Add Property
              </Link>
            </div>
          </div>

          {/* Property list */}
          {loadError ? (
            <div className="mt-6 flex flex-col items-center rounded-xl border border-dashed border-line px-4 py-14 text-center">
              <p className="text-[15px] font-semibold text-ink">
                Couldn&apos;t load your properties
              </p>
              <p className="mt-1 max-w-[320px] text-[13px] text-muted">{loadError}</p>
              <button
                type="button"
                onClick={retryLoad}
                className="mt-5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                Try again
              </button>
            </div>
          ) : (
            /* The table itself. It scrolls sideways inside the card rather than
               letting seven columns crush each other on a narrow window — the
               same treatment the Bookings and Rent Requests tables get. */
            <div className="overflow-x-auto">
              <ColumnHeadings />

              <div className="mt-2.5 space-y-3">
                {rows === null ? (
                  // 76px is what a real row measures: py-4 either side of a
                  // 44px thumbnail. A shorter placeholder makes the whole list
                  // jump the moment the data lands.
                  Array.from({ length: 3 }, (_, i) => (
                    <div key={i} className={`skeleton h-[76px] rounded-xl ${ROW_MINW}`} />
                  ))
                ) : rows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line px-4 py-14 text-center">
                    <p className="text-[15px] font-semibold text-ink">No properties yet</p>
                    {/* No call to action here on purpose — "Add Property"
                        already sits in the header right above this panel. */}
                    <p className="mx-auto mt-1 max-w-[320px] text-[13px] text-muted">
                      You haven&apos;t listed any villa. Use “Add Property” above to
                      list your first one and start hosting.
                    </p>
                  </div>
                ) : (
                  rows.map((p) => (
                    <PropertyRow
                      key={p.id}
                      p={p}
                      load={loads[p.id]}
                      onRemove={handleRemove}
                      removing={removingId === p.id}
                    />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
