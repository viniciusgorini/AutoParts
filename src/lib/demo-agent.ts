import { randomUUID } from "node:crypto";

import { signAgentPayRequest } from "@agentpay/merchant-sdk";

import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import type { SignedQuote } from "@/lib/quote";

/**
 * Browser-driven demo agent.
 *
 * The storefront runs in a browser and has no agent key: an agent key must
 * never reach the client. So when an operator drives the demo by hand, this
 * server-side signer stands in for the agent, using the SDK's own
 * `signAgentPayRequest`.
 *
 * It is NOT authentication and it is NOT a production path. `loadEnv` refuses
 * to start with it enabled in production, and this module refuses to run there
 * as a second gate.
 */

export type DemoAgentConfig = { agentId: string; privateKey: string; origin: string };

export function demoAgentConfig(): DemoAgentConfig {
  const configuration = env();

  if (configuration.NODE_ENV === "production" || !configuration.AUTOPARTS_DEMO_AGENT_ENABLED) {
    throw new ApiError(
      "DEMO_SIGNER_DISABLED",
      "The demo checkout is disabled. Drive this store with a real AgentPay agent.",
    );
  }
  if (!configuration.AUTOPARTS_DEMO_AGENT_ID || !configuration.AUTOPARTS_DEMO_AGENT_PRIVATE_KEY) {
    throw new ApiError("DEMO_SIGNER_DISABLED", "The demo agent is not configured.");
  }

  return {
    agentId: configuration.AUTOPARTS_DEMO_AGENT_ID,
    privateKey: configuration.AUTOPARTS_DEMO_AGENT_PRIVATE_KEY,
    origin: configuration.AUTOPARTS_PUBLIC_ORIGIN,
  };
}

export function isDemoAgentEnabled(): boolean {
  const configuration = env();
  return (
    configuration.NODE_ENV !== "production" &&
    configuration.AUTOPARTS_DEMO_AGENT_ENABLED &&
    Boolean(configuration.AUTOPARTS_DEMO_AGENT_ID && configuration.AUTOPARTS_DEMO_AGENT_PRIVATE_KEY)
  );
}

export type SignedCall = { url: string; init: RequestInit };

/** Builds a request the store's own protected routes will accept. */
export function signedCall(input: {
  config: DemoAgentConfig;
  method: "GET" | "POST";
  path: string;
  body: unknown;
  idempotencyKey?: string;
}): SignedCall {
  const url = new URL(input.path, input.config.origin).toString();
  const body = input.method === "GET" ? "" : JSON.stringify(input.body);

  const headers = signAgentPayRequest({
    agentId: input.config.agentId,
    privateKey: input.config.privateKey,
    method: input.method,
    url,
    body,
  });
  if (input.idempotencyKey) {
    headers.set("idempotency-key", input.idempotencyKey);
  }

  return {
    url,
    init: input.method === "GET" ? { method: "GET", headers } : { method: "POST", headers, body },
  };
}

export type DemoCheckoutStep = {
  step: string;
  ok: boolean;
  status: number;
  detail: string;
};

export type DemoCheckoutResult = {
  outcome: "approved" | "approval_required" | "refused" | "error";
  message: string;
  merchantOrderRef: string | null;
  quote: SignedQuote | null;
  decision: unknown;
  trace: DemoCheckoutStep[];
};

const OUTCOME_MESSAGES: Record<DemoCheckoutResult["outcome"], string> = {
  approved: "AgentPay approved the purchase and the payment was captured.",
  approval_required: "AgentPay needs an extra approval before this purchase can complete.",
  refused: "AgentPay refused this purchase.",
  error: "We could not reach AgentPay right now.",
};

export function demoOutcomeMessage(outcome: DemoCheckoutResult["outcome"]): string {
  return OUTCOME_MESSAGES[outcome];
}

export async function runDemoCheckout(input: {
  items: readonly { merchantSku: string; quantity: number }[];
  mandateId: string;
  exceptionId?: string;
  fetcher?: typeof fetch;
}): Promise<DemoCheckoutResult> {
  const config = demoAgentConfig();
  const fetcher = input.fetcher ?? fetch;
  const trace: DemoCheckoutStep[] = [];

  const quoteCall = signedCall({
    config,
    method: "POST",
    path: "/v1/agents-pay/quotes",
    body: { items: input.items },
    idempotencyKey: `demo_quote_${randomUUID()}`,
  });

  const quoteResponse = await fetcher(quoteCall.url, quoteCall.init);
  const quotePayload = (await quoteResponse.json()) as
    | { quote: SignedQuote }
    | { error: { code: string; message: string } };

  if (!quoteResponse.ok || !("quote" in quotePayload)) {
    const detail = "error" in quotePayload ? quotePayload.error.message : "The quote was refused.";
    trace.push({ step: "quote", ok: false, status: quoteResponse.status, detail });
    return {
      outcome: "error",
      message: detail,
      merchantOrderRef: null,
      quote: null,
      decision: null,
      trace,
    };
  }

  const quote = quotePayload.quote;
  trace.push({
    step: "quote",
    ok: true,
    status: quoteResponse.status,
    detail: `Signed quote ${quote.quoteId}`,
  });

  const verificationCall = signedCall({
    config,
    method: "POST",
    path: `/v1/agents-pay/orders/${encodeURIComponent(quote.merchantOrderRef)}/verification`,
    body: {
      quote_id: quote.quoteId,
      product_id: quote.quoteId,
      merchant_id: quote.merchantId,
      mandate_id: input.mandateId,
      ...(input.exceptionId ? { exception_id: input.exceptionId } : {}),
    },
    idempotencyKey: `demo_verify_${quote.quoteId}`,
  });

  const verificationResponse = await fetcher(verificationCall.url, verificationCall.init);
  const verification = (await verificationResponse.json()) as Record<string, unknown>;

  if (!verificationResponse.ok) {
    const message =
      typeof (verification.error as { message?: string } | undefined)?.message === "string"
        ? (verification.error as { message: string }).message
        : OUTCOME_MESSAGES.error;
    trace.push({ step: "verification", ok: false, status: verificationResponse.status, detail: message });
    return {
      outcome: "error",
      message,
      merchantOrderRef: quote.merchantOrderRef,
      quote,
      decision: verification,
      trace,
    };
  }

  const decision = String(verification.decision ?? "");
  const outcome: DemoCheckoutResult["outcome"] =
    decision === "verification_approved" && verification.orderComplete === true
      ? "approved"
      : decision === "approval_required"
        ? "approval_required"
        : "refused";

  trace.push({
    step: "verification",
    ok: true,
    status: verificationResponse.status,
    detail: `Decision ${decision}`,
  });

  return {
    outcome,
    message: OUTCOME_MESSAGES[outcome],
    merchantOrderRef: quote.merchantOrderRef,
    quote,
    decision: verification,
    trace,
  };
}
