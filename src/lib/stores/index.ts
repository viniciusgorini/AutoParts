import { env } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { createMemoryStores } from "@/lib/stores/memory";
import type { Stores } from "@/lib/stores/ports";

/**
 * Store selection.
 *
 * There is deliberately no silent fallback: when a deployment asks for durable
 * persistence and no durable adapter is wired in, every protected route fails
 * closed with 503 instead of quietly serving from process memory.
 */

let cached: Stores | null = null;

export function stores(): Stores {
  if (cached) return cached;

  const configuration = env();

  if (configuration.AUTOPARTS_PERSISTENCE === "durable") {
    // A durable adapter (see src/lib/stores/ports.ts) has not been implemented
    // in this build. Failing here is the safe outcome: quotes, orders,
    // idempotency keys and consumed nonces must survive a restart.
    throw new ApiError(
      "DEPENDENCY_UNAVAILABLE",
      "Durable persistence is configured but no durable adapter is available.",
    );
  }

  cached = createMemoryStores();
  return cached;
}

/** Test seam: drops the memoised stores. */
export function resetStores(): void {
  cached = null;
}

export type { Stores } from "@/lib/stores/ports";
