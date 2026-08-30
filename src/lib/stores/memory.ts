import type {
  IdempotencyRecord,
  IdempotencyStore,
  OrderRecord,
  OrderStore,
  QuoteStore,
  RateLimitStore,
  ReplayStore,
  StoredQuote,
  Stores,
} from "@/lib/stores/ports";

/**
 * In-memory adapters for development and tests.
 *
 * These are process-local and disappear on restart, which is exactly why
 * src/lib/stores/index.ts refuses to hand them out in production. The single
 * threaded event loop is what makes the claim/reserve operations atomic here;
 * a durable adapter must get the same atomicity from the database.
 */

export function createMemoryQuoteStore(): QuoteStore {
  const quotes = new Map<string, StoredQuote>();
  return {
    async put(stored) {
      quotes.set(stored.quote.quoteId, stored);
    },
    async get(quoteId) {
      return quotes.get(quoteId) ?? null;
    },
  };
}

type OrderEntry = OrderRecord & { claimed: boolean };

const TERMINAL_DECISIONS = new Set(["verification_approved", "verification_rejected"]);

export function createMemoryOrderStore(now: () => Date = () => new Date()): OrderStore {
  const orders = new Map<string, OrderEntry>();

  const strip = (entry: OrderEntry): OrderRecord => {
    const { claimed: _claimed, ...record } = entry;
    return record;
  };

  return {
    async get(merchantOrderRef) {
      const entry = orders.get(merchantOrderRef);
      return entry ? strip(entry) : null;
    },

    async claimVerification({ merchantOrderRef, merchantId, quoteId, capabilityHash }) {
      const existing = orders.get(merchantOrderRef);

      if (existing) {
        // A terminal decision is never replaced, and a live claim is never
        // handed to a second caller.
        if (TERMINAL_DECISIONS.has(existing.decision) || existing.claimed) {
          return { claimed: false, record: strip(existing) };
        }
        const updated: OrderEntry = {
          ...existing,
          quoteId,
          capabilityHash,
          claimed: true,
          updatedAt: now().toISOString(),
        };
        orders.set(merchantOrderRef, updated);
        return { claimed: true, record: strip(updated) };
      }

      const timestamp = now().toISOString();
      const created: OrderEntry = {
        merchantOrderRef,
        merchantId,
        quoteId,
        decision: "quoted",
        reasonCode: null,
        paymentOperationId: null,
        settlementStatus: "none",
        capabilityHash,
        createdAt: timestamp,
        updatedAt: timestamp,
        claimed: true,
      };
      orders.set(merchantOrderRef, created);
      return { claimed: true, record: strip(created) };
    },

    async completeVerification({ merchantOrderRef, decision, reasonCode, paymentOperationId, settlementStatus }) {
      const existing = orders.get(merchantOrderRef);
      if (!existing) {
        throw new Error("Cannot complete a verification that was never claimed");
      }
      const updated: OrderEntry = {
        ...existing,
        decision,
        reasonCode,
        paymentOperationId,
        settlementStatus,
        claimed: false,
        updatedAt: now().toISOString(),
      };
      orders.set(merchantOrderRef, updated);
      return strip(updated);
    },

    async releaseClaim(merchantOrderRef) {
      const existing = orders.get(merchantOrderRef);
      if (existing) {
        orders.set(merchantOrderRef, { ...existing, claimed: false });
      }
    },
  };
}

type IdempotencyEntry =
  | { state: "in_flight"; requestHash: string }
  | { state: "complete"; record: IdempotencyRecord };

export function createMemoryIdempotencyStore(now: () => Date = () => new Date()): IdempotencyStore {
  const entries = new Map<string, IdempotencyEntry>();
  const compose = (scope: string, key: string) => `${scope}::${key}`;

  return {
    async begin({ key, scope, requestHash }) {
      const id = compose(scope, key);
      const existing = entries.get(id);

      if (!existing) {
        entries.set(id, { state: "in_flight", requestHash });
        return { outcome: "reserved" };
      }
      if (existing.state === "in_flight") {
        return existing.requestHash === requestHash ? { outcome: "in_flight" } : { outcome: "conflict" };
      }
      return existing.record.requestHash === requestHash
        ? { outcome: "replay", record: existing.record }
        : { outcome: "conflict" };
    },

    async complete({ key, scope, status, body }) {
      const id = compose(scope, key);
      const existing = entries.get(id);
      const requestHash = existing?.state === "in_flight" ? existing.requestHash : "";
      entries.set(id, {
        state: "complete",
        record: { key, scope, requestHash, status, body, createdAt: now().toISOString() },
      });
    },

    async abandon({ key, scope }) {
      const id = compose(scope, key);
      if (entries.get(id)?.state === "in_flight") {
        entries.delete(id);
      }
    },
  };
}

export function createMemoryReplayStore(now: () => Date = () => new Date()): ReplayStore {
  const seen = new Map<string, number>();

  return {
    async consume({ id, expiresAt }) {
      const current = now().valueOf();
      for (const [key, expiry] of seen) {
        if (expiry <= current) seen.delete(key);
      }
      if (seen.has(id)) return false;
      seen.set(id, expiresAt.valueOf());
      return true;
    },
  };
}

export function createMemoryRateLimitStore(now: () => Date = () => new Date()): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();

  return {
    async hit({ bucket, limit, windowSeconds }) {
      const current = now().valueOf();
      const existing = windows.get(bucket);

      if (!existing || existing.resetAt <= current) {
        windows.set(bucket, { count: 1, resetAt: current + windowSeconds * 1_000 });
        return { allowed: true };
      }
      if (existing.count >= limit) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - current) / 1_000)) };
      }
      existing.count += 1;
      return { allowed: true };
    },
  };
}

export function createMemoryStores(now: () => Date = () => new Date()): Stores {
  return {
    quotes: createMemoryQuoteStore(),
    orders: createMemoryOrderStore(now),
    idempotency: createMemoryIdempotencyStore(now),
    replay: createMemoryReplayStore(now),
    rateLimit: createMemoryRateLimitStore(now),
  };
}
