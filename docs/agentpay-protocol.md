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
  "checkout_endpoint": "https://autoparts.example.com/v1/agents-pay/orders/verification",
  "quotes_endpoint": "https://autoparts.example.com/v1/agents-pay/quotes",
  "catalog_search_endpoint": "https://autoparts.example.com/v1/agents-pay/search",
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
    "automotive.maintenance"
  ]
}
```

---

## 2. Cryptographic Quote Creation

Agents request signed, immutable price quotes before initiating a purchase with the Mandate Authority:

```http
POST /v1/agents-pay/quotes HTTP/1.1
Content-Type: application/json
Idempotency-Key: quote-fleet-8921

{
  "items": [
    { "merchantSku": "prd_tire_std", "quantity": 4 },
    { "merchantSku": "prd_brake_hd", "quantity": 2 }
  ],
  "metadata": {
    "vehicle_plate": "FLT-8092",
    "purchase_order": "PO-2026-089"
  }
}
```

### Signed JWS Response:
AutoParts returns an immutable ES256-signed quote containing subtotal, tax, shipping, and expiry timestamp.

---

## 3. Order Verification & Settlement

When the agent presents a single-use payment token issued by the Mandate Authority:

```http
POST /v1/agents-pay/orders/{orderRef}/verification HTTP/1.1
Content-Type: application/json

{
  "quoteId": "qte_9821a",
  "paymentToken": "vt_mock_a89f",
  "mandateId": "mnd_7f2a"
}
```

AutoParts verifies the payment token with the Mandate Authority, binds the transaction, logs invoice `# INV-2026-089`, and confirms order dispatch.
