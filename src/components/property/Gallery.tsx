import Img from "@/components/ui/Img";

export default function Gallery({
  hero,
  thumbs,
  compact = false,
}: {
  hero: string;
  thumbs: string[];
  /** Collapsed form: every photo as a small tile on one scrollable line. */
  compact?: boolean;
}) {
  // Always render four thumbnail tiles so the 2x2 grid never has holes when a
  // listing has fewer photos — empty tiles hold the neutral frame instead.
  const tiles = Array.from({ length: 4 }, (_, i) => thumbs[i]);

  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {[hero, ...tiles].map((src, i) => (
          <div
            key={i}
            className="img-frame relative h-[52px] w-[76px] shrink-0 overflow-hidden rounded-lg"
          >
            <Img
              src={src}
              alt={i === 0 ? "Villa main view" : `Villa view ${i + 1}`}
              priority={i === 0}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Hero image — above the fold, so it loads eagerly (this is the LCP). */}
      <div className="img-frame relative aspect-[4/3] overflow-hidden rounded-2xl md:aspect-auto md:h-[420px]">
        <Img
          src={hero}
          alt="Villa main view"
          priority
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* 2x2 thumbnail grid */}
      <div className="grid grid-cols-2 gap-3 md:h-[420px]">
        {tiles.map((src, i) => (
          <div
            key={i}
            className="img-frame relative aspect-square overflow-hidden rounded-2xl md:aspect-auto"
          >
            <Img
              src={src}
              alt={`Villa view ${i + 2}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
