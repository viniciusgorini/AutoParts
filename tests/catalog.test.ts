import { describe, expect, it } from "vitest";

import {
  SEARCH_LIMIT_MAX,
  findProductById,
  findProductBySku,
  listProducts,
  localCategories,
  searchProducts,
  stockState,
} from "@/lib/catalog";
import { searchHandler } from "@/lib/handlers";
import { createTestAgent, createTestService, run, signRequestHeaders, url } from "./harness";

const MERCHANT = "mrc_autoparts_test";

describe("catalogue", () => {
  it("lists every product under the configured merchant", () => {
    const products = listProducts(MERCHANT);
    expect(products.length).toBeGreaterThanOrEqual(8);
    expect(products.every((product) => product.merchantId === MERCHANT)).toBe(true);
  });

  it("exposes the local category taxonomy", () => {
    const categories = localCategories(MERCHANT).map((category) => category.id);
    expect(categories).toContain("tires");
    expect(categories).toContain("brakes");
  });

  it("finds a product by name", () => {
    const results = searchProducts({ merchantId: MERCHANT, query: "tires" });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((product) => product.localCategoryId === "tires")).toBe(true);
  });

  it("finds a product by SKU", () => {
    const results = searchProducts({ merchantId: MERCHANT, query: "AP-BAT-60AH" });
    expect(results[0]?.sku).toBe("AP-BAT-60AH");
  });

  it("finds a product by brand", () => {
    const results = searchProducts({ merchantId: MERCHANT, query: "TrueVolt" });
    expect(results[0]?.brand).toBe("TrueVolt");
  });

  it("filters by category", () => {
    const results = searchProducts({ merchantId: MERCHANT, query: "", localCategoryId: "brakes" });
    expect(results.length).toBe(1);
    expect(results[0]?.localCategoryId).toBe("brakes");
  });

  it("ignores case", () => {
    const results = searchProducts({ merchantId: MERCHANT, query: "OIL" });
    expect(results.some((product) => product.sku === "AP-OIL-5W30-4L")).toBe(true);
  });

  it("returns nothing for an unmatched query", () => {
    expect(searchProducts({ merchantId: MERCHANT, query: "airplane turbine" })).toHaveLength(0);
  });

  it("applies the result limit", () => {
    expect(searchProducts({ merchantId: MERCHANT, query: "", limit: 2 })).toHaveLength(2);
    expect(searchProducts({ merchantId: MERCHANT, query: "", limit: SEARCH_LIMIT_MAX }).length).toBeLessThanOrEqual(
      SEARCH_LIMIT_MAX,
    );
  });

  it("returns null for a product that does not exist", () => {
    expect(findProductBySku(MERCHANT, "AP-DOES-NOT-EXIST")).toBeNull();
    expect(findProductById(MERCHANT, "prd_missing")).toBeNull();
  });

  it("reports stock state from the available quantity", () => {
    const filter = findProductBySku(MERCHANT, "AP-FLT-OIL-STD");
    const battery = findProductBySku(MERCHANT, "AP-BAT-60AH");
    const tyres = findProductBySku(MERCHANT, "AP-TIRE-20555R16-STD");
    expect(filter && stockState(filter)).toBe("out_of_stock");
    expect(battery && stockState(battery)).toBe("low_stock");
    expect(tyres && stockState(tyres)).toBe("in_stock");
  });
});

describe("POST /v1/agents-pay/search", () => {
  it("returns only public fields to an authenticated agent", async () => {
    const service = createTestService();
    const agent = createTestAgent();
    service.registry.agents.set(agent.agentId, agent);

    const target = url("/v1/agents-pay/search");
    const body = JSON.stringify({ query: "tire", limit: 5 });

    const result = await run(
      searchHandler(service),
      new Request(target, {
        method: "POST",
        headers: signRequestHeaders({ agent, method: "POST", url: target, body }),
        body,
      }),
    );

    expect(result.status).toBe(200);
    const results = result.body.results as Record<string, unknown>[];
    expect(results.length).toBeGreaterThan(0);
    expect(Object.keys(results[0] ?? {})).not.toContain("searchTerms");
    expect(results[0]).toHaveProperty("merchantSku");
  });

  it("refuses an unauthenticated caller", async () => {
    const service = createTestService();
    const target = url("/v1/agents-pay/search");
    const body = JSON.stringify({ query: "tire" });

    const result = await run(
      searchHandler(service),
      new Request(target, { method: "POST", headers: { "content-type": "application/json" }, body }),
    );

    expect(result.status).toBe(401);
    expect((result.body.error as { code: string }).code).toBe("UNAUTHENTICATED");
  });
});
