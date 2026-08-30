import { z } from "zod";

import { runDemoCheckout } from "@/lib/demo-agent";
import { ApiError, jsonResponse } from "@/lib/errors";
import { parseJsonBody, readRawBody, withApiRequest } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  items: z
    .array(z.object({ merchantSku: z.string().min(1), quantity: z.number().int().min(1).max(999) }))
    .min(1)
    .max(50),
  mandateId: z.string().min(1).max(128),
  exceptionId: z.string().min(1).max(128).optional(),
});

/**
 * Storefront checkout.
 *
 * This is the browser-facing entry point. It never signs anything in the
 * client: it asks the server-side demo agent to drive the store's own public
 * AgentPay routes. The route is refused entirely in production.
 */
export const POST = withApiRequest(async (request, { requestId }) => {
  const parsed = schema.safeParse(parseJsonBody(await readRawBody(request)));
  if (!parsed.success) {
    throw new ApiError("BAD_REQUEST", "Provide the cart items and the mandate identifier.");
  }

  const result = await runDemoCheckout({
    items: parsed.data.items,
    mandateId: parsed.data.mandateId,
    ...(parsed.data.exceptionId ? { exceptionId: parsed.data.exceptionId } : {}),
  });

  return jsonResponse(result, requestId);
});
