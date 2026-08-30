import { createHash, createPublicKey, verify } from "node:crypto";
import { z } from "zod";

import { canonicalize, type JsonValue } from "@/lib/jcs";

const agentSchema = z.object({ id: z.string().min(1), public_key: z.string().min(1) });

export type AgentRequestVerification =
  | { ok: true; agentId: string; canonicalBody: string }
  | { ok: false; code: string; message: string; status: number };

function refused(code: string, message: string, status = 401): AgentRequestVerification {
  return { ok: false, code, message, status };
}

export async function verifyAgentRequest(
  request: Request,
  body: JsonValue,
  registryUrl: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
): Promise<AgentRequestVerification> {
  const agentId = request.headers.get("x-agent-id");
  const timestamp = request.headers.get("x-timestamp");
  const nonce = request.headers.get("x-nonce");
  const signature = request.headers.get("x-signature");
  if (!agentId || !timestamp || !nonce || !signature) {
    return refused("AGENT_SIGNATURE_REQUIRED", "Signed AgentPay request headers are required.");
  }

  const signedAt = new Date(timestamp);
  if (!Number.isFinite(signedAt.valueOf()) || Math.abs(now.valueOf() - signedAt.valueOf()) > 60_000) {
    return refused("AGENT_SIGNATURE_EXPIRED", "The AgentPay request timestamp is outside the allowed window.");
  }

  let canonicalBody: string;
  try {
    canonicalBody = canonicalize(body);
  } catch {
    return refused("INVALID_CANONICAL_JSON", "The request cannot be canonicalized with RFC 8785 JCS.", 400);
  }

  try {
    const agentResponse = await fetcher(new URL(`/api/registry/agents/${encodeURIComponent(agentId)}`, registryUrl), {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!agentResponse.ok) return refused("AGENT_NOT_FOUND", "The signing agent is not active in the registry.");
    const agent = agentSchema.parse(await agentResponse.json());
    const bodyHash = createHash("sha256").update(canonicalBody).digest("base64url");
    const message = [request.method.toUpperCase(), new URL(request.url).pathname, bodyHash, timestamp, nonce].join("|");
    const signatureValid = verify(
      null,
      Buffer.from(message),
      createPublicKey(agent.public_key),
      Buffer.from(signature, "base64url"),
    );
    if (!signatureValid) return refused("AGENT_SIGNATURE_INVALID", "The AgentPay request signature is invalid.");

    const nonceResponse = await fetcher(new URL("/api/registry/nonces", registryUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, nonce, timestamp }),
    });
    if (!nonceResponse.ok) return refused("AGENT_REQUEST_REPLAYED", "The AgentPay request nonce was already used.", 409);
    return { ok: true, agentId, canonicalBody };
  } catch {
    return refused("AGENT_REGISTRY_UNAVAILABLE", "The AgentPay registry could not verify this request.", 503);
  }
}
