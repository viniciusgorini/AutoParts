# AgentPay Protocol Integration Specification

AutoParts implements the **AgentPay 1.0 Merchant Protocol** to enable autonomous procurement agents (such as ChatGPT, Claude, or custom fleet bots) to search parts, obtain cryptographic quotes, and execute mandate-bound purchases.

---

## 1. Decentralized Merchant Discovery

```http
GET /.well-known/agentpay.json HTTP/1.1
Host: autoparts.example.com
```

### Response (`200 OK`):

```json
{
  "protocol": "agentpay/1.0",
  "merchant": {
    "id": "mrc_autoparts",
    "name": "AutoParts B2B Fleet Supply"
  },
  "checkout_endpoint": "https://autoparts.example.com/api/agentpay/checkout",
  "quotes_endpoint": "https://autoparts.example.com/v1/agents-pay/quotes",
  "catalog_search_endpoint": "https://autoparts.example.com/v1/agents-pay/search",
  "order_verification_endpoint": "https://autoparts.example.com/v1/agents-pay/orders/{merchantOrderRef}/verification",
  "capabilities": [
    "intent-mandates",
    "batch-purchasing",
    "live-revocation",
    "mock-payment"
  ],
  "currency": "USD",
  "supported_categories": [
    "automotive.tires",
    "automotive.brakes",
    "automotive.accessories",
    "automotive.maintenance",
    "automotive.electrical"
  ],
  "quote_signing": {
    "algorithm": "ES256",
    "canonicalization": "RFC8785-JCS"
  }
}
```

---

## 2. Cryptographic Quote Creation

Agents request signed, immutable price quotes before initiating a purchase with the Mandate Authority:

```http
POST /v1/agents-pay/quotes HTTP/1.1
Content-Type: application/json
Idempotency-Key: quote-fleet-8921
X-Agent-Id: agent_fleet_ops
X-Timestamp: 2026-08-30T02:30:00.000Z
X-Nonce: 8e16b9f0-1b89-4ecf-8df8-a5f064e5da83
X-Signature: BASE64URL_SIGNATURE

{
  "items": [
    { "merchantSku": "prd_tire_std", "quantity": 1 },
    { "merchantSku": "prd_brake_hd", "quantity": 2 }
  ],
  "metadata": {
    "vehicle_plate": "FLT-8092",
    "purchase_order": "PO-2026-089"
  }
}
```

### Signed JWS Response:
AutoParts canonicalizes the parsed request with RFC 8785 JCS, verifies the agent signature and nonce through the AgentPay registry, and returns an immutable ES256 compact JWS. The quote binds item quantities, integer-cent prices, USD totals, request and cart hashes, and a 15-minute expiry.

---

## 3. Order Verification & Settlement

When the agent presents a single-use payment token issued by the Mandate Authority:

```http
POST /v1/agents-pay/orders/{orderRef}/verification HTTP/1.1
Content-Type: application/json
Idempotency-Key: order-fleet-8921
X-Agent-Id: agent_fleet_ops
X-Timestamp: 2026-08-30T02:31:00.000Z
X-Nonce: af4020a4-e4fa-43e7-86f8-6f09df8466f3
X-Signature: BASE64URL_SIGNATURE

{
  "quoteId": "qte_9821a",
  "paymentToken": "vt_mock_a89f",
  "mandateId": "mnd_7f2a"
}
```

AutoParts first authenticates the agent request. It then verifies the single-use payment token only against the fixed verification path under the configured Mandate Authority origin. Fulfillment occurs only if the returned merchant, mandate, quote, amount, and USD currency all match. The raw token is never stored or returned.

If the Mandate Authority does not provide that endpoint, AutoParts fails closed and leaves the order unfulfilled.
