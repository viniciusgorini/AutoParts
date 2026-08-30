import { applyBasisPoints, assertCents, sumCents } from "@/lib/money";

/**
 * Cart pricing rules, shared by the signed quote on the server and the cart
 * preview in the browser so the two can never disagree. Pure integer maths, no
 * Node built-ins, safe to import from a client component.
 */

export const SHIPPING_FLAT_CENTS = 4_990;
export const SHIPPING_FREE_THRESHOLD_CENTS = 50_000;
export const TAX_BASIS_POINTS = 1_200;

export type CartTotals = {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};

export function priceLineTotals(lineTotals: readonly number[]): CartTotals {
  const subtotalCents = sumCents(lineTotals);
  const shippingCents =
    subtotalCents === 0 || subtotalCents >= SHIPPING_FREE_THRESHOLD_CENTS ? 0 : SHIPPING_FLAT_CENTS;
  const taxCents = applyBasisPoints(subtotalCents, TAX_BASIS_POINTS);
  const totalCents = assertCents(subtotalCents + shippingCents + taxCents, "totalCents");
  return { subtotalCents, shippingCents, taxCents, totalCents };
}
