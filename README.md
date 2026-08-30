# AutoParts

AutoParts is an independent mock B2B automotive-parts storefront for the NextWave Hackathon 2026. It supports a normal human checkout experience and implements the Agentic Mandates V2 merchant boundary for autonomous fleet procurement.

The merchant is not a payment gateway. It never receives a card number, Vault reference, passkey data, mandate policy, canonical category, or trust tier.

## AgentPay V2 flow

1. An agent discovers this store on its own domain and uses the V2 client SDK to search and obtain an immutable ES256-signed quote.
2. The Control Plane verifies the registered quote key, maps AutoParts' local `fleet.*` category to its canonical taxonomy, evaluates the mandate, and mints a short-lived opaque purchase capability.
3. The agent presents that capability to the quoted order endpoint.
4. AutoParts calls the Mandate API with a merchant service proof, verifies the Mandate-signed receipt, and dispatches only when settlement is `captured`.

No payment token is sent to AutoParts. A revoked mandate, an untrusted response, an expired quote, or any unavailable verification dependency fails closed.

## What works

- Responsive English storefront with catalog, cart, quantities, and mock human payment choices
- Eight fleet products priced in USD integer minor units
- Decentralized `/.well-known/agentpay.json` discovery for `agentic-mandates/2`
- ES256 request-proof verification bound to method, full URL, raw body, expiry, registered key, and an atomic replay claim
- Immutable 15-minute quotes signed over RFC 8785 JCS canonical payloads
- Local merchant categories only (`fleet.*`); the Control Plane owns canonical taxonomy and trust
- V2 SDK merchant-to-Mandate verification using an opaque `purchaseCapability`
- Pinned Mandate receipt verification and fulfillment only after `settlementStatus: "captured"`
- Idempotent quote and order handling in the single-instance mock

No real payment is processed. Human card and bank-transfer options are visual mock flows only; they are not exposed through the AgentPay API.

## Run locally

Requirements: Node.js 22 or newer and npm.

```bash
cp .env.example .env.local
npm ci --allow-remote=all
npm run dev
```

Open [http://localhost:3220](http://localhost:3220).

Development creates an ephemeral ES256 quote key only. Merchant verification always requires the server-only merchant service key and the pinned Mandate receipt public JWK; production additionally requires an explicit Mandate API URL.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The tests cover V2 discovery, request-proof acceptance, local category exposure, canonical quote signing, idempotency, opaque capability handoff, and the distinction between pending and captured settlement.

## AgentPay endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/agentpay.json` | Public V2 merchant discovery |
| `POST` | `/v1/agents-pay/search` | Proof-protected catalog search with local categories |
| `POST` | `/v1/agents-pay/quotes` | Proof-protected, idempotent ES256 quote creation |
| `GET` | `/v1/agents-pay/quotes/{quoteId}` | Proof-protected quote retrieval |
| `POST` | `/v1/agents-pay/orders/{merchantOrderRef}/verification` | Capability claim and settlement-confirmed order verification |

Every AgentPay API request uses `X-Agent-Request-Proof`; mutating routes also require `Idempotency-Key`. The proof is an ES256 JWS created by `@agentic-mandates/sdk`, with audience `merchant-api:mrc_autoparts`.

### Control Plane dependencies

The merchant fails closed until the Control Plane provides these authenticated server endpoints:

- `GET /v1/registry/request-proof-keys/{keyId}` — returns the active public ES256 JWK and actor bound to a key ID.
- `POST /v1/registry/request-proofs/claims` — atomically claims an agent proof JTI through its expiry.
- `POST /v1/merchant/verifications` — accepts the merchant proof and opaque capability, then returns a Mandate-signed verification receipt.

The final endpoint is the only authorization/settlement integration. It independently refetches the quote, validates its registered signing key, applies taxonomy and mandate policy, and invokes the isolated hosted test-payment vault. AutoParts verifies the returned receipt with `AGENTPAY_MANDATE_RECEIPT_PUBLIC_JWK` before exposing an order as fulfilled.

## SDK boundary

`vendor/agentic-mandates-sdk-0.0.0-autoparts.107e534.tgz` and `vendor/agentic-mandates-contracts-0.0.0-autoparts.107e534.tgz` are pinned build artifacts of the current `pedroschott/hackatonyuno` V2 SDK and contract packages at commit `107e534`. They are committed deliberately: the package is private, there is no npm publication step, and the storefront must remain reproducible without a cross-repository symlink.

## Environment variables

See `.env.example` for placeholders.

- `AGENTPAY_MANDATE_API_URL`: Mandate API origin; required in production
- `AGENTPAY_REQUEST_PROOF_REGISTRY_URL`: registered-key and replay-claim API origin
- `AGENTPAY_MERCHANT_ID`: defaults to `mrc_autoparts`
- `AGENTPAY_MERCHANT_NAME`: defaults to `AutoParts B2B Fleet Supply`
- `AGENTPAY_MERCHANT_PRIVATE_JWK` / `AGENTPAY_MERCHANT_KEY_ID`: server-only quote signing material
- `AGENTPAY_MERCHANT_SERVICE_PRIVATE_JWK` / `AGENTPAY_MERCHANT_SERVICE_KEY_ID`: server-only merchant proof material
- `AGENTPAY_MANDATE_RECEIPT_PUBLIC_JWK`: pinned public JWK for Mandate verification receipts

Never use a `NEXT_PUBLIC_` prefix for a private key.

## Deployment boundary

This hackathon mock keeps quotes, idempotency keys, and orders in process-local maps. It is appropriate only for a single-instance demonstration. A Vercel production deployment needs durable, transactional quote/order/idempotency and replay-claim adapters before it can safely run across instances.
