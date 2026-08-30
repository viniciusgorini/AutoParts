import { createHash } from "node:crypto";

/**
 * Deterministic JSON serialisation used for the cart hash and the quote
 * signature. Object keys are sorted by UTF-16 code unit (the JCS/RFC 8785
 * ordering), arrays keep their order, and undefined members are dropped so a
 * value is never serialised in two different ways.
 *
 * The AgentPay merchant SDK does not export a canonicalisation helper, so
 * AutoParts owns this implementation. See README "SDK limitations".
 */
function canonicalise(value: unknown): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot represent a non-finite number");
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalise);
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => [key, canonicalise(nested)] as const);
    return Object.fromEntries(entries);
  }

  throw new TypeError(`Canonical JSON cannot represent ${typeof value}`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalise(value));
}

export function sha256Base64Url(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("base64url");
}

export function canonicalHash(value: unknown): string {
  return sha256Base64Url(canonicalJson(value));
}
