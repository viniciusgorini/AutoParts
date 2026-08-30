import { describe, expect, it } from "vitest";

import { createQuoteHandler, orderLookupHandler, verificationHandler } from "@/lib/handlers";
import type { SignedQuote } from "@/lib/quote";
import {
  createMandateFixture,
  createTestAgent,
  createTestService,
  createTestSettlementGateway,
  idempotencyKey,
  run,
  signRequestHeaders,
  url,
  type MandateFixture,
  type TestAgent,
} from "./harness";

type Service = ReturnType<typeof createTestService>;

async function issueQuote(
  service: Service,
  agent: TestAgent,
  items: { merchantSku: string; quantity: number }[] = [{ merchantSku: "AP-BRK-PADS-FRT", quantity: 1 }],
): Promise<SignedQuote> {
  service.registry.agents.set(agent.agentId, agent);
  const target = url("/v1/agents-pay/quotes");
  const body = JSON.stringify({ items });
  const headers = signRequestHeaders({ agent, method: "POST", url: target, body });
  headers.set("idempotency-key", idempotencyKey());

  const result = await run(createQuoteHandler(service), new Request(target, { method: "POST", headers, body }));
  if (result.status !== 201) {
    throw new Error(`quote creation failed: ${JSON.stringify(result.body)}`);
  }
  return result.body.quote as SignedQuote;
}

function verificationBody(quote: SignedQuote, mandate: MandateFixture, exceptionId?: string): string {
  return JSON.stringify({
    quote_id: quote.quoteId,
    product_id: quote.quoteId,
    merchant_id: quote.merchantId,
    mandate_id: mandate.mandate_id,
    ...(exceptionId ? { exception_id: exceptionId } : {}),
  });
}

async function verify(
  service: Service,
  agent: TestAgent,
  quote: SignedQuote,
  mandate: MandateFixture,
  options: { idempotencyKey?: string; body?: string; nonce?: string } = {},
) {
  const target = url(`/v1/agents-pay/orders/${quote.merchantOrderRef}/verification`);
  const body = options.body ?? verificationBody(quote, mandate);
  const headers = signRequestHeaders({
    agent,
    method: "POST",
    url: target,
    body,
    ...(options.nonce ? { nonce: options.nonce } : {}),
  });
  headers.set("idempotency-key", options.idempotencyKey ?? idempotencyKey());

  return run(
    verificationHandler(service, quote.merchantOrderRef),
    new Request(target, { method: "POST", headers, body }),
  );
}

async function setup(overrides?: Partial<MandateFixture>, settlement?: ReturnType<typeof createTestSettlementGateway>) {
  const service = createTestService(settlement ? { settlement } : undefined);
  const agent = createTestAgent();
  service.registry.agents.set(agent.agentId, agent);
  const quote = await issueQuote(service, agent);
  const mandate = service.registry.signMandate(
    createMandateFixture({ agent, ...(overrides ? { overrides } : {}) }),
  );
  return { service, agent, quote, mandate };
}

