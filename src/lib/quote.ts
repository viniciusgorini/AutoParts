import { randomUUID } from "node:crypto";

import { canonicalHash } from "@/lib/canonical";
import { CATALOG_VERSION, findProductBySku, type Product } from "@/lib/catalog";
import { ApiError } from "@/lib/errors";
import { CURRENCY, multiplyCents, type Currency } from "@/lib/money";
import { priceLineTotals, type CartTotals } from "@/lib/pricing";
import { verifyQuoteSignature, type QuoteSigner } from "@/lib/signing";

/**
 * Quotes are immutable, time-bound, signed snapshots of a cart.
 *
 * The signature covers the canonical form of everything except the signature
 * itself, so any later edit to a line, a total, or an expiry invalidates it.
 */

export {
  SHIPPING_FLAT_CENTS,
  SHIPPING_FREE_THRESHOLD_CENTS,
  TAX_BASIS_POINTS,
} from "@/lib/pricing";

export type QuoteLine = {
  productId: string;
  merchantSku: string;
  name: string;
  merchantCategoryId: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
};

export type QuotePayload = {
  quoteId: string;
  merchantId: string;
  merchantOrderRef: string;
  catalogVersion: string;
  /**
   * AgentPay taxonomy value the mandate is evaluated against. A quote carries
   * exactly one: the merchant checkout contract authorises a single category.
   */
  agentPayCategory: string;
  items: readonly QuoteLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: Currency;
  issuedAt: string;
  expiresAt: string;
  cartHash: string;
};

export type SignedQuote = QuotePayload & {
  signature: { keyId: string; algorithm: "Ed25519"; value: string };
};

export type QuoteRequestItem = { merchantSku: string; quantity: number };

function resolveLine(merchantId: string, item: QuoteRequestItem): { product: Product; line: QuoteLine } {
  const product = findProductBySku(merchantId, item.merchantSku);
  if (!product) {
    throw new ApiError("SKU_NOT_FOUND", `No product matches SKU ${item.merchantSku}.`);
  }
  if (product.availableQuantity < item.quantity) {
    throw new ApiError(
      "INSUFFICIENT_STOCK",
      `Only ${product.availableQuantity} unit(s) of ${product.sku} are available.`,
    );
  }

  return {
    product,
    line: {
      productId: product.id,
      merchantSku: product.sku,
      name: product.name,
      merchantCategoryId: product.localCategoryId,
      quantity: item.quantity,
      unitPriceCents: product.unitPriceCents,
      lineTotalCents: multiplyCents(product.unitPriceCents, item.quantity),
    },
  };
}

export function priceCart(items: readonly QuoteLine[]): CartTotals {
  return priceLineTotals(items.map((line) => line.lineTotalCents));
}

/** The cart hash covers only what was ordered, never the totals or the clock. */
export function cartHash(input: { merchantId: string; catalogVersion: string; items: readonly QuoteLine[] }): string {
  return canonicalHash({
    catalogVersion: input.catalogVersion,
    merchantId: input.merchantId,
    items: [...input.items]
      .map((line) => ({
        merchantSku: line.merchantSku,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      }))
      .sort((left, right) => left.merchantSku.localeCompare(right.merchantSku)),
  });
}

export function createQuote(input: {
  merchantId: string;
  items: readonly QuoteRequestItem[];
  signer: QuoteSigner;
  ttlSeconds: number;
  now?: Date;
  quoteId?: string;
  merchantOrderRef?: string;
}): SignedQuote {
  if (input.items.length === 0) {
    throw new ApiError("BAD_REQUEST", "A quote needs at least one item.");
  }

  const merged = new Map<string, number>();
  for (const item of input.items) {
    const sku = item.merchantSku.trim().toUpperCase();
    merged.set(sku, (merged.get(sku) ?? 0) + item.quantity);
  }

  const resolved = [...merged].map(([merchantSku, quantity]) =>
    resolveLine(input.merchantId, { merchantSku, quantity }),
  );

  const categories = new Set(resolved.map((entry) => entry.product.agentPayCategory));
  if (categories.size > 1) {
    // The AgentPay checkout contract authorises one category per purchase, so
    // a mixed cart is refused rather than silently checked against one of them.
    throw new ApiError(
      "MIXED_CATEGORY_CART",
      "A quote must cover a single AgentPay category. Split the cart and quote each category separately.",
    );
  }
  const [agentPayCategory] = [...categories];
  if (!agentPayCategory) {
    throw new ApiError("UNPROCESSABLE", "The cart has no resolvable AgentPay category.");
  }

  const items = resolved
    .map((entry) => entry.line)
    .sort((left, right) => left.merchantSku.localeCompare(right.merchantSku));

  const issuedAt = input.now ?? new Date();
  const totals = priceCart(items);

  const payload: QuotePayload = {
    quoteId: input.quoteId ?? `quote_${randomUUID()}`,
    merchantId: input.merchantId,
    merchantOrderRef: input.merchantOrderRef ?? `order_${randomUUID()}`,
    catalogVersion: CATALOG_VERSION,
    agentPayCategory,
    items,
    ...totals,
    currency: CURRENCY,
    issuedAt: issuedAt.toISOString(),
    expiresAt: new Date(issuedAt.valueOf() + input.ttlSeconds * 1_000).toISOString(),
    cartHash: cartHash({ merchantId: input.merchantId, catalogVersion: CATALOG_VERSION, items }),
  };

  return {
    ...payload,
    signature: { keyId: input.signer.keyId, algorithm: "Ed25519", value: input.signer.sign(payload) },
  };
}

export function quotePayload(quote: SignedQuote): QuotePayload {
  const { signature: _signature, ...payload } = quote;
  return payload;
}

export function isQuoteExpired(quote: SignedQuote, now: Date = new Date()): boolean {
  return now.valueOf() > new Date(quote.expiresAt).valueOf();
}

export function verifyQuote(input: {
  quote: SignedQuote;
  publicJwk: Parameters<typeof verifyQuoteSignature>[0]["publicJwk"];
}): boolean {
  return verifyQuoteSignature({
    publicJwk: input.publicJwk,
    payload: quotePayload(input.quote),
    signature: input.quote.signature.value,
  });
}
