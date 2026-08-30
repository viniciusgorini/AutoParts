import { type MerchantVerificationRequest, type VerificationResult } from "@agentic-mandates/contracts";
import { sha256Base64Url } from "@agentic-mandates/sdk";

import { agentPayConfig } from "@/lib/env";
import { verifyPurchaseWithMandate } from "@/lib/mandate-client";
import { getQuote } from "@/lib/quotes";

export type OrderVerificationInput = { quoteId: string; purchaseCapability: string };

type MerchantOrderStatus = "fulfilled" | "settlement_pending" | "approval_required" | "rejected";

type MerchantOrder = {
  merchantOrderRef: string;
  quoteId: string;
  capabilityHash: string;
  idempotencyKey: string;
  status: MerchantOrderStatus;
  verification: VerificationResult;
  invoiceNumber?: string;
  dispatchStatus?: "ready_for_dispatch";
  verifiedAt: string;
};

type MandateVerifier = (
  request: MerchantVerificationRequest,
  options: { idempotencyKey: string; requestId: string },
) => Promise<VerificationResult>;

const globalOrderState = globalThis as typeof globalThis & {
  autopartsOrders?: Map<string, MerchantOrder>;
  autopartsOrdersInFlight?: Set<string>;
};

const orders = globalOrderState.autopartsOrders ??= new Map();
const ordersInFlight = globalOrderState.autopartsOrdersInFlight ??= new Set();
const textEncoder = new TextEncoder();

/**
 * Claims a Mandate-issued capability through the merchant-to-Mandate SDK path.
 * A card reference, Vault token, passkey, or mandate policy never enters this
 * store process.
 */
export async function verifyAndRecordOrder(
  merchantOrderRef: string,
  input: OrderVerificationInput,
  options: { idempotencyKey: string; requestId: string },
  verifier: MandateVerifier = verifyPurchaseWithMandate,
  now = new Date(),
) {
  const quote = getQuote(input.quoteId);
  if (!quote || quote.quote.merchantOrderRef !== merchantOrderRef) throw new Error("QUOTE_NOT_FOUND");
  if (new Date(quote.quote.expiresAt).valueOf() <= now.valueOf()) throw new Error("QUOTE_EXPIRED");

  const capabilityHash = await sha256Base64Url(textEncoder.encode(input.purchaseCapability));
  const existing = orders.get(merchantOrderRef);
  if (existing) {
    if (
      existing.quoteId !== input.quoteId
      || existing.capabilityHash !== capabilityHash
      || existing.idempotencyKey !== options.idempotencyKey
    ) {
      throw new Error("ORDER_ALREADY_VERIFIED");
    }
    return existing;
  }
  if (ordersInFlight.has(merchantOrderRef)) throw new Error("VERIFICATION_IN_PROGRESS");
  ordersInFlight.add(merchantOrderRef);

  try {
    const config = agentPayConfig();
    const verification = await verifier({
      merchantId: config.merchantId,
      merchantOrderRef,
      quoteId: quote.quote.id,
      purchaseCapability: input.purchaseCapability,
    }, options);
    const fulfilled = verification.decision === "approved" && verification.settlementStatus === "captured";
    const order: MerchantOrder = {
      merchantOrderRef,
      quoteId: input.quoteId,
      capabilityHash,
      idempotencyKey: options.idempotencyKey,
      status: fulfilled
        ? "fulfilled"
        : verification.decision === "approval_required"
          ? "approval_required"
          : verification.decision === "rejected" || verification.settlementStatus === "failed"
            ? "rejected"
            : "settlement_pending",
      verification,
      ...(fulfilled
        ? {
            invoiceNumber: `INV-${now.getUTCFullYear()}-${merchantOrderRef.slice(-8).toUpperCase()}`,
            dispatchStatus: "ready_for_dispatch" as const,
          }
        : {}),
      verifiedAt: now.toISOString(),
    };
    orders.set(merchantOrderRef, order);
    return order;
  } finally {
    ordersInFlight.delete(merchantOrderRef);
  }
}

export function publicOrder(order: MerchantOrder) {
  return {
    merchantOrderRef: order.merchantOrderRef,
    quoteId: order.quoteId,
    status: order.status,
    verification: {
      decision: order.verification.decision,
      reasonCode: order.verification.reasonCode,
      verificationId: order.verification.verificationId,
      mandateStatus: order.verification.mandateStatus,
      ...(order.verification.paymentOperationId && order.verification.settlementStatus
        ? {
            paymentOperationId: order.verification.paymentOperationId,
            settlementStatus: order.verification.settlementStatus,
          }
        : {}),
    },
    ...(order.invoiceNumber ? { invoiceNumber: order.invoiceNumber } : {}),
    ...(order.dispatchStatus ? { dispatchStatus: order.dispatchStatus } : {}),
    verifiedAt: order.verifiedAt,
  };
}
