import { z } from "zod";

import { verifyAgentRequest } from "@/lib/agent-request";
import { apiError, readJson } from "@/lib/api";
import { agentPayConfig } from "@/lib/env";
import { type JsonValue } from "@/lib/jcs";
import { publicOrder, verifyAndFulfillOrder } from "@/lib/orders";

const verificationSchema = z.object({
  quoteId: z.string().min(1).max(100),
  paymentToken: z.string().min(1).max(2_000),
  mandateId: z.string().min(1).max(100),
});

export async function POST(request: Request, context: { params: Promise<{ merchantOrderRef: string }> }) {
  const requestId = `req_${crypto.randomUUID()}`;
  if (!request.headers.get("idempotency-key")?.trim()) {
    return apiError("IDEMPOTENCY_KEY_REQUIRED", "An Idempotency-Key header is required.", 400, requestId);
  }
  try {
    const parsed = verificationSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("INVALID_ORDER_VERIFICATION", "The order verification request is invalid.", 400, requestId);
    const verification = await verifyAgentRequest(
      request,
      parsed.data as unknown as JsonValue,
      agentPayConfig().registryUrl,
    );
    if (!verification.ok) return apiError(verification.code, verification.message, verification.status, requestId);
    const { merchantOrderRef } = await context.params;
    const order = await verifyAndFulfillOrder(merchantOrderRef, parsed.data);
    return Response.json({ requestId, order: publicOrder(order) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "BODY_TOO_LARGE") return apiError("BODY_TOO_LARGE", "The request body exceeds the limit.", 413, requestId);
    if (message === "QUOTE_NOT_FOUND") return apiError("QUOTE_NOT_FOUND", "The quote does not belong to this order.", 404, requestId);
    if (message === "QUOTE_EXPIRED") return apiError("QUOTE_EXPIRED", "The quote has expired.", 410, requestId);
    if (message === "PAYMENT_TOKEN_REFUSED") return apiError("PAYMENT_TOKEN_REFUSED", "The Mandate Authority refused the payment token.", 402, requestId);
    if (message === "PAYMENT_TOKEN_BINDING_MISMATCH") return apiError("PAYMENT_TOKEN_BINDING_MISMATCH", "The payment token is not bound to this quote.", 403, requestId);
    if (message === "ORDER_ALREADY_FINALIZED") return apiError("ORDER_ALREADY_FINALIZED", "This order was already finalized with different payment details.", 409, requestId);
    if (message === "ORDER_VERIFICATION_IN_PROGRESS") return apiError("ORDER_VERIFICATION_IN_PROGRESS", "This order is already being verified.", 409, requestId);
    return apiError("MANDATE_AUTHORITY_UNAVAILABLE", "The Mandate Authority could not verify the payment token.", 503, requestId);
  }
}
