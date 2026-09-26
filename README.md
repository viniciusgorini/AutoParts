<div align="center">
  <a href="#readme"><img src="./assets/banner.svg?v=1" alt="AutoParts: B2B fleet supply merchant on the AgentPay network" width="100%"/></a>
</div>

AutoParts is a standalone B2B automotive parts merchant built for autonomous procurement agents on the **AgentPay** network. A fleet agent searches the wholesale catalog, receives an immutable ES256-signed quote, and settles the order against a single-use payment token issued under a mandate. The merchant never asks the agent for money; it verifies that the mandate allows the purchase.

<p>
  <img src="https://img.shields.io/badge/AgentPay-1.0_merchant-131a2b?style=flat-square&labelColor=131a2b&color=635bff" alt="AgentPay 1.0 merchant" />
  <img src="https://img.shields.io/badge/discovery-.well--known%2Fagentpay.json-131a2b?style=flat-square&labelColor=131a2b&color=635bff" alt="Decentralized discovery" />
  <img src="https://img.shields.io/badge/quotes-ES256%20%2B%20RFC%208785%20JCS-131a2b?style=flat-square&labelColor=131a2b&color=f59e0b" alt="ES256 + RFC 8785 JCS quotes" />
  <img src="https://img.shields.io/badge/NextWave-Hackathon_2026-131a2b?style=flat-square&labelColor=131a2b&color=f59e0b" alt="NextWave Hackathon 2026" />
</p>

---

### ❯ business_context

In enterprise fleet management (the worked example here is *Locadora Atlas*), procurement agents watch vehicle maintenance schedules and restock parts inside strict budgets:

- Fleet scope: replacement tires, heavy-duty brake pads, hydraulic jacks, lubricants and filters, bought at wholesale MOQ.
- Authority bounds: intent mandates set spending caps (for example $2,000/month), vehicle-plate restrictions and canonical category constraints.
- Decentralized verification: AutoParts signs quotes with its own ES256 keypair and verifies the mandate's payment token against the Mandate Authority before an order is accepted. No central payment directory decides what a store may sell.

### ❯ catalog

Wholesale fleet SKUs, priced in USD:

| SKU | Product | Category | Unit price | MOQ | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `prd_tire_std` | Standard Fleet Tire Set | `automotive.tires` | $1,548.00 | 1 set (4 tires) | 4x 205/55 R16 all-season, fleet-grade, 60k km warranty |
| `prd_tire_prm` | Premium Tire Set | `automotive.tires` | $1,720.00 | 1 set (4 tires) | 4x 205/55 R16 performance, low noise, wet-grip A rating |
| `prd_brake_hd` | Heavy-Duty Ceramic Brake Pads | `automotive.brakes` | $145.00 | 1 axle set | Fleet ceramic pads with dual shims and wear sensors |
| `prd_acc_jack` | Hydraulic Trolley Jack (2-Ton) | `automotive.accessories` | $389.00 | 1 unit | Dual-pump rapid-lift shop jack for fleet bays |
| `prd_acc_mats` | All-Weather Floor Mats | `automotive.accessories` | $129.00 | 1 set | Trimmable heavy-duty rubber mats for fleet vans |
| `prd_oil_synth` | Synthetic Fleet Motor Oil (5W-30) | `automotive.maintenance` | $48.00 | 5-qt jug | Extended drain interval formulation (15,000 miles) |

### ❯ protocol

<div align="center">
  <img src="./assets/protocol.svg?v=1" alt="AgentPay merchant protocol: discovery, signed quote, mandate token, order verification" width="100%"/>
</div>

AutoParts implements the open **AgentPay 1.0 merchant protocol**:

1. Decentralized discovery: `GET /.well-known/agentpay.json` publishes protocol version, capabilities, currency and every endpoint an agent needs.
2. Deterministic canonicalization: quote requests and orders are normalized with RFC 8785 JSON Canonicalization (JCS) before signing or verification.
3. Cryptographic quotes: `POST /v1/agents-pay/quotes` returns an immutable, tamper-evident ES256-signed JWS containing subtotal, tax, shipping and expiry.
4. Order settlement: `POST /v1/agents-pay/orders/{orderRef}/verification` verifies the single-use payment token with the Mandate Authority, binds the mandate, and issues the invoice record.

The full HTTP contract, with request and response payloads, is [`docs/agentpay-protocol.md`](docs/agentpay-protocol.md).

### ❯ endpoints

| Method | Route | Purpose |
| :--- | :--- | :--- |
| `GET` | `/.well-known/agentpay.json` | Merchant manifest: protocol, capabilities, categories, endpoints |
| `POST` | `/v1/agents-pay/search` | Catalog search for fleet SKUs |
| `POST` | `/v1/agents-pay/quotes` | Issue an immutable ES256-signed quote (idempotent) |
| `POST` | `/v1/agents-pay/orders/{orderRef}/verification` | Verify the mandate payment token and claim the order for settlement |

### ❯ status

This branch carries the merchant contract (`docs/agentpay-protocol.md`), this README and `AGENTS.md`. The merchant implementation lands through pull requests from feature branches; the protocol document above is the source of truth it is being built against.

### ❯ quickstart

Applies to the implementation branches once merged:

```bash
npm install
npm test
npm run dev   # standalone merchant server on http://localhost:3002
```

### ❯ related

- [AgentPay](https://github.com/pedroschott/hackatonyuno): the Mandate Authority and registry this merchant integrates with, plus the merchant SDK and the OAuth-protected MCP server.
- [`docs/agentpay-protocol.md`](docs/agentpay-protocol.md): the wire-level spec AutoParts implements.
