import { z } from "zod";
import type { IAgentRuntime } from "@elizaos/core";

/**
 * Default FirstKey MCP server endpoint (live mainnet canister
 * uwmup-gaaaa-aaaab-qhipa-cai). Streamable HTTP, JSON-RPC 2.0, open CORS.
 */
export const DEFAULT_MCP_ENDPOINT =
  "https://uwmup-gaaaa-aaaab-qhipa-cai.icp.net/mcp";

/** Default FirstKey Fuel checkout page (human pays by card, cycles land in the agent wallet). */
export const DEFAULT_FUEL_URL = "https://firstkey.io/fuel";

export const firstkeyEnvSchema = z.object({
  /** FirstKey MCP endpoint override (defaults to the live mainnet server). */
  FIRSTKEY_MCP_ENDPOINT: z.string().url().default(DEFAULT_MCP_ENDPOINT),
  /** FirstKey Fuel page override (used only as a fallback link). */
  FIRSTKEY_FUEL_URL: z.string().url().default(DEFAULT_FUEL_URL),
  /**
   * Optional pre-existing wallet: a PKCS#8 PEM ("-----BEGIN PRIVATE KEY-----...")
   * for an Ed25519 key, or a raw 32-byte hex seed. When set, the plugin uses it
   * as the agent's wallet instead of generating a new one.
   */
  FIRSTKEY_ICP_PRIVATE_KEY: z.string().optional(),
});

export type FirstkeyEnv = z.infer<typeof firstkeyEnvSchema>;

function readSetting(
  runtime: IAgentRuntime,
  key: string
): string | undefined {
  try {
    const v = runtime.getSetting(key);
    if (typeof v === "string" && v.length > 0) return v;
  } catch {
    // fall through to process.env
  }
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env?.[key];
  return env && env.length > 0 ? env : undefined;
}

/** Resolve and validate the plugin's configuration from runtime settings / env. */
export async function getFirstkeyEnv(
  runtime: IAgentRuntime
): Promise<FirstkeyEnv> {
  const raw: Record<string, string | undefined> = {};
  for (const key of [
    "FIRSTKEY_MCP_ENDPOINT",
    "FIRSTKEY_FUEL_URL",
    "FIRSTKEY_ICP_PRIVATE_KEY",
  ] as const) {
    const v = readSetting(runtime, key);
    if (v !== undefined) raw[key] = v;
  }
  return firstkeyEnvSchema.parse(raw);
}
