import { describe, expect, it } from "vitest";

import { getProduct, products, searchProducts } from "@/lib/catalog";

describe("AutoParts catalog", () => {
  it("contains the eight required mock products", () => {
    expect(products).toHaveLength(8);
    expect(products.every((product) => product.currency === "USD")).toBe(true);
    expect(products.every((product) => Number.isInteger(product.priceCents))).toBe(true);
  });

  it("searches by name, SKU, category, brand and related terms", () => {
    expect(searchProducts("battery")[0]?.id).toBe("prd_battery_60ah");
    expect(searchProducts("prd_acc_jack")[0]?.id).toBe("prd_acc_jack");
    expect(searchProducts("brake", "fleet.brakes")[0]?.id).toBe("prd_brake_hd");
    expect(searchProducts("Motrix")[0]?.id).toBe("prd_oil_synth");
    expect(searchProducts("2 ton")[0]?.id).toBe("prd_acc_jack");
  });

  it("normalizes input, applies result limits and handles no results", () => {
    expect(searchProducts("oil")).toHaveLength(2);
    expect(searchProducts("", "all", 3)).toHaveLength(3);
    expect(searchProducts("part that does not exist")).toEqual([]);
  });

  it("returns undefined for an unknown product", () => {
    expect(getProduct("missing")).toBeUndefined();
  });
});
