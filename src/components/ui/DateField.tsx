"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * A date field with the app's own themed calendar — not the browser's native
 * date picker. The whole field opens the calendar (there is no text input to
 * select or mis-type into), and the popover is portaled to <body> so a clipping
 * parent (e.g. the hero's `overflow-hidden`) can never cut it off. Used for
 * every date across the app so they all look and behave the same.
 */

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Local YYYY-MM-DD (never toISOString — that shifts across the UTC boundary).
function ymd(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function parseYmd(value?: string): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

// "Fri, 24 Jul" — with the year when it isn't the current one, since a stay in
// another year is exactly the case a guest must not misread.
function formatDate(value: string): string {
  const date = parseYmd(value);
  if (!date) return value;
  const sameYear = date.getFullYear() === new Date().getFullYear();
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
  max,
  disabledDates,
  onChange,
  placeholder = "Add date",
  variant = "bar",
  disabled = false,
  className = "",
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  /**
   * Individual dates to close inside the min…max span, "YYYY-MM-DD" — nights
   * somebody else already holds. They render struck through rather than merely
   * dim, so "taken" reads differently from "outside the window".
   */
  disabledDates?: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * "field" is the settings-form shape: a single-line box that matches the
   * plain text inputs around it, with the label supplied externally (used here
   * only for aria). "bar"/"hero"/"plain" carry their own stacked label.
   */
  variant?: "bar" | "hero" | "plain" | "field";
  /** Locked, read-only field — never opens the calendar (e.g. view mode). */
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const hero = variant === "hero";
  const plain = variant === "plain";
  const field = variant === "field";

  // A field that locks while its calendar is open (e.g. leaving edit mode)
  // shouldn't leave the popover floating.
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  // Place the popover under (or above) the trigger, in viewport coordinates —
  // it's portaled to <body>, so it isn't clipped by any scroll/overflow parent.
  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const PANEL_W = 300;
    const EST_H = 348; // only used to decide which side has room
    const GAP = 8;
    // Keep it on-screen horizontally.
    let left = r.left;
    if (left + PANEL_W > window.innerWidth - GAP) left = window.innerWidth - GAP - PANEL_W;
    if (left < GAP) left = GAP;
    // Prefer below; flip above when there isn't room. When opening upward the
    // panel's BOTTOM is anchored just above the field, so it hugs the field's
    // top border no matter the panel's actual height (no gap from a bad guess).
    const roomBelow = r.bottom + GAP + EST_H <= window.innerHeight;
    if (roomBelow) {
      setPos({ left, top: r.bottom + GAP });
    } else {
      setPos({ left, bottom: window.innerHeight - r.top + GAP });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, reposition]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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

  function toggle() {
    if (disabled) return;
    setOpen((o) => !o);
  }

  const wrapClass = field
    ? disabled
      ? `rounded-lg border border-transparent bg-page px-3.5 py-2.5 ${className}`
      : `rounded-lg border bg-white px-3.5 py-2.5 hover:border-primary/40 ${open ? "border-primary" : "border-line"} ${className}`
    : plain
      ? `px-4 py-2.5 hover:bg-page ${className}`
      : hero
        ? `rounded-lg px-4 py-2.5 hover:bg-page ${className}`
        : `rounded-xl border border-line px-3.5 py-2 hover:border-primary/40 ${open ? "border-primary" : ""} ${className}`;

  return (
    <>
      <div
        ref={triggerRef}
        id={id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-disabled={disabled || undefined}
        aria-label={label}
        onClick={toggle}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        // Whole field opens the calendar, and nothing inside is text-selectable.
        className={`group relative flex select-none items-center gap-2.5 transition-colors ${
          disabled ? "cursor-default" : "cursor-pointer"
        } ${wrapClass}`}
      >
        {!plain && (
          <CalendarIcon
            size={hero ? 18 : 17}
            className={`shrink-0 ${disabled ? "text-muted" : "text-primary"}`}
            aria-hidden
          />
        )}

        {field ? (
          <span
            className={`min-w-0 flex-1 truncate text-[14px] ${
              value ? "text-ink" : "text-muted"
            }`}
          >
            {value ? formatDate(value) : placeholder}
          </span>
        ) : (
          <span className="flex min-w-0 flex-col">
            <span
              className={`leading-tight ${
                plain
                  ? "text-[13px] font-semibold text-ink"
                  : hero
                    ? "text-[13px] text-muted"
                    : "text-[11px] text-muted"
              }`}
            >
              {label}
            </span>
            <span
              className={`truncate leading-tight ${
                plain ? "mt-0.5 text-[13px]" : hero ? "mt-0.5 text-[15px]" : "text-[13px]"
              } ${
                value
                  ? plain
                    ? "text-body"
                    : "font-semibold text-ink"
                  : "text-muted/70"
              }`}
            >
              {value ? formatDate(value) : placeholder}
            </span>
          </span>
        )}

        {value && !plain && !disabled && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange("");
              setOpen(false);
            }}
            className="relative z-10 ml-auto shrink-0 rounded-full p-1 text-muted opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
          >
            <X size={14} aria-hidden />
          </button>
        )}
      </div>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label={`Choose ${label.toLowerCase()}`}
            style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: 300 }}
            className="z-[120] rounded-2xl border border-line bg-white p-3 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
          >
            <CalendarPanel
              value={value}
              min={min}
              max={max}
              disabledDates={disabledDates}
              onPick={(v) => {
                onChange(v);
                setOpen(false);
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}

/* ---------------- the calendar itself ---------------- */

function CalendarPanel({
  value,
  min,
  max,
  disabledDates,
  onPick,
}: {
  value: string;
  min?: string;
  max?: string;
  disabledDates?: string[];
  onPick: (value: string) => void;
}) {
  const taken = new Set(disabledDates ?? []);
  const selected = parseYmd(value);
  const today = new Date();
  const initial = selected ?? parseYmd(min) ?? today;
  const [view, setView] = useState({ year: initial.getFullYear(), month: initial.getMonth() });

  // Year range for the quick-jump dropdown: driven by min/max when present, so
  // booking (future) and date-of-birth (past) both land on a sensible span.
  const minYear = parseYmd(min)?.getFullYear() ?? today.getFullYear() - 100;
  const maxYear = parseYmd(max)?.getFullYear() ?? today.getFullYear() + 10;
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  const first = new Date(view.year, view.month, 1);
  const startOffset = first.getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.year, view.month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const disabled = (d: Date) => {
    const s = ymd(d);
    return (!!min && s < min) || (!!max && s > max) || taken.has(s);
  };

  const step = (delta: number) => {
    setView((v) => {
      const m = v.month + delta;
      return { year: v.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };

  const prevDisabled = !!min && ymd(new Date(view.year, view.month, 1)) < min && view.year <= minYear && view.month === 0;
  const nextDisabled =
    !!max && ymd(new Date(view.year, view.month + 1, 0)) > max && view.year >= maxYear && view.month === 11;

  return (
    <div>
      {/* Header: ◀  [Month] [Year]  ▶ */}
      <div className="flex items-center gap-1.5 px-1">
        <NavBtn onClick={() => step(-1)} disabled={prevDisabled} label="Previous month">
          <ChevronLeft size={16} aria-hidden />
        </NavBtn>

        <div className="flex flex-1 items-center justify-center gap-1.5">
          <select
            aria-label="Month"
            value={view.month}
            onChange={(e) => setView((v) => ({ ...v, month: Number(e.target.value) }))}
            className="cursor-pointer rounded-md px-1.5 py-1 text-[13px] font-semibold text-ink outline-none hover:bg-page focus:bg-page"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={view.year}
            onChange={(e) => setView((v) => ({ ...v, year: Number(e.target.value) }))}
            className="cursor-pointer rounded-md px-1.5 py-1 text-[13px] font-semibold text-ink outline-none hover:bg-page focus:bg-page"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <NavBtn onClick={() => step(1)} disabled={nextDisabled} label="Next month">
          <ChevronRight size={16} aria-hidden />
        </NavBtn>
      </div>

      {/* Weekday row */}
      <div className="mt-2 grid grid-cols-7 px-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="py-1 text-center text-[11px] font-medium text-muted">
            {w}
          </span>
        ))}
      </div>

      {/* Days */}
      <div className="grid grid-cols-7 gap-0.5 px-1 pb-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e-${i}`} />;
          const s = ymd(d);
          const isSelected = s === value;
          const isToday = s === ymd(today);
          const off = disabled(d);
          // A date somebody else holds, as opposed to one simply outside the
          // window — worth showing differently, so the guest can see that the
          // gap in the middle of the month is a booking, not a mistake.
          const isTaken = taken.has(s);
          return (
            <button
              key={s}
              type="button"
              disabled={off}
              aria-pressed={isSelected}
              title={isTaken ? "Already booked" : undefined}
              onClick={() => onPick(s)}
              className={`flex h-9 items-center justify-center rounded-lg text-[13px] transition-colors ${
                isSelected
                  ? "bg-primary font-semibold text-white"
                  : isTaken
                    ? "cursor-not-allowed text-muted/60 line-through decoration-red-400"
                    : off
                      ? "cursor-not-allowed text-muted/40"
                      : `text-ink hover:bg-primary/10 ${isToday ? "font-bold text-primary" : ""}`
              }`}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NavBtn({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-body transition-colors hover:bg-page disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}
