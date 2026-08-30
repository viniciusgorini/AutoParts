import { discoveryDocument } from "@/lib/agentpay";
import { errorResponse, newRequestId } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /.well-known/agentpay.json
 *
 * The document is produced by `merchantManifest` from @agentpay/merchant-sdk,
 * so the store cannot drift from the agentpay/1.0 contract.
 */
export function GET(): Response {
  const requestId = newRequestId();
  try {
    return Response.json(discoveryDocument(), {
      headers: { "cache-control": "public, max-age=300", "x-request-id": requestId },
    });
  } catch (error) {
    return errorResponse(error, requestId);
  }
}
