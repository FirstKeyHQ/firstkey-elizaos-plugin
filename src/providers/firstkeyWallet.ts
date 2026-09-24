import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";
import { getFirstkeyEnv } from "../environment.js";
import {
  getActiveWallet,
  loadWalletFromPrivateKeyEnv,
} from "../wallet.js";
import { FirstkeyMcpClient } from "../mcp.js";

/**
 * Dynamic provider that injects the agent's FirstKey wallet principal and live
 * cycles balance into the agent's context, so it always knows who it is
 * on-chain and how much compute fuel it has left.
 */
export const firstkeyWalletProvider: Provider = {
  name: "firstkeyWallet",
  description:
    "The agent's FirstKey ICP wallet principal and its current cycles balance on the Internet Computer.",
  dynamic: true,
  get: async (runtime: IAgentRuntime, _message: Memory, _state: State) => {
    let wallet = getActiveWallet();
    if (!wallet) {
      try {
        const env = await getFirstkeyEnv(runtime);
        wallet = loadWalletFromPrivateKeyEnv(env.FIRSTKEY_ICP_PRIVATE_KEY);
      } catch {
        wallet = null;
      }
    }
    if (!wallet) {
      return {
        text: "No FirstKey wallet configured yet. The agent can create one with the FIRSTKEY_GENERATE_WALLET action.",
      };
    }
    try {
      const env = await getFirstkeyEnv(runtime);
      const client = new FirstkeyMcpClient(env.FIRSTKEY_MCP_ENDPOINT);
      const balance = await client.checkCycles(wallet.principal);
      return {
        text:
          `FirstKey ICP wallet principal: ${wallet.principal}\n` +
          `Cycles balance: ${balance.ok ? balance.text : "unavailable"}`,
        values: {
          firstkeyPrincipal: wallet.principal,
          firstkeyCyclesOk: balance.ok,
        },
        data: { principal: wallet.principal, balance: balance.text },
      };
    } catch {
      return {
        text: `FirstKey ICP wallet principal: ${wallet.principal}\nCycles balance: unavailable (MCP server unreachable)`,
        values: { firstkeyPrincipal: wallet.principal },
      };
    }
  },
};
