"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

// The add/edit villa flow is a page in its own right, with its own header and
// breadcrumb — it borrows the settings routes, not the settings chrome.
const OWN_HEADER = ["/settings/property/add"];

// Height of the site header this page's own header sticks below (see Navbar).
const NAV_HEIGHT = 68;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { user, ready } = useAuth();

  // The sentinel sits above the header: once it passes under the navbar the
  // header is pinned, and that is exactly when it should tighten up. Set as a
  // ref callback rather than in an effect, because the header only mounts once
  // auth has resolved.
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

  // One heading for the whole account area: it stays put as the tabs change,
  // and never appears over a signed-out or still-loading page.
  const showHeader =
    ready && !!user && !OWN_HEADER.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!showHeader) return <>{children}</>;

  return (
    // The header and the page share this wrapper on purpose: a sticky element
    // can only travel inside its own parent, so a wrapper around the header
    // alone would pin it for exactly its own height and no further.
    <div>
      <div ref={sentinel} aria-hidden className="h-px" />
      {/* Full-width bar, page-width text — the background has to cover the
          viewport (and be solid: content scrolls behind it) while the heading
          stays on the content grid. */}
      <div
        className={`sticky top-[68px] z-30 border-b bg-page transition-all duration-200 ${
          scrolled ? "border-line py-2.5" : "border-transparent pb-4 pt-5"
        }`}
      >
        <div className="mx-auto w-full max-w-[1000px] px-5 lg:px-7">
          <nav aria-label="Breadcrumb" className="text-[13px] text-body">
            <Link href="/" className="underline underline-offset-2 hover:text-primary">
              Home
            </Link>
            <span className="mx-1.5 text-muted">/</span>
            <span className="text-muted">Manage Account</span>
          </nav>
          <h1
            className={`font-extrabold text-ink transition-all duration-200 ${
              scrolled ? "mt-0.5 text-[20px]" : "mt-2 text-[30px]"
            }`}
          >
            Manage Account
          </h1>
        </div>
      </div>
      {children}
    </div>
  );
}
