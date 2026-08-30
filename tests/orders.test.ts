import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/jcs";
import { publicOrder, verifyAndRecordOrder } from "@/lib/orders";
import { createQuote } from "@/lib/quotes";

const capturedVerification = {
  decision: "approved" as const,
  reasonCode: "AUTHORIZED" as const,
  verificationId: "verification_fixture",
  mandateStatus: "active" as const,
  verificationReceipt: "a.b.c",
  paymentOperationId: "operation_fixture",
  settlementStatus: "captured" as const,
};

describe("merchant settlement boundary", () => {
  it("passes only an opaque capability to the Mandate service and fulfils only after capture", async () => {
    const request = { items: [{ merchantSku: "prd_tire_std", quantity: 1 }] };
    const quote = await createQuote(request, canonicalize(request), `quote-order-${crypto.randomUUID()}`);
    const capability = "capability_fixture";
    const verifier = async (input: { purchaseCapability: string; quoteId: string }) => {
      expect(input.purchaseCapability).toBe(capability);
      expect(input.quoteId).toBe(quote.quote.id);
      return capturedVerification;
    };

    const order = await verifyAndRecordOrder(
      quote.quote.merchantOrderRef,
      { quoteId: quote.quote.id, purchaseCapability: capability },
      { idempotencyKey: `verify-${crypto.randomUUID()}`, requestId: `request_${crypto.randomUUID()}` },
      verifier,
    );
    expect(publicOrder(order)).toMatchObject({
      status: "fulfilled",
      dispatchStatus: "ready_for_dispatch",
      verification: { settlementStatus: "captured" },
    });
    expect(publicOrder(order)).not.toHaveProperty("paymentToken");
  });

  it("does not dispatch while settlement is pending", async () => {
    const request = { items: [{ merchantSku: "prd_brake_hd", quantity: 1 }] };
    const quote = await createQuote(request, canonicalize(request), `quote-pending-${crypto.randomUUID()}`);
    const order = await verifyAndRecordOrder(
      quote.quote.merchantOrderRef,
      { quoteId: quote.quote.id, purchaseCapability: "capability_pending" },
      { idempotencyKey: `verify-${crypto.randomUUID()}`, requestId: `request_${crypto.randomUUID()}` },
      async () => ({ ...capturedVerification, verificationId: "verification_pending", settlementStatus: "pending" as const }),
    );
    expect(publicOrder(order)).toMatchObject({ status: "settlement_pending" });
    expect(publicOrder(order)).not.toHaveProperty("dispatchStatus");
  });
});
