"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { guestChoices, type GuestChoice } from "@/lib/guests";

/**
 * The guest picker used by every search surface — one dropdown, one look.
 *
 * A native `<select>` can't be styled past its trigger: the option list is the
 * operating system's, so the hero and the search bar looked nothing like the
 * rest of the app. This is that picker, made shared.
 *
 * The list is `left-0 right-0` inside a wrapper that is exactly the trigger, so
 * it is always the trigger's width and flush with its edges — whatever the
 * surrounding field does with padding.
 */
export default function GuestSelect({
  value,
  onChange,
  /** Label for "no preference" — omit to require a count. */
  anyLabel = "Any guests",
  /** Drawn inside the trigger, so the list lines up with the icon too. */
  icon,
  /** Trigger's own box + text styling — the field it stands in decides. */
  triggerClass = "",
  /**
   * "up" opens the list above the trigger. The hero's search bar sits low in a
   * section that clips its overflow, so a list dropping down is cut off.
   */
  placement = "down",
  ariaLabel = "Number of guests",
}: {
  value: number;
  onChange: (guests: number) => void;
  anyLabel?: string;
  icon?: ReactNode;
  triggerClass?: string;
  placement?: "down" | "up";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const options: GuestChoice[] = [
    ...(anyLabel ? [{ value: 0, label: anyLabel, short: anyLabel }] : []),
    ...guestChoices(),
  ];
  const current = options.find((o) => o.value === value) ?? options[0];

  // Close on outside click / Escape — a list left hanging over the page is the
  // one thing a custom dropdown gets wrong that a native one never does.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${uid}-list`}
        aria-label={ariaLabel}
        className={`flex w-full items-center gap-2 text-left ${triggerClass}`}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{current.label}</span>
        <ChevronDown
          size={16}
          aria-hidden
          className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          id={`${uid}-list`}
          role="listbox"
          className={`animate-fade-in absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-line bg-white py-1 shadow-[0_14px_36px_rgba(20,20,40,0.16)] ${
            placement === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
          }`}
        >
          {options.map((opt) => (
            <li key={opt.value}>
              <button
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-page ${
                  value === opt.value ? "bg-primary/5 font-medium text-primary" : "text-body"
                }`}
              >
                {opt.label}
                {value === opt.value && <Check size={15} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
