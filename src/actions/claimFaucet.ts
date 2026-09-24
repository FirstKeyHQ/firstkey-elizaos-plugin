import type { Action } from "@elizaos/core";
import { NO_WALLET_MESSAGE, mcpFor, reply, resolveWallet } from "./common.js";

export const claimFaucetAction: Action = {
  name: "FIRSTKEY_CLAIM_FAUCET",
  similes: [
    "CLAIM_FAUCET_GRANT",
    "CLAIM_FIRSTKEY_GRANT",
    "GET_FREE_CYCLES",
    "FIRSTKEY_FAUCET",
  ],
  description:
    "Claim the one-time free 1T cycles grant from the FirstKey faucet for this " +
    "agent's ICP principal. One claim per principal, ever — the grant lands on the " +
    "cycles ledger and funds the agent's first canister deploy. Requires a FirstKey " +
    "wallet (FIRSTKEY_GENERATE_WALLET) first.",
  validate: async (runtime) => {
    try {
      return (await resolveWallet(runtime)) !== null;
    } catch {
      return false;
    }
  },
  handler: async (runtime, _message, _state, _options, callback) => {
    const wallet = await resolveWallet(runtime);
    if (!wallet) return reply(callback, NO_WALLET_MESSAGE, false);
    const { client } = await mcpFor(runtime);
    let result;
    try {
      result = await client.claimFaucetGrant(wallet.principal);
    } catch (err) {
      return reply(
        callback,
        `Faucet claim failed to reach the server: ${(err as Error).message}`,
        false
      );
    }
    return result.ok
      ? reply(
          callback,
          `Faucet grant claimed for ${wallet.principal}:\n${result.text}`
        )
      : reply(
          callback,
          `Faucet claim did not go through:\n${result.text}`,
          false
        );
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "claim my free cycles from the firstkey faucet",
          action: "FIRSTKEY_CLAIM_FAUCET",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Claiming your one-time 1T cycles faucet grant now.",
          action: "FIRSTKEY_CLAIM_FAUCET",
        },
      },
    ],
  ],
};
