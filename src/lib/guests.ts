/**
 * The guest counts every picker in the app offers — the hero search and the
 * search bar both read from here.
 *
 * The list stops at four. Past that the exact number stops being a useful
 * thing to choose from a menu: a larger party picks "4+" and the villa's own
 * capacity (shown on every listing) decides the rest. Only the last option
 * carries the plus — "2 guests" means two, not two-or-more.
 */

export const MAX_GUEST_CHOICE = 4;

export type GuestChoice = {
  /** The number sent to the backend — the "+" option sends its own floor. */
  value: number;
  /** "1 guest", "5 guests", "6+ guests" */
  label: string;
  /** Bare form for tight spaces: "1", "5", "6+" */
  short: string;
};

/**
 * Options from 1 up to `max`, capped at six.
 *
 * `max` is a villa's stated capacity where there is one: a villa that sleeps
 * three offers 1–3 and no "+" at all, since there is nothing beyond three to
 * stand for. Only a villa that can take four or more gets the "4+" option.
 */
export function guestChoices(max: number = MAX_GUEST_CHOICE): GuestChoice[] {
  const top = Math.max(1, Math.min(Math.round(max) || 1, MAX_GUEST_CHOICE));
  return Array.from({ length: top }, (_, i) => {
    const n = i + 1;
    // The plus belongs on the last option only, and only when the villa can
    // actually take more than the number shown.
    const open = n === MAX_GUEST_CHOICE && max >= MAX_GUEST_CHOICE;
    const short = open ? `${n}+` : String(n);
    return {
      value: n,
      short,
      label: `${short} guest${n === 1 && !open ? "" : "s"}`,
    };
  });
}
