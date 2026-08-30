import { calculateCart } from "@/lib/cart";
import { CATALOG_VERSION, getProduct, MERCHANT_ID } from "@/lib/catalog";
import { canonicalize, sha256Base64Url, type JsonValue } from "@/lib/jcs";

export type QuoteRequest = {
  items: Array<{ merchantSku: string; quantity: number }>;
  metadata?: Record<string, string>;
};

export type SignedQuote = {
  quote: {
    id: string;
    merchantId: string;
    merchantOrderRef: string;
    catalogVersion: string;
    items: Array<{ merchantSku: string; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }>;
    subtotalCents: number;
    shippingCents: number;
    taxCents: number;
    totalCents: number;
    currency: "USD";
    metadata: Record<string, string>;
    requestHash: string;
    cartHash: string;
    issuedAt: string;
    expiresAt: string;
  };
  keyId: string;
  publicJwk: JsonWebKey;
  jws: string;
};

type StoredQuote = SignedQuote & { idempotencyKey: string; idempotencyHash: string };

const globalQuoteState = globalThis as typeof globalThis & {
  autopartsQuotes?: Map<string, StoredQuote>;
  autopartsQuoteIdempotency?: Map<string, string>;
  autopartsDevelopmentKey?: Promise<CryptoKeyPair>;
};

const quotes = globalQuoteState.autopartsQuotes ??= new Map();
const idempotency = globalQuoteState.autopartsQuoteIdempotency ??= new Map();

async function signingKey() {
  const configured = process.env.AGENTPAY_MERCHANT_PRIVATE_JWK;
  if (configured) {
    const privateJwk = JSON.parse(configured) as JsonWebKey;
    const privateKey = await crypto.subtle.importKey(
      "jwk",
      privateJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
    const publicJwk = { ...privateJwk };
    delete publicJwk.d;
    return {
      privateKey,
      publicJwk,
      keyId: process.env.AGENTPAY_MERCHANT_KEY_ID || (privateJwk as JsonWebKey & { kid?: string }).kid || "autoparts-es256",
    };
  }
  if (process.env.NODE_ENV === "production") throw new Error("QUOTE_SIGNING_KEY_REQUIRED");
  globalQuoteState.autopartsDevelopmentKey ??= crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const pair = await globalQuoteState.autopartsDevelopmentKey;
  return {
    privateKey: pair.privateKey,
    publicJwk: await crypto.subtle.exportKey("jwk", pair.publicKey),
    keyId: "autoparts-development-es256",
  };
}

function toBase64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

async function signQuote(payload: JsonValue) {
  const { privateKey, publicJwk, keyId } = await signingKey();
  const protectedHeader = toBase64Url(JSON.stringify({ alg: "ES256", kid: keyId, typ: "agentpay-quote+jws" }));
  const encodedPayload = toBase64Url(canonicalize(payload));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(`${protectedHeader}.${encodedPayload}`),
  );
  return { keyId, publicJwk, jws: `${protectedHeader}.${encodedPayload}.${Buffer.from(signature).toString("base64url")}` };
}

export async function createQuote(input: QuoteRequest, canonicalRequest: string, idempotencyKey: string, now = new Date()) {
  const idempotencyHash = await sha256Base64Url(canonicalRequest);
  const existingQuoteId = idempotency.get(idempotencyKey);
  if (existingQuoteId) {
    const existing = quotes.get(existingQuoteId);
    if (existing?.idempotencyHash !== idempotencyHash) throw new Error("IDEMPOTENCY_KEY_REUSED");
    if (existing) return existing;
  }

  const cartLines = input.items.map((item) => {
    const product = getProduct(item.merchantSku);
    if (!product) throw new Error(`PRODUCT_NOT_FOUND:${item.merchantSku}`);
    if (item.quantity > product.availableQuantity) throw new Error(`INSUFFICIENT_STOCK:${item.merchantSku}`);
    return { productId: product.id, quantity: item.quantity };
  });
  const totals = calculateCart(cartLines);
  const items = totals.items.map(({ product, quantity, lineTotalCents }) => ({
    merchantSku: product.sku,
    name: product.name,
    quantity,
    unitPriceCents: product.priceCents,
    lineTotalCents,
  }));
  const cartHash = await sha256Base64Url(canonicalize(items as unknown as JsonValue));
  const quote = {
    id: `qte_${crypto.randomUUID()}`,
    merchantId: MERCHANT_ID,
    merchantOrderRef: `ord_${crypto.randomUUID()}`,
    catalogVersion: CATALOG_VERSION,
    items,
    subtotalCents: totals.subtotalCents,
    shippingCents: totals.shippingCents,
    taxCents: totals.taxCents,
    totalCents: totals.totalCents,
    currency: "USD" as const,
    metadata: input.metadata ?? {},
    requestHash: idempotencyHash,
    cartHash,
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.valueOf() + 15 * 60_000).toISOString(),
  };
  const signature = await signQuote(quote as unknown as JsonValue);
  const stored = { quote, ...signature, idempotencyKey, idempotencyHash };
  quotes.set(quote.id, stored);
  idempotency.set(idempotencyKey, quote.id);
  return stored;
}

export function getQuote(quoteId: string) {
  return quotes.get(quoteId);
}

export function publicQuote(stored: StoredQuote): SignedQuote {
  return { quote: stored.quote, keyId: stored.keyId, publicJwk: stored.publicJwk, jws: stored.jws };
}
