import {
  VerificationReceiptPayloadSchema,
  VerificationResultSchema,
  type MerchantVerificationRequest,
  type VerificationResult,
} from "@agentic-mandates/contracts";
import {
  createEs256RequestProofSigner,
  createMerchantClient,
  sha256Base64Url,
} from "@agentic-mandates/sdk";
import {
  compactVerify,
  decodeProtectedHeader,
  importJWK,
  type JWK,
} from "jose";

import { agentPayConfig, merchantServiceConfig } from "@/lib/env";
import { canonicalize } from "@/lib/jcs";

const receiptType = "application/agentic-mandates-verification+jws";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export class MandateVerificationError extends Error {
  constructor(
    readonly code: "MANDATE_VERIFICATION_UNAVAILABLE" | "MANDATE_RESULT_UNTRUSTED",
    message: string,
  ) {
    super(message);
    this.name = "MandateVerificationError";
  }
}

/**
 * The merchant asks the Mandate service to claim the opaque capability. This
 * is intentionally the only payment-related call made by AutoParts.
 */
export async function verifyPurchaseWithMandate(
  request: MerchantVerificationRequest,
  options: { idempotencyKey: string; requestId: string },
): Promise<VerificationResult> {
  const config = agentPayConfig();
  const service = merchantServiceConfig();

  try {
    const privateKey = await importJWK(JSON.parse(service.privateJwk) as JWK, "ES256");
    const requestProofSigner = createEs256RequestProofSigner({
      issuer: config.merchantId,
      keyId: service.keyId,
      signingKey: privateKey as CryptoKey,
    });
    const client = createMerchantClient({
      baseUrl: config.mandateApiUrl,
      requestProofSigner,
    });
    const result = await client.verifyPurchase(request, options);
    await verifyMandateReceipt({
      result,
      request,
      publicJwk: JSON.parse(service.mandateReceiptPublicJwk) as JWK,
      now: new Date(),
    });
    return result;
  } catch (error) {
    if (error instanceof MandateVerificationError) throw error;
    throw new MandateVerificationError(
      "MANDATE_VERIFICATION_UNAVAILABLE",
      "The Mandate verification service is unavailable.",
    );
  }
}

/** A receipt is accepted only if it is pinned, canonical, and bound to this exact claim. */
export async function verifyMandateReceipt(input: {
  result: VerificationResult;
  request: MerchantVerificationRequest;
  publicJwk: JWK;
  now: Date;
}): Promise<void> {
  try {
    const result = VerificationResultSchema.parse(input.result);
    const header = decodeProtectedHeader(result.verificationReceipt);
    if (
      header.alg !== "ES256"
      || header.typ !== receiptType
      || typeof header.kid !== "string"
    ) {
      throw new Error("Invalid receipt header");
    }

    const verificationKey = await importJWK(input.publicJwk, "ES256");
    const { payload } = await compactVerify(result.verificationReceipt, verificationKey, { algorithms: ["ES256"] });
    const parsedPayload = VerificationReceiptPayloadSchema.parse(JSON.parse(textDecoder.decode(payload)));
    const canonicalPayload = textEncoder.encode(canonicalize(parsedPayload));
    if (!sameBytes(payload, canonicalPayload)) throw new Error("Non-canonical receipt payload");
    if (parsedPayload.keyId !== header.kid) throw new Error("Mismatched receipt key");
    if (parsedPayload.expiresAt && Date.parse(parsedPayload.expiresAt) <= input.now.valueOf()) {
      throw new Error("Expired receipt");
    }

    const capabilityHash = await sha256Base64Url(textEncoder.encode(input.request.purchaseCapability));
    if (
      parsedPayload.merchantId !== input.request.merchantId
      || parsedPayload.merchantOrderRef !== input.request.merchantOrderRef
      || parsedPayload.quoteId !== input.request.quoteId
      || parsedPayload.capabilityHash !== capabilityHash
      || parsedPayload.verificationId !== result.verificationId
      || parsedPayload.decision !== result.decision
      || parsedPayload.reasonCode !== result.reasonCode
      || parsedPayload.mandateStatus !== result.mandateStatus
      || parsedPayload.expiresAt !== result.expiresAt
      || parsedPayload.paymentOperationId !== result.paymentOperationId
      || parsedPayload.settlementStatus !== result.settlementStatus
    ) {
      throw new Error("Receipt is not bound to this verification");
    }
  } catch {
    throw new MandateVerificationError(
      "MANDATE_RESULT_UNTRUSTED",
      "The Mandate verification result is malformed, untrusted, or bound to another request.",
    );
  }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }
  return difference === 0;
}
