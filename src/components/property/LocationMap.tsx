export default function LocationMap() {
  // OpenStreetMap embed centered on New York City Hall (matches the mock).
  const bbox = "-74.0100,40.7100,-74.0000,40.7160";
  const marker = "40.7128,-74.0060";
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;

  return (
    <section className="border-b border-line py-6">
      <h3 className="mb-4 text-[18px] font-semibold text-primary">Location on map</h3>
      <div className="overflow-hidden rounded-2xl border border-line">
        <iframe
          title="Property location"
          src={src}
          className="h-[320px] w-full sm:h-[380px]"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
    </section>
  );
}
