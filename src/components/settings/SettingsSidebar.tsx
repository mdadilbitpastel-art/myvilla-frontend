import Link from "next/link";

const ITEMS = [
  { label: "Settings", href: "/settings" },
  { label: "Profile Settings", href: "/settings/profile" },
  { label: "My Property", href: "/settings/property" },
  { label: "My Bookings", href: "/settings/bookings" },
  { label: "Rent Requests", href: "/settings/rent-requests" },
];

export default function SettingsSidebar({ active }: { active: string }) {
  return (
    <nav className="flex flex-col gap-4">
      {ITEMS.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={
            active === item.label
              ? "text-[16px] font-bold text-primary"
              : "text-[15px] text-ink transition-colors hover:text-primary"
          }
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
