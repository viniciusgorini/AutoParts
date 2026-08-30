import { describe, expect, it } from "vitest";

import { GET as discovery } from "@/app/.well-known/agentpay.json/route";

describe("AgentPay V2 discovery", () => {
  it("publishes the quote and capability protocol without a legacy checkout endpoint", async () => {
    const response = await discovery(new Request("https://autoparts.example/.well-known/agentpay.json"));
    expect(response.status).toBe(200);
    const manifest = await response.json() as Record<string, unknown>;
    expect(manifest).toMatchObject({
      protocol: "agentic-mandates/2",
      merchant: { id: "mrc_autoparts" },
      currency: "USD",
      requestProof: { algorithm: "ES256", audience: "merchant-api:mrc_autoparts" },
    });
    expect(manifest).not.toHaveProperty("checkout_endpoint");
    expect(manifest).toHaveProperty("endpoints.verifyOrder");
    expect((manifest.endpoints as { getQuote: string }).getQuote).toContain("{quoteId}");
  });
});
