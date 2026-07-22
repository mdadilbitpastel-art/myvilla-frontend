"use client";

import { useId, useRef } from "react";
import { Calendar, X } from "lucide-react";

/**
 * A date field that reads like a booking site's rather than a bare form input.
 *
 * It's still a native `<input type="date">` — same keyboard support, same
 * calendar, same validation — but the input itself is laid transparently over
 * the field so what a guest sees is "Fri, 24 Jul" under a label, and a click
 * anywhere in the field opens the calendar rather than only the tiny icon.
 */

// "Fri, 24 Jul" — and the year too when it isn't the current one, since a
// stay in another year is exactly the case a guest must not misread.
function formatDate(value: string): string {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  const date = new Date(y, m - 1, d);
  const sameYear = y === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export default function DateField({
  label,
  value,
  min,
  onChange,
  placeholder = "Add date",
  variant = "bar",
  className = "",
}: {
  label: string;
  value: string;
  min?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  variant?: "bar" | "hero";
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const hero = variant === "hero";

  function openPicker() {
    const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null;
    if (!el) return;
    try {
      // Only ever called from a click: showPicker() throws without a gesture.
      el.showPicker?.();
    } catch {
      // Browser refused or doesn't support it — the field still types/tabs.
    }
  }

  return (
    <div
      onClick={openPicker}
      className={`group relative flex cursor-pointer items-center gap-2.5 transition-colors ${
        hero
          ? "rounded-lg px-4 py-2.5 hover:bg-page"
          : "rounded-xl border border-line px-3.5 py-2 hover:border-primary/40"
      } focus-within:border-primary ${className}`}
    >
      <Calendar size={18} className="shrink-0 text-primary" aria-hidden />

      <span className="flex min-w-0 flex-col">
        <span
          className={`leading-tight text-muted ${hero ? "text-[13px]" : "text-[11px]"}`}
        >
          {label}
        </span>
        <span
          className={`truncate leading-tight ${
            hero ? "mt-0.5 text-[15px]" : "text-[13px]"
          } ${value ? "font-semibold text-ink" : "text-muted/70"}`}
        >
          {value ? formatDate(value) : placeholder}
        </span>
      </span>

      {/* The real control, transparent and stretched over the whole field so a
          click anywhere lands on it. It keeps focus, keyboard entry and the
          native calendar exactly as they were. */}
      <input
        ref={ref}
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />

      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()}`}
          onClick={(e) => {
            // Sits above the transparent input, so stop the click reaching the
            // field's own open-the-calendar handler.
            e.preventDefault();
            e.stopPropagation();
            onChange("");
          }}
          className="relative z-10 ml-auto shrink-0 rounded-full p-1 text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}
