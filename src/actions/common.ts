import type {
  ActionResult,
  HandlerCallback,
  IAgentRuntime,
} from "@elizaos/core";
import { getFirstkeyEnv, type FirstkeyEnv } from "../environment.js";
import {
  getActiveWallet,
  loadWalletFromPrivateKeyEnv,
  type GeneratedWallet,
} from "../wallet.js";
import { FirstkeyMcpClient } from "../mcp.js";

/**
 * Send the final text back to the conversation and return an ActionResult.
 * Pass success=false for failure paths so the runtime can chain correctly.
 */
export async function reply(
  callback: HandlerCallback | undefined,
  text: string,
  success = true
): Promise<ActionResult> {
  if (callback) {
    await callback({ text });
  }
  return { success, text };
}

/**
 * Resolve the agent's active wallet: the in-session wallet (set by
 * FIRSTKEY_GENERATE_WALLET) or FIRSTKEY_ICP_PRIVATE_KEY from settings/env.
 */
export async function resolveWallet(
  runtime: IAgentRuntime
): Promise<GeneratedWallet | null> {
  let wallet = getActiveWallet();
  if (wallet) return wallet;
  try {
    const env = await getFirstkeyEnv(runtime);
    wallet = loadWalletFromPrivateKeyEnv(env.FIRSTKEY_ICP_PRIVATE_KEY);
  } catch {
    wallet = null;
  }
  return wallet;
}

export async function mcpFor(
  runtime: IAgentRuntime
): Promise<{ env: FirstkeyEnv; client: FirstkeyMcpClient }> {
  const env = await getFirstkeyEnv(runtime);
  return { env, client: new FirstkeyMcpClient(env.FIRSTKEY_MCP_ENDPOINT) };
}

export const NO_WALLET_MESSAGE =
  "No FirstKey wallet is set up yet. Use FIRSTKEY_GENERATE_WALLET to create one " +
  "(the keypair is generated locally and never leaves this runtime), or set " +
  "FIRSTKEY_ICP_PRIVATE_KEY to an existing Ed25519 PKCS#8 PEM.";
