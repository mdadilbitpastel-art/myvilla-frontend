"use client";

import Link from "next/link";
import { Ban } from "lucide-react";
import type { ReactNode } from "react";

/**
 * How a booking shows the property it was made on once the host has taken that
 * listing down.
 *
 * A removal on MyVilla is a soft one (see the backend's `Villa.soft_delete`):
 * the row survives, and so does every stay booked on it — those are still
 * checked in and out with their PINs, still cancellable, still reviewable. What
 * goes is the LISTING. It leaves search, the home page, the host's property
 * list and every path that could start a new booking.
 *
 * Which leaves this: the booking rows that still point at it. They must keep
 * showing the property — it is what the guest paid for, and a row that hid it
 * would be a receipt with the item torn out — while making plain that there is
 * nowhere left to go and look at it.
 *
 * The two sides are told differently, and deliberately:
 *
 *   THE HOST took the property down, so their rent-request rows say so outright
 *   — `RemovedNote` under the name, `REMOVED_IMG` greying the thumbnail, and
 *   `PropertyLink` with no callback, which makes the name plain text. It is a
 *   fact about something they did, and their own list is where they check it.
 *
 *   THE GUEST is told nothing until they ask. Their booking list stays a list
 *   of trips: nothing greyed, nothing badged, no notice hung on a stay that is
 *   going ahead perfectly normally. The property is still a link and still
 *   looks like one — it just answers, when pressed, that there is no longer a
 *   listing to open. That is `PropertyLink` with `onRemovedClick`. Announcing
 *   it on a row the guest didn't ask about would read as trouble with their
 *   booking, which is exactly what it isn't.
 */

/** Greys a removed property's photo out. Applied on the `<Img>` itself, over
 *  whatever object-fit and hover the caller already set. */
export const REMOVED_IMG = "grayscale opacity-75";

/**
 * The villa's name or photo. A link to the listing while there is a listing,
 * and once there isn't, one of two things depending on `onRemovedClick`:
 *
 *   given     a button that looks and behaves exactly like the link it
 *             replaces, and says why nothing opened when it's pressed. The
 *             guest's version: the row gives nothing away until asked.
 *   omitted   plain, unclickable text. The host's version, which sits under a
 *             note already saying the property is gone — leaving it pressable
 *             would offer a door the note has just explained isn't there.
 *
 * Same element box and same classes in every case: a removed property must sit
 * in the row at exactly the size and place a live one does, so nothing shifts
 * under the reader.
 */
export function PropertyLink({
  villaId,
  removed,
  message,
  title,
  className = "",
  removedClassName = "",
  onRemovedClick,
  children,
}: {
  villaId: string;
  removed: boolean;
  /** The server's wording of the removal — the tooltip, and what
   *  `onRemovedClick` is expected to put in front of the reader. */
  message?: string;
  /** Tooltip while the listing is live (usually the villa's name). */
  title?: string;
  className?: string;
  /** Extra classes only for the un-pressable removed case — typically to drop
   *  a hover colour or an underline that would still suggest a link. */
  removedClassName?: string;
  /** Called instead of navigating, when the listing is gone. Passing this is
   *  what keeps the row silent until the reader presses it. */
  onRemovedClick?: (message: string) => void;
  children: ReactNode;
}) {
  const removalMessage = message || "This property is no longer listed on MyVilla.";

  if (removed && onRemovedClick) {
    return (
      <button
        type="button"
        onClick={() => onRemovedClick(removalMessage)}
        // No `title` here: a tooltip would answer on hover, which is the whole
        // thing this variant exists not to do.
        className={`${className} text-left`}
      >
        {children}
      </button>
    );
  }

  if (removed) {
    return (
      <span
        className={`${className} ${removedClassName} cursor-default`}
        title={removalMessage}
        aria-disabled
      >
        {children}
      </span>
    );
  }

  return (
    <Link href={`/villa/${villaId}`} title={title} className={className}>
      {children}
    </Link>
  );
}

/**
 * The line that says why the name above isn't a link.
 *
 * `compact` is the list row's version — a small pill that has to fit beside a
 * date and a status without pushing them anywhere. The full version is the
 * opened detail panel's, where there is room to also date the removal.
 */
export function RemovedNote({
  message,
  at,
  compact = false,
  className = "",
}: {
  message: string;
  /** ISO instant of the removal; dated only on the full version. */
  at?: string;
  compact?: boolean;
  className?: string;
}) {
  if (!message) return null;

  if (compact) {
    return (
      <span
        className={`inline-flex max-w-full items-center gap-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-semibold text-muted ${className}`}
        title={message}
      >
        <Ban size={11} className="shrink-0" aria-hidden />
        <span className="truncate">{message}</span>
      </span>
    );
  }

  const on = removedOn(at);
  return (
    <div
      className={`flex items-start gap-2 rounded-xl bg-ink/[0.04] px-3 py-2.5 text-[12.5px] leading-5 text-body ${className}`}
    >
      <Ban size={14} className="mt-0.5 shrink-0 text-muted" aria-hidden />
      <p>
        <span className="font-semibold text-ink">{message}</span>
        {on && <span className="text-muted"> Removed on {on}.</span>}{" "}
        <span className="text-muted">
          This booking is unaffected and goes ahead exactly as made.
        </span>
      </p>
    </div>
  );
}

/** "3 Mar 2026" from the removal instant, or "" when there isn't one. */
function removedOn(at?: string): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
