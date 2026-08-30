# Agentic Mandates V2 Merchant Protocol

AutoParts is a merchant implementation of the private `@agentic-mandates/sdk` contract. It owns its catalog, prices, quote key, order references, and fulfillment. The Control Plane owns agent identity, request-key registration, replay storage, category normalization, merchant trust, mandate policy, capabilities, settlement, and audit.

## Discovery

`GET /.well-known/agentpay.json` declares `agentic-mandates/2`, the merchant ID, base URL, endpoint templates, local categories, quote signing, and request-proof audience. It intentionally does not include `checkout_endpoint`, a payment API, a quote public key, or any Vault detail.

## Agent request proof

Every AgentPay request includes `X-Agent-Request-Proof`, an ES256 JWS made by `createEs256RequestProofSigner` from `@agentic-mandates/sdk`.

The signed claims bind:

- `iss`, `sub`, and registered `kid` to the agent identity
- `aud` to `merchant-api:mrc_autoparts`
- `htm` and full `htu` to this exact request
- `body_hash` to the raw UTF-8 request body
- short expiry and a one-time `jti`

AutoParts resolves the key only from the Control Plane and atomically claims the JTI. A client-supplied key, an expired proof, a different URL/body, or a replay is refused.

## Catalog and quote

`POST /v1/agents-pay/search` returns merchant-local `merchantCategoryId` values such as `fleet.tires`. It never presents a canonical category as merchant authorization data.

`POST /v1/agents-pay/quotes` accepts only SKU/quantity pairs and an idempotency key. The quote is immutable and includes:

- merchant/order/quote IDs and catalog version
- local category, immutable unit amount, quantity, and product attributes per line
- subtotal, shipping, tax, total, USD currency, issue and expiry time
- an RFC 8785 canonical merchant-cart hash
- `keyId` and an ES256 compact JWS over the exact canonical quote payload

The Control Plane resolves the merchant's registered signing public key; AutoParts never sends a public JWK alongside a quote response.

## Capability claim and settlement

After policy succeeds, the agent sends:

```json
{
  "quoteId": "quote_123",
  "purchaseCapability": "opaque-capability-proof"
}
```

to `POST /v1/agents-pay/orders/{merchantOrderRef}/verification` with an idempotency key and request proof. The merchant sends that tuple to `POST /v1/merchant/verifications` using `createMerchantClient` from the V2 SDK and a separate merchant service proof.

The response is accepted only after its pinned ES256 Mandate receipt verifies and binds merchant ID, order reference, quote ID, capability hash, decision, and settlement details. AutoParts creates an invoice and marks dispatch ready only for `decision: "approved"` plus `settlementStatus: "captured"`. A pending settlement is not fulfilled; a rejection or unavailable dependency fails closed.

Neither request nor response contains card data, payment method identifiers, provider tokens, passkey data, or the full mandate.
