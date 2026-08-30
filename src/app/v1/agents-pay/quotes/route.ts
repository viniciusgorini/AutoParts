import { MerchantQuoteRequestSchema } from "@agentic-mandates/contracts";

import { verifyAgentRequest } from "@/lib/agent-request";
import { apiError, readRawBody } from "@/lib/api";
import { canonicalize } from "@/lib/jcs";
import { createQuote, publicQuote } from "@/lib/quotes";

export async function POST(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 255) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.", 400, requestId);
  }

  try {
    const rawBody = await readRawBody(request);
    const parsed = MerchantQuoteRequestSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return apiError("INVALID_REQUEST", "The quote request is invalid.", 400, requestId);

    const verification = await verifyAgentRequest(request, rawBody);
    if (!verification.ok) return apiError(verification.code, verification.message, verification.status, requestId);

    const quote = await createQuote(parsed.data, canonicalize(parsed.data), idempotencyKey);
    return Response.json({ quote: publicQuote(quote) }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BODY_TOO_LARGE") return apiError("REQUEST_TOO_LARGE", "The request body exceeds the limit.", 413, requestId);
    if (message === "IDEMPOTENCY_KEY_REUSED") return apiError("IDEMPOTENCY_KEY_REUSED", "The Idempotency-Key was already used for another request.", 409, requestId);
    if (message.startsWith("SKU_NOT_FOUND:")) return apiError("SKU_NOT_FOUND", "One or more products do not exist.", 404, requestId);
    if (message.startsWith("INSUFFICIENT_INVENTORY:")) return apiError("INSUFFICIENT_INVENTORY", "The requested quantity is not available.", 409, requestId);
    if (message === "QUOTE_SIGNING_KEY_REQUIRED") return apiError("SERVICE_UNAVAILABLE", "Quote signing is not configured.", 503, requestId);
    return apiError("MALFORMED_REQUEST", "The request body must contain valid JSON.", 400, requestId);
  }
}
