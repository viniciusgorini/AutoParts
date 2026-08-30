import { createPublicKey, verify } from "node:crypto";

import { z } from "zod";

import { sha256Base64Url } from "@/lib/canonical";
import { ApiError } from "@/lib/errors";
import type { ReplayStore } from "@/lib/stores/ports";

/**
 * Agent request authentication for the store-owned routes.
 *
 * ---------------------------------------------------------------------------
 * SDK LIMITATION (documented, not worked around silently)
 * ---------------------------------------------------------------------------
 * `@agentpay/merchant-sdk@0.1.0` verifies agent request signatures *inside*
 * `createAgentPayCheckoutHandler`, and that handler only accepts its own
 * checkout body. It does not export the two pieces a store needs to protect
 * any other route:
 *
 *   - `agentSigningMessage({ method, path, body, timestamp, nonce })`
 *   - `verifyText(publicKeyPem, message, signature)`
 *
 * They exist in the AgentPay source but are not part of the package surface.
 * AutoParts therefore re-implements the documented wire format below so that
 * `/v1/agents-pay/search` and `/v1/agents-pay/quotes` can be authenticated. No
 * AgentPay file is imported or copied; the agent's public key comes from the
 * public registry endpoint.
 *
 * Requested SDK change: export `agentSigningMessage`, `verifyText`, and ideally
 * a `verifyAgentPayRequest({ registryUrl, request, rawBody })` helper that
 * returns the authenticated agent id. See README.
 * ---------------------------------------------------------------------------
 */

export const SIGNING_WINDOW_SECONDS = 60;

const registryAgentSchema = z.object({ id: z.string().min(1), public_key: z.string().min(1) });

export type AuthenticatedAgent = { agentId: string; publicKeyPem: string; nonce: string; timestamp: string };

/** The exact message the SDK's `signAgentPayRequest` produces on the agent side. */
function signingMessage(input: {
  method: string;
  path: string;
  body: string;
  timestamp: string;
  nonce: string;
}): string {
  return [
    input.method.toUpperCase(),
    input.path,
    sha256Base64Url(input.body),
    input.timestamp,
    input.nonce,
  ].join("|");
}

function unauthenticated(message: string): ApiError {
  // Every failure returns the same code and status so a caller cannot probe
  // which specific check rejected the request.
  return new ApiError("UNAUTHENTICATED", message);
}

async function fetchAgentKey(input: {
  registryUrl: string;
  agentId: string;
  fetcher: typeof fetch;
}): Promise<string> {
  let response: Response;
  try {
    response = await input.fetcher(
      new URL(`/api/registry/agents/${encodeURIComponent(input.agentId)}`, input.registryUrl),
      { headers: { Accept: "application/json" } },
    );
  } catch {
    throw new ApiError("DEPENDENCY_UNAVAILABLE", "The AgentPay registry is unreachable.");
  }

  if (response.status >= 500) {
    throw new ApiError("DEPENDENCY_UNAVAILABLE", "The AgentPay registry is unavailable.");
  }
  if (!response.ok) {
    throw unauthenticated("The request signature could not be verified.");
  }

  const parsed = registryAgentSchema.safeParse(await response.json());
  if (!parsed.success || parsed.data.id !== input.agentId) {
    throw unauthenticated("The request signature could not be verified.");
  }
  return parsed.data.public_key;
}

export async function authenticateAgent(input: {
  request: Request;
  rawBody: string;
  registryUrl: string;
  replay: ReplayStore;
  fetcher?: typeof fetch;
  now?: Date;
}): Promise<AuthenticatedAgent> {
  const fetcher = input.fetcher ?? fetch;
  const now = input.now ?? new Date();

  const agentId = input.request.headers.get("x-agent-id");
  const timestamp = input.request.headers.get("x-timestamp");
  const nonce = input.request.headers.get("x-nonce");
  const signature = input.request.headers.get("x-signature");

  if (!agentId || !timestamp || !nonce || !signature) {
    throw unauthenticated("This endpoint requires a signed AgentPay request.");
  }
  if (nonce.length < 8 || nonce.length > 200) {
    throw unauthenticated("The request signature could not be verified.");
  }

  const signedAt = new Date(timestamp);
  if (!Number.isFinite(signedAt.valueOf())) {
    throw unauthenticated("The request signature could not be verified.");
  }
  // A future timestamp is as invalid as a stale one.
  if (Math.abs(now.valueOf() - signedAt.valueOf()) > SIGNING_WINDOW_SECONDS * 1_000) {
    throw unauthenticated("The request proof is outside the accepted time window.");
  }

  const publicKeyPem = await fetchAgentKey({ registryUrl: input.registryUrl, agentId, fetcher });

  let publicKey;
  try {
    publicKey = createPublicKey(publicKeyPem);
  } catch {
    throw unauthenticated("The request signature could not be verified.");
  }
  if (publicKey.asymmetricKeyType !== "ed25519") {
    // Only the algorithm the protocol defines is accepted.
    throw unauthenticated("The registered key algorithm is not accepted for this endpoint.");
  }

  const message = signingMessage({
    method: input.request.method,
    path: new URL(input.request.url).pathname,
    body: input.rawBody,
    timestamp,
    nonce,
  });

  let valid = false;
  try {
    valid = verify(null, Buffer.from(message, "utf8"), publicKey, Buffer.from(signature, "base64url"));
  } catch {
    valid = false;
  }
  if (!valid) {
    throw unauthenticated("The request signature could not be verified.");
  }

  // Single use, scoped to this agent, kept for the whole signing window.
  const accepted = await input.replay.consume({
    id: `agent:${agentId}:${nonce}`,
    expiresAt: new Date(now.valueOf() + SIGNING_WINDOW_SECONDS * 2 * 1_000),
  });
  if (!accepted) {
    throw new ApiError("REPLAYED_PROOF", "This request proof has already been used.");
  }

  return { agentId, publicKeyPem, nonce, timestamp };
}
