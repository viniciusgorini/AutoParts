import { z } from "zod";

import { apiError, readJson } from "@/lib/api";
import { searchProducts } from "@/lib/catalog";

const searchSchema = z.object({
  query: z.string().max(200).default(""),
  category: z.enum([
    "automotive.tires",
    "automotive.brakes",
    "automotive.accessories",
    "automotive.maintenance",
    "automotive.electrical",
  ]).optional(),
  limit: z.number().int().min(1).max(50).default(10),
});

export async function POST(request: Request) {
  const requestId = `req_${crypto.randomUUID()}`;
  try {
    const parsed = searchSchema.safeParse(await readJson(request));
    if (!parsed.success) return apiError("INVALID_SEARCH", "Invalid search request.", 400, requestId);
    const results = searchProducts(parsed.data.query, parsed.data.category, parsed.data.limit).map((product) => ({
      id: product.id,
      sku: product.sku,
      merchantId: product.merchantId,
      name: product.name,
      description: product.description,
      category: product.category,
      priceCents: product.priceCents,
      currency: product.currency,
      availableQuantity: product.availableQuantity,
      brand: product.brand,
      compatibility: product.compatibility,
      inStock: product.availableQuantity > 0,
    }));
    return Response.json({ requestId, results });
  } catch (error) {
    if (error instanceof Error && error.message === "BODY_TOO_LARGE") {
      return apiError("BODY_TOO_LARGE", "The request body exceeds the limit.", 413, requestId);
    }
    return apiError("INVALID_JSON", "The request body must contain valid JSON.", 400, requestId);
  }
}
