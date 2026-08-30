import { Storefront } from "@/components/storefront";
import { merchantIdentity } from "@/lib/agentpay";
import { isDemoAgentEnabled } from "@/lib/demo-agent";
import { catalogueSnapshot } from "@/lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function HomePage() {
  const identity = merchantIdentity();
  const catalogue = catalogueSnapshot(identity.merchantId);

  return (
    <Storefront
      merchantName={identity.merchantName}
      merchantId={identity.merchantId}
      registryUrl={identity.registryUrl}
      catalogVersion={catalogue.catalogVersion}
      categories={catalogue.categories}
      products={catalogue.products}
      demoCheckoutEnabled={isDemoAgentEnabled()}
    />
  );
}