describe("mandate policy through the AgentPay SDK", () => {
  it("approves a purchase inside an active mandate", async () => {
    const { service, agent, quote, mandate } = await setup();
    const result = await verify(service, agent, quote, mandate);

    expect(result.status).toBe(200);
    expect(result.body.decision).toBe("verification_approved");
    expect(result.body.settlementStatus).toBe("captured");
    expect(result.body.orderComplete).toBe(true);
    expect(String(result.body.paymentOperationId)).toMatch(/^pay_mock_/);

    // The SDK really did consult the registry.
    const paths = service.registry.calls.map((call) => new URL(call.url).pathname);
    expect(paths.some((path) => path.startsWith("/api/registry/mandates/"))).toBe(true);
    expect(paths).toContain("/api/registry/keys");
  });

  it("refuses an expired mandate", async () => {
    const past = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const { service, agent, quote, mandate } = await setup({
      validity: { not_before: new Date(Date.now() - 20 * 86_400_000).toISOString(), expires_at: past },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.decision).toBe("verification_rejected");
    expect(result.body.reasonCode).toBe("MANDATE_EXPIRED");
    expect(result.body.paymentOperationId).toBeNull();
  });

  it("refuses a revoked mandate", async () => {
    const { service, agent, quote, mandate } = await setup({ status: "revoked" });
    const result = await verify(service, agent, quote, mandate);

    expect(result.body.decision).toBe("verification_rejected");
    expect(result.body.reasonCode).toBe("MANDATE_REVOKED");
    expect(result.body.paymentOperationId).toBeNull();
  });

  it("refuses a mandate that belongs to another agent", async () => {
    const service = createTestService();
    const owner = createTestAgent();
    const other = createTestAgent();
    service.registry.agents.set(owner.agentId, owner);
    service.registry.agents.set(other.agentId, other);

    const quote = await issueQuote(service, other);
    const mandate = service.registry.signMandate(createMandateFixture({ agent: owner }));

    const result = await verify(service, other, quote, mandate);
    expect(result.body.decision).toBe("verification_rejected");
    expect(result.body.reasonCode).toBe("MANDATE_SIGNATURE_INVALID");
  });

  it("refuses a merchant outside the mandate scope", async () => {
    const { service, agent, quote, mandate } = await setup({
      scope: { merchants: ["mrc_somewhere_else"], categories: ["tires", "accessories"] },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.reasonCode).toBe("MERCHANT_NOT_IN_SCOPE");
  });

  it("refuses a category outside the mandate scope", async () => {
    const { service, agent, quote, mandate } = await setup({
      scope: { merchants: ["mrc_autoparts_test"], categories: ["tires"] },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.reasonCode).toBe("CATEGORY_NOT_IN_SCOPE");
  });

  it("refuses a currency mismatch", async () => {
    const { service, agent, quote, mandate } = await setup({
      limits: {
        per_purchase_cents: 500_000,
        cumulative_cents: 1_000_000,
        max_uses: 10,
        period: "month",
        currency: "EUR",
      },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.reasonCode).toBe("CURRENCY_MISMATCH");
  });

  it("refuses when the mandate has no uses left", async () => {
    const { service, agent, quote, mandate } = await setup({
      usage: { approved_uses: 10, cumulative_cents: 0 },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.reasonCode).toBe("USES_EXCEEDED");
  });

  it("refuses when the cumulative limit would be exceeded", async () => {
    const { service, agent, quote, mandate } = await setup({
      limits: {
        per_purchase_cents: 500_000,
        cumulative_cents: 30_000,
        max_uses: 10,
        period: "month",
        currency: "USD",
      },
      usage: { approved_uses: 1, cumulative_cents: 25_000 },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.reasonCode).toBe("CUMULATIVE_EXCEEDED");
  });

  it("escalates when the amount is above the per-purchase limit", async () => {
    const { service, agent, quote, mandate } = await setup({
      limits: {
        per_purchase_cents: 1_000,
        cumulative_cents: 1_000_000,
        max_uses: 10,
        period: "month",
        currency: "USD",
      },
    });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.decision).toBe("approval_required");
    expect(result.body.reasonCode).toBe("AMOUNT_EXCEEDS_LIMIT");
    expect(result.body.paymentOperationId).toBeNull();
    expect(result.body.orderComplete).toBe(false);
  });

  it("refuses an unsigned mandate", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);
    const quote = await issueQuote(service, agent);

    const unsigned = createMandateFixture({ agent });
    service.registry.mandates.set(unsigned.mandate_id, unsigned);

    const result = await verify(service, agent, quote, unsigned);
    expect(result.body.reasonCode).toBe("MANDATE_SIGNATURE_INVALID");
  });

  it("refuses a mandate that does not exist", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);
    const quote = await issueQuote(service, agent);
    const missing = createMandateFixture({ agent });

    const result = await verify(service, agent, quote, missing);
    expect(result.body.reasonCode).toBe("MANDATE_SIGNATURE_INVALID");
  });

  it("blocks a mandate revoked between quoting and the final decision", async () => {
    const { service, agent, quote, mandate } = await setup();
    service.registry.mandates.set(mandate.mandate_id, { ...mandate, status: "revoked" });

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.decision).toBe("verification_rejected");
    expect(result.body.reasonCode).toBe("MANDATE_REVOKED");
  });
});

