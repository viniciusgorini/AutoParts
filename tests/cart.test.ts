import { describe, expect, it } from "vitest";

import { calculateCart, formatUsd } from "@/lib/cart";

describe("cart calculations", () => {
  it("calculates subtotal, shipping, tax and total using integer cents", () => {
    const result = calculateCart([{ productId: "prd_tire_std", quantity: 1 }]);
    expect(result.subtotalCents).toBe(154_800);
    expect(result.shippingCents).toBe(2_990);
    expect(result.taxCents).toBe(12_384);
    expect(result.totalCents).toBe(170_174);
  });

  it("applies free shipping above the threshold", () => {
    const result = calculateCart([
      { productId: "prd_tire_std", quantity: 1 },
      { productId: "prd_tire_prm", quantity: 1 },
    ]);
    expect(result.subtotalCents).toBe(326_800);
    expect(result.shippingCents).toBe(0);
    expect(result.taxCents).toBe(26_144);
    expect(result.totalCents).toBe(352_944);
  });

  it("caps quantities at available stock and ignores unknown products", () => {
    const result = calculateCart([
      { productId: "prd_filter_oil", quantity: 999 },
      { productId: "missing", quantity: 2 },
    ]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.quantity).toBe(24);
  });

  it("formats values as US dollars", () => {
    expect(formatUsd(154_800)).toBe("$1,548.00");
  });
});
