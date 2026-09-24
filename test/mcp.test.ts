import { afterEach, describe, expect, it, vi } from "vitest";
import { FirstkeyMcpClient, parseStreamableHttpBody } from "../src/mcp.js";

const ENDPOINT = "https://example.invalid/mcp";

function jsonResponse(result: unknown) {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseStreamableHttpBody", () => {
  it("parses plain JSON bodies", () => {
    const payload = { jsonrpc: "2.0", id: 1, result: { ok: true } };
    expect(parseStreamableHttpBody(JSON.stringify(payload))).toEqual(payload);
  });

  it("parses SSE bodies, taking the last data line", () => {
    const body = [
      'event: message',
      'data: {"jsonrpc":"2.0","id":1,"result":{"partial":true}}',
      "",
      'event: message',
      'data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"done"}]}}',
      "",
    ].join("\n");
    const parsed = parseStreamableHttpBody(body);
    expect(parsed.result).toEqual({
      content: [{ type: "text", text: "done" }],
    });
  });

  it("throws on empty SSE streams", () => {
    expect(() => parseStreamableHttpBody("event: ping\n\n")).toThrow();
  });
});

describe("FirstkeyMcpClient.callTool", () => {
  it("sends a JSON-RPC tools/call and joins text content", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [{ type: "text", text: "hello" }, { type: "text", text: "world" }],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new FirstkeyMcpClient(ENDPOINT);
    const result = await client.checkCycles("aaaaa-aa");

    expect(result.ok).toBe(true);
    expect(result.text).toBe("hello\nworld");
    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: "check_cycles", arguments: { principal: "aaaaa-aa" } },
    });
  });

  it("marks MCP isError results as not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          content: [{ type: "text", text: "already claimed" }],
          isError: true,
        })
      )
    );
    const result = await new FirstkeyMcpClient(ENDPOINT).claimFaucetGrant("aaaaa-aa");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("already claimed");
  });

  it("returns JSON-RPC errors as not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            error: { code: -32602, message: "invalid params" },
          })
        )
      )
    );
    const result = await new FirstkeyMcpClient(ENDPOINT).getFuelLink("aaaaa-aa");
    expect(result.ok).toBe(false);
    expect(result.text).toContain("invalid params");
  });

  it("throws a clear error on HTTP failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 500 }))
    );
    await expect(
      new FirstkeyMcpClient(ENDPOINT).checkCycles("aaaaa-aa")
    ).rejects.toThrow("HTTP 500");
  });

  it("throws a clear error when the server is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("connection refused"))
    );
    await expect(
      new FirstkeyMcpClient(ENDPOINT).checkCycles("aaaaa-aa")
    ).rejects.toThrow("unreachable");
  });

  it("serializes deploy_site file arguments exactly", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: "text", text: "https://x.icp.net/" }] })
    );
    vi.stubGlobal("fetch", fetchMock);

    await new FirstkeyMcpClient(ENDPOINT).deploySite("agent-principal", [
      { path: "index.html", content_base64: "PGgxPkhlbGxvPC9oMT4=" },
    ]);

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.params.arguments).toEqual({
      agent: "agent-principal",
      files: [{ path: "index.html", content_base64: "PGgxPkhlbGxvPC9oMT4=" }],
    });
  });
});
