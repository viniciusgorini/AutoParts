import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/lib/canonical";
import { createQuoteHandler, getQuoteHandler } from "@/lib/handlers";
import { applyBasisPoints } from "@/lib/money";
import {
  SHIPPING_FLAT_CENTS,
  TAX_BASIS_POINTS,
  cartHash,
  createQuote,
  isQuoteExpired,
  quotePayload,
  verifyQuote,
  type SignedQuote,
} from "@/lib/quote";
import { createQuoteSigner, generateQuoteKeyPairJwk } from "@/lib/signing";
import {
  createTestAgent,
  createTestService,
  idempotencyKey,
  run,
  signRequestHeaders,
  url,
} from "./harness";

const MERCHANT = "mrc_autoparts_test";

function signer() {
  const pair = generateQuoteKeyPairJwk();
  return {
    signer: createQuoteSigner({ keyId: "k1", privateJwk: pair.privateJwk }),
    publicJwk: pair.publicJwk,
  };
}

describe("quote pricing and signing", () => {
  it("prices a valid cart in cents", () => {
    const { signer: quoteSigner } = signer();
    const quote = createQuote({
      merchantId: MERCHANT,
      items: [{ merchantSku: "AP-BRK-PADS-FRT", quantity: 2 }],
      signer: quoteSigner,
      ttlSeconds: 900,
    });

    expect(quote.subtotalCents).toBe(21_500 * 2);
    expect(quote.shippingCents).toBe(SHIPPING_FLAT_CENTS); // 43000 is below the free-shipping threshold
    expect(quote.taxCents).toBe(applyBasisPoints(43_000, TAX_BASIS_POINTS));
    expect(quote.totalCents).toBe(quote.subtotalCents + quote.shippingCents + quote.taxCents);
    expect(quote.currency).toBe("USD");
    expect(Number.isSafeInteger(quote.totalCents)).toBe(true);
  });

  it("charges flat shipping below the threshold", () => {
    const { signer: quoteSigner } = signer();
    const quote = createQuote({
      merchantId: MERCHANT,
      items: [{ merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 }],
      signer: quoteSigner,
      ttlSeconds: 900,
    });

    expect(quote.subtotalCents).toBe(12_900);
    expect(quote.shippingCents).toBe(SHIPPING_FLAT_CENTS);
    expect(quote.taxCents).toBe(1_548);
    expect(quote.totalCents).toBe(12_900 + SHIPPING_FLAT_CENTS + 1_548);
  });

  it("rejects an unknown SKU", () => {
    const { signer: quoteSigner } = signer();
    expect(() =>
      createQuote({
        merchantId: MERCHANT,
        items: [{ merchantSku: "AP-NOPE", quantity: 1 }],
        signer: quoteSigner,
        ttlSeconds: 900,
      }),
    ).toThrowError(/No product matches SKU/);
  });

  it("rejects insufficient stock", () => {
    const { signer: quoteSigner } = signer();
    expect(() =>
      createQuote({
        merchantId: MERCHANT,
        items: [{ merchantSku: "AP-BAT-60AH", quantity: 99 }],
        signer: quoteSigner,
        ttlSeconds: 900,
      }),
    ).toThrowError(/available/);
  });

  it("rejects an out-of-stock product", () => {
    const { signer: quoteSigner } = signer();
    expect(() =>
      createQuote({
        merchantId: MERCHANT,
        items: [{ merchantSku: "AP-FLT-OIL-STD", quantity: 1 }],
        signer: quoteSigner,
        ttlSeconds: 900,
      }),
    ).toThrowError(/available/);
  });

  it("rejects an invalid quantity", () => {
    const { signer: quoteSigner } = signer();
    expect(() =>
      createQuote({
        merchantId: MERCHANT,
        items: [{ merchantSku: "AP-ACC-MATS-UNIV", quantity: 0 }],
        signer: quoteSigner,
        ttlSeconds: 900,
      }),
    ).toThrowError();
  });

  it("refuses a cart that mixes AgentPay categories", () => {
    const { signer: quoteSigner } = signer();
    expect(() =>
      createQuote({
        merchantId: MERCHANT,
        items: [
          { merchantSku: "AP-TIRE-20555R16-STD", quantity: 1 },
          { merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 },
        ],
        signer: quoteSigner,
        ttlSeconds: 900,
      }),
    ).toThrowError(/single AgentPay category/);
  });

  it("produces a stable cart hash regardless of item order", () => {
    const { signer: quoteSigner } = signer();
    const first = createQuote({
      merchantId: MERCHANT,
      items: [
        { merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 },
        { merchantSku: "AP-BRK-PADS-FRT", quantity: 2 },
      ],
      signer: quoteSigner,
      ttlSeconds: 900,
    });
    const second = createQuote({
      merchantId: MERCHANT,
      items: [
        { merchantSku: "AP-BRK-PADS-FRT", quantity: 2 },
        { merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 },
      ],
      signer: quoteSigner,
      ttlSeconds: 900,
    });

    expect(first.cartHash).toBe(second.cartHash);
    expect(first.cartHash).not.toBe(
      cartHash({
        merchantId: MERCHANT,
        catalogVersion: first.catalogVersion,
        items: [{ ...first.items[0]!, quantity: 9 }],
      }),
    );
  });

  it("canonicalises independently of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it("verifies its own signature", () => {
    const { signer: quoteSigner, publicJwk } = signer();
    const quote = createQuote({
      merchantId: MERCHANT,
      items: [{ merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 }],
      signer: quoteSigner,
      ttlSeconds: 900,
    });

    expect(verifyQuote({ quote, publicJwk })).toBe(true);
    expect(quote.signature.algorithm).toBe("Ed25519");
    expect(quote.signature.keyId).toBe("k1");
  });

  it("rejects a signature made by another key", () => {
    const { signer: quoteSigner } = signer();
    const other = signer();
    const quote = createQuote({
      merchantId: MERCHANT,
      items: [{ merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 }],
      signer: quoteSigner,
      ttlSeconds: 900,
    });

    expect(verifyQuote({ quote, publicJwk: other.publicJwk })).toBe(false);
  });

  it("rejects a body edited after signing", () => {
    const { signer: quoteSigner, publicJwk } = signer();
    const quote = createQuote({
      merchantId: MERCHANT,
      items: [{ merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 }],
      signer: quoteSigner,
      ttlSeconds: 900,
    });

    const tampered: SignedQuote = { ...quote, totalCents: 1 };
    expect(verifyQuote({ quote: tampered, publicJwk })).toBe(false);
    expect(quotePayload(tampered)).not.toHaveProperty("signature");
  });

  it("reports expiry against the clock", () => {
    const { signer: quoteSigner } = signer();
    const issuedAt = new Date("2026-01-01T00:00:00.000Z");
    const quote = createQuote({
      merchantId: MERCHANT,
      items: [{ merchantSku: "AP-ACC-MATS-UNIV", quantity: 1 }],
      signer: quoteSigner,
      ttlSeconds: 60,
      now: issuedAt,
    });

    expect(isQuoteExpired(quote, new Date("2026-01-01T00:00:30.000Z"))).toBe(false);
    expect(isQuoteExpired(quote, new Date("2026-01-01T00:01:30.000Z"))).toBe(true);
  });
});

