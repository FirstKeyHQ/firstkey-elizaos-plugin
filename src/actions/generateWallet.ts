import type { Action } from "@elizaos/core";
import { generateWallet, setActiveWallet } from "../wallet.js";
import { reply } from "./common.js";

export const generateWalletAction: Action = {
  name: "FIRSTKEY_GENERATE_WALLET",
  similes: [
    "GENERATE_ICP_WALLET",
    "CREATE_ICP_WALLET",
    "FIRSTKEY_NEW_WALLET",
    "MAKE_ICP_WALLET",
  ],
  description:
    "Generate a fresh Ed25519 ICP wallet for this agent via FirstKey. The keypair " +
    "is generated LOCALLY inside the agent runtime and never leaves it — the keypair " +
    "IS the wallet: no signup, no on-chain registration, no API key. Returns the ICP " +
    "principal and the PKCS#8 PEM private key exactly once. Save the PEM into " +
    "FIRSTKEY_ICP_PRIVATE_KEY so the wallet survives restarts. Use this before " +
    "claiming the faucet grant or deploying a site.",
  validate: async () => true,
  handler: async (_runtime, _message, _state, _options, callback) => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    const text = [
      "FirstKey wallet created. The keypair was generated locally and never left this runtime.",
      "",
      `Principal: ${wallet.principal}`,
      "",
      "Private key (PKCS#8 PEM) — shown exactly once. Save it as FIRSTKEY_ICP_PRIVATE_KEY:",
      wallet.privateKeyPem,
      "Next step: claim the free 1T cycles faucet grant with FIRSTKEY_CLAIM_FAUCET.",
    ].join("\n");
    return reply(callback, text);
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "I need an ICP wallet so I can start deploying things",
          action: "FIRSTKEY_GENERATE_WALLET",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Generating your FirstKey wallet now — the keypair is created locally and never leaves this runtime.",
          action: "FIRSTKEY_GENERATE_WALLET",
        },
      },
    ],
    [
      {
        name: "{{user1}}",
        content: {
          text: "set me up with firstkey",
          action: "FIRSTKEY_GENERATE_WALLET",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "On it — creating your sovereign ICP wallet.",
          action: "FIRSTKEY_GENERATE_WALLET",
        },
      },
    ],
  ],
};
