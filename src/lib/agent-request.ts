import {
  AgentRequestProofClaimsSchema,
  OpaqueIdSchema,
  type AgentRequestProofClaims,
} from "@agentic-mandates/contracts";
import { sha256Base64Url } from "@agentic-mandates/sdk";
import { decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { z } from "zod";

import { agentPayConfig } from "@/lib/env";

const requestProofType = "application/agentic-mandates-request-proof+jws";
const maximumProofLifetimeSeconds = 60;
const textEncoder = new TextEncoder();

const registeredKeySchema = z.object({
  keyId: OpaqueIdSchema,
  actor: z.object({ type: z.literal("agent"), id: OpaqueIdSchema }).strict(),
  status: z.enum(["active", "revoked", "suspended"]),
  publicJwk: z.object({
    kty: z.literal("EC"),
    crv: z.literal("P-256"),
    x: z.string().min(1),
    y: z.string().min(1),
  }).passthrough(),
}).strict();

export type AgentRequestVerification =
  | { ok: true; agentId: string }
  | { ok: false; code: string; message: string; status: 401 | 409 | 503 };

function refused(
  code: string,
  message: string,
  status: 401 | 409 | 503 = 401,
): AgentRequestVerification {
  return { ok: false, code, message, status };
}

/**
 * Validates an SDK V2 ES256 proof against a Control-Plane registered key and
 * atomically claims its JTI. The merchant never accepts caller-provided keys
 * or a browser session at this machine-to-machine boundary.
 */
export async function verifyAgentRequest(
  request: Request,
  rawBody: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<AgentRequestVerification> {
  const proof = request.headers.get("x-agent-request-proof")?.trim();
  if (!proof) {
    return refused("AGENT_AUTH_REQUIRED", "A signed AgentPay request proof is required.");
  }

  let keyId: string;
  try {
    const header = decodeProtectedHeader(proof);
    if (header.alg !== "ES256" || header.typ !== requestProofType || typeof header.kid !== "string") {
      return refused("AGENT_PROOF_INVALID", "The AgentPay request proof is invalid.");
    }
    keyId = OpaqueIdSchema.parse(header.kid);
  } catch {
    return refused("AGENT_PROOF_INVALID", "The AgentPay request proof is invalid.");
  }

  const config = agentPayConfig();
  let registeredKey: z.infer<typeof registeredKeySchema>;
  try {
    const response = await fetcher(
      new URL(`v1/registry/request-proof-keys/${encodeURIComponent(keyId)}`, withTrailingSlash(config.requestProofRegistryUrl)),
      { headers: { accept: "application/json" }, cache: "no-store" },
    );
    if (response.status === 404) {
      return refused("AGENT_PROOF_INVALID", "The AgentPay request proof is invalid.");
    }
    if (!response.ok) {
      return refused("SERVICE_UNAVAILABLE", "The AgentPay request-proof registry is unavailable.", 503);
    }
    registeredKey = registeredKeySchema.parse(await response.json());
  } catch {
    return refused("SERVICE_UNAVAILABLE", "The AgentPay request-proof registry is unavailable.", 503);
  }

  if (registeredKey.keyId !== keyId || registeredKey.status !== "active") {
    return refused(
      registeredKey.status === "revoked" ? "AGENT_KEY_REVOKED" : "AGENT_PROOF_INVALID",
      "The AgentPay request proof is invalid or its key is not active.",
    );
  }

  let claims: AgentRequestProofClaims;
  try {
    const verified = await jwtVerify(proof, await importJWK(registeredKey.publicJwk as JWK, "ES256"), {
      algorithms: ["ES256"],
      audience: `merchant-api:${config.merchantId}`,
      issuer: registeredKey.actor.id,
      subject: registeredKey.actor.id,
      currentDate: now,
      maxTokenAge: maximumProofLifetimeSeconds,
    });
    const parsed = AgentRequestProofClaimsSchema.safeParse(verified.payload);
    if (!parsed.success) {
      return refused("AGENT_PROOF_INVALID", "The AgentPay request proof is invalid.");
    }
    claims = parsed.data;
  } catch {
    return refused("AGENT_PROOF_INVALID", "The AgentPay request proof is invalid, expired, or untrusted.");
  }

  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    claims.iss !== registeredKey.actor.id
    || claims.sub !== registeredKey.actor.id
    || claims.htm !== request.method.toUpperCase()
    || claims.htu !== request.url
    || claims.iat > nowSeconds + 5
    || claims.exp <= nowSeconds
    || claims.exp - claims.iat > maximumProofLifetimeSeconds
    || claims.body_hash !== await sha256Base64Url(textEncoder.encode(rawBody))
  ) {
    return refused("AGENT_PROOF_INVALID", "The AgentPay request proof is not bound to this request.");
  }

  try {
    const response = await fetcher(
      new URL("v1/registry/request-proofs/claims", withTrailingSlash(config.requestProofRegistryUrl)),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorKind: "agent",
          keyId,
          proofId: claims.jti,
          expiresAtUnixSeconds: claims.exp,
        }),
        cache: "no-store",
      },
    );
    if (response.status === 409) {
      return refused("REQUEST_REPLAYED", "This AgentPay request proof was already used.", 409);
    }
    if (!response.ok) {
      return refused("SERVICE_UNAVAILABLE", "The AgentPay replay-protection service is unavailable.", 503);
    }
  } catch {
    return refused("SERVICE_UNAVAILABLE", "The AgentPay replay-protection service is unavailable.", 503);
  }

  return { ok: true, agentId: registeredKey.actor.id };
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
