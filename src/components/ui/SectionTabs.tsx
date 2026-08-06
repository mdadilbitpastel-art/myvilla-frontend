"use client";

import { useRef } from "react";
import CountPill from "./CountPill";

export type SectionTab<K extends string = string> = {
  key: K;
  label: string;
  /** What the tab is called on a phone, where two full headings and the sort
   *  control will not fit across one band. Falls back to `label`. */
  shortLabel?: string;
  count: number;
};

/**
 * The two halves of a bookings page — what is still to come, and what is on the
 * record — as tabs in the card's own header band.
 *
 * They used to be two headed sections stacked down one page, which meant the
 * live stays and a year of finished ones were always both on screen: the thing
 * you open this page for got shorter every month, and reaching the history was
 * a scroll past everything you were actually doing. One list at a time, chosen
 * here, and nothing loads again to change between them — both lists are already
 * in hand, and the tab only decides which is drawn.
 *
 * The counts stay on BOTH tabs, selected or not. The count is most of the
 * reason to look at the other one.
 *
 * A real tablist: arrow keys move along it, Home/End jump to the ends, and only
 * the selected tab is in the page's tab order (roving tabindex), so a keyboard
 * passing through the header lands on the tabs once rather than on each of
 * them. The panel each one controls is named by `id`/`idPrefix`, so a screen
 * reader is told what changed rather than left to notice.
 */
export default function SectionTabs<K extends string>({
  tabs,
  value,
  onChange,
  idPrefix,
  className = "",
}: {
  tabs: readonly SectionTab<K>[];
  value: K;
  onChange: (key: K) => void;
  /** Ties each tab to its panel: the page renders `${idPrefix}-panel-${key}`. */
  idPrefix: string;
  className?: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // Arrow keys move the selection AND the focus with it, which is what a
  // tablist is expected to do: the selected tab is the focused one, so moving
  // along the row shows each list as it is reached.
  const onKeyDown = (e: React.KeyboardEvent) => {
    const at = tabs.findIndex((t) => t.key === value);
    if (at < 0) return;
    const to =
      e.key === "ArrowRight"
        ? (at + 1) % tabs.length
        : e.key === "ArrowLeft"
          ? (at - 1 + tabs.length) % tabs.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? tabs.length - 1
              : -1;
    if (to < 0) return;
    e.preventDefault();
    onChange(tabs[to].key);
    // The newly selected tab is the only one still in the tab order, so it is
    // the one to move focus to — found by id rather than held in a ref array,
    // which would have to be kept in step with the list.
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#${idPrefix}-tab-${tabs[to].key}`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Bookings"
      onKeyDown={onKeyDown}
      // `-my-4 self-stretch` makes the tabs as tall as the header band itself,
      // padding included, so a tab's bottom edge IS the band's bottom edge —
      // which is what lets the selected bar below sit on the band's own rule
      // rather than floating a few pixels above it.
      // The `-ml-2`/`-ml-3` pulls the first tab's own padding back off the
      // band's, so the heading starts on the same left edge as everything else
      // in the card rather than a step in from it.
      className={`-my-4 -ml-2 flex items-stretch gap-1 self-stretch sm:-ml-3 ${className}`}
    >
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={on}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center gap-1.5 whitespace-nowrap px-2 text-[15px] font-bold transition-colors sm:gap-2 sm:px-3 sm:text-[16px] ${
              on ? "text-ink" : "text-muted hover:text-body"
            }`}
          >
            {/* Two headings and a sort control do not fit across a phone, so
                the tabs go by their short names there and their full ones from
                the first breakpoint up. */}
            <span className="sm:hidden">{t.shortLabel || t.label}</span>
            <span className="hidden sm:inline">{t.label}</span>
            <CountPill value={t.count} />
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full transition-colors ${
                on ? "bg-primary" : "bg-transparent"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
