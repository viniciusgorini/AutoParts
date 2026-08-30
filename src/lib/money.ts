/**
 * Every monetary value in AutoParts is an integer number of cents.
 * Floating point never touches a price, a total, or a tax.
 */

export const CURRENCY = "USD" as const;

export type Currency = typeof CURRENCY;

export class MoneyError extends Error {}

export function assertCents(value: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new MoneyError(`${field} must be a non-negative safe integer amount in cents`);
  }
  return value;
}

export function multiplyCents(unitPriceCents: number, quantity: number): number {
  assertCents(unitPriceCents, "unitPriceCents");
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new MoneyError("quantity must be a positive safe integer");
  }
  return assertCents(unitPriceCents * quantity, "lineTotalCents");
}

export function sumCents(values: readonly number[]): number {
  return values.reduce((total, value) => total + assertCents(value, "amount"), 0);
}

/**
 * Basis points keep the tax rate in integer space: 1200 bp = 12%.
 * Half-up rounding on the final cent is applied once, on the whole base.
 */
export function applyBasisPoints(baseCents: number, basisPoints: number): number {
  assertCents(baseCents, "baseCents");
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError("basisPoints must be a non-negative safe integer");
  }
  return Math.round((baseCents * basisPoints) / 10_000);
}

export function formatMoney(cents: number): string {
  assertCents(cents, "cents");
  return new Intl.NumberFormat("en-US", { style: "currency", currency: CURRENCY }).format(cents / 100);
}
