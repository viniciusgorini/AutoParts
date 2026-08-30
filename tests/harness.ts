import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

import { sha256Base64Url } from "@/lib/canonical";
import type { MerchantIdentity } from "@/lib/agentpay";
import type { MerchantService } from "@/lib/service";
import { createQuoteSigner } from "@/lib/signing";
import { createMemoryStores } from "@/lib/stores/memory";
import type { SettlementGateway } from "@/lib/settlement";

/**
 * Test harness.
 *
 * Every key here is generated per run and is throwaway. Nothing in this file
 * ships to the application: routes always build their service from the real
 * composition root.
 */

export const TEST_MERCHANT_ID = "mrc_autoparts_test";
export const TEST_REGISTRY_URL = "https://registry.test";
export const TEST_ORIGIN = "https://autoparts.test";

export type TestAgent = { agentId: string; privateKeyPem: string; publicKeyPem: string };

export function createTestAgent(agentId = `agent_${randomUUID()}`): TestAgent {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    agentId,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** Mirrors the SDK's agent signing message so tests can forge valid requests. */
export function signRequestHeaders(input: {
  agent: TestAgent;
  method: string;
  url: string;
  body: string;
  timestamp?: string;
  nonce?: string;
  privateKeyPem?: string;
}): Headers {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const nonce = input.nonce ?? `nonce_${randomUUID()}`;
  const message = [
    input.method.toUpperCase(),
    new URL(input.url).pathname,
    sha256Base64Url(input.body),
    timestamp,
    nonce,
  ].join("|");

  const signature = sign(
    null,
    Buffer.from(message, "utf8"),
    input.privateKeyPem ?? input.agent.privateKeyPem,
  ).toString("base64url");

  return new Headers({
    "content-type": "application/json",
    "x-agent-id": input.agent.agentId,
    "x-timestamp": timestamp,
    "x-nonce": nonce,
    "x-signature": signature,
  });
}

export type MandateFixture = {
  mandate_id: string;
  type: "intent";
  issuer: { user_id: string };
  agent: { agent_id: string; public_key: string };
  scope: { merchants: string[]; categories: string[] };
  limits: {
    per_purchase_cents: number;
    cumulative_cents: number;
    max_uses: number;
    period: "month";
    currency: string;
  };
  validity: { not_before: string; expires_at: string };
  payment: { vault_card_id: string };
  authorization: { credential_id: string; mandate_hash: string; signed_at: string } | null;
  server_sig: string | null;
  status: "draft" | "active" | "revoked" | "expired";
  usage: { approved_uses: number; cumulative_cents: number };
};

export function createMandateFixture(input: {
  agent: TestAgent;
  overrides?: Partial<MandateFixture>;
}): MandateFixture {
  const now = Date.now();
  return {
    mandate_id: randomUUID(),
    type: "intent",
    issuer: { user_id: `user_${randomUUID()}` },
    agent: { agent_id: input.agent.agentId, public_key: input.agent.publicKeyPem },
    scope: { merchants: [TEST_MERCHANT_ID], categories: ["tires", "accessories"] },
    limits: {
      per_purchase_cents: 500_000,
      cumulative_cents: 1_000_000,
      max_uses: 10,
      period: "month",
      currency: "USD",
    },
    validity: {
      not_before: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 86_400_000).toISOString(),
    },
    payment: { vault_card_id: `card_${randomUUID()}` },
    authorization: null,
    server_sig: null,
    status: "active",
    usage: { approved_uses: 0, cumulative_cents: 0 },
    ...input.overrides,
  };
}

/**
 * Canonicalisation used by the AgentPay registry when it signs a mandate. The
 * SDK verifies against this exact form, so the fake registry must reproduce it.
 */
