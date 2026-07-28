"use client";

import Image from "next/image";

/** What lands in the chat. The link itself carries the preview — title, blurb
 *  and cover photo come from the site's own metadata (see app/layout.tsx). */
const PITCH =
  "Check out MyVilla.com — book beautiful villas around the world, or list your own and start earning.";

function WhatsAppGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.16-1.35a9.9 9.9 0 0 0 4.88 1.28h.01c5.5 0 9.96-4.46 9.96-9.96S17.54 2 12.04 2zm0 18.24h-.01a8.3 8.3 0 0 1-4.22-1.16l-.3-.18-3.06.8.82-2.98-.2-.31a8.26 8.26 0 0 1-1.27-4.41c0-4.57 3.72-8.29 8.3-8.29a8.29 8.29 0 0 1 0 16.53zm4.55-6.2c-.25-.13-1.47-.72-1.7-.8-.23-.09-.4-.13-.56.12s-.64.8-.79.97c-.14.16-.29.18-.54.06a6.8 6.8 0 0 1-2-1.24 7.5 7.5 0 0 1-1.38-1.72c-.15-.25-.02-.38.11-.5.11-.11.25-.29.37-.44.12-.15.16-.25.25-.42.08-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.42-.55-.43h-.47c-.16 0-.42.06-.64.31-.22.25-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.65.58.25 1.03.4 1.38.51.58.19 1.1.16 1.52.1.47-.07 1.47-.6 1.68-1.18.2-.58.2-1.07.14-1.18-.06-.1-.22-.16-.47-.29z" />
    </svg>
  );
}

/**
 * The invite promo — a real share rather than a picture of one. Tapping it
 * hands WhatsApp the site link, and the chat app builds the rich preview
 * (cover photo, title, blurb) from the page's own metadata.
 */
export default function InviteCard({
  image,
  title,
  className = "",
}: {
  image: string;
  title: string;
  className?: string;
}) {
  return (
    <a
      // The site's own address is only knowable in the browser, so the message
      // is filled in on the way out: the handler runs before the browser reads
      // the href for the navigation it is already performing.
      href="https://wa.me/"
      onClick={(e) => {
        const text = `${PITCH}\n${window.location.origin}`;
        e.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
      }}
      target="_blank"
      rel="noreferrer"
      aria-label={`${title} — share MyVilla.com on WhatsApp`}
      className={`group relative block overflow-hidden rounded-2xl ${className}`}
    >
      <Image
        src={image}
        alt=""
        fill
        sizes="(max-width: 1024px) 100vw, 50vw"
        className="object-cover transition-transform duration-500 group-hover:scale-105"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-5">
        <h3 className="max-w-[200px] text-[18px] font-bold leading-snug text-white">
          {title}
        </h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25d366] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow transition-transform group-hover:scale-[1.03]">
          <WhatsAppGlyph />
          Share
        </span>
      </div>
    </a>
  );
}
