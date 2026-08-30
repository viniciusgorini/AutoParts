import {
  MerchantQuotePayloadSchema,
  MerchantQuoteRequestSchema,
  type MerchantQuote,
  type MerchantQuotePayload,
  type MerchantQuoteRequest,
} from "@agentic-mandates/contracts";
import { sha256Base64Url } from "@agentic-mandates/sdk";
import { CompactSign, exportJWK, generateKeyPair, importJWK, type JWK } from "jose";

import { calculateCart } from "@/lib/cart";
import { CATALOG_VERSION, getProduct, MERCHANT_ID } from "@/lib/catalog";
import { canonicalize } from "@/lib/jcs";

export type QuoteRequest = MerchantQuoteRequest;
export type SignedQuote = MerchantQuote;

type StoredQuote = {
  quote: MerchantQuote;
  idempotencyKey: string;
  idempotencyHash: string;
};

type QuoteSigningMaterial = {
  privateJwk: JWK;
  keyId: string;
};

const globalQuoteState = globalThis as typeof globalThis & {
  autopartsQuotes?: Map<string, StoredQuote>;
  autopartsQuoteIdempotency?: Map<string, string>;
  autopartsDevelopmentSigningMaterial?: Promise<QuoteSigningMaterial>;
};

const quotes = globalQuoteState.autopartsQuotes ??= new Map();
const idempotency = globalQuoteState.autopartsQuoteIdempotency ??= new Map();
const textEncoder = new TextEncoder();

async function signingMaterial(): Promise<QuoteSigningMaterial> {
  const configured = process.env.AGENTPAY_MERCHANT_PRIVATE_JWK;
  if (configured) {
    const privateJwk = JSON.parse(configured) as JWK;
    return {
      privateJwk,
      keyId: process.env.AGENTPAY_MERCHANT_KEY_ID ?? privateJwk.kid ?? "autoparts-quote-key",
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("QUOTE_SIGNING_KEY_REQUIRED");
  }

  globalQuoteState.autopartsDevelopmentSigningMaterial ??= (async () => {
    const keyPair = await generateKeyPair("ES256", { extractable: true });
    return {
      privateJwk: await exportJWK(keyPair.privateKey),
      keyId: "autoparts-development-quote-key",
    };
  })();
  return globalQuoteState.autopartsDevelopmentSigningMaterial;
}

async function signQuote(payload: MerchantQuotePayload): Promise<MerchantQuote> {
  const material = await signingMaterial();
  const validated = MerchantQuotePayloadSchema.parse(payload);
  const privateKey = await importJWK(material.privateJwk, "ES256");
  const signature = await new CompactSign(textEncoder.encode(canonicalize(validated)))
    .setProtectedHeader({
      alg: "ES256",
      kid: validated.keyId,
      typ: "application/agents-pay-quote+jws",
    })
    .sign(privateKey);

  return { ...validated, signature };
}

export async function createQuote(
  request: QuoteRequest,
  canonicalRequest: string,
  idempotencyKey: string,
  now = new Date(),
) {
  const parsedRequest = MerchantQuoteRequestSchema.parse(request);
  const idempotencyHash = await hashText(canonicalRequest);
  const existingQuoteId = idempotency.get(idempotencyKey);
  if (existingQuoteId) {
    const existing = quotes.get(existingQuoteId);
    if (existing?.idempotencyHash !== idempotencyHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (existing) return existing;
  }

  const requestedQuantities = new Map<string, number>();
  for (const item of parsedRequest.items) {
    requestedQuantities.set(item.merchantSku, (requestedQuantities.get(item.merchantSku) ?? 0) + item.quantity);
  }

  const cartLines = [...requestedQuantities.entries()].map(([merchantSku, quantity]) => {
    const product = getProduct(merchantSku);
    if (!product) throw new Error(`SKU_NOT_FOUND:${merchantSku}`);
    if (quantity > product.availableQuantity) throw new Error(`INSUFFICIENT_INVENTORY:${merchantSku}`);
    return { productId: product.id, quantity };
  });
  const totals = calculateCart(cartLines);
  const lineItems = totals.items.map(({ product, quantity }) => ({
    merchantSku: product.sku,
    merchantCategoryId: product.category,
    name: product.name,
    quantity,
    unitAmountMinor: product.priceCents,
    attributes: product.attributes,
  }));
  const material = await signingMaterial();
  const issuedAt = now.toISOString();
  const quoteWithoutCartHash = {
    id: `quote_${crypto.randomUUID()}`,
    merchantId: MERCHANT_ID,
    merchantOrderRef: `order_${crypto.randomUUID()}`,
    issuedAt,
    merchantCatalogVersion: CATALOG_VERSION,
    lineItems,
    subtotalMinor: totals.subtotalCents,
    shippingMinor: totals.shippingCents,
    taxMinor: totals.taxCents,
    totalMinor: totals.totalCents,
    currency: "USD" as const,
    expiresAt: new Date(now.valueOf() + 15 * 60_000).toISOString(),
    keyId: material.keyId,
  };
  const quote = await signQuote({
    ...quoteWithoutCartHash,
    merchantCartHash: await hashText(canonicalize({
      merchantId: quoteWithoutCartHash.merchantId,
      merchantCatalogVersion: quoteWithoutCartHash.merchantCatalogVersion,
      lineItems: quoteWithoutCartHash.lineItems,
      subtotalMinor: quoteWithoutCartHash.subtotalMinor,
      shippingMinor: quoteWithoutCartHash.shippingMinor,
      taxMinor: quoteWithoutCartHash.taxMinor,
      totalMinor: quoteWithoutCartHash.totalMinor,
      currency: quoteWithoutCartHash.currency,
    })),
  });
  const stored = { quote, idempotencyKey, idempotencyHash };
  quotes.set(quote.id, stored);
  idempotency.set(idempotencyKey, quote.id);
  return stored;
}

export function getQuote(quoteId: string) {
  return quotes.get(quoteId);
}

export function publicQuote(stored: StoredQuote): SignedQuote {
  return stored.quote;
}

/** Public material for local contract tests; a deployment registers it out of band. */
export async function quoteSigningPublicJwkForTests(): Promise<JWK> {
  const publicJwk = { ...(await signingMaterial()).privateJwk };
  delete publicJwk.d;
  return publicJwk;
}

async function hashText(value: string): Promise<string> {
  return sha256Base64Url(textEncoder.encode(value));
}
