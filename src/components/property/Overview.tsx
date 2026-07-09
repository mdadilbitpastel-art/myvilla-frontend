export default function Overview({
  subtitle,
  items,
}: {
  subtitle: string;
  items: string[];
}) {
  return (
    <div className="border-b border-line pb-6">
      <h2 className="text-[19px] font-bold text-ink">{subtitle}</h2>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-body">
        {items.map((item, i) => (
          <span key={item} className="flex items-center gap-2">
            {item}
            {i < items.length - 1 && (
              <span className="text-primary">·</span>
            )}
          </span>
        ))}
      </p>
    </div>
  );
}
