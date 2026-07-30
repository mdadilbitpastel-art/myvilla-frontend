"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, UserCog, LogOut, Heart } from "lucide-react";
import AuthModal from "@/components/auth/AuthModal";
import Avatar from "@/components/ui/Avatar";
import { useAuth } from "@/lib/auth";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Villas", href: "/search" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Signin", href: "#" },
];

// Which nav link is active for the current route.
function isActive(href: string, pathname: string): boolean {
  if (href === "#") return false;
  if (href === "/") return pathname === "/";
  // "Villas" (/search) also stays active while browsing a villa's pages.
  if (href === "/search") return pathname === "/search" || pathname.startsWith("/villa");
  return pathname === href || pathname.startsWith(href + "/");
}

export function Logo({
  className = "",
  onClick,
  /** The header's mark is alive; the footer's is the same wordmark at rest. */
  animated = true,
}: {
  className?: string;
  onClick?: () => void;
  animated?: boolean;
}) {
  return (
    <Link
      href="/"
      onClick={onClick}
      aria-label="MyVilla.com — home"
      className={`text-[22px] font-bold tracking-tight ${animated ? "logo-mark" : ""} ${className}`}
    >
      <span className="text-ink">My</span>
      {/* Animated, the sheen is painted through the text, so the colour lives
          in CSS; at rest it's simply the brand colour. */}
      <span className={animated ? "logo-villa" : "text-primary"}>Villa</span>
      <span className={`text-ink ${animated ? "logo-com" : ""}`}>
        {animated ? <span className="logo-dot">.</span> : "."}com
      </span>
    </Link>
  );
}

/**
 * A quiet stand-in for whichever control auth is about to resolve to.
 *
 * The session is restored on the client, so for the first frames the header
 * genuinely doesn't know who is asking. Guessing "Get Started" and then
 * swapping it for "My Account" reads as the page changing its mind about you;
 * a placeholder of the same size simply finishes loading.
 */
function AuthSkeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`animate-pulse rounded-full bg-line ${className}`}
    />
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, ready, signOut, authMode, openAuth, closeAuth } = useAuth();
  const loggedIn = !!user;
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  // While its menu is open the account pill holds the look hover gave it — the
  // deepened fill, and the glint parked off the right edge — instead of
  // tracking the pointer: replaying either one under the pill's own open panel
  // reads as the trigger fidgeting. Closing the menu returns both, in reverse.
  //
  // That return has to survive :hover, or a cursor still resting on the button
  // would hold it deep and fling the glint straight back out. So on close it's
  // pinned at rest until the pointer actually leaves — and only when the
  // pointer is on it, since a menu closed from elsewhere isn't hovered anyway.
  const [restHeld, setRestHeld] = useState(false);
  const pillHoverRef = useRef(false);
  useEffect(() => {
    if (!menuOpen) return;
    return () => setRestHeld(pillHoverRef.current);
  }, [menuOpen]);

  // How deep the pill's fill sits. `bg-primary` is on the element; this only
  // says when it darkens, and whether hover is what asks for it.
  const pillTone = menuOpen
    ? "bg-primary-dark"
    : restHeld
      ? ""
      : "hover:bg-primary-dark";

  // Close the account dropdown on Escape (returning focus to its trigger) or on
  // any press outside it. A click-away <div> overlay can't do the latter job:
  // it renders inside the header's z-50 stacking context, so anything on the
  // page with its own stacking context swallowed the click before it landed.
  useEffect(() => {
    if (!menuOpen) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.querySelector("button")?.focus();
    }

    // The trigger lives inside menuRef, so its own toggle still wins here.
    function onPressOutside(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      setMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPressOutside);
    document.addEventListener("touchstart", onPressOutside);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPressOutside);
      document.removeEventListener("touchstart", onPressOutside);
    };
  }, [menuOpen]);

  // Route changes should never leave a menu hanging open over the new page.
  useEffect(() => {
    setOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  function handleLogout() {
    setMenuOpen(false);
    setOpen(false);
    // signOut() clears the session and opens the sign-in popup.
    signOut();
  }

  // Once signed in the "Signin" tab disappears from the nav.
  const navLinks = loggedIn
    ? NAV_LINKS.filter((l) => l.label !== "Signin")
    : NAV_LINKS;

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white">
      <div className="flex h-[68px] w-full items-center justify-between px-5 lg:px-7">
        {/* The auth modal's backdrop starts below the 68px header, so the nav
            stays clickable while it's open. Navigating away has to take the
            modal with it — closed on click rather than on pathname change,
            because /reset-password deliberately navigates first and opens the
            sign-in modal second. */}
        <Logo onClick={closeAuth} />

        {/* Right group: nav links + CTA (logo stays left-most, button right-most) */}
        <div className="flex items-center gap-8">
          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) =>
              link.label === "Signin" ? (
                // Held as a placeholder until we know: this tab disappears
                // entirely for a signed-in guest, so showing it early would
                // make the nav shuffle its items after the session lands.
                !ready ? (
                  <AuthSkeleton key={link.label} className="h-[13px] w-11" />
                ) : (
                  <button
                    key={link.label}
                    type="button"
                    onClick={() => openAuth("signin")}
                    className="text-[15px] text-muted transition-colors hover:text-ink"
                  >
                    {link.label}
                  </button>
                )
              ) : link.href === "#" ? (
                // No destination built yet. Rendering these as <Link href="#">
                // made every click jump the page to the top.
                <button
                  key={link.label}
                  type="button"
                  aria-disabled="true"
                  className="text-[15px] text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={closeAuth}
                  aria-current={isActive(link.href, pathname) ? "page" : undefined}
                  className={`text-[15px] transition-colors hover:text-ink ${
                    isActive(link.href, pathname) ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {!ready ? (
            // Sized to the account pill, the taller of the two possible
            // controls, so the header's height never settles twice.
            <AuthSkeleton className="hidden h-[38px] w-[136px] sm:block" />
          ) : loggedIn ? (
            <div ref={menuRef} className="relative hidden sm:block">
              {/* A pill carrying the signed-in face: who you are is the point
                  of this control, so the avatar leads and the label follows. */}
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                onMouseEnter={() => {
                  pillHoverRef.current = true;
                }}
                onMouseLeave={() => {
                  pillHoverRef.current = false;
                  setRestHeld(false);
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                // The plain brand fill every other button in the app uses,
                // deepening to primary-dark on hover exactly as "Edit profile"
                // does. It was a two-stop gradient running out to #8a7dff,
                // which pulled it violet — next to the solid primary buttons
                // it read as a different colour rather than the same one.
                className={`group relative flex items-center gap-2 overflow-hidden rounded-full bg-primary py-1 pl-1 pr-3.5 text-[14px] font-semibold text-white transition-all duration-200 active:translate-y-0 active:scale-[0.98] ${pillTone} ${
                  // Open, the pill stays raised — it's the menu's anchor, and
                  // dropping back down while the panel is still there read as
                  // the two coming apart. It settles when the menu closes,
                  // alongside the colour rather than hanging up there alone.
                  // Ordinary neutral shadows: the purple glow they replace was
                  // the other half of what made this control shout.
                  menuOpen
                    ? "-translate-y-0.5 shadow-md"
                    : restHeld
                      ? "shadow-sm"
                      : "shadow-sm hover:-translate-y-0.5 hover:shadow-md"
                }`}
              >
                {/* A light bar that sweeps across the pill on hover. Parked off
                    the left edge and slid clear of the right one, so it only
                    ever reads as a glint travelling over the fill. Softened to
                    white/20 with the gradient gone: at /25 it was a bright band
                    crossing a flat colour rather than a highlight. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-white/20 blur-[3px] transition-transform duration-700 ease-out ${
                    menuOpen
                      ? "translate-x-[400%]"
                      : restHeld
                        ? ""
                        : "group-hover:translate-x-[400%]"
                  }`}
                />
                {/* The contents sit above the sheen — a positioned sibling would
                    otherwise paint over unpositioned ones. */}
                <span className="relative rounded-full bg-white/25 p-[2px] ring-1 ring-white/40 transition-transform duration-200 group-hover:scale-105">
                  <Avatar
                    src={user?.avatar}
                    name={user?.fullName}
                    gender={user?.gender}
                    size={26}
                  />
                </span>
                <span className="relative">My Account</span>
                <ChevronDown
                  size={16}
                  className={`relative transition-transform duration-200 ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="animate-fade-in absolute right-0 top-[calc(100%+8px)] z-50 w-60 rounded-xl bg-white shadow-[0_14px_36px_rgba(20,20,40,0.18)]"
                >
                  {/* No outline — the tie to the button is a bar in its colour
                      across the top, and a notch of the same colour pointing
                      up at the button's bottom-right corner. */}
                  <span
                    aria-hidden
                    className="absolute -top-[7px] right-4 h-[14px] w-[14px] rotate-45 rounded-tl-[3px] bg-primary"
                  />
                  {/* The items ride above the notch and are clipped to the
                      panel's radius, so a hover fill can't square off a corner. */}
                  <div className="relative overflow-hidden rounded-xl">
                  <span aria-hidden className="block h-[3px] bg-primary" />
                  <div className="py-1.5">
                  {/* Who you're signed in as, at the head of the menu the way
                      an account menu usually states it: avatar, name, email.
                      The name only shows once there is one — a profile nobody
                      has filled in shouldn't leave a blank line where a name
                      would be. */}
                  <div className="flex items-center gap-2.5 border-b border-line px-4 pb-3 pt-1.5">
                    <Avatar
                      src={user?.avatar}
                      name={user?.fullName}
                      gender={user?.gender}
                      size={34}
                    />
                    <span className="min-w-0">
                      {user?.fullName?.trim() && (
                        <span className="block truncate text-[13px] font-semibold leading-tight text-ink">
                          {user.fullName.trim()}
                        </span>
                      )}
                      <span className="mt-0.5 block truncate text-[12px] leading-tight text-muted">
                        {user?.email}
                      </span>
                    </span>
                  </div>
                  <Link
                    href="/settings"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="mt-1.5 flex items-center gap-3 px-4 py-2.5 text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                  >
                    <UserCog size={17} aria-hidden className="text-muted" />
                    Manage Account
                  </Link>
                  <Link
                    href="/saved"
                    role="menuitem"
                    onClick={() => setMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                  >
                    <Heart size={17} aria-hidden className="text-muted" />
                    Saved
                  </Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                  >
                    <LogOut size={17} aria-hidden className="text-muted" />
                    Logout
                  </button>
                  </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => openAuth("register")}
              className="hidden rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white shadow-sm transition-colors hover:bg-primary-dark sm:block"
            >
              Get Started
            </button>
          )}

          {/* Mobile hamburger */}
          <button
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
            className="text-ink lg:hidden"
          >
            {open ? <X size={26} /> : <Menu size={26} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <nav className="border-t border-line bg-white lg:hidden">
          <div className="flex w-full flex-col px-5 py-2 lg:px-7">
            {navLinks.map((link) =>
              link.label === "Signin" ? (
                !ready ? (
                  <AuthSkeleton key={link.label} className="my-3 h-[13px] w-11" />
                ) : (
                  <button
                    key={link.label}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      openAuth("signin");
                    }}
                    className="py-3 text-left text-[15px] text-muted"
                  >
                    {link.label}
                  </button>
                )
              ) : link.href === "#" ? (
                <button
                  key={link.label}
                  type="button"
                  aria-disabled="true"
                  className="py-3 text-left text-[15px] text-muted"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => {
                    setOpen(false);
                    closeAuth();
                  }}
                  aria-current={isActive(link.href, pathname) ? "page" : undefined}
                  className={`py-3 text-[15px] ${
                    isActive(link.href, pathname) ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {link.label}
                </Link>
              )
            )}
            {!ready ? (
              <AuthSkeleton className="mt-2 mb-3 h-[46px] w-full rounded-lg sm:hidden" />
            ) : loggedIn ? (
              <div className="mt-1 flex flex-col border-t border-line pt-1 sm:hidden">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 py-3 text-[15px] text-body"
                >
                  <UserCog size={18} aria-hidden className="text-muted" />
                  Manage Account
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center gap-3 py-3 text-left text-[15px] text-body"
                >
                  <LogOut size={18} aria-hidden className="text-muted" />
                  Logout
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setOpen(false);
                  openAuth("register");
                }}
                className="mt-2 mb-3 rounded-lg bg-primary px-5 py-3 text-[14px] font-medium text-white sm:hidden"
              >
                Get Started
              </button>
            )}
          </div>
        </nav>
      )}

      {/* Auth popups */}
      {authMode && (
        <AuthModal mode={authMode} onClose={closeAuth} onSwitch={openAuth} />
      )}
    </header>
  );
}
