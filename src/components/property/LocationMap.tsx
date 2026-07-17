export default function LocationMap({ location }: { location?: string }) {
  // Center the map on the villa's real location (city/country/address). Falls
  // back to a neutral query when a listing has no location set. Uses Google
  // Maps' keyless embed, which accepts a free-text place query.
  const query = (location || "").trim() || "villa";
  const src = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=11&output=embed`;

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
