import { CATALOG_VERSION, products } from "@/lib/catalog";

export function GET() {
  return Response.json({ status: "ok", service: "autoparts", catalogVersion: CATALOG_VERSION, productCount: products.length });
}
