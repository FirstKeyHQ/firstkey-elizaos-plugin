import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HandlerCallback, IAgentRuntime, Memory } from "@elizaos/core";
import { generateWalletAction } from "../src/actions/generateWallet.js";
import { claimFaucetAction } from "../src/actions/claimFaucet.js";
import { checkCyclesAction } from "../src/actions/checkCycles.js";
import { getFuelLinkAction } from "../src/actions/getFuelLink.js";
import {
  encodeDeployFiles,
  deploySiteAction,
  MAX_SINGLE_CALL_BYTES,
} from "../src/actions/deploySite.js";
import { uploadChunkAction } from "../src/actions/uploadChunk.js";
import { firstkeyWalletProvider } from "../src/providers/firstkeyWallet.js";
import { firstkeyPlugin } from "../src/index.js";
import {
  generateWallet,
  getActiveWallet,
  setActiveWallet,
} from "../src/wallet.js";

const message = { content: { text: "hi" } } as unknown as Memory;

function runtimeWith(settings: Record<string, string> = {}): IAgentRuntime {
  return {
    getSetting: (key: string) => settings[key],
  } as unknown as IAgentRuntime;
}

function mcpOk(text: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { content: [{ type: "text", text }] },
    })
  );
}

let callbackText = "";
const callback: HandlerCallback = (async (response: { text: string }) => {
  callbackText = response.text;
  return [];
}) as unknown as HandlerCallback;

beforeEach(() => {
  setActiveWallet(null);
  callbackText = "";
  for (const k of [
    "FIRSTKEY_MCP_ENDPOINT",
    "FIRSTKEY_FUEL_URL",
    "FIRSTKEY_ICP_PRIVATE_KEY",
  ]) {
    delete process.env[k];
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  setActiveWallet(null);
});

describe("plugin shape", () => {
  it("exports a valid Plugin with 6 actions and 1 provider", () => {
    expect(firstkeyPlugin.name).toBe("@firstkeyhq/elizaos-plugin");
    expect(firstkeyPlugin.actions).toHaveLength(6);
    expect(firstkeyPlugin.providers).toHaveLength(1);
    const names = firstkeyPlugin.actions!.map((a) => a.name);
    expect(names).toEqual([
      "FIRSTKEY_GENERATE_WALLET",
      "FIRSTKEY_CLAIM_FAUCET",
      "FIRSTKEY_CHECK_CYCLES",
      "FIRSTKEY_DEPLOY_SITE",
      "FIRSTKEY_UPLOAD_CHUNK",
      "FIRSTKEY_GET_FUEL_LINK",
    ]);
    for (const action of firstkeyPlugin.actions!) {
      expect(typeof action.validate).toBe("function");
      expect(typeof action.handler).toBe("function");
      expect(action.description.length).toBeGreaterThan(20);
    }
  });
});

describe("FIRSTKEY_GENERATE_WALLET", () => {
  it("generates a wallet and stores it as active", async () => {
    expect(await generateWalletAction.validate(runtimeWith(), message)).toBe(true);
    const out = (await generateWalletAction.handler(
      runtimeWith(),
      message,
      undefined,
      undefined,
      callback
    )) as { text: string };
    expect(getActiveWallet()).not.toBeNull();
    expect(out.text).toContain("Principal:");
    expect(out.text).toContain("BEGIN PRIVATE KEY");
    expect(callbackText).toBe(out.text);
  });
});

describe("wallet-gated actions", () => {
  it("validate() is false with no wallet, true once generated", async () => {
    const rt = runtimeWith();
    expect(await claimFaucetAction.validate(rt, message)).toBe(false);
    expect(await deploySiteAction.validate(rt, message)).toBe(false);
    expect(await uploadChunkAction.validate(rt, message)).toBe(false);
    setActiveWallet(generateWallet());
    expect(await claimFaucetAction.validate(rt, message)).toBe(true);
    expect(await deploySiteAction.validate(rt, message)).toBe(true);
    expect(await uploadChunkAction.validate(rt, message)).toBe(true);
  });

  it("accepts a wallet from FIRSTKEY_ICP_PRIVATE_KEY", async () => {
    const w = generateWallet();
    const rt = runtimeWith({ FIRSTKEY_ICP_PRIVATE_KEY: w.privateKeyPem });
    expect(await claimFaucetAction.validate(rt, message)).toBe(true);
  });

  it("handlers explain the missing wallet", async () => {
    const out = (await claimFaucetAction.handler(
      runtimeWith(),
      message,
      undefined,
      undefined,
      callback
    )) as { text: string };
    expect(out.text).toContain("FIRSTKEY_GENERATE_WALLET");
  });
});

describe("FIRSTKEY_CLAIM_FAUCET", () => {
  it("calls claim_faucet_grant with the agent principal", async () => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    const fetchMock = vi.fn().mockResolvedValue(mcpOk("grant claimed"));
    vi.stubGlobal("fetch", fetchMock);

    const out = (await claimFaucetAction.handler(
      runtimeWith(),
      message,
      undefined,
      undefined,
      callback
    )) as { text: string };

    expect(out.text).toContain(wallet.principal);
    expect(out.text).toContain("grant claimed");
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.params).toEqual({
      name: "claim_faucet_grant",
      arguments: { agent: wallet.principal },
    });
  });
});

