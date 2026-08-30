# AutoParts

A mock car-parts store built for purchases made by people and by agents using **AgentPay**.

This repository exists to prove one thing: **the public AgentPay SDK works outside its original monorepo**. AutoParts is a standalone Next.js application that consumes `@agentpay/merchant-sdk` as an installed package and talks to AgentPay only over public HTTP.

---

## Contents

- [Goal](#goal)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Install](#install)
- [Configure](#configure)
- [Run](#run)
- [Tests and verification](#tests-and-verification)
- [Installing the AgentPay SDK](#installing-the-agentpay-sdk)
- [Routes](#routes)
- [The full AgentPay flow](#the-full-agentpay-flow)
- [How to test each step](#how-to-test-each-step)
- [What is mock and what is really verified](#what-is-mock-and-what-is-really-verified)
- [SDK limitations found](#sdk-limitations-found)
- [Security decisions](#security-decisions)
- [Build environment notes](#build-environment-notes)

---

## Goal

Demonstrate the AgentPay protocol from the merchant side:

1. The store publishes its own discovery document.
2. An agent searches the catalogue and asks for a quote.
3. The store issues an **immutable, time-bound, signed** quote.
4. The agent presents an AgentPay mandate.
5. The store asks AgentPay for cryptographic verification and a policy decision.
6. Only after approval, and only once settlement is captured, is the order complete.

No real payment happens. No personal or card data is ever used.

## Architecture

```
                      ┌──────────────────────────────┐
   agent ───────────► │  AutoParts (this repository) │
   (signs every       │                              │
    request)          │  Next.js App Router          │
                      │  ├─ /.well-known/agentpay.json
                      │  ├─ /v1/agents-pay/search    │
                      │  ├─ /v1/agents-pay/quotes    │
                      │  └─ .../verification ────────┼──┐
                      └──────────────┬───────────────┘  │
                                     │                  │ @agentpay/merchant-sdk
                        signs the quote (Ed25519)       │ (installed package)
                                     │                  ▼
                                     │        ┌───────────────────────────┐
                                     │        │ AgentPay registry (HTTP)  │
                                     │        │ /api/registry/agents/:id  │
                                     │        │ /api/registry/keys        │
                                     │        │ /api/registry/mandates/:id│
                                     │        │ /api/registry/nonces      │
                                     │        └───────────────────────────┘
```

Layers in `src/lib`:

| Module | Responsibility |
| --- | --- |
| `agentpay.ts` | The **only** bridge to AgentPay: manifest and SDK verification |
| `agent-auth.ts` | Agent request authentication on the store's own routes |
| `catalog.ts` | Synthetic catalogue and search |
| `money.ts` / `pricing.ts` | Integer arithmetic in cents |
| `canonical.ts` | Canonical JSON + SHA-256 (cart hash) |
| `signing.ts` | Ed25519 quote signing |
| `quote.ts` | Quote construction, pricing and signature |
| `handlers.ts` | Route logic, testable without a server |
| `stores/` | `QuoteStore`, `OrderStore`, `IdempotencyStore`, `ReplayStore`, `RateLimitStore` ports |
| `settlement.ts` | Mock payment (`pay_mock_<uuid>`), single use |
| `env.ts` | Validated configuration, fails closed |

Routes under `src/app` are thin wrappers: they assemble the service and delegate to `handlers.ts`.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript 5.9 (strict) · Tailwind CSS 3 · Zod 4 · Vitest 4 · ESLint 9 · Ed25519 via `node:crypto`.

## Install

```bash
npm install
```

The SDK is installed from the tarball checked into `vendor/` — see [Installing the AgentPay SDK](#installing-the-agentpay-sdk).

## Configure

```bash
cp .env.example .env.local
node scripts/generate-merchant-key.mjs   # prints AGENTPAY_MERCHANT_PRIVATE_JWK
```

Fill in `.env.local`:

| Variable | Description |
| --- | --- |
| `AGENTPAY_REGISTRY_URL` | AgentPay base URL (`https://agentpay-yuno.vercel.app`) |
| `AGENTPAY_MERCHANT_ID` | Merchant identity as mandates scope it (`mrc_autoparts`) |
| `AGENTPAY_MERCHANT_NAME` | Name published in discovery |
| `AGENTPAY_MERCHANT_PRIVATE_JWK` | Store's private Ed25519 JWK — **server only** |
| `AGENTPAY_MERCHANT_KEY_ID` | Signing key identifier |
| `AUTOPARTS_PUBLIC_ORIGIN` | Absolute origin the store is served from |
| `AUTOPARTS_QUOTE_TTL_SECONDS` | Quote lifetime (default 900) |
| `AUTOPARTS_PERSISTENCE` | `memory` (dev/test) or `durable` (production) |
| `DATABASE_URL` | Required when `durable` |
| `AUTOPARTS_DEMO_AGENT_*` | Browser checkout — **local only** |

No variable uses a `NEXT_PUBLIC_` prefix. A missing required variable stops the service from starting.

## Run

```bash
npm run dev        # http://localhost:3300
npm run build
npm run start
```

## Tests and verification

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run verify     # all four in sequence
```

## Installing the AgentPay SDK

The package is **not published to any npm registry** (`npm view @agentpay/merchant-sdk` → 404), so the preference order falls through to a tarball.

| | |
| --- | --- |
| Package | `@agentpay/merchant-sdk` |
| Version | `0.1.0` |
| Source | `https://github.com/pedroschott/hackatonyuno` |
| Commit | `59e4bc6c10c266d2f0be6dee94f686261c90dfb8` |
| Tarball | `vendor/agentpay-merchant-sdk-0.1.0.tgz` (4.7 kB) |

Published contents (`npm pack --dry-run`), 6 files / 26.4 kB unpacked:

```
README.md  index.d.mts  index.d.ts  index.js  index.mjs  package.json
```

Installed the way any external store would:

```bash
npm install ./vendor/agentpay-merchant-sdk-0.1.0.tgz
```

### Regenerating the tarball

The official command is `npm run sdk:pack` inside the AgentPay repository. **It does not run in this environment**: `tsup` loads Rollup's native binary, which Windows Application Control blocks. The tarball in `vendor/` was produced with the same steps, swapping only the build tools:

- JS (`index.js` CJS + `index.mjs` ESM): esbuild, `@/*` aliased to the AgentPay root, `zod` external, Node 22 target
- Types (`index.d.ts`/`index.d.mts`): `tsc --emitDeclarationOnly` + `rollup-plugin-dts` running on `@rollup/wasm-node`
- `package.json` and `README.md`: identical to what `sdk/release-package.mjs` emits

On a machine without that restriction, use the official command:

```bash
git clone https://github.com/pedroschott/hackatonyuno.git
cd hackatonyuno && npm install && npm run sdk:pack
```

### Independence checks

The bundle is self-contained: `zod` is its only external dependency, `node:crypto` its only builtin, and there are **zero** occurrences of `@/lib`. The AgentPay repository is not inside this project, there is no symlink, no workspace dependency, and ESLint carries a rule that rejects any import pointing at it.

## Routes

| Method | Route | Auth | Idempotency |
| --- | --- | --- | --- |
| `GET` | `/health` | — | — |
| `GET` | `/.well-known/agentpay.json` | — | — |
| `POST` | `/v1/agents-pay/search` | agent | — |
| `POST` | `/v1/agents-pay/quotes` | agent | required |
| `GET` | `/v1/agents-pay/quotes/:quoteId` | owning agent | — |
| `POST` | `/v1/agents-pay/orders/:merchantOrderRef/verification` | agent (via SDK) | required |
| `GET` | `/api/orders/:merchantOrderRef` | — | — |
| `POST` | `/api/storefront/checkout` | local demo | — |

Errors always use one envelope:

```json
{ "error": { "code": "QUOTE_EXPIRED", "message": "That quote has expired. Request a new one.", "requestId": "req_..." } }
```

Status codes in use: 400, 401, 403, 404, 409, 410, 413, 422, 429, 500, 503.

### Verification body

```json
{
  "quote_id":   "quote_...",
  "product_id": "quote_...",
  "merchant_id": "mrc_autoparts",
  "mandate_id": "11111111-1111-4111-8111-111111111111"
}
```

`product_id` must name the same quote: under the SDK's checkout contract the quote **is** the purchasable unit, with its signed total as the price. `mandate_id` has to be an RFC-conformant UUID — the SDK validates it.

## The full AgentPay flow

1. The agent reads `/.well-known/agentpay.json` (SDK `discoverAgentPayMerchant`).
2. It searches through `POST /v1/agents-pay/search`.
3. It requests `POST /v1/agents-pay/quotes` with SKUs and quantities.
4. The store validates SKU, stock and quantity; computes subtotal, shipping and tax **in cents**; derives the canonical cart hash; signs with Ed25519 and stores the quote.
5. The agent presents the mandate at `POST /v1/agents-pay/orders/:ref/verification`.
6. The store applies rate limiting, requires an `Idempotency-Key`, rejects a reused nonce, and **atomically claims** the order's single verification attempt.
7. `createAgentPayCheckoutHandler` verifies, against the live registry: agent identity, the Ed25519 signature over method/path/body-hash/timestamp/nonce, the 60 second window, single-use nonce consumption, the registry's mandate signature, the agent↔mandate binding, live mandate status, and the deterministic policy.
8. Approved → the mock settlement mints `pay_mock_<uuid>` and captures. Escalated → `approval_required`, nothing minted. Refused → `verification_rejected`, nothing minted.
9. The order is complete only at `settlementStatus === "captured"`.

## How to test each step

The AgentPay registry is live and the store really talks to it. But registering an agent and signing a mandate with a passkey requires an AgentPay account, so the scripted end-to-end run uses a **local registry double** (`scripts/fake-agentpay-registry.mjs`) — it answers the same four endpoints with real Ed25519 keys, so every SDK check executes for real.

```bash
# 1. local registry (prints the agent key and the test mandates)
node scripts/fake-agentpay-registry.mjs --port 4400

# 2. the store pointed at it
AGENTPAY_REGISTRY_URL=http://localhost:4400 npm run dev

# 3. an external agent, using only the SDK package
node scripts/agentpay-agent-demo.mjs \
  --store http://localhost:3300 \
  --agent-key ./.agent-demo-key.pem \
  --mandate 11111111-1111-4111-8111-111111111111 \
  --sku AP-BRK-PADS-FRT
```

Test mandates: `1111…` active, `2222…` low limit (escalates), `3333…` revoked. To revoke mid-flow:

```bash
curl -X POST http://localhost:4400/_control/mandates/11111111-1111-4111-8111-111111111111/revoke
```

Idempotency and duplicate purchase:

```bash
node scripts/e2e-idempotency-check.mjs --mandate 11111111-1111-4111-8111-111111111111
```

Against the **real** AgentPay, with an unregistered agent, the store refuses — which itself proves the outbound call:

```bash
curl -s http://localhost:3300/.well-known/agentpay.json
curl -s -X POST http://localhost:3300/v1/agents-pay/search \
  -H 'content-type: application/json' -d '{"query":"tire"}'
# 401 UNAUTHENTICATED
```

## What is mock and what is really verified

| Real | Mock |
| --- | --- |
| Ed25519 quote signing and its verification | Catalogue and stock |
| Agent request authentication (signature, window, nonce) | Shipping and tax |
| HTTP calls to the AgentPay registry | Payment (`pay_mock_<uuid>`) |
| Registry verification of the mandate signature | Persistence (in memory in dev/test) |
| Live mandate status and the deterministic policy | |
| Idempotency, replay protection, rate limiting | |

## SDK limitations found

`@agentpay/merchant-sdk@0.1.0` exports only `merchantManifest`, `discoverAgentPayMerchant`, `signAgentPayRequest`, `createAgentPayCheckoutHandler` and the `MerchantProduct` / `MerchantCheckoutResult` types. From that:

1. **No signing primitives.** `agentSigningMessage`, `verifyText`, `signText`, `canonicalJson` and `sha256Base64Url` exist in the AgentPay source but are not exported. As a result `search` and `quotes` could not be authenticated at all: agent verification only happens inside `createAgentPayCheckoutHandler`, which accepts nothing but its own checkout body. AutoParts re-implements the documented wire format in `src/lib/agent-auth.ts`, with the reason written in the file.
   *Request:* export `agentSigningMessage` and `verifyText`, or better, a `verifyAgentPayRequest({ registryUrl, request, rawBody })` that returns the authenticated agent.

2. **No exported canonicalisation.** The canonical cart hash and quote signature use the store's own implementation (`src/lib/canonical.ts`).
   *Request:* export `canonicalJson` and a quote-signing helper.

3. **Checkout is single-product.** The contract takes one `product_id` at one price in one category. AutoParts presents the quote as that unit, at its signed total. The side effect is that **a cart cannot mix AgentPay categories** — the store refuses with `MIXED_CATEGORY_CART` rather than checking only one of them against the mandate.
   *Request:* a cart-level checkout contract with a list of items and categories.

4. **`cache: "force-cache"` on the registry key.** Reproduced end to end: after the registry rotated its key, every verification started returning `MANDATE_SIGNATURE_INVALID`, because Next's fetch had pinned the old key indefinitely. The store works around it through the injectable `fetcher` (`withFreshRegistryKeys` in `src/lib/agentpay.ts`).
   *Request:* fetch the key with bounded revalidation — the endpoint already answers with `cache-control: public, max-age=3600`.

5. **No `paymentOperationId` / `settlementStatus`.** The public SDK stops at the policy decision. The mock settlement and the "complete only at `captured`" rule belong to AutoParts.
   *Request:* return the mock payment operation in the checkout result.

6. **No contracts for the `/v1/agents-pay/*` routes.** They live in `apps/merchant-mocks` and `packages/contracts`, both `private: true` with `file:` dependencies — not installable outside the monorepo. The AutoParts Zod schemas are its own.

7. **No service identity in the registry.** By protocol, quote retrieval should accept the authorized agent **or** AgentPay. The public registry only exposes agents, so AutoParts restricts it to the agent that created the quote.

8. **No persistence adapters.** The five ports in `src/lib/stores/ports.ts` belong to the store.

No AgentPay file was copied into this repository.

## Security decisions

- The store's private key exists only on the server, comes from an environment variable, never appears in a log or a response, and never carries a `NEXT_PUBLIC_` prefix.
- A configuration failure names the **variable**, never the value.
- Every authentication failure returns the same code and status, revealing nothing about which check failed.
- No stack trace in a response; an unexpected error becomes a generic `INTERNAL`.
- A body over 32 KiB is rejected before any parsing.
- `Idempotency-Key` is required on every mutation; the same key with a different payload returns 409.
- The agent's nonce/`jti` is consumed in the AgentPay registry **and** kept locally.
- The verification claim is atomic: two concurrent requests never produce two payment operations, and a terminal decision is never replaced.
- Rate limiting is keyed by merchant + actor + purpose; an unavailable limiter returns 503, never "allow".
- In production: in-memory persistence is refused, `DATABASE_URL` is required, and the demo signer is refused.
- AutoParts never receives a card number, CVC, PIN, password, passkey or vault credential.

### Risks that remain

- **No durable adapter is implemented.** With `AUTOPARTS_PERSISTENCE=durable` the service fails closed (503) because no implementation of the ports has been written. That is safe, but it means **the store is not production-ready yet**.
- The in-memory rate limiter is per process; several instances multiply the effective limit.
- Browser checkout signs on the server. It is a demonstration aid, blocked in production by two independent gates, but in a local environment any visitor can use it with a mandate they know.
- The 60 second signing window depends on the server clock.
- The mock settlement is synchronous; a real provider would need reconciliation for orphaned authorizations.

## Build environment notes

This machine (Windows 11 ARM64) blocks unsigned native modules through Application Control. Two consequences:

- `tsup` (native Rollup) does not run — see [Regenerating the tarball](#regenerating-the-tarball).
- Tailwind CSS v4 does not run: its `@tailwindcss/oxide` engine is a native binary and the WASM fallback is not installable on this CPU. The project uses **Tailwind v3**, which is pure JavaScript. On other platforms, moving to v4 is straightforward.
