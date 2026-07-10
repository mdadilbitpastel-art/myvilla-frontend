"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, ChevronDown, Settings, LogOut } from "lucide-react";
import AuthModal from "@/components/auth/AuthModal";
import { useAuth } from "@/lib/auth";

const NAV_LINKS = [
  { label: "Home", href: "#", active: true },
  { label: "Villas", href: "#" },
  { label: "Packages", href: "#" },
  { label: "Promotions", href: "#" },
  { label: "Help", href: "#" },
  { label: "Blog", href: "#" },
  { label: "Signin", href: "#" },
];

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
                  onClick={() => openAuth("signin")}
                  className="text-[15px] text-muted transition-colors hover:text-ink"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  className={`text-[15px] transition-colors hover:text-ink ${
                    link.active ? "font-medium text-ink" : "text-muted"
                  }`}
                >
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {loggedIn ? (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setMenuOpen((v) => !v)}
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
                  {/* click-away layer */}
                  <button
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-40 cursor-default"
                  />
                  <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-48 overflow-hidden rounded-xl border border-line bg-white py-1.5 shadow-xl">
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                    >
                      <Settings size={17} className="text-muted" />
                      Settings
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-body transition-colors hover:bg-page hover:text-ink"
                    >
                      <LogOut size={17} className="text-muted" />
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
                  onClick={() => {
                    setOpen(false);
                    openAuth("signin");
                  }}
                  className="py-3 text-left text-[15px] text-muted"
                >
                  {link.label}
                </button>
              ) : (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className={`py-3 text-[15px] ${
                    link.active ? "font-medium text-ink" : "text-muted"
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
                  <Settings size={18} className="text-muted" />
                  Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 py-3 text-left text-[15px] text-body"
                >
                  <LogOut size={18} className="text-muted" />
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
