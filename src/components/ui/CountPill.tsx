/**
 * A small count that sits after a section heading ("Active Bookings 4").
 *
 * Deliberately not zero-padded: "00" reads as a code or a placeholder, not as
 * "none". An empty section says so in words instead of showing a bold zero.
 */
export default function CountPill({ value }: { value: number }) {
  const none = value === 0;
  return (
    <span
      className={`inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-2 text-[12px] font-semibold tabular-nums ${
        none ? "bg-page text-muted" : "bg-primary/10 text-primary"
      }`}
    >
      {value}
    </span>
  );
}
