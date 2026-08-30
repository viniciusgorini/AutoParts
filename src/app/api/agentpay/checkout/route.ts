import { createAgentPayCheckoutHandler } from "@agentpay/merchant-sdk";

import { getProduct } from "@/lib/catalog";
import { agentPayConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const config = agentPayConfig();
  const checkout = createAgentPayCheckoutHandler({
    merchantId: config.merchantId,
    registryUrl: config.registryUrl,
    resolveProduct: async (productId) => {
      const product = getProduct(productId);
      return product
        ? {
            id: product.id,
            merchant_id: config.merchantId,
            name: product.name,
            category: product.category,
            price_cents: product.priceCents,
            currency: product.currency,
          }
        : null;
    },
  });
  return checkout(request);
}
