"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle, Building2, CalendarDays, Inbox, type LucideIcon } from "lucide-react";

// "Manage Account" itself is the page heading, not one of these — the hub has
// nothing of its own to show, so it is never a selectable item.
const ITEMS: { label: string; href: string; icon: LucideIcon; desc: string }[] = [
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
  },
  {
    label: "My Bookings",
    href: "/settings/bookings",
    icon: CalendarDays,
    desc: "Stays you have reserved",
  },
  {
    label: "Rent Requests",
    href: "/settings/rent-requests",
    icon: Inbox,
    desc: "Requests from guests on your villas",
  },
];

export { ITEMS as SETTINGS_SECTIONS };

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

  return (
    // Sticky below the 68px header so only the settings panel on the right
    // scrolls. The wrapping <aside> keeps its stretched full-row height, which
    // is exactly the room this needs to travel in.
    // Parks below the pinned "Manage Account" header (navbar + its collapsed
    // height), so the section list never slides underneath it.
    <nav className="flex flex-col gap-6 lg:sticky lg:top-[151px]">
      {ITEMS.map(({ label, href, icon: Icon }) => {
        const isActive = current === label;
        return (
          <Link key={label} href={href} aria-current={isActive ? "page" : undefined} className="flex items-center gap-4">
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
                isActive ? "bg-primary text-white" : "bg-[#c9cdd6] text-white"
              }`}
            >
              <Icon size={16} aria-hidden />
            </span>
            <span
              className={`text-[15px] transition-colors hover:text-primary ${
                isActive ? "font-semibold text-primary" : "text-ink"
              }`}
            >
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
