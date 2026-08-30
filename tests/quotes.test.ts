import { compactVerify, importJWK } from "jose";
import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/jcs";
import {
  createQuote,
  publicQuote,
  quoteSigningPublicJwkForTests,
} from "@/lib/quotes";

describe("signed AgentPay V2 quotes", () => {
  it("creates an immutable quote with a local category and a verifiable ES256 JWS", async () => {
    const request = { items: [{ merchantSku: "prd_tire_std", quantity: 1 }] };
    const stored = await createQuote(request, canonicalize(request), `quote-test-${crypto.randomUUID()}`);
    const quote = publicQuote(stored);
    expect(quote).toMatchObject({
      merchantId: "mrc_autoparts",
      merchantCatalogVersion: "autoparts-2026-08-30",
      currency: "USD",
      subtotalMinor: 154_800,
      totalMinor: 170_174,
      lineItems: [{ merchantCategoryId: "fleet.tires", unitAmountMinor: 154_800 }],
    });
    expect(quote.signature.split(".")).toHaveLength(3);
    expect(quote).not.toHaveProperty("publicJwk");

    const { payload } = await compactVerify(
      quote.signature,
      await importJWK(await quoteSigningPublicJwkForTests(), "ES256"),
      { algorithms: ["ES256"] },
    );
    expect(new TextDecoder().decode(payload)).toBe(canonicalize({
      id: quote.id,
      merchantId: quote.merchantId,
      merchantOrderRef: quote.merchantOrderRef,
      issuedAt: quote.issuedAt,
      merchantCatalogVersion: quote.merchantCatalogVersion,
      lineItems: quote.lineItems,
      subtotalMinor: quote.subtotalMinor,
      shippingMinor: quote.shippingMinor,
      taxMinor: quote.taxMinor,
      totalMinor: quote.totalMinor,
      currency: quote.currency,
      expiresAt: quote.expiresAt,
      merchantCartHash: quote.merchantCartHash,
      keyId: quote.keyId,
    }));
  });

  it("returns the same quote for an idempotent retry and refuses payload reuse", async () => {
    const key = `quote-idempotency-${crypto.randomUUID()}`;
    const request = { items: [{ merchantSku: "prd_brake_hd", quantity: 2 }] };
    const canonical = canonicalize(request);
    const first = await createQuote(request, canonical, key);
    const retry = await createQuote(request, canonical, key);
    expect(retry.quote.id).toBe(first.quote.id);
    await expect(createQuote(
      { items: [{ merchantSku: "prd_brake_hd", quantity: 3 }] },
      canonicalize({ items: [{ merchantSku: "prd_brake_hd", quantity: 3 }] }),
      key,
    )).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });
});
