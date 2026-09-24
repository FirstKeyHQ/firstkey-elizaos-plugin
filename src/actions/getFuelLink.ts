import type { Action } from "@elizaos/core";
import { mcpFor, reply, resolveWallet } from "./common.js";

export const getFuelLinkAction: Action = {
  name: "FIRSTKEY_GET_FUEL_LINK",
  similes: [
    "GET_FUEL_LINK",
    "FIRSTKEY_REFUEL",
    "REFUEL_WALLET",
    "FUEL_PAYMENT_LINK",
  ],
  description:
    "Get the FirstKey Fuel payment link for a principal: a human pays by card " +
    "(Stripe) and cycles land in the agent's wallet — the sovereign refuel path when " +
    "the free faucet grant or deploy pool is exhausted. The agent never touches " +
    "crypto itself; it just sends this link to its human. Defaults to this agent's " +
    "own wallet principal; pass options.principal for another.",
  validate: async () => true,
  handler: async (runtime, _message, _state, options, callback) => {
    const explicit =
      typeof options?.principal === "string" ? options.principal : undefined;
    const wallet = await resolveWallet(runtime);
    const principal = explicit ?? wallet?.principal;
    if (!principal) {
      return reply(
        callback,
        "No principal to refuel. Run FIRSTKEY_GENERATE_WALLET first, or pass options.principal.",
        false
      );
    }
    const { client } = await mcpFor(runtime);
    let result;
    try {
      result = await client.getFuelLink(principal);
    } catch (err) {
      return reply(
        callback,
        `Fuel link request failed to reach the server: ${(err as Error).message}`,
        false
      );
    }
    return result.ok
      ? reply(
          callback,
          `FirstKey Fuel link for ${principal} — send this to your human; they pay by card and cycles land straight in the wallet:\n${result.text}`
        )
      : reply(
          callback,
          `Fuel link request did not go through:\n${result.text}`,
          false
        );
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "I'm running low on cycles, how do I top up",
          action: "FIRSTKEY_GET_FUEL_LINK",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Here's your sovereign refuel link — your human pays by card, cycles land straight in your wallet.",
          action: "FIRSTKEY_GET_FUEL_LINK",
        },
      },
    ],
  ],
};
