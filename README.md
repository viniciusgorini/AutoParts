# AutoParts

AutoParts is an independent mock B2B automotive-parts store built for the NextWave Hackathon 2026 pitch. It works as a normal storefront for people and also participates in the AgentPay merchant network for autonomous fleet procurement.

The demo scenario is simple: a fleet vehicle breaks down, an AI agent searches available parts, compares a USD quote, and purchases the selected items within an approved mandate.

## What works

- Responsive English storefront with search, category filters, cart, quantities, and checkout
- Eight fleet products priced in US dollars using integer cents
- Bank transfer, card, and AgentPay mock payment choices
- Public catalog search for procurement agents
- AgentPay decentralized merchant discovery
- RFC 8785 JCS request verification for agent-only operations
- Immutable 15-minute quotes signed as compact ES256 JWS values
- Idempotent quote creation and order verification
- Payment-token verification with the Mandate Authority before fulfillment
- Legacy single-product checkout protected by the official AgentPay merchant SDK

No real payment is processed. The project never accepts card numbers, CVC values, or private agent credentials.

## Demo catalog

| SKU | Product | Category | Unit price |
| --- | --- | --- | ---: |
| `prd_tire_std` | Standard Fleet Tire Set | Tires | $1,548.00 |
| `prd_tire_prm` | Premium Fleet Tire Set | Tires | $1,720.00 |
| `prd_acc_jack` | Hydraulic Trolley Jack (2-Ton) | Accessories | $389.00 |
| `prd_acc_mats` | All-Weather Floor Mats | Accessories | $129.00 |
| `prd_brake_hd` | Heavy-Duty Ceramic Brake Pads | Brakes | $145.00 |
| `prd_battery_60ah` | Fleet Battery 60 Ah | Electrical | $189.00 |
| `prd_oil_synth` | Synthetic Fleet Motor Oil (5W-30) | Maintenance | $48.00 |
| `prd_filter_oil` | Premium Oil Filter | Maintenance | $18.00 |

Prices, tax, shipping, and totals are always calculated in integer cents. Orders over $2,000 receive free shipping; other orders use a $29.90 mock shipping charge and an 8% estimated tax.

## Run locally

Requirements: Node.js 20 or newer and npm.

```bash
cp .env.example .env.local
npm ci
npm run dev
```

Open [http://localhost:3220](http://localhost:3220).

The development server generates an ephemeral ES256 quote key when no private JWK is configured. Production fails closed until `AGENTPAY_MERCHANT_PRIVATE_JWK`, `AGENTPAY_MERCHANT_KEY_ID`, and an explicit registry URL are configured.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Tests live in `tests/` and cover catalog search, USD cart calculations, SDK refusal of unsigned checkout, public catalog search, JCS behavior, ES256 signature verification, and quote idempotency.

## AgentPay endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/.well-known/agentpay.json` | Merchant discovery and protocol capabilities |
| `POST` | `/v1/agents-pay/search` | Public fleet catalog search |
| `POST` | `/v1/agents-pay/quotes` | Authenticated, idempotent ES256 quote creation |
| `GET` | `/v1/agents-pay/quotes/{quoteId}` | Authenticated quote retrieval |
| `POST` | `/v1/agents-pay/orders/{merchantOrderRef}/verification` | Authenticated payment-token verification and fulfillment |
| `POST` | `/api/agentpay/checkout` | Official SDK single-product policy checkout |

### Signed agent requests

Quote creation, quote retrieval, and order verification require:

- `X-Agent-Id`
- `X-Timestamp`
- `X-Nonce`
- `X-Signature`
- `Idempotency-Key` for POST operations

The request body is canonicalized with RFC 8785 JCS. AutoParts hashes the canonical bytes with SHA-256 and verifies the agent signature over:

```text
METHOD|PATH|BASE64URL_SHA256_BODY|TIMESTAMP|NONCE
```

The agent public key and single-use nonce are checked through the configured AgentPay registry before a quote is generated. For authenticated GET requests, the canonical body is `{}`.

### Quote response

Successful quote creation returns the quote payload, key ID, public JWK, and compact JWS. The payload binds the merchant, catalog version, item quantities, unit prices, USD totals, request hash, cart hash, issue time, and expiry time.

Production should publish the public quote key through a trusted merchant-key directory. The public JWK is included in this mock response so judges can verify the ES256 signature directly during the demo.

### Order safety

AutoParts never trusts a submitted payment token by itself. It sends the token only to the fixed `/api/registry/payment-tokens/verify` path under the configured Mandate Authority origin. Fulfillment occurs only when the authority response matches the merchant, mandate, quote, total amount, and USD currency. The raw token is never returned or stored; only its SHA-256 hash is retained for idempotency.

The current AgentPay deployment may not expose the payment-token endpoint yet. In that case AutoParts fails closed with `MANDATE_AUTHORITY_UNAVAILABLE` and does not fulfill the order.

## SDK boundary

The dependency `@agentpay/merchant-sdk@0.1.0` is installed from the audited tarball at `vendor/agentpay-merchant-sdk-0.1.0.tgz`. It was built from AgentPay commit:

```text
4d631acf0f2347542081d12e63f08ec1221c5e6a
```

The package is used for the legacy discovery base and signed single-product checkout. The public SDK does not currently export batch quote signing or payment-token settlement helpers, so AutoParts implements the repository's documented protocol extension locally without importing AgentPay source files, database code, workspace dependencies, or symlinks.

## Environment variables

See `.env.example` for placeholders.

- `AGENTPAY_REGISTRY_URL`: Mandate Authority and registry origin; required in production
- `AGENTPAY_MERCHANT_ID`: defaults to `mrc_autoparts`
- `AGENTPAY_MERCHANT_NAME`: defaults to `AutoParts B2B Fleet Supply`
- `AGENTPAY_MERCHANT_PRIVATE_JWK`: private P-256 JWK used only on the server
- `AGENTPAY_MERCHANT_KEY_ID`: public identifier for the quote signing key
- `DATABASE_URL`: reserved for durable production stores

Never use a `NEXT_PUBLIC_` prefix for private key material.

## Production boundary

This hackathon version uses process-local maps for quotes, idempotency keys, replay state, and finalized orders. That is appropriate for a single-instance pitch demo, but a multi-instance deployment must replace them with durable transactional storage before production use.

## Repository boundary

AutoParts is intentionally standalone. The AgentPay repository is an external public service and SDK provider; it is not modified by this project.
