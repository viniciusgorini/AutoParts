import { getProduct } from "@/lib/catalog";

export type CartLine = { productId: string; quantity: number };

export const SHIPPING_CENTS = 2_990;
export const FREE_SHIPPING_FROM_CENTS = 200_000;
export const TAX_BASIS_POINTS = 800;

export function calculateCart(lines: CartLine[]) {
  const items = lines.flatMap((line) => {
    const product = getProduct(line.productId);
    if (!product) return [];
    const quantity = Math.max(1, Math.min(Math.trunc(line.quantity), product.availableQuantity));
    return [{ product, quantity, lineTotalCents: product.priceCents * quantity }];
  });
  const subtotalCents = items.reduce((total, item) => total + item.lineTotalCents, 0);
  const shippingCents = subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_FROM_CENTS ? 0 : SHIPPING_CENTS;
  const taxCents = Math.round((subtotalCents * TAX_BASIS_POINTS) / 10_000);
  return {
    items,
    subtotalCents,
    shippingCents,
    taxCents,
    totalCents: subtotalCents + shippingCents + taxCents,
  };
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
