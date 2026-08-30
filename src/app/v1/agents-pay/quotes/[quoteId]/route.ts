import { getQuoteHandler } from "@/lib/handlers";
import { withApiRequest } from "@/lib/http";
import { merchantService } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ quoteId: string }> },
): Promise<Response> {
  const { quoteId } = await context.params;
  return withApiRequest((scopedRequest, requestContext) =>
    getQuoteHandler(merchantService(), quoteId)(scopedRequest, requestContext),
  )(request);
}
