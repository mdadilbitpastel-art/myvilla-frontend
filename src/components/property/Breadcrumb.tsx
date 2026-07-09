import Link from "next/link";

export default function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item} className="flex items-center gap-2">
            {isLast ? (
              <span className="text-muted">{item}</span>
            ) : (
              <Link href="#" className="text-ink underline underline-offset-2 hover:text-primary">
                {item}
              </Link>
            )}
            {!isLast && <span className="text-muted">/</span>}
          </span>
        );
      })}
    </nav>
  );
}