describe("FIRSTKEY_CHECK_CYCLES / FIRSTKEY_GET_FUEL_LINK", () => {
  it("defaults to the agent wallet principal", async () => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    const fetchMock = vi.fn().mockResolvedValue(mcpOk("123456789"));
    vi.stubGlobal("fetch", fetchMock);

    await checkCyclesAction.handler(runtimeWith(), message, undefined, undefined, callback);
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.params.arguments).toEqual({ principal: wallet.principal });
    expect(callbackText).toContain("123456789");
  });

  it("fuel link handler surfaces the link", async () => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mcpOk("https://firstkey.io/fuel?for=abc")));
    await getFuelLinkAction.handler(runtimeWith(), message, undefined, undefined, callback);
    expect(callbackText).toContain("https://firstkey.io/fuel?for=abc");
  });

  it("reports clearly when no principal is available", async () => {
    const out = (await checkCyclesAction.handler(
      runtimeWith(),
      message,
      undefined,
      undefined,
      callback
    )) as { text: string };
    expect(out.text).toContain("No principal");
  });
});

describe("encodeDeployFiles", () => {
  it("base64-encodes raw content and sums bytes", () => {
    const { encoded, totalBytes } = encodeDeployFiles([
      { path: "index.html", content: "<h1>hi</h1>" },
    ]);
    expect(encoded[0]!.content_base64).toBe(
      Buffer.from("<h1>hi</h1>").toString("base64")
    );
    expect(totalBytes).toBe(Buffer.byteLength("<h1>hi</h1>"));
  });

  it("prefers provided base64 and rejects empty files", () => {
    const { encoded } = encodeDeployFiles([
      { path: "a.txt", content_base64: "eA==" },
    ]);
    expect(encoded[0]!.content_base64).toBe("eA==");
    expect(() => encodeDeployFiles([{ path: "b.txt" }])).toThrow();
    expect(() => encodeDeployFiles([{ content: "x" } as never])).toThrow();
  });
});

describe("FIRSTKEY_DEPLOY_SITE", () => {
  it("refuses oversized payloads with chunk guidance", async () => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    const big = "x".repeat(MAX_SINGLE_CALL_BYTES + 1);
    const out = (await deploySiteAction.handler(
      runtimeWith(),
      message,
      undefined,
      { files: [{ path: "index.html", content: big }] },
      callback
    )) as { text: string };
    expect(out.text).toContain("FIRSTKEY_UPLOAD_CHUNK");
  });

  it("deploys small sites through the MCP server", async () => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    const fetchMock = vi.fn().mockResolvedValue(mcpOk("https://site.icp.net/"));
    vi.stubGlobal("fetch", fetchMock);

    await deploySiteAction.handler(
      runtimeWith(),
      message,
      undefined,
      { files: [{ path: "index.html", content: "<h1>hi</h1>" }] },
      callback
    );

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.params.name).toBe("deploy_site");
    expect(body.params.arguments.agent).toBe(wallet.principal);
    expect(body.params.arguments.files[0].path).toBe("index.html");
    expect(callbackText).toContain("https://site.icp.net/");
  });
});

describe("firstkeyWalletProvider", () => {
  it("reports no wallet when none is configured", async () => {
    const out = await firstkeyWalletProvider.get(
      runtimeWith(),
      message,
      {} as never
    );
    expect(out.text).toContain("No FirstKey wallet");
  });

  it("injects principal and live balance", async () => {
    const wallet = generateWallet();
    setActiveWallet(wallet);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mcpOk("987654321")));
    const out = await firstkeyWalletProvider.get(
      runtimeWith(),
      message,
      {} as never
    );
    expect(out.text).toContain(wallet.principal);
    expect(out.text).toContain("987654321");
    expect(out.values?.firstkeyPrincipal).toBe(wallet.principal);
  });
});
