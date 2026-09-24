import type { Action } from "@elizaos/core";
import { mcpFor, reply, resolveWallet } from "./common.js";

export const checkCyclesAction: Action = {
  name: "FIRSTKEY_CHECK_CYCLES",
  similes: [
    "CHECK_CYCLES_BALANCE",
    "FIRSTKEY_BALANCE",
    "GET_CYCLES_BALANCE",
    "WALLET_BALANCE",
  ],
  description:
    "Read an ICP principal's cycles balance from the cycles ledger via FirstKey. " +
    "Defaults to this agent's own wallet principal; pass options.principal to check " +
    "any other principal.",
  validate: async () => true,
  handler: async (runtime, _message, _state, options, callback) => {
    const explicit =
      typeof options?.principal === "string" ? options.principal : undefined;
    const wallet = await resolveWallet(runtime);
    const principal = explicit ?? wallet?.principal;
    if (!principal) {
      return reply(
        callback,
        "No principal to check. Run FIRSTKEY_GENERATE_WALLET first, or pass options.principal.",
        false
      );
    }
    const { client } = await mcpFor(runtime);
    let result;
    try {
      result = await client.checkCycles(principal);
    } catch (err) {
      return reply(
        callback,
        `Balance check failed to reach the server: ${(err as Error).message}`,
        false
      );
    }
    return result.ok
      ? reply(callback, `Cycles balance for ${principal}:\n${result.text}`)
      : reply(
          callback,
          `Balance check did not go through:\n${result.text}`,
          false
        );
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "how many cycles do I have left",
          action: "FIRSTKEY_CHECK_CYCLES",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Checking your cycles balance now.",
          action: "FIRSTKEY_CHECK_CYCLES",
        },
      },
    ],
  ],
};
