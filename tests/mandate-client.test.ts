import { sha256Base64Url } from "@agentic-mandates/sdk";
import { CompactSign, exportJWK, generateKeyPair } from "jose";
import { describe, expect, it } from "vitest";

import { canonicalize } from "@/lib/jcs";
import { MandateVerificationError, verifyMandateReceipt } from "@/lib/mandate-client";

const textEncoder = new TextEncoder();

describe("Mandate verification receipts", () => {
  it("accepts only a pinned, canonical receipt bound to the opaque capability", async () => {
    const request = {
      merchantId: "mrc_autoparts",
      merchantOrderRef: "order_fixture",
      quoteId: "quote_fixture",
      purchaseCapability: "capability_fixture",
    };
    const keyPair = await generateKeyPair("ES256", { extractable: true });
    const payload = {
      verificationId: "verification_fixture",
      merchantId: request.merchantId,
      merchantOrderRef: request.merchantOrderRef,
      quoteId: request.quoteId,
      capabilityHash: await sha256Base64Url(textEncoder.encode(request.purchaseCapability)),
      requestId: "request_fixture",
      decision: "approved" as const,
      reasonCode: "AUTHORIZED" as const,
      mandateStatus: "active" as const,
      issuedAt: "2026-08-30T12:00:00.000Z",
      keyId: "mandate_receipt_key",
      paymentOperationId: "operation_fixture",
      settlementStatus: "captured" as const,
    };
    const verificationReceipt = await new CompactSign(textEncoder.encode(canonicalize(payload)))
      .setProtectedHeader({
        alg: "ES256",
        kid: payload.keyId,
        typ: "application/agentic-mandates-verification+jws",
      })
      .sign(keyPair.privateKey);
    const result = {
      decision: payload.decision,
      reasonCode: payload.reasonCode,
      verificationId: payload.verificationId,
      mandateStatus: payload.mandateStatus,
      verificationReceipt,
      paymentOperationId: payload.paymentOperationId,
      settlementStatus: payload.settlementStatus,
    };

    await expect(verifyMandateReceipt({
      result,
      request,
      publicJwk: await exportJWK(keyPair.publicKey),
      now: new Date("2026-08-30T12:01:00.000Z"),
    })).resolves.toBeUndefined();

    await expect(verifyMandateReceipt({
      result,
      request: { ...request, quoteId: "quote_tampered" },
      publicJwk: await exportJWK(keyPair.publicKey),
      now: new Date("2026-08-30T12:01:00.000Z"),
    })).rejects.toMatchObject({
      name: "MandateVerificationError",
      code: "MANDATE_RESULT_UNTRUSTED",
    } satisfies Partial<MandateVerificationError>);
  });
});
