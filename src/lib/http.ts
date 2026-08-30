import { canonicalHash, sha256Base64Url } from "@/lib/canonical";
import { ApiError, errorResponse, newRequestId } from "@/lib/errors";
import type { RateLimitStore, ReplayStore } from "@/lib/stores/ports";

/** Bodies larger than this are rejected before any parsing happens. */
export const MAX_BODY_BYTES = 32 * 1024;

export const IDEMPOTENCY_KEY_MIN = 8;
export const IDEMPOTENCY_KEY_MAX = 255;

export type RequestContext = { requestId: string };

/**
 * Wraps a route handler with a request id and the shared error envelope, so a
 * thrown ApiError always leaves as the documented JSON shape and an unexpected
 * failure never leaks a stack trace.
 */
export function withApiRequest(
  handler: (request: Request, context: RequestContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const requestId = newRequestId();
    try {
      return await handler(request, { requestId });
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}

export async function readRawBody(request: Request): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > MAX_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is larger than 32 KiB.");
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is larger than 32 KiB.");
  }
  return raw;
}

export function parseJsonBody(raw: string): unknown {
  if (raw.trim().length === 0) {
    throw new ApiError("BAD_REQUEST", "A JSON body is required.");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError("BAD_REQUEST", "The request body is not valid JSON.");
  }
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get("idempotency-key");
  if (key === null) {
    throw new ApiError("IDEMPOTENCY_KEY_REQUIRED", "This operation requires an Idempotency-Key header.");
  }
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new ApiError("IDEMPOTENCY_KEY_INVALID", "The Idempotency-Key header must not be empty.");
  }
  if (trimmed.length < IDEMPOTENCY_KEY_MIN || trimmed.length > IDEMPOTENCY_KEY_MAX) {
    throw new ApiError(
      "IDEMPOTENCY_KEY_INVALID",
      `The Idempotency-Key header must be between ${IDEMPOTENCY_KEY_MIN} and ${IDEMPOTENCY_KEY_MAX} characters.`,
    );
  }
  return trimmed;
}

/** The idempotency fingerprint binds a key to the exact request it replayed. */
export function requestFingerprint(input: { method: string; path: string; rawBody: string }): string {
  return canonicalHash({
    method: input.method.toUpperCase(),
    path: input.path,
    bodyHash: sha256Base64Url(input.rawBody),
  });
}

/**
 * Identifies who is being limited. An authenticated agent is limited by its own
 * identity; an unauthenticated caller falls back to the forwarded client
 * address so an anonymous flood cannot exhaust another agent's budget.
 */
export function rateLimitActor(request: Request): string {
  const agentId = request.headers.get("x-agent-id");
  if (agentId && agentId.trim().length > 0) return `agent:${agentId.trim()}`;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return `ip:${forwarded && forwarded.length > 0 ? forwarded : "unknown"}`;
}

export async function enforceRateLimit(input: {
  store: RateLimitStore;
  merchantId: string;
  purpose: string;
  actor: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  let verdict;
  try {
    verdict = await input.store.hit({
      bucket: `${input.merchantId}:${input.purpose}:${input.actor}`,
      limit: input.limit,
      windowSeconds: input.windowSeconds,
    });
  } catch {
    // A rate limiter that cannot answer must not be treated as "allow".
    throw new ApiError("DEPENDENCY_UNAVAILABLE", "The rate limiter is unavailable. Try again shortly.");
  }

  if (!verdict.allowed) {
    throw new ApiError("RATE_LIMITED", "Too many requests. Slow down and retry later.", {
      "retry-after": String(verdict.retryAfterSeconds),
    });
  }
}

/**
 * Store-side replay guard.
 *
 * AgentPay's registry consumes the request nonce durably; this is the store's
 * own defence in depth so a proof cannot be replayed against AutoParts even if
 * the registry call is retried.
 */
export async function guardReplay(input: {
  store: ReplayStore;
  proofId: string;
  windowSeconds: number;
  now?: Date;
}): Promise<void> {
  const now = input.now ?? new Date();
  const accepted = await input.store.consume({
    id: input.proofId,
    expiresAt: new Date(now.valueOf() + input.windowSeconds * 1_000),
  });
  if (!accepted) {
    throw new ApiError("REPLAYED_PROOF", "This request proof has already been used.");
  }
}

export function requestPath(request: Request): string {
  return new URL(request.url).pathname;
}
