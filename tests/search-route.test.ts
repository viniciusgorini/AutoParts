import { createEs256RequestProofSigner } from "@agentic-mandates/sdk";
import { exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/v1/agents-pay/search/route";

afterEach(() => vi.unstubAllGlobals());

describe("agent product search route", () => {
  it("returns the V2 public catalog only after an SDK request proof is verified", async () => {
    const keyPair = await generateKeyPair("ES256", { extractable: true });
    const signer = createEs256RequestProofSigner({
      issuer: "agent_fixture",
      keyId: "agent_fixture_key",
      signingKey: keyPair.privateKey as CryptoKey,
    });
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input.toString());
      if (url.pathname.endsWith("/request-proof-keys/agent_fixture_key")) {
        return Response.json({
          keyId: "agent_fixture_key",
          actor: { type: "agent", id: "agent_fixture" },
          status: "active",
          publicJwk: await exportJWK(keyPair.publicKey),
        });
      }
      if (url.pathname.endsWith("/request-proofs/claims")) {
        expect(init?.method).toBe("POST");
        return new Response(null, { status: 201 });
      }
      return new Response(null, { status: 404 });
    });

    const body = JSON.stringify({ query: "tire", limit: 1 });
    const url = "http://localhost:3220/v1/agents-pay/search";
    const proof = await signer.sign({
      method: "POST",
      url,
      rawBody: new TextEncoder().encode(body),
      audience: "merchant-api:mrc_autoparts",
    });
    const response = await POST(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-agent-request-proof": proof },
      body,
    }));
    expect(response.status).toBe(200);
    const responseBody = await response.json() as { offers: Array<Record<string, unknown>> };
    expect(responseBody.offers).toHaveLength(1);
    expect(responseBody.offers[0]).toMatchObject({
      merchantSku: "prd_tire_std",
      merchantCategoryId: "fleet.tires",
      unitAmountMinor: 154_800,
      currency: "USD",
    });
    expect(responseBody.offers[0]).toHaveProperty("attributes");
    expect(responseBody.offers[0]).not.toHaveProperty("canonicalCategoryId");
  });

  it("rejects an unsigned search request", async () => {
    const response = await POST(new Request("http://localhost:3220/v1/agents-pay/search", {
      method: "POST",
      body: JSON.stringify({ query: "tire", limit: 1 }),
    }));
    expect(response.status).toBe(401);
  });
});
