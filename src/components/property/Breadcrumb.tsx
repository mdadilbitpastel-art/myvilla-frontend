import Link from "next/link";

// Map known breadcrumb labels to real routes; others stay non-navigating.
const HREFS: Record<string, string> = {
  Home: "/",
  Villas: "/search",
  "Legal Terms": "/terms",
  "Terms of Service": "/terms",
  "Privacy Policy": "/privacy",
};

/** A plain label (routed through HREFS) or a label carrying its own route. */
export type Crumb = string | { label: string; href?: string };

export default function Breadcrumb({
  items,
  compact = false,
}: {
  items: Crumb[];
  /** One tight line — used while the page header is stuck to the navbar. */
  compact?: boolean;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-x-2 ${
        compact
          ? "mb-1 flex-nowrap overflow-hidden whitespace-nowrap text-[12px]"
          : "mb-6 flex-wrap gap-y-1 text-[13px] sm:text-[14px]"
      }`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const label = typeof item === "string" ? item : item.label;
        const href = typeof item === "string" ? HREFS[label] : item.href ?? HREFS[label];
        return (
          <span key={`${label}-${i}`} className="flex min-w-0 items-center gap-2">
            {isLast || !href ? (
              <span className={`truncate ${isLast ? "text-muted" : "text-ink"}`}>{label}</span>
            ) : (
              <Link href={href} className="truncate text-ink underline underline-offset-2 hover:text-primary">
                {label}
              </Link>
            )}
            {!isLast && <span className="text-muted">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
