"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { label: "Settings", href: "/settings" },
  { label: "Profile Settings", href: "/settings/profile" },
  { label: "My Property", href: "/settings/property" },
  { label: "My Bookings", href: "/settings/bookings" },
  { label: "Rent Requests", href: "/settings/rent-requests" },
];

// Longest matching href wins, so nested routes (e.g. /settings/property/add)
// highlight their section instead of falling back to "Settings".
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
    <nav className="flex flex-col gap-4 lg:sticky lg:top-[84px]">
      {ITEMS.map((item) => {
        const isActive = current === item.label;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "text-[15px] font-bold text-primary"
                : "text-[15px] text-ink transition-colors hover:text-primary"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
