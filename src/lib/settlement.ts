import { randomUUID } from "node:crypto";

import type { SettlementStatus } from "@/lib/stores/ports";

/**
 * Mock settlement.
 *
 * AutoParts never touches money. AgentPay's challenge protocol ends at an
 * approved policy decision, so the store models the settlement it would have
 * asked its own payment provider for.
 *
 * The operation id is opaque, single use, and is only ever minted after an
 * approved decision. An order is complete only at `captured`.
 */

export type SettlementResult =
  | { paymentOperationId: string; settlementStatus: Extract<SettlementStatus, "pending" | "captured"> }
  | { paymentOperationId: null; settlementStatus: Extract<SettlementStatus, "failed"> };

export type SettlementGateway = {
  authorizeAndCapture(input: {
    merchantOrderRef: string;
    amountCents: number;
    currency: string;
  }): Promise<SettlementResult>;
};

export function createMockSettlementGateway(): SettlementGateway {
  return {
    async authorizeAndCapture() {
      return { paymentOperationId: `pay_mock_${randomUUID()}`, settlementStatus: "captured" };
    },
  };
}

export function isOrderComplete(settlementStatus: SettlementStatus): boolean {
  return settlementStatus === "captured";
}
