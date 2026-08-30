import { z } from "zod";

import { agentPayConfig } from "@/lib/env";
import { sha256Base64Url } from "@/lib/jcs";
import { getQuote } from "@/lib/quotes";

export type OrderVerificationInput = { quoteId: string; paymentToken: string; mandateId: string };

const authorityResponseSchema = z.object({
  valid: z.literal(true),
  status: z.enum(["authorized", "captured"]),
  merchant_id: z.string(),
  mandate_id: z.string(),
  quote_id: z.string(),
  amount_cents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  payment_operation_id: z.string().min(1),
});

type FulfilledOrder = {
  merchantOrderRef: string;
  quoteId: string;
  mandateId: string;
  tokenHash: string;
  paymentOperationId: string;
  status: "fulfilled";
  invoiceNumber: string;
  dispatchStatus: "ready_for_dispatch";
  verifiedAt: string;
};

const globalOrderState = globalThis as typeof globalThis & {
  autopartsOrders?: Map<string, FulfilledOrder>;
  autopartsOrdersInFlight?: Set<string>;
};

const orders = globalOrderState.autopartsOrders ??= new Map();
const ordersInFlight = globalOrderState.autopartsOrdersInFlight ??= new Set();

export async function verifyAndFulfillOrder(
  merchantOrderRef: string,
  input: OrderVerificationInput,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const quote = getQuote(input.quoteId);
  if (!quote || quote.quote.merchantOrderRef !== merchantOrderRef) throw new Error("QUOTE_NOT_FOUND");
  if (new Date(quote.quote.expiresAt).valueOf() <= now.valueOf()) throw new Error("QUOTE_EXPIRED");

  const tokenHash = await sha256Base64Url(input.paymentToken);
  const existing = orders.get(merchantOrderRef);
  if (existing) {
    if (existing.quoteId !== input.quoteId || existing.mandateId !== input.mandateId || existing.tokenHash !== tokenHash) {
      throw new Error("ORDER_ALREADY_FINALIZED");
    }
    return existing;
  }
  if (ordersInFlight.has(merchantOrderRef)) throw new Error("ORDER_VERIFICATION_IN_PROGRESS");
  ordersInFlight.add(merchantOrderRef);

  try {
    const config = agentPayConfig();
    const response = await fetcher(new URL("/api/registry/payment-tokens/verify", config.registryUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        payment_token: input.paymentToken,
        mandate_id: input.mandateId,
        quote_id: input.quoteId,
        merchant_id: config.merchantId,
        amount_cents: quote.quote.totalCents,
        currency: quote.quote.currency,
      }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("PAYMENT_TOKEN_REFUSED");
    const decision = authorityResponseSchema.parse(await response.json());
    if (
      decision.merchant_id !== config.merchantId
      || decision.mandate_id !== input.mandateId
      || decision.quote_id !== input.quoteId
      || decision.amount_cents !== quote.quote.totalCents
    ) {
      throw new Error("PAYMENT_TOKEN_BINDING_MISMATCH");
    }
    const fulfilled: FulfilledOrder = {
      merchantOrderRef,
      quoteId: input.quoteId,
      mandateId: input.mandateId,
      tokenHash,
      paymentOperationId: decision.payment_operation_id,
      status: "fulfilled",
      invoiceNumber: `INV-${now.getUTCFullYear()}-${merchantOrderRef.slice(-8).toUpperCase()}`,
      dispatchStatus: "ready_for_dispatch",
      verifiedAt: now.toISOString(),
    };
    orders.set(merchantOrderRef, fulfilled);
    return fulfilled;
  } catch (error) {
    if (error instanceof Error && ["PAYMENT_TOKEN_REFUSED", "PAYMENT_TOKEN_BINDING_MISMATCH"].includes(error.message)) {
      throw error;
    }
    throw new Error("MANDATE_AUTHORITY_UNAVAILABLE");
  } finally {
    ordersInFlight.delete(merchantOrderRef);
  }
}

export function publicOrder(order: FulfilledOrder) {
  return {
    merchantOrderRef: order.merchantOrderRef,
    quoteId: order.quoteId,
    mandateId: order.mandateId,
    paymentOperationId: order.paymentOperationId,
    status: order.status,
    invoiceNumber: order.invoiceNumber,
    dispatchStatus: order.dispatchStatus,
    verifiedAt: order.verifiedAt,
  };
}
