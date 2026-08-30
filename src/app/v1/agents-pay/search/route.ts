import { MerchantSearchRequestSchema } from "@agentic-mandates/contracts";

import { verifyAgentRequest } from "@/lib/agent-request";
import { apiError, readRawBody } from "@/lib/api";
import { CATALOG_VERSION, MERCHANT_ID, MERCHANT_NAME, searchProducts } from "@/lib/catalog";

export async function POST(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  try {
    const rawBody = await readRawBody(request);
    const parsed = MerchantSearchRequestSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return apiError("INVALID_REQUEST", "The catalog search request is invalid.", 400, requestId);

    const verification = await verifyAgentRequest(request, rawBody);
    if (!verification.ok) return apiError(verification.code, verification.message, verification.status, requestId);

    const offers = searchProducts(parsed.data.query, undefined, parsed.data.limit ?? 10).map((product) => ({
      merchantSku: product.sku,
      merchantCategoryId: product.category,
      name: product.name,
      description: product.description,
      unitAmountMinor: product.priceCents,
      currency: product.currency,
      availableQuantity: product.availableQuantity,
      attributes: product.attributes,
    }));
    return Response.json({
      merchantId: MERCHANT_ID,
      merchantName: MERCHANT_NAME,
      merchantCatalogVersion: CATALOG_VERSION,
      offers,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return apiError("REQUEST_TOO_LARGE", "The request body exceeds the limit.", 413, requestId);
    }
    return apiError("MALFORMED_REQUEST", "The request body must contain valid JSON.", 400, requestId);
  }
}
