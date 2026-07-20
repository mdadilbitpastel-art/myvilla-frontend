"use client";

import { useCallback, useState } from "react";

/**
 * Drop-in replacement for a raw `<img>` on remote/user-uploaded photos.
 *
 * Same box, same object-fit — it only changes *how* the photo arrives:
 *   - a neutral tile fills the (already reserved) space while it loads,
 *   - the photo fades in on decode instead of popping,
 *   - a broken or empty `src` falls back instead of showing the browser's
 *     torn-page glyph,
 *   - off-screen photos are lazy + async-decoded.
 *
 * The caller keeps full control of layout via `className` — this component
 * adds no wrapper element and no sizing of its own.
 */
export default function Img({
  src,
  alt,
  className = "",
  fallback,
  priority = false,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  /** Shown when `src` is empty or fails to load. Defaults to a plain tile. */
  fallback?: string;
  /** Set on above-the-fold images (LCP) to opt out of lazy loading. */
  priority?: boolean;
}) {
  // Both flags key off the URL rather than being booleans reset by an effect,
  // so swapping `src` (a gallery changing photos) re-arms the fade for free.
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const failed = !!src && failedSrc === src;
  const resolved = failed ? fallback : src || fallback;
  const loaded = !!resolved && loadedSrc === resolved;

  // A cached image can finish decoding before React attaches onLoad, which
  // would leave it stuck at opacity 0. The ref callback catches that case.
  const attach = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth > 0) setLoadedSrc(node.src);
  }, []);

  if (!resolved) {
    // Nothing to show at all — hold the space with the neutral tile so the
    // surrounding layout is identical to the loaded case.
    return <span aria-label={alt} role="img" className={`${className} img-frame`} />;
  }

  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      ref={attach}
      src={resolved}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onLoad={() => setLoadedSrc(resolved)}
      onError={() => {
        // Fall back once; if the fallback itself is broken, stop retrying and
        // just reveal the (empty) image rather than looping onError forever.
        if (!failed && fallback && src) setFailedSrc(src);
        else setLoadedSrc(resolved);
      }}
      className={`${className} img-fade ${loaded ? "is-loaded" : ""}`}
    />
  );
}
