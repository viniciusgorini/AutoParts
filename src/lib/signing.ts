import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
  type JsonWebKey,
} from "node:crypto";

import { canonicalJson } from "@/lib/canonical";

/**
 * Ed25519 quote signing.
 *
 * The AgentPay merchant SDK signs and verifies agent requests internally but
 * does not export its signing primitives, so the store owns this narrow
 * implementation for its own quote signature. Keys are JWK (OKP/Ed25519) and
 * live only in server-side environment variables.
 */

export type QuoteSigner = {
  keyId: string;
  sign(payload: unknown): string;
  publicJwk(): JsonWebKey;
};

export class SigningKeyError extends Error {}

function parseJwk(raw: string): JsonWebKey {
  const text = raw.trim().startsWith("{") ? raw.trim() : Buffer.from(raw.trim(), "base64").toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new SigningKeyError("The merchant private JWK must be JSON or base64-encoded JSON");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new SigningKeyError("The merchant private JWK must be a JSON object");
  }
  const jwk = parsed as JsonWebKey & { crv?: string; d?: string; x?: string };
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.d !== "string" || typeof jwk.x !== "string") {
    throw new SigningKeyError("The merchant private JWK must be an Ed25519 OKP key with 'd' and 'x'");
  }
  return jwk;
}

export function createQuoteSigner(input: { keyId: string; privateJwk: string }): QuoteSigner {
  const jwk = parseJwk(input.privateJwk);
  const privateKey = createPrivateKey({ key: jwk, format: "jwk" });
  const publicKey = createPublicKey(privateKey);

  return {
    keyId: input.keyId,
    sign(payload: unknown): string {
      return sign(null, Buffer.from(canonicalJson(payload), "utf8"), privateKey).toString("base64url");
    },
    publicJwk(): JsonWebKey {
      return publicKey.export({ format: "jwk" });
    },
  };
}

export function verifyQuoteSignature(input: {
  publicJwk: JsonWebKey;
  payload: unknown;
  signature: string;
}): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonicalJson(input.payload), "utf8"),
      createPublicKey({ key: input.publicJwk, format: "jwk" }),
      Buffer.from(input.signature, "base64url"),
    );
  } catch {
    return false;
  }
}

/** Development helper: generates a throwaway Ed25519 key pair as JWK. */
export function generateQuoteKeyPairJwk(): { privateJwk: string; publicJwk: JsonWebKey } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    privateJwk: JSON.stringify(privateKey.export({ format: "jwk" })),
    publicJwk: publicKey.export({ format: "jwk" }),
  };
}