function registryCanonicalJson(value: unknown): string {
  const sortValue = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(sortValue);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, sortValue(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(sortValue(value));
}

export function mandateArtifact(mandate: MandateFixture): unknown {
  return {
    mandate_id: mandate.mandate_id,
    type: mandate.type,
    issuer: mandate.issuer,
    agent: mandate.agent,
    scope: mandate.scope,
    limits: mandate.limits,
    validity: mandate.validity,
    payment: mandate.payment,
    ...(mandate.authorization ? { authorization: mandate.authorization } : {}),
  };
}

export type FakeRegistry = {
  fetcher: typeof fetch;
  registryPublicKeyPem: string;
  agents: Map<string, TestAgent>;
  mandates: Map<string, MandateFixture>;
  consumedNonces: Set<string>;
  signMandate(mandate: MandateFixture): MandateFixture;
  calls: { url: string; method: string }[];
};

/**
 * Stand-in for AgentPay's public registry.
 *
 * It answers the four public endpoints the SDK calls, with a real Ed25519
 * registry key, so the SDK's signature verification runs for real against
 * fixtures we control.
 */
export function createFakeRegistry(): FakeRegistry {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const registryPrivateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  const registryPublicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

  const agents = new Map<string, TestAgent>();
  const mandates = new Map<string, MandateFixture>();
  const consumedNonces = new Set<string>();
  const calls: { url: string; method: string }[] = [];

  const signMandate = (mandate: MandateFixture): MandateFixture => {
    const signed: MandateFixture = {
      ...mandate,
      server_sig: sign(
        null,
        Buffer.from(registryCanonicalJson(mandateArtifact(mandate)), "utf8"),
        registryPrivateKeyPem,
      ).toString("base64url"),
    };
    mandates.set(signed.mandate_id, signed);
    return signed;
  };

  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    calls.push({ url: url.toString(), method });
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (url.pathname.startsWith("/api/registry/agents/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const agent = agents.get(id);
      return agent
        ? json({ id: agent.agentId, public_key: agent.publicKeyPem })
        : json({ error: "Agent not found" }, 404);
    }

    if (url.pathname === "/api/registry/keys") {
      return json({ algorithm: "Ed25519", public_key: registryPublicKeyPem });
    }

    if (url.pathname.startsWith("/api/registry/mandates/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      const mandate = mandates.get(id);
      return mandate ? json(mandate) : json({ error: "Mandate not found" }, 404);
    }

    if (url.pathname === "/api/registry/nonces" && method === "POST") {
      const body = JSON.parse(String(init?.body ?? "{}")) as { agent_id?: string; nonce?: string };
      const key = `${body.agent_id}:${body.nonce}`;
      if (consumedNonces.has(key)) return json({ error: "Nonce already used" }, 409);
      consumedNonces.add(key);
      return json({ consumed: true }, 201);
    }

    return json({ error: "Not found" }, 404);
  };

  return { fetcher, registryPublicKeyPem, agents, mandates, consumedNonces, signMandate, calls };
}

export function createTestSettlementGateway(
  behaviour: "capture" | "fail" = "capture",
): SettlementGateway & { calls: number } {
  const gateway = {
    calls: 0,
    async authorizeAndCapture() {
      gateway.calls += 1;
      if (behaviour === "fail") {
        throw new Error("settlement provider unavailable");
      }
      return { paymentOperationId: `pay_mock_${randomUUID()}`, settlementStatus: "captured" as const };
    },
  };
  return gateway;
}

export function createTestService(input?: {
  registry?: FakeRegistry;
  settlement?: SettlementGateway;
  now?: () => Date;
  quoteTtlSeconds?: number;
  merchantId?: string;
}): MerchantService & { registry: FakeRegistry } {
  const registry = input?.registry ?? createFakeRegistry();
  const { privateKey } = generateKeyPairSync("ed25519");

  const identity: MerchantIdentity = {
    merchantId: input?.merchantId ?? TEST_MERCHANT_ID,
    merchantName: "AutoParts",
    registryUrl: TEST_REGISTRY_URL,
    origin: TEST_ORIGIN,
  };

  return {
    identity,
    signer: createQuoteSigner({
      keyId: "test-quote-key-1",
      privateJwk: JSON.stringify(privateKey.export({ format: "jwk" })),
    }),
    stores: createMemoryStores(input?.now),
    settlement: input?.settlement ?? createTestSettlementGateway(),
    quoteTtlSeconds: input?.quoteTtlSeconds ?? 900,
    now: input?.now ?? (() => new Date()),
    fetcher: registry.fetcher,
    registry,
  };
}

export function url(path: string): string {
  return new URL(path, TEST_ORIGIN).toString();
}

export function idempotencyKey(): string {
  return `idem_${randomUUID()}`;
}

/** Runs a handler through the same wrapper the routes use. */
export async function run(
  handler: (request: Request, context: { requestId: string }) => Promise<Response>,
  request: Request,
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const { withApiRequest } = await import("@/lib/http");
  const response = await withApiRequest(handler)(request);
  const text = await response.text();
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as Record<string, unknown>) : {},
    headers: response.headers,
  };
}
