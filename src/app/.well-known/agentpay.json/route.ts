import { agentPayConfig } from "@/lib/env";

/** Public, decentralized discovery. Payment and key material are never published here. */
export async function GET(request: Request) {
  const config = agentPayConfig();
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      protocol: "agentic-mandates/2",
      merchant: { id: config.merchantId, name: config.merchantName },
      apiBaseUrl: `${origin}/`,
      endpoints: {
        search: new URL("/v1/agents-pay/search", origin).toString(),
        createQuote: new URL("/v1/agents-pay/quotes", origin).toString(),
        getQuote: `${origin}/v1/agents-pay/quotes/{quoteId}`,
        verifyOrder: `${origin}/v1/agents-pay/orders/{merchantOrderRef}/verification`,
      },
      capabilities: ["signed-quotes", "purchase-capabilities", "live-revocation", "mock-settlement"],
      currency: "USD",
      localCategories: [
        "fleet.tires",
        "fleet.brakes",
        "fleet.shop-accessories",
        "fleet.maintenance",
        "fleet.electrical",
      ],
      requestProof: { algorithm: "ES256", audience: `merchant-api:${config.merchantId}` },
      quoteSigning: { algorithm: "ES256", canonicalization: "RFC8785-JCS" },
    },
    {
      headers: {
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=300",
      },
    },
  );
}