describe("quote endpoints", () => {
  async function createQuoteOverHttp(
    service: ReturnType<typeof createTestService>,
    agent = createTestAgent(),
    timestamp?: string,
  ) {
    service.registry.agents.set(agent.agentId, agent);
    const target = url("/v1/agents-pay/quotes");
    const body = JSON.stringify({ items: [{ merchantSku: "AP-BRK-PADS-FRT", quantity: 1 }] });
    const headers = signRequestHeaders({
      agent,
      method: "POST",
      url: target,
      body,
      ...(timestamp ? { timestamp } : {}),
    });
    headers.set("idempotency-key", idempotencyKey());

    const result = await run(
      createQuoteHandler(service),
      new Request(target, { method: "POST", headers, body }),
    );
    return { result, agent };
  }

  it("issues a signed quote to an authenticated agent", async () => {
    const service = createTestService();
    const { result } = await createQuoteOverHttp(service);

    expect(result.status).toBe(201);
    const quote = result.body.quote as SignedQuote;
    expect(quote.merchantId).toBe(MERCHANT);
    expect(quote.signature.value.length).toBeGreaterThan(0);
    expect(quote.currency).toBe("USD");
  });

  it("requires an Idempotency-Key", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);
    const target = url("/v1/agents-pay/quotes");
    const body = JSON.stringify({ items: [{ merchantSku: "AP-BRK-PADS-FRT", quantity: 1 }] });

    const result = await run(
      createQuoteHandler(service),
      new Request(target, {
        method: "POST",
        headers: signRequestHeaders({ agent, method: "POST", url: target, body }),
        body,
      }),
    );

    expect(result.status).toBe(400);
    expect((result.body.error as { code: string }).code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });

  it("returns the quote to the agent that owns it", async () => {
    const service = createTestService();
    const { result, agent } = await createQuoteOverHttp(service);
    const quote = result.body.quote as SignedQuote;

    const target = url(`/v1/agents-pay/quotes/${quote.quoteId}`);
    const read = await run(
      getQuoteHandler(service, quote.quoteId),
      new Request(target, {
        method: "GET",
        headers: signRequestHeaders({ agent, method: "GET", url: target, body: "" }),
      }),
    );

    expect(read.status).toBe(200);
    expect((read.body.quote as SignedQuote).quoteId).toBe(quote.quoteId);
  });

  it("refuses a quote belonging to another agent", async () => {
    const service = createTestService();
    const { result } = await createQuoteOverHttp(service);
    const quote = result.body.quote as SignedQuote;

    const intruder = createTestAgent();
    service.registry.agents.set(intruder.agentId, intruder);
    const target = url(`/v1/agents-pay/quotes/${quote.quoteId}`);

    const read = await run(
      getQuoteHandler(service, quote.quoteId),
      new Request(target, {
        method: "GET",
        headers: signRequestHeaders({ agent: intruder, method: "GET", url: target, body: "" }),
      }),
    );

    expect(read.status).toBe(403);
  });

  it("returns 404 for a quote that does not exist", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);
    const target = url("/v1/agents-pay/quotes/quote_missing");

    const read = await run(
      getQuoteHandler(service, "quote_missing"),
      new Request(target, {
        method: "GET",
        headers: signRequestHeaders({ agent, method: "GET", url: target, body: "" }),
      }),
    );

    expect(read.status).toBe(404);
  });

  it("reports an expired quote as gone", async () => {
    let current = new Date("2026-01-01T00:00:00.000Z");
    const service = createTestService({ now: () => current, quoteTtlSeconds: 60 });
    const { result, agent } = await createQuoteOverHttp(
      service,
      createTestAgent(),
      current.toISOString(),
    );
    const quote = result.body.quote as SignedQuote;

    current = new Date("2026-01-01T00:05:00.000Z");
    const target = url(`/v1/agents-pay/quotes/${quote.quoteId}`);
    const read = await run(
      getQuoteHandler(service, quote.quoteId),
      new Request(target, {
        method: "GET",
        headers: signRequestHeaders({
          agent,
          method: "GET",
          url: target,
          body: "",
          timestamp: current.toISOString(),
        }),
      }),
    );

    expect(read.status).toBe(410);
    expect((read.body.error as { code: string }).code).toBe("QUOTE_EXPIRED");
  });
});