describe("idempotency and concurrency", () => {
  it("replays the stored result for the same key and payload", async () => {
    const { service, agent, quote, mandate } = await setup();
    const key = idempotencyKey();

    const first = await verify(service, agent, quote, mandate, { idempotencyKey: key });
    const second = await verify(service, agent, quote, mandate, { idempotencyKey: key });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.paymentOperationId).toBe(first.body.paymentOperationId);
    expect(second.headers.get("idempotent-replay")).toBe("true");
  });

  it("conflicts when the same key arrives with a different payload", async () => {
    const { service, agent, quote, mandate } = await setup();
    const key = idempotencyKey();

    await verify(service, agent, quote, mandate, { idempotencyKey: key });
    const second = await verify(service, agent, quote, mandate, {
      idempotencyKey: key,
      body: JSON.stringify({
        quote_id: quote.quoteId,
        product_id: quote.quoteId,
        merchant_id: quote.merchantId,
        mandate_id: mandate.mandate_id,
        exception_id: "11111111-1111-1111-1111-111111111111",
      }),
    });

    expect(second.status).toBe(409);
    expect((second.body.error as { code: string }).code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects a missing, empty, or oversized key", async () => {
    const { service, agent, quote, mandate } = await setup();
    const target = url(`/v1/agents-pay/orders/${quote.merchantOrderRef}/verification`);
    const body = verificationBody(quote, mandate);

    const withKey = async (value: string | null) => {
      const headers = signRequestHeaders({ agent, method: "POST", url: target, body });
      if (value !== null) headers.set("idempotency-key", value);
      return run(
        verificationHandler(service, quote.merchantOrderRef),
        new Request(target, { method: "POST", headers, body }),
      );
    };

    expect((await withKey(null)).status).toBe(400);
    expect((await withKey("   ")).status).toBe(400);
    expect((await withKey("short")).status).toBe(400);
    expect((await withKey("k".repeat(300))).status).toBe(400);
  });

  it("never issues two payment operations for two concurrent purchases", async () => {
    const settlement = createTestSettlementGateway();
    const { service, agent, quote, mandate } = await setup(undefined, settlement);

    const [first, second] = await Promise.all([
      verify(service, agent, quote, mandate),
      verify(service, agent, quote, mandate),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);
    expect(settlement.calls).toBe(1);
  });

  it("refuses to replace a terminal decision", async () => {
    const { service, agent, quote, mandate } = await setup();

    const first = await verify(service, agent, quote, mandate);
    expect(first.body.decision).toBe("verification_approved");

    const second = await verify(service, agent, quote, mandate);
    expect(second.status).toBe(409);
    expect((second.body.error as { code: string }).code).toBe("ORDER_DECISION_FINAL");
  });

  it("refuses a replayed request proof", async () => {
    const { service, agent, quote, mandate } = await setup();
    const nonce = "nonce_verification_replay";

    await verify(service, agent, quote, mandate, { nonce });
    const replay = await verify(service, agent, quote, mandate, { nonce });

    expect(replay.status).toBe(409);
    expect((replay.body.error as { code: string }).code).toBe("REPLAYED_PROOF");
  });

  it("refuses a quote that belongs to another order reference", async () => {
    const { service, agent, quote, mandate } = await setup();
    const target = url("/v1/agents-pay/orders/order_someone_else/verification");
    const body = verificationBody(quote, mandate);
    const headers = signRequestHeaders({ agent, method: "POST", url: target, body });
    headers.set("idempotency-key", idempotencyKey());

    const result = await run(
      verificationHandler(service, "order_someone_else"),
      new Request(target, { method: "POST", headers, body }),
    );

    expect(result.status).toBe(400);
  });

  it("refuses a request aimed at another merchant", async () => {
    const { service, agent, quote, mandate } = await setup();
    const body = JSON.stringify({
      quote_id: quote.quoteId,
      product_id: quote.quoteId,
      merchant_id: "mrc_other",
      mandate_id: mandate.mandate_id,
    });

    const result = await verify(service, agent, quote, mandate, { body });
    expect(result.status).toBe(403);
    expect((result.body.error as { code: string }).code).toBe("QUOTE_MERCHANT_MISMATCH");
  });
});

describe("mock settlement", () => {
  it("issues an opaque single-use operation only after approval", async () => {
    const { service, agent, quote, mandate } = await setup();
    const result = await verify(service, agent, quote, mandate);

    const operation = String(result.body.paymentOperationId);
    expect(operation).toMatch(/^pay_mock_[0-9a-f-]{36}$/);
    expect(result.body.settlementStatus).toBe("captured");
  });

  it("issues nothing after a refusal", async () => {
    const settlement = createTestSettlementGateway();
    const { service, agent, quote, mandate } = await setup({ status: "revoked" }, settlement);

    const result = await verify(service, agent, quote, mandate);
    expect(result.body.paymentOperationId).toBeNull();
    expect(result.body.settlementStatus).toBe("none");
    expect(settlement.calls).toBe(0);
  });

  it("leaves the order incomplete when settlement fails after authorisation", async () => {
    const settlement = createTestSettlementGateway("fail");
    const { service, agent, quote, mandate } = await setup(undefined, settlement);

    const result = await verify(service, agent, quote, mandate);
    expect(settlement.calls).toBe(1);
    expect(result.body.settlementStatus).toBe("failed");
    expect(result.body.orderComplete).toBe(false);
    expect(result.body.paymentOperationId).toBeNull();
  });

  it("exposes the recorded order for audit", async () => {
    const { service, agent, quote, mandate } = await setup();
    await verify(service, agent, quote, mandate);

    const target = url(`/api/orders/${quote.merchantOrderRef}`);
    const result = await run(
      orderLookupHandler(service, quote.merchantOrderRef),
      new Request(target, { method: "GET" }),
    );

    expect(result.status).toBe(200);
    expect(result.body.decision).toBe("verification_approved");
    expect(result.body.orderComplete).toBe(true);
  });

  it("returns 404 for an unknown order", async () => {
    const service = createTestService();
    const result = await run(
      orderLookupHandler(service, "order_missing"),
      new Request(url("/api/orders/order_missing"), { method: "GET" }),
    );
    expect(result.status).toBe(404);
  });
});
