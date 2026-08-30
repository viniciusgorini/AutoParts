import { MERCHANT_ID, MERCHANT_NAME } from "@/lib/catalog";

export function agentPayConfig() {
  const registryUrl = process.env.AGENTPAY_REGISTRY_URL || process.env.AGENTPAY_BASE_URL;
  if (process.env.NODE_ENV === "production" && !registryUrl) {
    throw new Error("AGENTPAY_REGISTRY_URL is required in production");
  }
  return {
    merchantId: process.env.AGENTPAY_MERCHANT_ID || MERCHANT_ID,
    merchantName: process.env.AGENTPAY_MERCHANT_NAME || MERCHANT_NAME,
    registryUrl: registryUrl || "https://agentpay-yuno.vercel.app",
  };
}
