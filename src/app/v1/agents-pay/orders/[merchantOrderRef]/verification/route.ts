import { verificationHandler } from "@/lib/handlers";
import { withApiRequest } from "@/lib/http";
import { merchantService } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ merchantOrderRef: string }> },
): Promise<Response> {
  const { merchantOrderRef } = await context.params;
  return withApiRequest((scopedRequest, requestContext) =>
    verificationHandler(merchantService(), merchantOrderRef)(scopedRequest, requestContext),
  )(request);
}
