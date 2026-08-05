"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * How a list of bookings is ordered. Shared by the guest's own bookings and the
 * host's rent requests, because both lists are read for the same reason: what
 * needs doing, and when.
 *
 * `action` is the default everywhere it is offered. It orders by the next thing
 * somebody has to DO on the booking — a guest to check in, a guest to check out
 * — soonest first, so the top of the list is the job in front of you and a row
 * whose hour has already passed sits above everything (see `nextActionAt`).
 * "When was this booked" is a different question, and it is the one the history
 * is read with, so it leads there instead.
 */
export type SortKey = "action" | "action-last" | "newest" | "oldest";

export const ACTION_SORTS: { value: SortKey; label: string }[] = [
  { value: "action", label: "Next action first" },
  { value: "action-last", label: "Next action last" },
  { value: "newest", label: "Newest booking" },
  { value: "oldest", label: "Oldest booking" },
];

/** The history has no action outstanding on any of its rows, so the two action
 *  orderings would be one arbitrary tie-break — it sorts by when instead. */
export const HISTORY_SORTS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
];

export function sortLabel(
  value: SortKey,
  options: { value: SortKey; label: string }[]
): string {
  return options.find((o) => o.value === value)?.label ?? options[0].label;
}

export default function SortMenu({
  value,
  options,
  onChange,
}: {
  value: SortKey;
  options: { value: SortKey; label: string }[];
  onChange: (next: SortKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Anywhere else on the page, or Escape, closes it — the same way every other
  // small menu in the product behaves.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 whitespace-nowrap rounded-md border border-line px-3 py-1.5 text-[12px] text-body transition-colors hover:border-primary/40"
      >
        Sort: <span className="font-semibold text-ink">{sortLabel(value, options)}</span>
        <ChevronDown
          size={14}
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          className="animate-fade-in absolute right-0 z-30 mt-1.5 w-[178px] overflow-hidden rounded-lg border border-line bg-white py-1 shadow-[0_12px_28px_-12px_rgba(20,20,45,0.4)]"
        >
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12.5px] transition-colors hover:bg-page ${
                  option.value === value ? "font-semibold text-primary" : "text-body"
                }`}
              >
                {option.label}
                {option.value === value && <Check size={13} className="shrink-0" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The comparator behind the menu. `nextAction` is read from the booking by the
 * caller (it needs the page's server clock), and every ordering falls back to
 * the booking stamp so two rows due at the same hour never swap places between
 * renders.
 */
export function compareBySort<T>(
  key: SortKey,
  nextAction: (item: T) => number,
  stamp: (item: T) => number
): (a: T, b: T) => number {
  return (a, b) => {
    if (key === "newest") return stamp(b) - stamp(a);
    if (key === "oldest") return stamp(a) - stamp(b);
    const na = nextAction(a);
    const nb = nextAction(b);
    // Compared, not subtracted: two rows with nothing outstanding are both
    // Infinity, and Infinity − Infinity is NaN — which leaves a sort with no
    // defined order at all.
    const due = na === nb ? 0 : na < nb ? -1 : 1;
    return (key === "action" ? due : -due) || stamp(b) - stamp(a);
  };
}
