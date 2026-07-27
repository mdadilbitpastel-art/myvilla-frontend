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
  // Same type scale, colours and spacing as the breadcrumb in the shared
  // PageHeader — the size does NOT change as the header collapses, only the
  // wrapping does, so the line reads identically on every page.
  return (
    <nav
      aria-label="Breadcrumb"
      className={`flex items-center gap-x-1.5 text-[13px] text-body ${
        compact ? "flex-nowrap overflow-hidden whitespace-nowrap" : "flex-wrap gap-y-1"
      }`}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const label = typeof item === "string" ? item : item.label;
        const href = typeof item === "string" ? HREFS[label] : item.href ?? HREFS[label];
        return (
          <span key={`${label}-${i}`} className="flex min-w-0 items-center gap-x-1.5">
            {isLast || !href ? (
              <span className={`truncate ${isLast ? "text-muted" : ""}`}>{label}</span>
            ) : (
              <Link href={href} className="truncate underline underline-offset-2 hover:text-primary">
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
