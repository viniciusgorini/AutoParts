import { merchantManifest } from "@agentpay/merchant-sdk";

import { agentPayConfig } from "@/lib/env";

export async function GET(request: Request) {
  const config = agentPayConfig();
  const origin = new URL(request.url).origin;
  const sdkManifest = merchantManifest({
    origin,
    merchantId: config.merchantId,
    merchantName: config.merchantName,
    checkoutPath: "/api/agentpay/checkout",
    registryUrl: config.registryUrl,
  });
  return Response.json(
    {
      ...sdkManifest,
      capabilities: ["intent-mandates", "batch-purchasing", "live-revocation", "mock-payment"],
      quotes_endpoint: new URL("/v1/agents-pay/quotes", origin).toString(),
      catalog_search_endpoint: new URL("/v1/agents-pay/search", origin).toString(),
      order_verification_endpoint: new URL("/v1/agents-pay/orders/{merchantOrderRef}/verification", origin).toString(),
      currency: "USD",
      supported_categories: [
        "automotive.tires",
        "automotive.brakes",
        "automotive.accessories",
        "automotive.maintenance",
        "automotive.electrical",
      ],
      quote_signing: { algorithm: "ES256", canonicalization: "RFC8785-JCS" },
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      },
    },
  );
}
