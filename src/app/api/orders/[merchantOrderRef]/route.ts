import { orderLookupHandler } from "@/lib/handlers";
import { withApiRequest } from "@/lib/http";
import { merchantService } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Technical order view used by the storefront's audit panel. */
export async function GET(
  request: Request,
  context: { params: Promise<{ merchantOrderRef: string }> },
): Promise<Response> {
  const { merchantOrderRef } = await context.params;
  return withApiRequest((scopedRequest, requestContext) =>
    orderLookupHandler(merchantService(), merchantOrderRef)(scopedRequest, requestContext),
  )(request);
}
