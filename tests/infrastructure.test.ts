import { describe, expect, it } from "vitest";

import { discoveryDocument, quoteAsMerchantProduct, withFreshRegistryKeys } from "@/lib/agentpay";
import { EnvironmentError, loadEnv, resetEnvCache } from "@/lib/env";
import { searchHandler } from "@/lib/handlers";
import { applyBasisPoints, formatMoney, multiplyCents, MoneyError, sumCents } from "@/lib/money";
import { createMemoryRateLimitStore } from "@/lib/stores/memory";
import { createQuote } from "@/lib/quote";
import { createQuoteSigner, generateQuoteKeyPairJwk } from "@/lib/signing";
import { createTestAgent, createTestService, run, signRequestHeaders, url } from "./harness";

const BASE_ENV = {
  NODE_ENV: "production",
  AGENTPAY_REGISTRY_URL: "https://agentpay.example",
  AGENTPAY_MERCHANT_ID: "mrc_autoparts",
  AGENTPAY_MERCHANT_NAME: "AutoParts",
  AGENTPAY_MERCHANT_PRIVATE_JWK: '{"kty":"OKP"}',
  AGENTPAY_MERCHANT_KEY_ID: "key-1",
  AUTOPARTS_PUBLIC_ORIGIN: "https://autoparts.example",
} as unknown as NodeJS.ProcessEnv;

describe("money", () => {
  it("refuses non-integer and negative amounts", () => {
    expect(() => multiplyCents(10.5, 1)).toThrow(MoneyError);
    expect(() => multiplyCents(100, 0)).toThrow(MoneyError);
    expect(() => sumCents([-1])).toThrow(MoneyError);
  });

  it("applies tax in integer basis points", () => {
    expect(applyBasisPoints(12_900, 1_200)).toBe(1_548);
    expect(applyBasisPoints(0, 1_200)).toBe(0);
  });

  it("formats USD without touching the stored integer", () => {
    expect(formatMoney(154_800)).toBe("$1,548.00");
  });
});

describe("environment", () => {
  it("refuses in-memory persistence in production", () => {
    resetEnvCache();
    expect(() => loadEnv({ ...BASE_ENV, AUTOPARTS_PERSISTENCE: "memory" })).toThrow(EnvironmentError);
  });

  it("requires a database URL for durable persistence", () => {
    expect(() => loadEnv({ ...BASE_ENV, AUTOPARTS_PERSISTENCE: "durable" })).toThrow(/DATABASE_URL/);
  });

  it("refuses the demo signer in production", () => {
    expect(() =>
      loadEnv({
        ...BASE_ENV,
        AUTOPARTS_PERSISTENCE: "durable",
        DATABASE_URL: "postgres://localhost/autoparts",
        AUTOPARTS_DEMO_AGENT_ENABLED: "true",
        AUTOPARTS_DEMO_AGENT_ID: "agent",
        AUTOPARTS_DEMO_AGENT_PRIVATE_KEY: "pem",
      } as unknown as NodeJS.ProcessEnv),
    ).toThrow(/must be false in production/);
  });

  it("never echoes a secret value in the failure message", () => {
    try {
      loadEnv({ ...BASE_ENV, NODE_ENV: "development", AGENTPAY_MERCHANT_PRIVATE_JWK: undefined });
      throw new Error("expected a failure");
    } catch (error) {
      expect(String(error)).toContain("AGENTPAY_MERCHANT_PRIVATE_JWK");
      expect(String(error)).not.toContain("kty");
    }
  });
});

