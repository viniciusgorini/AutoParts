import { merchantManifest } from "@agentpay/merchant-sdk";
import { describe, expect, it } from "vitest";

import { POST as checkout } from "@/app/api/agentpay/checkout/route";

describe("external AgentPay SDK integration", () => {
  it("generates discovery metadata through the installed SDK package", () => {
    const manifest = merchantManifest({
      origin: "https://shop.example",
      merchantId: "autoparts",
      merchantName: "AutoParts",
      checkoutPath: "/api/agentpay/checkout",
      registryUrl: "https://agentpay.example",
    });
    expect(manifest.protocol).toBe("agentpay/1.0");
    expect(manifest.merchant.id).toBe("autoparts");
    expect(manifest.checkout_endpoint).toBe("https://shop.example/api/agentpay/checkout");
  });

  it("refuses an unsigned checkout before contacting AgentPay", async () => {
    const response = await checkout(
      new Request("http://localhost:3220/api/agentpay/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mandate_id: "018f47a7-6db6-7c76-9a61-001122334455",
          merchant_id: "mrc_autoparts",
          product_id: "prd_tire_std",
        }),
      }),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      decision: "refused",
      reason_code: "AGENT_SIGNATURE_INVALID",
    });
  });
});
