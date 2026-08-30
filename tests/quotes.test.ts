import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/jcs";
import { createQuote, publicQuote } from "@/lib/quotes";

describe("signed AgentPay quotes", () => {
  it("creates an immutable USD quote with a verifiable ES256 compact JWS", async () => {
    const request = { items: [{ merchantSku: "prd_tire_std", quantity: 1 }] };
    const stored = await createQuote(request, canonicalize(request), `quote-test-${crypto.randomUUID()}`);
    const result = publicQuote(stored);
    expect(result.quote).toMatchObject({
      merchantId: "mrc_autoparts",
      currency: "USD",
      subtotalCents: 154_800,
      totalCents: 170_174,
    });
    expect(result.jws.split(".")).toHaveLength(3);

    const [protectedHeader, payload, signature] = result.jws.split(".");
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      result.publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      Buffer.from(signature, "base64url"),
      new TextEncoder().encode(`${protectedHeader}.${payload}`),
    );
    expect(valid).toBe(true);
    expect(JSON.parse(Buffer.from(payload, "base64url").toString())).toEqual(result.quote);
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
