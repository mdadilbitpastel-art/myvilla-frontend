import Img from "@/components/ui/Img";

/** Desktop height of the whole block — the hero and the tile column share it. */
const BLOCK_H = "md:h-[420px]";

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
  // Only real photos are laid out — a listing with three of them gets a
  // three-photo layout, not two blank frames padding a fixed 2x2 grid.
  const photos = [hero, ...thumbs].filter(Boolean);
  // Past five, the extras are counted on the last tile rather than shrinking
  // every tile to fit them.
  const tiles = photos.slice(1, 5);
  const extra = photos.length - 1 - tiles.length;

  if (compact) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {photos.map((src, i) => (
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

  // Hero image — above the fold, so it loads eagerly (this is the LCP).
  const heroTile = (
    <div
      className={`img-frame relative aspect-[4/3] overflow-hidden rounded-2xl md:aspect-auto ${BLOCK_H}`}
    >
      <Img
        src={photos[0]}
        alt="Villa main view"
        priority
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );

  // A lone photo fills the row instead of leaving half of it empty.
  if (tiles.length === 0) {
    return (
      <div className="img-frame relative aspect-[16/9] overflow-hidden rounded-2xl md:aspect-auto md:h-[420px]">
        <Img
          src={photos[0]}
          alt="Villa main view"
          priority
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
    );
  }

  // One tile → a single column beside the hero; two → stacked; three and four
  // → a 2x2, with the odd third tile widened across the bottom row.
  const gridCls =
    tiles.length === 1
      ? "grid-cols-1"
      : tiles.length === 2
        ? "grid-cols-1 grid-rows-2"
        : "grid-cols-2 grid-rows-2";
  const wideLast = tiles.length === 3;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {heroTile}

      <div className={`grid gap-3 ${gridCls} ${BLOCK_H}`}>
        {tiles.map((src, i) => {
          const wide = wideLast && i === 2;
          const last = i === tiles.length - 1;
          return (
            <div
              key={i}
              className={`img-frame relative overflow-hidden rounded-2xl md:aspect-auto ${
                wide ? "aspect-[2/1] col-span-2" : tiles.length > 2 ? "aspect-square" : "aspect-[3/2]"
              }`}
            >
              <Img
                src={src}
                alt={`Villa view ${i + 2}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
              {last && extra > 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-[15px] font-semibold text-white">
                  +{extra} photo{extra === 1 ? "" : "s"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
