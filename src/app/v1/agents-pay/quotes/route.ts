import { z } from "zod";

import { verifyAgentRequest } from "@/lib/agent-request";
import { apiError, readJson } from "@/lib/api";
import { agentPayConfig } from "@/lib/env";
import { type JsonValue } from "@/lib/jcs";
import { createQuote, publicQuote } from "@/lib/quotes";

const quoteSchema = z.object({
  items: z.array(z.object({
    merchantSku: z.string().min(1).max(100),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(50),
  metadata: z.record(z.string(), z.string().max(500)).optional(),
});

export async function POST(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 128) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "A valid Idempotency-Key header is required.", 400, requestId);
  }

  try {
    const rawBody = await readJson(request);
    const parsed = quoteSchema.safeParse(rawBody);
    if (!parsed.success) return apiError("INVALID_QUOTE", "The quote request is invalid.", 400, requestId);

    const verification = await verifyAgentRequest(
      request,
      parsed.data as unknown as JsonValue,
      agentPayConfig().registryUrl,
    );
    if (!verification.ok) {
      return apiError(verification.code, verification.message, verification.status, requestId);
    }

    const signedQuote = await createQuote(parsed.data, verification.canonicalBody, idempotencyKey);
    return Response.json({ requestId, ...publicQuote(signedQuote) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BODY_TOO_LARGE") return apiError("BODY_TOO_LARGE", "The request body exceeds the limit.", 413, requestId);
    if (message === "IDEMPOTENCY_KEY_REUSED") return apiError("IDEMPOTENCY_KEY_REUSED", "The Idempotency-Key was already used for another request.", 409, requestId);
    if (message.startsWith("PRODUCT_NOT_FOUND:")) return apiError("PRODUCT_NOT_FOUND", "One or more products do not exist.", 404, requestId);
    if (message.startsWith("INSUFFICIENT_STOCK:")) return apiError("INSUFFICIENT_STOCK", "The requested quantity is not available.", 409, requestId);
    if (message === "QUOTE_SIGNING_KEY_REQUIRED") return apiError("QUOTE_SIGNING_UNAVAILABLE", "Quote signing is not configured.", 503, requestId);
    return apiError("INVALID_JSON", "The request body must contain valid JSON.", 400, requestId);
  }
}
