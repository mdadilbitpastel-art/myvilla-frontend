import Link from "next/link";

// Footer labels that link to real pages (others are placeholders → "#").
const LINK_HREFS: Record<string, string> = {
  "Privacy policy": "/privacy",
  "Terms of service": "/terms",
};

const COLUMNS = [
  {
    title: "About",
    links: ["About MyVilla", "How it works", "Careers", "Press", "Blog", "Forum"],
  },
  {
    title: "Partner with us",
    links: [
      "Partnership programs",
      "Affiliate program",
      "Connectivity partners",
      "Promotions and events",
      "Integrations",
      "Community",
      "Loyalty program",
    ],
  },
  {
    title: "Support",
    links: [
      "Help Center",
      "Contact us",
      "Privacy policy",
      "Terms of service",
      "Trust and safety",
      "Accessibility",
    ],
  },
  {
    title: "Get the app",
    links: ["MyVilla for Android", "MyVilla for iOS", "Mobile site"],
  },
];

export default function Footer() {
  return (
    <footer className="bg-white">
      <div className="mx-auto max-w-[1120px] px-6 pt-14 pb-8">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-[22px] font-bold tracking-tight">
              <span className="text-ink">My</span>
              <span className="text-primary">Villa</span>
              <span className="text-ink">.com</span>
            </Link>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 text-[15px] font-semibold text-ink">{col.title}</h4>
              <ul className="space-y-3">
                {col.links.map((link) => (
                  <li key={link}>
                    <Link
                      href={LINK_HREFS[link] || "#"}
                      className="text-[14px] text-muted transition-colors hover:text-primary"
                    >
                      {link}
                    </Link>
                  </li>
                ))}

                {/* App store badges under the last column */}
                {col.title === "Get the app" && (
                  <li className="space-y-3 pt-3">
                    <StoreBadge
                      top="Download on the"
                      bottom="App Store"
                      glyph={<AppleGlyph />}
                    />
                    <StoreBadge
                      top="GET IT ON"
                      bottom="Google Play"
                      glyph={<PlayGlyph />}
                    />
                  </li>
                )}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col-reverse items-start gap-4 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-5 text-muted">
            <Link href="#" aria-label="Twitter" className="transition-colors hover:text-primary">
              <TwitterGlyph />
            </Link>
            <Link href="#" aria-label="Instagram" className="transition-colors hover:text-primary">
              <InstagramGlyph />
            </Link>
            <Link href="#" aria-label="Facebook" className="transition-colors hover:text-primary">
              <FacebookGlyph />
            </Link>
          </div>
          <p className="text-[13px] text-muted">© 2022 MyVilla incorporated</p>
        </div>
      </div>
    </footer>
  );
}

function StoreBadge({
  top,
  bottom,
  glyph,
}: {
  top: string;
  bottom: string;
  glyph: React.ReactNode;
}) {
  return (
    <Link
      href="#"
      className="flex w-[150px] items-center gap-3 rounded-lg bg-black px-3 py-2 text-white transition-transform hover:scale-[1.02]"
    >
      <span className="shrink-0">{glyph}</span>
      <span className="flex flex-col leading-tight">
        <span className="text-[9px] uppercase tracking-wide text-white/80">{top}</span>
        <span className="text-[15px] font-semibold">{bottom}</span>
      </span>
    </Link>
  );
}

function TwitterGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 5.8a8.3 8.3 0 0 1-2.36.65 4.1 4.1 0 0 0 1.8-2.27 8.2 8.2 0 0 1-2.6 1A4.1 4.1 0 0 0 11.5 8.7a11.6 11.6 0 0 1-8.4-4.27 4.1 4.1 0 0 0 1.27 5.47A4 4 0 0 1 2.5 9.4v.05a4.1 4.1 0 0 0 3.3 4.02 4.1 4.1 0 0 1-1.85.07 4.1 4.1 0 0 0 3.83 2.85A8.23 8.23 0 0 1 2 18.1a11.6 11.6 0 0 0 6.29 1.84c7.55 0 11.67-6.25 11.67-11.67v-.53A8.3 8.3 0 0 0 22 5.8z" />
    </svg>
  );
}

function InstagramGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M14 9h2.5V6H14c-2 0-3.5 1.5-3.5 3.5V11H8v3h2.5v7h3v-7H16l.5-3H13.5V9.5c0-.3.2-.5.5-.5z" />
    </svg>
  );
}

function AppleGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 12.53c-.02-2.02 1.65-2.99 1.72-3.04-.94-1.37-2.4-1.56-2.92-1.58-1.24-.13-2.42.73-3.05.73-.63 0-1.6-.71-2.63-.69-1.35.02-2.6.79-3.29 2-1.4 2.43-.36 6.02 1 8 .67.96 1.46 2.04 2.5 2 1-.04 1.38-.65 2.59-.65 1.2 0 1.55.65 2.6.63 1.08-.02 1.76-.98 2.42-1.95.77-1.12 1.08-2.2 1.1-2.26-.02-.01-2.11-.81-2.13-3.21zM15.1 6.24c.55-.67.92-1.6.82-2.53-.79.03-1.75.53-2.32 1.19-.51.59-.96 1.54-.84 2.44.88.07 1.79-.45 2.34-1.1z" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
      <path d="M3.6 2.6 13 12 3.6 21.4a1 1 0 0 1-.6-.9V3.5a1 1 0 0 1 .6-.9z" fill="#00d0ff" />
      <path d="M13 12 3.6 2.6c.15-.06.33-.06.5.05L16.5 9.6 13 12z" fill="#00f076" />
      <path d="M13 12l3.5 2.4-12.4 7c-.17.1-.35.1-.5.04L13 12z" fill="#ff3a44" />
      <path d="m16.5 9.6 3.9 2.2c.7.4.7 1.2 0 1.6l-3.9 2.2L13 12l3.5-2.4z" fill="#ffc900" />
    </svg>
  );
}
