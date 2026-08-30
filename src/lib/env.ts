import { z } from "zod";

/**
 * Server-only configuration.
 *
 * Nothing in this module may be imported from a client component: it reads the
 * merchant signing key and the demo agent key. No value here is ever prefixed
 * with NEXT_PUBLIC_.
 *
 * A missing or malformed required variable throws, so the service refuses to
 * start rather than running with an insecure default.
 */

const booleanFromString = z
  .union([z.literal("true"), z.literal("false"), z.literal("1"), z.literal("0")])
  .transform((value) => value === "true" || value === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Base URL of the AgentPay deployment that hosts the public registry. */
  AGENTPAY_REGISTRY_URL: z.url(),
  /** Merchant identity as it is known to AgentPay mandates. */
  AGENTPAY_MERCHANT_ID: z.string().min(1),
  AGENTPAY_MERCHANT_NAME: z.string().min(1),

  /** Ed25519 OKP JWK used to sign quotes. Server-only, never logged. */
  AGENTPAY_MERCHANT_PRIVATE_JWK: z.string().min(1),
  AGENTPAY_MERCHANT_KEY_ID: z.string().min(1),

  /** Absolute origin the store is served from; used for discovery + audience. */
  AUTOPARTS_PUBLIC_ORIGIN: z.url(),

  /** memory is refused in production; see src/lib/stores/index.ts. */
  AUTOPARTS_PERSISTENCE: z.enum(["memory", "durable"]).default("memory"),
  DATABASE_URL: z.string().min(1).optional(),

  AUTOPARTS_QUOTE_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(900),

  /**
   * Browser-driven demo checkout. The storefront has no agent key of its own,
   * so this server-side signer stands in for an agent. It is refused in
   * production.
   */
  AUTOPARTS_DEMO_AGENT_ENABLED: booleanFromString.default(false),
  AUTOPARTS_DEMO_AGENT_ID: z.string().min(1).optional(),
  AUTOPARTS_DEMO_AGENT_PRIVATE_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

export class EnvironmentError extends Error {}

let cached: Env | null = null;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    // Only the field names are reported. Values may contain key material.
    const fields = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new EnvironmentError(`Invalid AutoParts configuration. Check these variables: ${fields}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    if (env.AUTOPARTS_PERSISTENCE !== "durable") {
      throw new EnvironmentError(
        "AUTOPARTS_PERSISTENCE must be 'durable' in production. In-memory stores are development-only.",
      );
    }
    if (!env.DATABASE_URL) {
      throw new EnvironmentError("DATABASE_URL is required when AUTOPARTS_PERSISTENCE is 'durable'.");
    }
    if (env.AUTOPARTS_DEMO_AGENT_ENABLED) {
      throw new EnvironmentError(
        "AUTOPARTS_DEMO_AGENT_ENABLED must be false in production. The demo signer is not authentication.",
      );
    }
  }

  if (env.AUTOPARTS_DEMO_AGENT_ENABLED && (!env.AUTOPARTS_DEMO_AGENT_ID || !env.AUTOPARTS_DEMO_AGENT_PRIVATE_KEY)) {
    throw new EnvironmentError(
      "AUTOPARTS_DEMO_AGENT_ID and AUTOPARTS_DEMO_AGENT_PRIVATE_KEY are required when the demo signer is enabled.",
    );
  }

  return env;
}

export function env(): Env {
  cached ??= loadEnv();
  return cached;
}

/** Test seam: drops the memoised configuration. */
export function resetEnvCache(): void {
  cached = null;
}
