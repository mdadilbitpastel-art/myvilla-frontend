export default function Gallery({
  hero,
  thumbs,
}: {
  hero: string;
  thumbs: string[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {/* Hero image */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl md:aspect-auto md:h-[420px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={hero}
          alt="Villa main view"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* 2x2 thumbnail grid */}
      <div className="grid grid-cols-2 gap-3 md:h-[420px]">
        {thumbs.slice(0, 4).map((src, i) => (
          <div
            key={i}
            className="relative aspect-square overflow-hidden rounded-2xl md:aspect-auto"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
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
