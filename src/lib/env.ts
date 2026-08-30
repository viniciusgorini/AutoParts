import { MERCHANT_ID, MERCHANT_NAME } from "@/lib/catalog";

export function agentPayConfig() {
  const mandateApiUrl = process.env.AGENTPAY_MANDATE_API_URL || process.env.AGENTPAY_BASE_URL;
  if (process.env.NODE_ENV === "production" && !mandateApiUrl) {
    throw new Error("AGENTPAY_MANDATE_API_URL is required in production");
  }
  return {
    merchantId: process.env.AGENTPAY_MERCHANT_ID || MERCHANT_ID,
    merchantName: process.env.AGENTPAY_MERCHANT_NAME || MERCHANT_NAME,
    mandateApiUrl: mandateApiUrl || "https://agentpay-yuno.vercel.app",
    requestProofRegistryUrl: process.env.AGENTPAY_REQUEST_PROOF_REGISTRY_URL || mandateApiUrl || "https://agentpay-yuno.vercel.app",
  };
}

export function merchantServiceConfig() {
  const privateJwk = process.env.AGENTPAY_MERCHANT_SERVICE_PRIVATE_JWK;
  const keyId = process.env.AGENTPAY_MERCHANT_SERVICE_KEY_ID;
  const mandateReceiptPublicJwk = process.env.AGENTPAY_MANDATE_RECEIPT_PUBLIC_JWK;
  if (!privateJwk || !keyId || !mandateReceiptPublicJwk) {
    throw new Error("MERCHANT_SERVICE_VERIFICATION_CONFIG_REQUIRED");
  }
  return { privateJwk, keyId, mandateReceiptPublicJwk };
}