describe("discovery document", () => {
  it("is produced by the SDK and matches the agentpay/1.0 contract", () => {
    const manifest = discoveryDocument({
      merchantId: "mrc_autoparts",
      merchantName: "AutoParts",
      registryUrl: "https://agentpay-yuno.vercel.app",
      origin: "https://autoparts.example",
    });

    expect(manifest.protocol).toBe("agentpay/1.0");
    expect(manifest.merchant).toEqual({ id: "mrc_autoparts", name: "AutoParts" });
    expect(manifest.checkout_endpoint).toBe(
      "https://autoparts.example/v1/agents-pay/orders/verification",
    );
    expect(manifest.registry_url).toBe("https://agentpay-yuno.vercel.app/");
    expect(manifest.capabilities).toEqual(["intent-mandates", "live-revocation", "mock-payment"]);
  });
});

describe("quote as the purchasable unit", () => {
  it("presents the signed total to the SDK, not a line item", () => {
    const pair = generateQuoteKeyPairJwk();
    const quote = createQuote({
      merchantId: "mrc_autoparts_test",
      items: [{ merchantSku: "AP-BRK-PADS-FRT", quantity: 2 }],
      signer: createQuoteSigner({ keyId: "k1", privateJwk: pair.privateJwk }),
      ttlSeconds: 900,
    });

    const product = quoteAsMerchantProduct(quote);
    expect(product.id).toBe(quote.quoteId);
    expect(product.price_cents).toBe(quote.totalCents);
    expect(product.category).toBe(quote.agentPayCategory);
    expect(product.currency).toBe("USD");
  });
});

describe("rate limiting", () => {
  it("allows up to the limit and then reports a retry delay", async () => {
    const store = createMemoryRateLimitStore(() => new Date("2026-01-01T00:00:00.000Z"));
    for (let attempt = 0; attempt < 3; attempt += 1) {
      expect(await store.hit({ bucket: "b", limit: 3, windowSeconds: 60 })).toEqual({ allowed: true });
    }
    const blocked = await store.hit({ bucket: "b", limit: 3, windowSeconds: 60 });
    expect(blocked.allowed).toBe(false);
  });

  it("returns 429 with Retry-After on a protected route", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);
    const target = url("/v1/agents-pay/search");
    const body = JSON.stringify({ query: "tire" });

    let last = await run(
      searchHandler(service),
      new Request(target, {
        method: "POST",
        headers: signRequestHeaders({ agent, method: "POST", url: target, body }),
        body,
      }),
    );

    for (let attempt = 0; attempt < 70 && last.status !== 429; attempt += 1) {
      last = await run(
        searchHandler(service),
        new Request(target, {
          method: "POST",
          headers: signRequestHeaders({ agent, method: "POST", url: target, body }),
          body,
        }),
      );
    }

    expect(last.status).toBe(429);
    expect(last.headers.get("retry-after")).toBeTruthy();
  });

  it("fails closed when the limiter throws", async () => {
    const service = createTestService();
    const broken = {
      ...service,
      stores: {
        ...service.stores,
        rateLimit: {
          async hit(): Promise<never> {
            throw new Error("limiter down");
          },
        },
      },
    };
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);
    const target = url("/v1/agents-pay/search");
    const body = JSON.stringify({ query: "tire" });

    const result = await run(
      searchHandler(broken),
      new Request(target, {
        method: "POST",
        headers: signRequestHeaders({ agent, method: "POST", url: target, body }),
        body,
      }),
    );

    expect(result.status).toBe(503);
  });
});

describe("registry key freshness", () => {
  it("overrides the SDK's force-cache directive for the registry key endpoint", async () => {
    const seen: { path: string; cache: string | undefined }[] = [];
    const base: typeof fetch = async (input, init) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      seen.push({ path: new URL(href).pathname, cache: init?.cache });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    };

    const wrapped = withFreshRegistryKeys(base);
    await wrapped("https://registry.test/api/registry/keys", { cache: "force-cache" });
    await wrapped("https://registry.test/api/registry/mandates/abc", { cache: "no-store" });

    expect(seen[0]).toEqual({ path: "/api/registry/keys", cache: "no-store" });
    expect(seen[1]).toEqual({ path: "/api/registry/mandates/abc", cache: "no-store" });
  });
});
