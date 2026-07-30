"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";

/** Height of the site header this bar sticks below (see Navbar). */
const NAV_HEIGHT = 68;

/** One step of the "Home / … / This page" line above the title. */
export type Crumb = {
  label: string;
  /** Omit on the last step — it reads as the current page, not a link. */
  href?: string;
  /** Clamp a long label (a villa title) to one line. */
  truncate?: boolean;
};

/**
 * The page heading used everywhere outside the landing and search pages: a
 * full-width bar pinned under the navbar carrying the breadcrumb and the page
 * title, which tightens up (smaller title, thinner padding, a hairline border)
 * once it passes under the navbar.
 *
 * "Manage Account" is the reference this was lifted from, so every page that
 * uses it gets that exact type scale, spacing and collapse behaviour rather
 * than a near-miss of its own.
 */
export default function PageHeader({
  crumbs,
  title,
  subtitle,
  action,
  children,
}: {
  /** The trail above the title. Omit it on a page that has no useful one. */
  crumbs?: Crumb[];
  title: string;
  /** One supporting line under the title; it folds away on collapse. */
  subtitle?: React.ReactNode;
  /** Right-hand affordance on the title row (a "Back" / "Cancel" link). */
  action?: React.ReactNode;
  /** Extra content pinned inside the bar, below the title row. */
  children?: React.ReactNode;
}) {
  // The sentinel sits above the bar: once it slips under the navbar the bar is
  // pinned, and that's exactly when it should collapse. Set as a ref callback
  // rather than in an effect, because on some pages the header only mounts
  // once auth (or the villa) has resolved.
  const [scrolled, setScrolled] = useState(false);
  const observer = useRef<IntersectionObserver | null>(null);
  const sentinel = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    if (!node) return;
    observer.current = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { rootMargin: `-${NAV_HEIGHT}px 0px 0px 0px`, threshold: 0 }
    );
    observer.current.observe(node);
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="h-px" />
      {/* Full-width bar, page-width text — the background has to cover the
          viewport (and be solid: content scrolls behind it) while the heading
          stays on the content grid. Render this OUTSIDE the page's own
          max-width container, or the bar stops at the container's edge. */}
      <div
        className={`sticky top-[68px] z-30 border-b bg-page transition-all duration-200 ${
          scrolled ? "border-line py-2.5" : "border-transparent pb-4 pt-5"
        }`}
      >
        <div className="mx-auto w-full max-w-body px-5 lg:px-7">
          <div>
            <div className="min-w-0">
              {/* Nothing is rendered without crumbs — an empty nav would still
                  push the title down by its own line height. */}
              {!!crumbs?.length && (
              <nav
                aria-label="Breadcrumb"
                className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-body"
              >
                {crumbs.map((c, i) => {
                  const isLast = i === crumbs.length - 1;
                  return (
                    <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-x-1.5">
                      {isLast || !c.href ? (
                        <span
                          className={`text-muted ${c.truncate ? "max-w-[220px] truncate" : ""}`}
                        >
                          {c.label}
                        </span>
                      ) : (
                        <Link
                          href={c.href}
                          className={`underline underline-offset-2 hover:text-primary ${
                            c.truncate ? "max-w-[220px] truncate" : ""
                          }`}
                        >
                          {c.label}
                        </Link>
                      )}
                      {!isLast && <span className="text-muted">/</span>}
                    </span>
                  );
                })}
              </nav>
              )}
              {/* The action shares the title's row and is centred against it,
                  so a "Back" / "Cancel" link reads as belonging to the heading
                  rather than floating up beside the breadcrumb. */}
              <div
                className={`flex items-center justify-between gap-4 transition-all duration-200 ${
                  crumbs?.length ? (scrolled ? "mt-0.5" : "mt-2") : ""
                }`}
              >
                <h1
                  className={`min-w-0 font-extrabold text-ink transition-all duration-200 ${
                    scrolled ? "text-[20px]" : "text-[30px]"
                  }`}
                >
                  {title}
                </h1>
                {action && <div className="shrink-0">{action}</div>}
              </div>
            </div>
          </div>

          {subtitle && (
            <p
              className={`overflow-hidden text-[13px] text-muted transition-all duration-200 ${
                scrolled ? "mt-0 max-h-0 opacity-0" : "mt-2 max-h-6 opacity-100"
              }`}
            >
              {subtitle}
            </p>
          )}
          {children}
        </div>
      </div>
    </>
  );
}

/** The one style for a header's right-hand link, so they all match. */
export const pageHeaderAction =
  "text-[15.5px] font-medium text-ink underline underline-offset-2 hover:text-primary";
