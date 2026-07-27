"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";

export type SelectOption<T extends string = string> = {
  value: T;
  /** Row content in the open list. */
  label: ReactNode;
  /** Shorter content for the closed trigger — defaults to `label`. */
  triggerLabel?: ReactNode;
};

/**
 * A single custom dropdown for the whole app — the same trigger + popup as
 * `GuestSelect`, generalised for any option list.
 *
 * A native `<select>` can't be styled past its trigger: the popup is the
 * operating system's, and hiding its arrow to draw our own left a caret that
 * rendered oversized. This is a button + a styled list instead, so the closed
 * field and the open menu both look like the rest of the app.
 *
 * The box styling of the trigger is the caller's (via `triggerClass`) so it can
 * sit in any field; the chevron, popup, and selected-row check are ours.
 */
export default function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled = false,
  id,
  ariaLabel,
  triggerClass = "",
  placement = "down",
  /**
   * "full" — the menu is exactly the trigger's width (a full-row field like
   * gender). "fit" — it grows to its content (a narrow trigger whose options,
   * like "+971 · United Arab Emirates", are wider than the box).
   */
  menu = "full",
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: ReactNode;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
  triggerClass?: string;
  placement?: "down" | "up";
  menu?: "full" | "fit";
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const current = options.find((o) => o.value === value) ?? null;

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

  // If the field is locked while its menu is open (e.g. leaving edit mode),
  // don't leave the popup floating.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div ref={wrapRef} className="relative w-full min-w-0">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${uid}-list`}
        aria-label={ariaLabel}
        className={`flex w-full items-center gap-2 text-left ${triggerClass}`}
      >
        <span className={`min-w-0 flex-1 truncate ${current ? "" : "text-muted"}`}>
          {current ? current.triggerLabel ?? current.label : placeholder}
        </span>
        {!disabled && (
          <ChevronDown
            size={16}
            aria-hidden
            className={`shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && !disabled && (
        <ul
          id={`${uid}-list`}
          role="listbox"
          className={`animate-fade-in absolute z-50 max-h-64 overflow-auto rounded-xl border border-line bg-white py-1 shadow-[0_14px_36px_rgba(20,20,40,0.16)] ${
            placement === "up" ? "bottom-[calc(100%+8px)]" : "top-[calc(100%+8px)]"
          } ${
            menu === "fit" ? "left-0 w-max min-w-full max-w-[min(320px,80vw)]" : "left-0 right-0"
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
                className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-[14px] transition-colors hover:bg-page ${
                  value === opt.value ? "bg-primary/5 font-medium text-primary" : "text-body"
                }`}
              >
                <span className="min-w-0 truncate">{opt.label}</span>
                {value === opt.value && <Check size={15} aria-hidden className="shrink-0" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
