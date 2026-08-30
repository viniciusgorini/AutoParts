# AutoParts — B2B Fleet Procurement & AgentPay Merchant

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![AgentPay](https://img.shields.io/badge/AgentPay-1.0_Compliant-green.svg)](https://github.com/pedroschott/hackatonyuno)
[![NextWave 2026](https://img.shields.io/badge/NextWave-Hackathon_2026-orange.svg)](https://nextwave-hackathon-2026.vercel.app/)

AutoParts is a standalone **B2B automotive parts merchant** engineered for autonomous AI agents participating in the **AgentPay Store Network**. It enables fleet procurement agents (e.g. ChatGPT, Claude, custom bots) to search wholesale catalogs, generate cryptographic quotes, and execute mandate-governed bulk purchases.

---

## 🏢 Business Context: B2B Fleet Restocking

In enterprise fleet management (e.g., *Locadora Atlas*), AI procurement agents monitor vehicle maintenance schedules and restock parts within strict budgets:
- **Fleet Scope**: Replacement tires, heavy-duty brake pads, hydraulic jacks, lubricants, and oil filters.
- **Authority Bounds**: Intent Mandates set spending caps (e.g. $2,000/mo), vehicle plate restrictions, and canonical category constraints.
- **Decentralized Verification**: AutoParts signs quotes with ES256 keys and verifies single-use payment tokens against the Mandate Authority.

---

## 📦 B2B Parts Catalog

| SKU | Product Name | Category | Unit Price (USD) | Bulk MOQ | Fleet Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `prd_tire_std` | **Standard Fleet Tire Set** | `automotive.tires` | **$1,548.00** | 1 set (4 tires) | 4× 205/55 R16 all-season. Fleet-grade, 60k km warranty. |
| `prd_tire_prm` | **Premium Tire Set** | `automotive.tires` | **$1,720.00** | 1 set (4 tires) | 4× 205/55 R16 performance. Low noise, wet-grip A rating. |
| `prd_brake_hd` | **Heavy-Duty Ceramic Brake Pads** | `automotive.brakes` | **$145.00** | 1 axle set | Fleet ceramic pads with dual shims and wear sensors. |
| `prd_acc_jack` | **Hydraulic Trolley Jack (2-Ton)** | `automotive.accessories` | **$389.00** | 1 unit | Dual-pump rapid lift shop jack for fleet bays. |
| `prd_acc_mats` | **All-Weather Floor Mats** | `automotive.accessories` | **$129.00** | 1 set | Trimmable heavy-duty rubber mats for fleet vans. |
| `prd_oil_synth` | **Synthetic Fleet Motor Oil (5W-30)** | `automotive.maintenance` | **$48.00** | 5-qt jug | Extended drain interval formulation (15,000 miles). |

---

## ⚡ AgentPay Protocol Implementation

AutoParts adheres to the open **AgentPay 1.0 Merchant Protocol**:

1. **Decentralized Discovery**:
   - `GET /.well-known/agentpay.json` exposes protocol capabilities, currency, and endpoints.
2. **Deterministic Canonicalization**:
   - Quotes and orders are normalized with **RFC 8785 JSON Canonicalization Scheme (JCS)**.
3. **Cryptographic Quotes**:
   - `POST /v1/agents-pay/quotes` generates immutable, tamper-evident ES256-signed quotes.
4. **Order Settlement**:
   - `POST /v1/agents-pay/orders/:ref/verification` claims mandate single-use payment tokens and issues invoice records.

---

## 🚀 Quickstart & Standalone Execution

```bash
# 1. Install dependencies
npm install

# 2. Run test suites
npm test

# 3. Start standalone AutoParts server
npm run dev
# Server running at http://localhost:3002
```

---

## 🔗 Architecture & Related Repositories

- **AgentPay Mandate Authority & Vault**: [pedroschott/hackatonyuno](https://github.com/pedroschott/hackatonyuno)
- **Protocol Documentation**: [`docs/agentpay-protocol.md`](docs/agentpay-protocol.md)
