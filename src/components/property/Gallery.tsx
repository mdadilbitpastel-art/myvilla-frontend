import Image from "next/image";

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
        <Image
          src={hero}
          alt="Villa main view"
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>

      {/* 2x2 thumbnail grid */}
      <div className="grid grid-cols-2 gap-3 md:h-[420px]">
        {thumbs.slice(0, 4).map((src, i) => (
          <div
            key={i}
            className="relative aspect-square overflow-hidden rounded-2xl md:aspect-auto"
          >
            <Image
              src={src}
              alt={`Villa view ${i + 2}`}
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
