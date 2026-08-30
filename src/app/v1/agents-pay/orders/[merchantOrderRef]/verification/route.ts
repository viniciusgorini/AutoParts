import { OrderVerificationRequestSchema } from "@agentic-mandates/contracts";

import { verifyAgentRequest } from "@/lib/agent-request";
import { apiError, readRawBody } from "@/lib/api";
import { MandateVerificationError } from "@/lib/mandate-client";
import { publicOrder, verifyAndRecordOrder } from "@/lib/orders";

export async function POST(request: Request, context: { params: Promise<{ merchantOrderRef: string }> }) {
  const requestId = `req_${crypto.randomUUID()}`;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 255) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key header is required.", 400, requestId);
  }

  try {
    const rawBody = await readRawBody(request);
    const parsed = OrderVerificationRequestSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return apiError("INVALID_REQUEST", "The order verification request is invalid.", 400, requestId);

    const verification = await verifyAgentRequest(request, rawBody);
    if (!verification.ok) return apiError(verification.code, verification.message, verification.status, requestId);

    const { merchantOrderRef } = await context.params;
    const order = await verifyAndRecordOrder(merchantOrderRef, parsed.data, { idempotencyKey, requestId });
    const status = order.status === "fulfilled" ? 200 : order.status === "rejected" ? 403 : 202;
    return Response.json({ order: publicOrder(order) }, { status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BODY_TOO_LARGE") return apiError("REQUEST_TOO_LARGE", "The request body exceeds the limit.", 413, requestId);
    if (message === "QUOTE_NOT_FOUND") return apiError("QUOTE_NOT_FOUND", "The quote does not belong to this order.", 404, requestId);
    if (message === "QUOTE_EXPIRED") return apiError("QUOTE_EXPIRED", "The quote has expired.", 410, requestId);
    if (message === "ORDER_ALREADY_VERIFIED") return apiError("ORDER_ALREADY_VERIFIED", "This order has already been verified.", 409, requestId);
    if (message === "VERIFICATION_IN_PROGRESS") return apiError("VERIFICATION_IN_PROGRESS", "This order is already being verified.", 409, requestId);
    if (error instanceof MandateVerificationError) {
      return apiError(
        error.code,
        error.message,
        error.code === "MANDATE_VERIFICATION_UNAVAILABLE" ? 503 : 502,
        requestId,
      );
    }
    return apiError("MALFORMED_REQUEST", "The request body must contain valid JSON.", 400, requestId);
  }
}
