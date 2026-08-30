import { randomUUID } from "node:crypto";

/**
 * One error envelope for every API route:
 *
 *   { "error": { "code": "...", "message": "...", "requestId": "req_..." } }
 *
 * Messages are written for an integrator, never for a debugger: no stack
 * traces, no key material, no internal identifiers beyond the request id.
 */

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "GONE"
  | "PAYLOAD_TOO_LARGE"
  | "UNPROCESSABLE"
  | "IDEMPOTENCY_KEY_REQUIRED"
  | "IDEMPOTENCY_KEY_INVALID"
  | "IDEMPOTENCY_KEY_REUSED"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_EXPIRED"
  | "QUOTE_MERCHANT_MISMATCH"
  | "SKU_NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "MIXED_CATEGORY_CART"
  | "ORDER_DECISION_FINAL"
  | "REPLAYED_PROOF"
  | "RATE_LIMITED"
  | "DEMO_SIGNER_DISABLED"
  | "INTERNAL"
  | "DEPENDENCY_UNAVAILABLE";

const statusByCode: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  GONE: 410,
  PAYLOAD_TOO_LARGE: 413,
  UNPROCESSABLE: 422,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  IDEMPOTENCY_KEY_INVALID: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  QUOTE_NOT_FOUND: 404,
  QUOTE_EXPIRED: 410,
  QUOTE_MERCHANT_MISMATCH: 403,
  SKU_NOT_FOUND: 422,
  INSUFFICIENT_STOCK: 422,
  MIXED_CATEGORY_CART: 422,
  ORDER_DECISION_FINAL: 409,
  REPLAYED_PROOF: 409,
  RATE_LIMITED: 429,
  DEMO_SIGNER_DISABLED: 403,
  INTERNAL: 500,
  DEPENDENCY_UNAVAILABLE: 503,
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly headers: Record<string, string>;

  constructor(code: ErrorCode, message: string, headers: Record<string, string> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.headers = headers;
  }

  get status(): number {
    return statusByCode[this.code];
  }
}

export function newRequestId(): string {
  return `req_${randomUUID()}`;
}

export function errorResponse(error: unknown, requestId: string): Response {
  const apiError =
    error instanceof ApiError
      ? error
      : new ApiError("INTERNAL", "The store could not complete this request.");

  return Response.json(
    { error: { code: apiError.code, message: apiError.message, requestId } },
    {
      status: apiError.status,
      headers: { "x-request-id": requestId, "cache-control": "no-store", ...apiError.headers },
    },
  );
}

export function jsonResponse(body: unknown, requestId: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("x-request-id", requestId);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}
