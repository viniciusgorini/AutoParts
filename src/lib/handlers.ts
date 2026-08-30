import { z } from "zod";

import { authenticateAgent } from "@/lib/agent-auth";
import { verifyWithAgentPay } from "@/lib/agentpay";
import {
  CATALOG_VERSION,
  SEARCH_LIMIT_DEFAULT,
  SEARCH_LIMIT_MAX,
  listProducts,
  localCategories,
  searchProducts,
  stockState,
  type Product,
} from "@/lib/catalog";
import { ApiError, jsonResponse } from "@/lib/errors";
import {
  enforceRateLimit,
  guardReplay,
  parseJsonBody,
  rateLimitActor,
  readRawBody,
  requestFingerprint,
  requestPath,
  requireIdempotencyKey,
} from "@/lib/http";
import { createQuote, isQuoteExpired, type SignedQuote } from "@/lib/quote";
import type { MerchantService } from "@/lib/service";
import { isOrderComplete } from "@/lib/settlement";
import type { OrderDecision, SettlementStatus } from "@/lib/stores/ports";

/** Only public catalogue data ever leaves the store. */
export type PublicProduct = ReturnType<typeof publicProduct>;

export function publicProduct(product: Product) {
  return {
    id: product.id,
    merchantSku: product.sku,
    name: product.name,
    description: product.description,
    merchantCategoryId: product.localCategoryId,
    merchantCategoryLabel: product.localCategoryLabel,
    agentPayCategory: product.agentPayCategory,
    brand: product.brand,
    compatibility: product.compatibility,
    attributes: product.attributes,
    unitPriceCents: product.unitPriceCents,
    currency: product.currency,
    availableQuantity: product.availableQuantity,
    stockState: stockState(product),
  };
}

export function catalogueSnapshot(merchantId: string) {
  return {
    merchantId,
    catalogVersion: CATALOG_VERSION,
    categories: localCategories(merchantId),
    products: listProducts(merchantId).map(publicProduct),
  };
}

const searchSchema = z.object({
  query: z.string().max(200).default(""),
  limit: z.number().int().min(1).max(SEARCH_LIMIT_MAX).default(SEARCH_LIMIT_DEFAULT),
  merchantCategoryId: z.string().min(1).max(64).optional(),
});

