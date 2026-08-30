#!/usr/bin/env node
/**
 * LOCAL TEST DOUBLE FOR THE AGENTPAY REGISTRY. NOT PART OF THE APPLICATION.
 *
 * The real AgentPay registry at https://agentpay-yuno.vercel.app is live and
 * AutoParts talks to it directly. But registering an agent and having a user
 * sign a mandate with a passkey requires an AgentPay account, so an end-to-end
 * purchase cannot be driven from a script against the real deployment.
 *
 * This server answers the same four public endpoints the merchant SDK calls,
 * with real Ed25519 keys, so the SDK's signature verification, live-status
 * check, replay protection and policy evaluation all execute for real:
 *
 *   GET  /api/registry/agents/:id
 *   GET  /api/registry/keys
 *   GET  /api/registry/mandates/:id
 *   POST /api/registry/nonces
 *
 * It also exposes /_control/* so a demo can flip a mandate to revoked mid-run.
 * Nothing here is used by the store's own code.
 *
 * Usage:
 *   node scripts/fake-agentpay-registry.mjs --port 4400 --merchant mrc_autoparts
 */
import { createServer } from "node:http";
import { generateKeyPairSync, sign } from "node:crypto";
import { writeFileSync } from "node:fs";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const port = Number(arg("port", "4400"));
const merchantId = arg("merchant", "mrc_autoparts");
const keyOut = arg("agent-key-out", "./.agent-demo-key.pem");

const registryKeys = generateKeyPairSync("ed25519");
const registryPrivatePem = registryKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const registryPublicPem = registryKeys.publicKey.export({ type: "spki", format: "pem" }).toString();

const agentKeys = generateKeyPairSync("ed25519");
const agentId = "agent_local_demo";
const agentPrivatePem = agentKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const agentPublicPem = agentKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
writeFileSync(keyOut, agentPrivatePem);

function canonicalJson(value) {
  const sortValue = (input) => {
    if (Array.isArray(input)) return input.map(sortValue);
    if (input && typeof input === "object") {
      return Object.fromEntries(
        Object.entries(input)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, sortValue(nested)]),
      );
    }
    return input;
  };
  return JSON.stringify(sortValue(value));
}

const now = Date.now();

function buildMandate(id, overrides = {}) {
  return {
    mandate_id: id,
    type: "intent",
    issuer: { user_id: "user_local_demo" },
    agent: { agent_id: agentId, public_key: agentPublicPem },
    scope: { merchants: [merchantId], categories: ["tires", "accessories"] },
    limits: {
      per_purchase_cents: 500_000,
      cumulative_cents: 2_000_000,
      max_uses: 20,
      period: "month",
      currency: "USD",
    },
    validity: {
      not_before: new Date(now - 60_000).toISOString(),
      expires_at: new Date(now + 30 * 86_400_000).toISOString(),
    },
    payment: { vault_card_id: "card_local_demo" },
    authorization: null,
    status: "active",
    usage: { approved_uses: 0, cumulative_cents: 0 },
    ...overrides,
  };
}

function signMandate(mandate) {
  const artifact = {
    mandate_id: mandate.mandate_id,
    type: mandate.type,
    issuer: mandate.issuer,
    agent: mandate.agent,
    scope: mandate.scope,
    limits: mandate.limits,
    validity: mandate.validity,
    payment: mandate.payment,
    ...(mandate.authorization ? { authorization: mandate.authorization } : {}),
  };
  return {
    ...mandate,
    server_sig: sign(null, Buffer.from(canonicalJson(artifact), "utf8"), registryPrivatePem).toString(
      "base64url",
    ),
  };
}

const mandates = new Map();
// The SDK validates mandate ids as RFC-conformant UUIDs (version nibble 1-8,
// variant nibble 8/9/a/b), so these fixed demo ids are shaped as valid v4.
const ACTIVE = "11111111-1111-4111-8111-111111111111";
const SMALL_LIMIT = "22222222-2222-4222-8222-222222222222";
const REVOKED = "33333333-3333-4333-8333-333333333333";

mandates.set(ACTIVE, signMandate(buildMandate(ACTIVE)));
mandates.set(
  SMALL_LIMIT,
  signMandate(
    buildMandate(SMALL_LIMIT, {
      limits: {
        per_purchase_cents: 1_000,
        cumulative_cents: 2_000_000,
        max_uses: 20,
        period: "month",
        currency: "USD",
      },
    }),
  ),
);
mandates.set(REVOKED, signMandate(buildMandate(REVOKED, { status: "revoked" })));

const consumedNonces = new Set();

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const json = (body, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  if (url.pathname === `/api/registry/agents/${agentId}`) {
    return json({ id: agentId, public_key: agentPublicPem });
  }
  if (url.pathname.startsWith("/api/registry/agents/")) {
    return json({ error: "Agent not found" }, 404);
  }
  if (url.pathname === "/api/registry/keys") {
    return json({ algorithm: "Ed25519", public_key: registryPublicPem });
  }
  if (url.pathname.startsWith("/api/registry/mandates/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const mandate = mandates.get(id);
    return mandate ? json(mandate) : json({ error: "Mandate not found" }, 404);
  }
  if (url.pathname === "/api/registry/nonces" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    const key = `${body.agent_id}:${body.nonce}`;
    if (consumedNonces.has(key)) return json({ error: "Nonce already used" }, 409);
    consumedNonces.add(key);
    return json({ consumed: true }, 201);
  }
  if (url.pathname.startsWith("/_control/mandates/") && request.method === "POST") {
    const id = url.pathname.split("/")[3] ?? "";
    const mandate = mandates.get(id);
    if (!mandate) return json({ error: "Mandate not found" }, 404);
    mandates.set(id, { ...mandate, status: "revoked" });
    return json({ mandate_id: id, status: "revoked" });
  }

  return json({ error: "Not found" }, 404);
});

server.listen(port, () => {
  console.log(`fake AgentPay registry listening on http://localhost:${port}`);
  console.log(`agent id            : ${agentId}`);
  console.log(`agent private key   : ${keyOut}`);
  console.log(`mandate (active)    : ${ACTIVE}`);
  console.log(`mandate (low limit) : ${SMALL_LIMIT}`);
  console.log(`mandate (revoked)   : ${REVOKED}`);
  console.log(`revoke at runtime   : POST /_control/mandates/<id>/revoke`);
});
