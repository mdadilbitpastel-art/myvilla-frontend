/**
 * One source of truth for stay pricing, so the villa page's reservation card
 * and the checkout page can never quote different numbers.
 */

/** Platform service fee — must match the backend (SERVICE_FEE_RATE). */
export const SERVICE_FEE_RATE = 0.141;

/** Flat tax applied to the accommodation subtotal. */
export const TAX_RATE = 0.05;

export type StayPricing = {
  subtotal: number;
  discount: number;
  serviceFee: number;
  tax: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeStayPricing(pricePerNight: number, nights: number): StayPricing {
  const safeNights = Math.max(0, nights);
  const subtotal = round2(pricePerNight * safeNights);
  // No discount scheme exists yet — the row stays so the layout is final.
  const discount = 0;
  const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
  const tax = round2(subtotal * TAX_RATE);
  return {
    subtotal,
    discount,
    serviceFee,
    tax,
    total: round2(subtotal - discount + serviceFee + tax),
  };
}

/** "$1,234.50" — trailing ".00" dropped for whole amounts. */
export function money(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