const quoteSchema = z.object({
  items: z
    .array(
      z.object({
        merchantSku: z.string().min(1).max(64),
        quantity: z.number().int().min(1).max(999),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Verification body.
 *
 * `product_id`, `merchant_id` and `mandate_id` are the fields the AgentPay
 * merchant SDK parses and the agent signs over; `quote_id` is the store's own
 * reference and must name the same quote. The SDK's checkout contract has no
 * separate capability artefact: the signed request plus the registry mandate
 * *is* the proof of authority.
 */
const verificationSchema = z.object({
  quote_id: z.string().min(1).max(128),
  product_id: z.string().min(1).max(128),
  merchant_id: z.string().min(1).max(128),
  mandate_id: z.string().min(1).max(128),
  exception_id: z.string().min(1).max(128).optional(),
});

type Handler = (request: Request, context: { requestId: string }) => Promise<Response>;

async function loadQuote(service: MerchantService, quoteId: string) {
  const stored = await service.stores.quotes.get(quoteId);
  if (!stored) {
    throw new ApiError("QUOTE_NOT_FOUND", "No quote matches that identifier.");
  }
  if (stored.quote.merchantId !== service.identity.merchantId) {
    throw new ApiError("QUOTE_MERCHANT_MISMATCH", "That quote belongs to another merchant.");
  }
  return stored;
}

// ---------------------------------------------------------------------------
// POST /v1/agents-pay/search
// ---------------------------------------------------------------------------

export function searchHandler(service: MerchantService): Handler {
  return async (request, { requestId }) => {
    const rawBody = await readRawBody(request);

    await enforceRateLimit({
      store: service.stores.rateLimit,
      merchantId: service.identity.merchantId,
      purpose: "search",
      actor: rateLimitActor(request),
      limit: 60,
      windowSeconds: 60,
    });

    const agent = await authenticateAgent({
      request,
      rawBody,
      registryUrl: service.identity.registryUrl,
      replay: service.stores.replay,
      fetcher: service.fetcher,
      now: service.now(),
    });

    const parsed = searchSchema.safeParse(parseJsonBody(rawBody));
    if (!parsed.success) {
      throw new ApiError("BAD_REQUEST", "The search payload is invalid.");
    }

    const results = searchProducts({
      merchantId: service.identity.merchantId,
      query: parsed.data.query,
      limit: parsed.data.limit,
      ...(parsed.data.merchantCategoryId ? { localCategoryId: parsed.data.merchantCategoryId } : {}),
    });

    return jsonResponse(
      {
        merchantId: service.identity.merchantId,
        catalogVersion: CATALOG_VERSION,
        agentId: agent.agentId,
        limit: parsed.data.limit,
        results: results.map(publicProduct),
      },
      requestId,
    );
  };
}

// ---------------------------------------------------------------------------
// POST /v1/agents-pay/quotes
// ---------------------------------------------------------------------------

export function createQuoteHandler(service: MerchantService): Handler {
  return async (request, { requestId }) => {
    const rawBody = await readRawBody(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const scope = `${service.identity.merchantId}:quotes`;
    const fingerprint = requestFingerprint({
      method: request.method,
      path: requestPath(request),
      rawBody,
    });

    await enforceRateLimit({
      store: service.stores.rateLimit,
      merchantId: service.identity.merchantId,
      purpose: "quotes",
      actor: rateLimitActor(request),
      limit: 30,
      windowSeconds: 60,
    });

    const reservation = await service.stores.idempotency.begin({
      key: idempotencyKey,
      scope,
      requestHash: fingerprint,
    });

    if (reservation.outcome === "replay") {
      return new Response(reservation.record.body, {
        status: reservation.record.status,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "idempotent-replay": "true",
          "cache-control": "no-store",
        },
      });
    }
    if (reservation.outcome === "conflict") {
      throw new ApiError(
        "IDEMPOTENCY_KEY_REUSED",
        "That Idempotency-Key was already used with a different payload.",
      );
    }
    if (reservation.outcome === "in_flight") {
      throw new ApiError("CONFLICT", "An identical request is already being processed.");
    }

    try {
      const agent = await authenticateAgent({
        request,
        rawBody,
        registryUrl: service.identity.registryUrl,
        replay: service.stores.replay,
        fetcher: service.fetcher,
        now: service.now(),
      });

      const parsed = quoteSchema.safeParse(parseJsonBody(rawBody));
      if (!parsed.success) {
        throw new ApiError("BAD_REQUEST", "The quote payload is invalid.");
      }

      const quote = createQuote({
        merchantId: service.identity.merchantId,
        items: parsed.data.items,
        signer: service.signer,
        ttlSeconds: service.quoteTtlSeconds,
        now: service.now(),
      });

      await service.stores.quotes.put({ quote, agentId: agent.agentId });

      const body = JSON.stringify({ quote });
      await service.stores.idempotency.complete({ key: idempotencyKey, scope, status: 201, body });

      return new Response(body, {
        status: 201,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      // A failed attempt must not burn the key: the same request may retry.
      await service.stores.idempotency.abandon({ key: idempotencyKey, scope });
      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// GET /v1/agents-pay/quotes/:quoteId
// ---------------------------------------------------------------------------

export function getQuoteHandler(service: MerchantService, quoteId: string): Handler {
  return async (request, { requestId }) => {
    await enforceRateLimit({
      store: service.stores.rateLimit,
      merchantId: service.identity.merchantId,
      purpose: "quotes:read",
      actor: rateLimitActor(request),
      limit: 120,
      windowSeconds: 60,
    });

    const agent = await authenticateAgent({
      request,
      rawBody: "",
      registryUrl: service.identity.registryUrl,
      replay: service.stores.replay,
      fetcher: service.fetcher,
      now: service.now(),
    });

    const stored = await loadQuote(service, quoteId);

    if (stored.agentId !== agent.agentId) {
      throw new ApiError("FORBIDDEN", "That quote was issued to another agent.");
    }
    if (isQuoteExpired(stored.quote, service.now())) {
      throw new ApiError("QUOTE_EXPIRED", "That quote has expired. Request a new one.");
    }

    return jsonResponse({ quote: stored.quote }, requestId);
  };
}

// ---------------------------------------------------------------------------
// POST /v1/agents-pay/orders/:merchantOrderRef/verification
// ---------------------------------------------------------------------------

type VerificationBody = z.infer<typeof verificationSchema>;

function decisionFor(decision: string): OrderDecision {
  if (decision === "approved") return "verification_approved";
  if (decision === "escalated") return "approval_required";
  return "verification_rejected";
}

async function settleApprovedOrder(
  service: MerchantService,
  quote: SignedQuote,
): Promise<{ paymentOperationId: string | null; settlementStatus: SettlementStatus }> {
  try {
    const result = await service.settlement.authorizeAndCapture({
      merchantOrderRef: quote.merchantOrderRef,
      amountCents: quote.totalCents,
      currency: quote.currency,
    });
    return { paymentOperationId: result.paymentOperationId, settlementStatus: result.settlementStatus };
  } catch {
    // Authorised but not settled: the order stays incomplete.
    return { paymentOperationId: null, settlementStatus: "failed" };
  }
}

export function verificationHandler(service: MerchantService, merchantOrderRef: string): Handler {
  return async (request, { requestId }) => {
    const rawBody = await readRawBody(request);
    const idempotencyKey = requireIdempotencyKey(request);
    const scope = `${service.identity.merchantId}:verification:${merchantOrderRef}`;
    const fingerprint = requestFingerprint({
      method: request.method,
      path: requestPath(request),
      rawBody,
    });

    await enforceRateLimit({
      store: service.stores.rateLimit,
      merchantId: service.identity.merchantId,
      purpose: "verification",
      actor: rateLimitActor(request),
      limit: 20,
      windowSeconds: 60,
    });

    const reservation = await service.stores.idempotency.begin({
      key: idempotencyKey,
      scope,
      requestHash: fingerprint,
    });

    if (reservation.outcome === "replay") {
      return new Response(reservation.record.body, {
        status: reservation.record.status,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "idempotent-replay": "true",
          "cache-control": "no-store",
        },
      });
    }
    if (reservation.outcome === "conflict") {
      throw new ApiError(
        "IDEMPOTENCY_KEY_REUSED",
        "That Idempotency-Key was already used with a different payload.",
      );
    }
    if (reservation.outcome === "in_flight") {
      throw new ApiError("CONFLICT", "An identical request is already being processed.");
    }

    let claimed = false;
    try {
      const parsed = verificationSchema.safeParse(parseJsonBody(rawBody));
      if (!parsed.success) {
        throw new ApiError("BAD_REQUEST", "The verification payload is invalid.");
      }
      const body: VerificationBody = parsed.data;

      if (body.product_id !== body.quote_id) {
        throw new ApiError("BAD_REQUEST", "product_id must name the quote being purchased.");
      }
      if (body.merchant_id !== service.identity.merchantId) {
        throw new ApiError("QUOTE_MERCHANT_MISMATCH", "That request targets another merchant.");
      }

      const stored = await loadQuote(service, body.quote_id);
      if (stored.quote.merchantOrderRef !== merchantOrderRef) {
        throw new ApiError("BAD_REQUEST", "The quote does not belong to that order reference.");
      }
      if (isQuoteExpired(stored.quote, service.now())) {
        throw new ApiError("QUOTE_EXPIRED", "That quote has expired. Request a new one.");
      }

      // Defence in depth: AgentPay's registry consumes the nonce durably, and
      // the store refuses a nonce it has already seen for this agent.
      const nonce = request.headers.get("x-nonce");
      const agentId = request.headers.get("x-agent-id");
      if (nonce && agentId) {
        await guardReplay({
          store: service.stores.replay,
          proofId: `agent:${agentId}:${nonce}`,
          windowSeconds: 120,
          now: service.now(),
        });
      }

      const claim = await service.stores.orders.claimVerification({
        merchantOrderRef,
        merchantId: service.identity.merchantId,
        quoteId: stored.quote.quoteId,
        capabilityHash: fingerprint,
      });

      if (!claim.claimed) {
        // A terminal decision is never replaced and a concurrent attempt never
        // produces a second payment operation.
        throw new ApiError(
          "ORDER_DECISION_FINAL",
          "This order already has a decision or another verification is in flight.",
        );
      }
      claimed = true;

      const outcome = await verifyWithAgentPay({
        request,
        rawBody,
        quote: stored.quote,
        identity: service.identity,
        fetcher: service.fetcher,
        now: service.now,
      });

      if (outcome.kind === "rejected_payload") {
        throw new ApiError(
          outcome.httpStatus === 404 ? "NOT_FOUND" : "UNPROCESSABLE",
          outcome.reason,
        );
      }

      const orderDecision = decisionFor(outcome.decision);
      const settlement =
        orderDecision === "verification_approved"
          ? await settleApprovedOrder(service, stored.quote)
          : { paymentOperationId: null, settlementStatus: "none" as SettlementStatus };

      const record = await service.stores.orders.completeVerification({
        merchantOrderRef,
        decision: orderDecision,
        reasonCode: outcome.reason_code,
        paymentOperationId: settlement.paymentOperationId,
        settlementStatus: settlement.settlementStatus,
      });
      claimed = false;

      const status = outcome.decision === "approved" ? 200 : outcome.httpStatus === 401 ? 401 : 200;
      const payload = {
        merchantOrderRef: record.merchantOrderRef,
        quoteId: record.quoteId,
        decision: record.decision,
        reasonCode: record.reasonCode,
        paymentOperationId: record.paymentOperationId,
        settlementStatus: record.settlementStatus,
        orderComplete: isOrderComplete(record.settlementStatus),
        totalCents: stored.quote.totalCents,
        currency: stored.quote.currency,
        checks: outcome.checks,
      };
      const responseBody = JSON.stringify(payload);

      await service.stores.idempotency.complete({ key: idempotencyKey, scope, status, body: responseBody });

      return new Response(responseBody, {
        status,
        headers: {
          "content-type": "application/json",
          "x-request-id": requestId,
          "cache-control": "no-store",
        },
      });
    } catch (error) {
      if (claimed) {
        await service.stores.orders.releaseClaim(merchantOrderRef);
      }
      await service.stores.idempotency.abandon({ key: idempotencyKey, scope });
      throw error;
    }
  };
}

// ---------------------------------------------------------------------------
// Technical order lookup (audit view)
// ---------------------------------------------------------------------------

export function orderLookupHandler(service: MerchantService, merchantOrderRef: string): Handler {
  return async (_request, { requestId }) => {
    const record = await service.stores.orders.get(merchantOrderRef);
    if (!record) {
      throw new ApiError("NOT_FOUND", "No order matches that reference.");
    }
    return jsonResponse(
      {
        merchantOrderRef: record.merchantOrderRef,
        quoteId: record.quoteId,
        decision: record.decision,
        reasonCode: record.reasonCode,
        paymentOperationId: record.paymentOperationId,
        settlementStatus: record.settlementStatus,
        orderComplete: isOrderComplete(record.settlementStatus),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      requestId,
    );
  };
}
