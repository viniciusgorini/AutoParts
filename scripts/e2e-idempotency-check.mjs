#!/usr/bin/env node
/**
 * End-to-end idempotency and duplicate-purchase check, over real HTTP.
 *
 * Sends the same verification twice with one Idempotency-Key (expects the
 * stored result, byte for byte), then a third with a fresh key against the same
 * order (expects a conflict, because a terminal decision is never replaced).
 *
 * Requires a running store and the fake registry:
 *   node scripts/fake-agentpay-registry.mjs --port 4400
 *   AGENTPAY_REGISTRY_URL=http://localhost:4400 npm run dev
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { signAgentPayRequest } from "@agentpay/merchant-sdk";

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

const store = arg("store", "http://localhost:3300");
const agentId = arg("agent-id", "agent_local_demo");
const privateKey = readFileSync(arg("agent-key", "./.agent-demo-key.pem"), "utf8");
const mandateId = arg("mandate", "11111111-1111-4111-8111-111111111111");
const sku = arg("sku", "AP-ACC-MATS-UNIV");

async function call(method, path, body, idempotencyKey) {
  const url = new URL(path, store).toString();
  const payload = method === "GET" ? "" : JSON.stringify(body);
  const headers = signAgentPayRequest({ agentId, privateKey, method, url, body: payload });
  if (idempotencyKey) headers.set("idempotency-key", idempotencyKey);
  const response = await fetch(
    url,
    method === "GET" ? { method, headers } : { method, headers, body: payload },
  );
  return {
    status: response.status,
    replayed: response.headers.get("idempotent-replay"),
    body: await response.json(),
  };
}

const quoteResult = await call(
  "POST",
  "/v1/agents-pay/quotes",
  { items: [{ merchantSku: sku, quantity: 1 }] },
  `key_${randomUUID()}`,
);
if (quoteResult.status !== 201) {
  console.error("quote failed", quoteResult.status, quoteResult.body);
  process.exit(1);
}

const quote = quoteResult.body.quote;
const path = `/v1/agents-pay/orders/${encodeURIComponent(quote.merchantOrderRef)}/verification`;
const body = {
  quote_id: quote.quoteId,
  product_id: quote.quoteId,
  merchant_id: quote.merchantId,
  mandate_id: mandateId,
};
const sharedKey = `key_${randomUUID()}`;

const first = await call("POST", path, body, sharedKey);
const replay = await call("POST", path, body, sharedKey);
const freshKey = await call("POST", path, body, `key_${randomUUID()}`);
const conflicting = await call("POST", path, { ...body, exception_id: randomUUID() }, sharedKey);

console.log(`first attempt            : HTTP ${first.status} decision=${first.body.decision}`);
console.log(
  `same key + same payload  : HTTP ${replay.status} replay-header=${replay.replayed} ` +
    `samePaymentOperation=${first.body.paymentOperationId === replay.body.paymentOperationId}`,
);
console.log(
  `new key, settled order   : HTTP ${freshKey.status} code=${freshKey.body?.error?.code ?? freshKey.body.decision}`,
);
console.log(
  `same key + other payload : HTTP ${conflicting.status} code=${conflicting.body?.error?.code ?? "-"}`,
);

const ok =
  first.status === 200 &&
  replay.replayed === "true" &&
  first.body.paymentOperationId === replay.body.paymentOperationId &&
  freshKey.status === 409 &&
  conflicting.status === 409;

console.log(`\n${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
