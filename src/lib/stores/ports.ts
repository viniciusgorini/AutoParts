import type { SignedQuote } from "@/lib/quote";

/**
 * Persistence ports.
 *
 * Every adapter is injected. Nothing in the request path constructs a store
 * directly, so a deployment can swap in a durable implementation without
 * touching route code, and tests can assert against a fake.
 */

/** The agent binding is stored beside the quote, never inside the signed payload. */
export type StoredQuote = { quote: SignedQuote; agentId: string };

export type QuoteStore = {
  put(stored: StoredQuote): Promise<void>;
  get(quoteId: string): Promise<StoredQuote | null>;
};

export type OrderDecision = "quoted" | "verification_approved" | "verification_rejected" | "approval_required";

export type SettlementStatus = "none" | "pending" | "captured" | "failed";

export type OrderRecord = {
  merchantOrderRef: string;
  merchantId: string;
  quoteId: string;
  decision: OrderDecision;
  reasonCode: string | null;
  /** Opaque, single-use, only ever populated after an approved decision. */
  paymentOperationId: string | null;
  settlementStatus: SettlementStatus;
  capabilityHash: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrderStore = {
  get(merchantOrderRef: string): Promise<OrderRecord | null>;
  /**
   * Atomically reserves the single verification attempt for this order.
   * Returns null when another attempt already holds the claim or a terminal
   * decision is already recorded, which is what stops two concurrent requests
   * from producing two payment operations.
   */
  claimVerification(input: {
    merchantOrderRef: string;
    merchantId: string;
    quoteId: string;
    capabilityHash: string;
  }): Promise<{ claimed: true; record: OrderRecord } | { claimed: false; record: OrderRecord | null }>;
  completeVerification(input: {
    merchantOrderRef: string;
    decision: OrderDecision;
    reasonCode: string | null;
    paymentOperationId: string | null;
    settlementStatus: SettlementStatus;
  }): Promise<OrderRecord>;
  releaseClaim(merchantOrderRef: string): Promise<void>;
};

export type IdempotencyRecord = {
  key: string;
  scope: string;
  requestHash: string;
  status: number;
  body: string;
  createdAt: string;
};

export type IdempotencyStore = {
  /**
   * Reserves the key for this scope+payload. `replay` returns the stored
   * response; `conflict` means the same key arrived with a different payload;
   * `in_flight` means a concurrent request holds the reservation.
   */
  begin(input: {
    key: string;
    scope: string;
    requestHash: string;
  }): Promise<
    | { outcome: "reserved" }
    | { outcome: "replay"; record: IdempotencyRecord }
    | { outcome: "conflict" }
    | { outcome: "in_flight" }
  >;
  complete(input: { key: string; scope: string; status: number; body: string }): Promise<void>;
  abandon(input: { key: string; scope: string }): Promise<void>;
};

export type ReplayStore = {
  /** Returns false when the identifier has already been consumed. */
  consume(input: { id: string; expiresAt: Date }): Promise<boolean>;
};

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type RateLimitStore = {
  hit(input: { bucket: string; limit: number; windowSeconds: number }): Promise<RateLimitVerdict>;
};

export type Stores = {
  quotes: QuoteStore;
  orders: OrderStore;
  idempotency: IdempotencyStore;
  replay: ReplayStore;
  rateLimit: RateLimitStore;
};
