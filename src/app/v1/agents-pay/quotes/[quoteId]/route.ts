import { verifyAgentRequest } from "@/lib/agent-request";
import { apiError } from "@/lib/api";
import { getQuote, publicQuote } from "@/lib/quotes";

export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }) {
  const verification = await verifyAgentRequest(request, "");
  if (!verification.ok) return apiError(verification.code, verification.message, verification.status);
  const { quoteId } = await context.params;
  const stored = getQuote(quoteId);
  if (!stored) return apiError("QUOTE_NOT_FOUND", "The requested quote does not exist.", 404);
  if (new Date(stored.quote.expiresAt).valueOf() <= Date.now()) {
    return apiError("QUOTE_EXPIRED", "The requested quote has expired.", 410);
  }
  return Response.json({ quote: publicQuote(stored) }, { headers: { "cache-control": "no-store" } });
}
