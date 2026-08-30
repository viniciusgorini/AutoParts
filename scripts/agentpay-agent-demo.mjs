#!/usr/bin/env node
/**
 * External AgentPay agent.
 *
 * This is what a real buying agent does against AutoParts, and it uses only
 * the published `@agentpay/merchant-sdk` package: `discoverAgentPayMerchant`
 * to read the store's discovery document, and `signAgentPayRequest` to sign
 * every protected call. It imports nothing from the store's source.
 *
 * Usage:
 *   node scripts/agentpay-agent-demo.mjs \
 *     --store http://localhost:3300 \
 *     --agent-id agent_local_demo \
 *     --agent-key ./.agent-demo-key.pem \
 *     --mandate 11111111-1111-4111-8111-111111111111 \
 *     --sku AP-BRK-PADS-FRT --quantity 1
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { discoverAgentPayMerchant, signAgentPayRequest } from "@agentpay/merchant-sdk";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const storeUrl = arg("store", "http://localhost:3300");
const agentId = arg("agent-id", "agent_local_demo");
const agentKeyPath = arg("agent-key", "./.agent-demo-key.pem");
const mandateId = arg("mandate", "");
const sku = arg("sku", "AP-BRK-PADS-FRT");
const quantity = Number(arg("quantity", "1"));

if (!mandateId) {
  console.error("--mandate is required");
  process.exit(2);
}

const privateKey = readFileSync(agentKeyPath, "utf8");

async function signedFetch({ method, path, body, idempotencyKey }) {
  const url = new URL(path, storeUrl).toString();
  const payload = method === "GET" ? "" : JSON.stringify(body);
  const headers = signAgentPayRequest({ agentId, privateKey, method, url, body: payload });
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);

  const response = await fetch(url, method === "GET" ? { method, headers } : { method, headers, body: payload });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

function show(label, value) {
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(value, null, 2));
}

// 1. Discovery, straight from the SDK.
const manifest = await discoverAgentPayMerchant(storeUrl);
show("1. discovery (/.well-known/agentpay.json)", manifest);

// 2. Search the store's catalogue.
const search = await signedFetch({ method: "POST", path: "/v1/agents-pay/search", body: { query: sku, limit: 3 } });
show(`2. search -> HTTP ${search.status}`, search.body);

// 3. Ask for a signed quote.
const quote = await signedFetch({
  method: "POST",
  path: "/v1/agents-pay/quotes",
  body: { items: [{ merchantSku: sku, quantity }] },
  idempotencyKey: `agent_quote_${randomUUID()}`,
});
show(`3. quote -> HTTP ${quote.status}`, quote.body);

if (quote.status !== 201) {
  process.exit(1);
}

const signedQuote = quote.body.quote;

// 4. Read the quote back.
const readBack = await signedFetch({ method: "GET", path: `/v1/agents-pay/quotes/${signedQuote.quoteId}` });
show(`4. quote read-back -> HTTP ${readBack.status}`, { quoteId: readBack.body?.quote?.quoteId ?? null });

// 5. Present the mandate for verification.
const verification = await signedFetch({
  method: "POST",
  path: `/v1/agents-pay/orders/${encodeURIComponent(signedQuote.merchantOrderRef)}/verification`,
  body: {
    quote_id: signedQuote.quoteId,
    product_id: signedQuote.quoteId,
    merchant_id: signedQuote.merchantId,
    mandate_id: mandateId,
  },
  idempotencyKey: `agent_verify_${signedQuote.quoteId}`,
});
show(`5. verification -> HTTP ${verification.status}`, verification.body);

const decision = verification.body?.decision ?? "unknown";
const complete = verification.body?.orderComplete === true;
console.log(`\nresult: decision=${decision} orderComplete=${complete}`);
process.exit(decision === "verification_approved" && complete ? 0 : 1);
