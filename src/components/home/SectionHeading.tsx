import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function SectionHeading({
  title,
  highlight,
  actionLabel = "View all",
  href = "/search",
}: {
  title: string;
  highlight?: string;
  actionLabel?: string;
  href?: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="text-[20px] font-semibold text-heading sm:text-[22px]">
        {title}
        {highlight && <span className="text-primary"> {highlight}</span>}
      </h2>
      <Link
        href={href}
        className="group flex shrink-0 items-center gap-1.5 text-[14px] text-muted transition-colors hover:text-primary"
      >
        {actionLabel}
        <ArrowRight
          size={16}
          className="transition-transform group-hover:translate-x-1"
        />
      </Link>
    </div>
  );
}
