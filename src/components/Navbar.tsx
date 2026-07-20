"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, Settings, LogOut, Heart } from "lucide-react";
import AuthModal from "@/components/auth/AuthModal";
import { useAuth } from "@/lib/auth";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Villas", href: "/search" },
  { label: "Packages", href: "#" },
  { label: "Promotions", href: "#" },
  { label: "Help", href: "#" },
  { label: "Blog", href: "#" },
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

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`text-[22px] font-bold tracking-tight ${className}`}>
      <span className="text-ink">My</span>
      <span className="text-primary">Villa</span>
      <span className="text-ink">.com</span>
    </Link>
  );
}

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, signOut, authMode, openAuth, closeAuth } = useAuth();
  const loggedIn = !!user;
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the account dropdown on Escape and return focus to its trigger.
  useEffect(() => {
    if (!menuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setMenuOpen(false);
      menuRef.current?.querySelector("button")?.focus();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
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
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
      <div className="flex h-[68px] w-full items-center justify-between px-5 lg:px-7">
        <Logo />

        {/* Right group: nav links + CTA (logo stays left-most, button right-most) */}
        <div className="flex items-center gap-8">
          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) =>
              link.label === "Signin" ? (
                <button
                  key={link.label}
                  type="button"
                  onClick={() => openAuth("signin")}
                  className="text-[15px] text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </button>
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

          {loggedIn ? (
            <div ref={menuRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white shadow-sm transition-colors hover:bg-primary-dark"
              >
                My Account
                <ChevronDown
                  size={16}
                  className={`transition-transform ${menuOpen ? "rotate-180" : ""}`}
                />
              </button>

              {menuOpen && (
                <>
                  {/* Click-away layer. Not focusable: as a real <button> it sat
                      in the tab order between the trigger and the menu items. */}
                  <div
                    aria-hidden
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div
                    role="menu"
                    className="animate-fade-in absolute right-0 top-[calc(100%+10px)] z-50 w-48 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-xl"
                  >
                    <Link
                      href="/saved"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                    >
                      <Heart size={17} aria-hidden className="text-muted" />
                      Saved
                    </Link>
                    <Link
                      href="/settings"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                    >
                      <Settings size={17} aria-hidden className="text-muted" />
                      Settings
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
                </>
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
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href, pathname) ? "page" : undefined}
                  className={`py-3 text-[15px] ${
                    isActive(link.href, pathname) ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {link.label}
                </Link>
              )
            )}
            {loggedIn ? (
              <div className="mt-1 flex flex-col border-t border-line pt-1 sm:hidden">
                <Link
                  href="/settings"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 py-3 text-[15px] text-body"
                >
                  <Settings size={18} aria-hidden className="text-muted" />
                  Settings
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
