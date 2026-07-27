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
  /** Chosen extra services, charged per night: (sum of per-night prices) × nights. */
  extras: number;
  total: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeStayPricing(
  pricePerNight: number,
  nights: number,
  // Coupon discount off the accommodation subtotal. Fee and tax are still
  // charged on the full subtotal — mirrors the backend (create_booking).
  discount = 0,
  // Sum of the per-night prices of the extra services the guest ticked. Charged
  // per night and added straight to the total — no fee or tax on top, exactly
  // like the backend (create_booking).
  extrasPerNight = 0
): StayPricing {
  const safeNights = Math.max(0, nights);
  const subtotal = round2(pricePerNight * safeNights);
  // Never let a discount exceed the subtotal (a stay can't cost less than $0).
  const safeDiscount = Math.min(Math.max(0, round2(discount)), subtotal);
  const serviceFee = round2(subtotal * SERVICE_FEE_RATE);
  const tax = round2(subtotal * TAX_RATE);
  const extras = round2(Math.max(0, extrasPerNight) * safeNights);
  return {
    subtotal,
    discount: safeDiscount,
    serviceFee,
    tax,
    extras,
    total: round2(subtotal - safeDiscount + serviceFee + tax + extras),
  };
}

/** "$1,234.50" — trailing ".00" dropped for whole amounts. */
export function money(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}
