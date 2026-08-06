"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UserCircle,
  Building2,
  CalendarDays,
  Inbox,
  BadgePercent,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { AuthUser } from "@/lib/api";
import { useAccountCounts } from "@/lib/useProperty";

type Item = {
  label: string;
  href: string;
  icon: LucideIcon;
  desc: string;
  // Host-only sections only make sense once the user has listed a property, so
  // they're hidden until then and hide again if the last property is removed.
  hostOnly?: boolean;
  /** What to say under the label when this section is empty. A nav that only
   *  ever lists doors tells you nothing about which of them are worth opening;
   *  a host who has listed nothing should be able to see that from here. */
  emptyNote?: string;
};

// "Manage Account" itself is the page heading, not one of these — the hub has
// nothing of its own to show, so it is never a selectable item.
const ITEMS: Item[] = [
  {
    label: "Profile Settings",
    href: "/settings/profile",
    icon: UserCircle,
    desc: "Your details and contact information",
  },
  {
    label: "My Property",
    href: "/settings/property",
    icon: Building2,
    desc: "The villas you have listed",
    emptyNote: "No property added",
  },
  {
    label: "My Bookings",
    href: "/settings/bookings",
    icon: CalendarDays,
    desc: "Stays you have reserved",
    emptyNote: "No bookings yet",
  },
  {
    label: "Rent Requests",
    href: "/settings/rent-requests",
    icon: Inbox,
    desc: "Requests from guests on your villas",
    hostOnly: true,
    emptyNote: "0 requests",
  },
  {
    label: "Coupons",
    href: "/settings/coupons",
    icon: BadgePercent,
    desc: "Discount codes for your villas",
    hostOnly: true,
    emptyNote: "0 coupons",
  },
];

export { ITEMS as SETTINGS_SECTIONS };

/**
 * The profile details a complete account has. Exactly the fields the profile
 * page asks for and calls "Not provided" when they're blank — the note in the
 * nav and the empty line on the page have to be talking about the same thing.
 * The photo is not among them: an account without one is not unfinished.
 */
const PROFILE_FIELDS = [
  "fullName",
  "phoneNumber",
  "gender",
  "dateOfBirth",
  "address",
] as const;

function profilePending(user: AuthUser | null): boolean {
  if (!user) return false;
  return PROFILE_FIELDS.some((f) => !String(user[f] || "").trim());
}

// Longest matching href wins, so nested routes (e.g. /settings/property/add)
// highlight their section.
function activeFromPath(pathname: string): string | null {
  let best: (typeof ITEMS)[number] | null = null;
  for (const item of ITEMS) {
    const matches = pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (matches && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.label ?? null;
}

export default function SettingsSidebar({ active }: { active?: string }) {
  const pathname = usePathname();
  const current = active ?? activeFromPath(pathname ?? "");
  const { user } = useAuth();
  const { villas, bookings, rentRequests, coupons, ready } = useAccountCounts();
  const pending = profilePending(user);

  // Nothing at all until the counts land, and then the whole nav at once.
  //
  // It used to render immediately with whatever it knew, which on a hard
  // refresh was nothing: the three ordinary sections drew straight away and
  // Rent Requests and Coupons dropped in afterwards, once the villa count came
  // back — the list assembling itself in front of the reader, and the item they
  // were reaching for moving as they reached. A row of placeholders holds the
  // shape for that moment instead, and every section appears together.
  if (!ready) {
    return (
      <nav aria-busy className="flex flex-col gap-6 lg:sticky lg:top-[151px]">
        {ITEMS.map((item) => (
          <span key={item.label} className="flex items-center gap-4">
            <span className="skeleton h-8 w-8 shrink-0 rounded-full" />
            <span className="skeleton h-3.5 w-28 rounded" />
          </span>
        ))}
      </nav>
    );
  }

  // Host-only sections appear once the user owns a property. Until they do,
  // they're kept out of the nav entirely.
  //
  // Rent requests count too, and have to: a host who removes their last
  // property still has the stays booked on it to see through — those guests
  // are still checked in and out from that section, because a removal on
  // MyVilla takes the LISTING down, not the bookings. Gating on the villa
  // count alone would hide the section from the one host who most needs it,
  // the moment they need it.
  //
  // The section you're actually on is the last exception: it can be open on a
  // refresh that resolves to neither, and dropping it would leave the nav with
  // nothing highlighted — as if the refresh had moved you elsewhere.
  const hosts = (villas ?? 0) > 0 || (rentRequests ?? 0) > 0;
  const items = ITEMS.filter(
    (item) => !item.hostOnly || hosts || item.label === current
  );

  // The count that decides whether a section is empty. Null means the server
  // didn't say, and an unknown count marks nothing — silence is the honest
  // reading, not "you have none".
  const countFor = (label: string): number | null =>
    label === "My Property"
      ? villas
      : label === "My Bookings"
        ? bookings
        : label === "Rent Requests"
          ? rentRequests
          : label === "Coupons"
            ? coupons
            : null;

  // What to say under a section's name, if anything. Two different kinds of
  // note, and they are not the same colour: an empty section is a fact and sits
  // quiet, while a half-filled profile is something to go and do.
  const noteFor = (item: Item): { text: string; warn: boolean } | null => {
    if (item.label === "Profile Settings") {
      return pending ? { text: "Update profile", warn: true } : null;
    }
    if (item.emptyNote && countFor(item.label) === 0) {
      return { text: item.emptyNote, warn: false };
    }
    return null;
  };

  return (
    // Sticky below the 68px header so only the settings panel on the right
    // scrolls. The wrapping <aside> keeps its stretched full-row height, which
    // is exactly the room this needs to travel in.
    // Parks below the pinned "Manage Account" header (navbar + its collapsed
    // height), so the section list never slides underneath it.
    <nav className="flex flex-col gap-6 lg:sticky lg:top-[151px]">
      {items.map((item) => {
        const { label, href, icon: Icon } = item;
        const isActive = current === label;
        const note = noteFor(item);
        return (
          <Link key={label} href={href} aria-current={isActive ? "page" : undefined} className="flex items-center gap-4">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                isActive ? "bg-primary text-white" : "bg-[#c9cdd6] text-white"
              }`}
            >
              <Icon size={16} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-col">
              <span
                className={`text-[15px] transition-colors hover:text-primary ${
                  isActive ? "font-semibold text-primary" : "text-ink"
                }`}
              >
                {label}
              </span>
              {/* Either this section has nothing in it, or it has something
                  outstanding. Said here, under the name, so the state of the
                  account can be read without opening five pages — and so a
                  section never used doesn't look the same as a full one. */}
              {note && (
                <span
                  className={`text-[11.5px] leading-[15px] ${
                    note.warn ? "font-medium text-orange-500" : "text-muted"
                  }`}
                >
                  {note.text}
                </span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
