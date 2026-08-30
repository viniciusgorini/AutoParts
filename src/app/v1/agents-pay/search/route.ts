import { searchHandler } from "@/lib/handlers";
import { withApiRequest } from "@/lib/http";
import { merchantService } from "@/lib/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withApiRequest((request, context) => searchHandler(merchantService())(request, context));
