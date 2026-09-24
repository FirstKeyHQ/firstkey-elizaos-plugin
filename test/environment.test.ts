import { afterEach, describe, expect, it } from "vitest";
import type { IAgentRuntime } from "@elizaos/core";
import {
  DEFAULT_FUEL_URL,
  DEFAULT_MCP_ENDPOINT,
  getFirstkeyEnv,
} from "../src/environment.js";

const SETTING_KEYS = [
  "FIRSTKEY_MCP_ENDPOINT",
  "FIRSTKEY_FUEL_URL",
  "FIRSTKEY_ICP_PRIVATE_KEY",
];

function runtimeWith(settings: Record<string, string> = {}): IAgentRuntime {
  return {
    getSetting: (key: string) => settings[key],
  } as unknown as IAgentRuntime;
}

afterEach(() => {
  for (const k of SETTING_KEYS) delete process.env[k];
});

describe("getFirstkeyEnv", () => {
  it("applies defaults when nothing is configured", async () => {
    const env = await getFirstkeyEnv(runtimeWith());
    expect(env.FIRSTKEY_MCP_ENDPOINT).toBe(DEFAULT_MCP_ENDPOINT);
    expect(env.FIRSTKEY_FUEL_URL).toBe(DEFAULT_FUEL_URL);
    expect(env.FIRSTKEY_ICP_PRIVATE_KEY).toBeUndefined();
  });

  it("prefers runtime settings over process.env", async () => {
    process.env.FIRSTKEY_MCP_ENDPOINT = "https://env.example/mcp";
    const env = await getFirstkeyEnv(
      runtimeWith({ FIRSTKEY_MCP_ENDPOINT: "https://runtime.example/mcp" })
    );
    expect(env.FIRSTKEY_MCP_ENDPOINT).toBe("https://runtime.example/mcp");
  });

  it("falls back to process.env", async () => {
    process.env.FIRSTKEY_FUEL_URL = "https://env.example/fuel";
    const env = await getFirstkeyEnv(runtimeWith());
    expect(env.FIRSTKEY_FUEL_URL).toBe("https://env.example/fuel");
  });

  it("rejects invalid URLs", async () => {
    await expect(
      getFirstkeyEnv(runtimeWith({ FIRSTKEY_MCP_ENDPOINT: "not-a-url" }))
    ).rejects.toThrow();
  });
});
