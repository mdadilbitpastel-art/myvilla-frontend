"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import AuthModal, { type AuthMode } from "@/components/auth/AuthModal";

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
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
      <div className="flex h-[68px] w-full items-center justify-between px-5 lg:px-7">
        <Logo />

        {/* Right group: nav links + CTA (logo stays left-most, button right-most) */}
        <div className="flex items-center gap-8">
          {/* Desktop nav */}
          <nav className="hidden items-center gap-8 lg:flex">
            {NAV_LINKS.map((link) =>
              link.label === "Signin" ? (
                <button
                  key={link.label}
                  onClick={() => setAuthMode("signin")}
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

          <button
            onClick={() => setAuthMode("register")}
            className="hidden rounded-lg bg-primary px-5 py-2.5 text-[14px] font-medium text-white shadow-sm transition-colors hover:bg-primary-dark sm:block"
          >
            Get Started
          </button>

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
            {NAV_LINKS.map((link) =>
              link.label === "Signin" ? (
                <button
                  key={link.label}
                  onClick={() => {
                    setOpen(false);
                    setAuthMode("signin");
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
            <button
              onClick={() => {
                setOpen(false);
                setAuthMode("register");
              }}
              className="mt-2 mb-3 rounded-lg bg-primary px-5 py-3 text-[14px] font-medium text-white sm:hidden"
            >
              Get Started
            </button>
          </div>
        </nav>
      )}

      {/* Auth popups */}
      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitch={setAuthMode}
        />
      )}
    </header>
  );
}
