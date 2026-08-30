import { merchantIdentity, type MerchantIdentity } from "@/lib/agentpay";
import { env } from "@/lib/env";
import { createMockSettlementGateway, type SettlementGateway } from "@/lib/settlement";
import { createQuoteSigner, type QuoteSigner } from "@/lib/signing";
import { stores } from "@/lib/stores";
import type { Stores } from "@/lib/stores/ports";

/**
 * Composition root.
 *
 * Routes never build their own signer, stores, or clock: they ask for a
 * MerchantService. Tests build one with fakes and exercise the same code path.
 */

export type MerchantService = {
  identity: MerchantIdentity;
  signer: QuoteSigner;
  stores: Stores;
  settlement: SettlementGateway;
  quoteTtlSeconds: number;
  now: () => Date;
  fetcher: typeof fetch;
};

let cached: MerchantService | null = null;

export function merchantService(): MerchantService {
  if (cached) return cached;

  const configuration = env();
  cached = {
    identity: merchantIdentity(),
    signer: createQuoteSigner({
      keyId: configuration.AGENTPAY_MERCHANT_KEY_ID,
      privateJwk: configuration.AGENTPAY_MERCHANT_PRIVATE_JWK,
    }),
    stores: stores(),
    settlement: createMockSettlementGateway(),
    quoteTtlSeconds: configuration.AUTOPARTS_QUOTE_TTL_SECONDS,
    now: () => new Date(),
    fetcher: fetch,
  };
  return cached;
}

/** Test seam: drops the memoised service. */
export function resetMerchantService(): void {
  cached = null;
}
