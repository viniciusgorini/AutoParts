import { describe, expect, it } from "vitest";

import { POST } from "@/app/v1/agents-pay/search/route";

describe("agent product search route", () => {
  it("returns only public matching catalog data", async () => {
    const response = await POST(new Request("http://localhost:3220/v1/agents-pay/search", {
      method: "POST",
      body: JSON.stringify({ query: "tire", category: "automotive.tires", limit: 1 }),
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { results: Array<Record<string, unknown>> };
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ currency: "USD", inStock: true });
    expect(body.results[0]).not.toHaveProperty("attributes");
  });

  it("rejects an invalid result limit", async () => {
    const response = await POST(new Request("http://localhost:3220/v1/agents-pay/search", {
      method: "POST",
      body: JSON.stringify({ query: "tire", limit: 1000 }),
    }));
    expect(response.status).toBe(400);
  });
});
