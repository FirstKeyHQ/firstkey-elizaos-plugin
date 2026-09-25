import type { Plugin } from "@elizaos/core";
import {
  generateWalletAction,
  claimFaucetAction,
  checkCyclesAction,
  deploySiteAction,
  uploadChunkAction,
  getFuelLinkAction,
} from "./actions/index.js";
import { firstkeyWalletProvider } from "./providers/index.js";

/**
 * FirstKey for ElizaOS — the agent-native wallet for the Internet Computer.
 *
 * Gives any Eliza agent:
 *  - a sovereign Ed25519 wallet (keypair generated locally, never leaves the runtime)
 *  - a free 1T cycles faucet grant (one claim per principal)
 *  - one-command static-site deploys to ICP (+ chunked uploads for large files)
 *  - cycles balance checks
 *  - Fuel refuel links (human pays by card, cycles land in the agent wallet)
 *
 * Chain operations run through the live FirstKey MCP server on ICP
 * (uwmup-gaaaa-aaaab-qhipa-cai); key material never crosses the network.
 */
export const firstkeyPlugin: Plugin = {
  name: "@firstkeyhq/elizaos-plugin",
  description:
    "FirstKey — the agent-native wallet for the Internet Computer. Generate a " +
    "sovereign Ed25519 wallet, claim free faucet cycles, deploy static sites to " +
    "ICP, check cycles balances, and get Fuel refuel links.",
  actions: [
    generateWalletAction,
    claimFaucetAction,
    checkCyclesAction,
    deploySiteAction,
    uploadChunkAction,
    getFuelLinkAction,
  ],
  providers: [firstkeyWalletProvider],
};

export default firstkeyPlugin;

// Re-export the pieces integrators may want directly.
export * from "./wallet.js";
export * from "./mcp.js";
export * from "./environment.js";
