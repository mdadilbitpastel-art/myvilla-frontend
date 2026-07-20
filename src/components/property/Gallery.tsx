import Img from "@/components/ui/Img";

export default function Gallery({
  hero,
  thumbs,
}: {
  hero: string;
  thumbs: string[];
}) {
  // Always render four thumbnail tiles so the 2x2 grid never has holes when a
  // listing has fewer photos — empty tiles hold the neutral frame instead.
  const tiles = Array.from({ length: 4 }, (_, i) => thumbs[i]);

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
