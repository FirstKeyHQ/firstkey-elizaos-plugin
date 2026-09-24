/**
 * Minimal JSON-RPC 2.0 client for the FirstKey MCP server (Streamable HTTP).
 *
 * The MCP server lives on-chain (uwmup-gaaaa-aaaab-qhipa-cai). The plugin
 * speaks to it with plain POST JSON-RPC — no MCP SDK needed — and keeps all
 * key material local: only principals and public data cross the network.
 */

export interface McpCallResult {
  ok: boolean;
  /** Human-readable text from the MCP result content blocks. */
  text: string;
  /** Raw MCP result payload. */
  raw: unknown;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number | string;
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
    [k: string]: unknown;
  };
  error?: { code: number; message: string; data?: unknown };
}

let nextId = 1;

/** Extract the JSON-RPC response payload from a plain JSON or SSE body. */
export function parseStreamableHttpBody(body: string): JsonRpcResponse {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }
  // Server-Sent Events: take the last "data:" line carrying the response.
  const dataLines = trimmed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice("data:".length).trim())
    .filter((d) => d && d !== "[DONE]");
  if (dataLines.length === 0) {
    throw new Error("MCP server returned an empty SSE stream");
  }
  return JSON.parse(dataLines[dataLines.length - 1]!) as JsonRpcResponse;
}

export class FirstkeyMcpClient {
  constructor(private readonly endpoint: string) {}

  async callTool(
    name: string,
    args: Record<string, unknown> = {}
  ): Promise<McpCallResult> {
    const request = {
      jsonrpc: "2.0",
      id: nextId++,
      method: "tools/call",
      params: { name, arguments: args },
    };
    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(request),
      });
    } catch (err) {
      throw new Error(
        `FirstKey MCP server unreachable at ${this.endpoint}: ${(err as Error).message}`
      );
    }
    const body = await res.text();
    if (!res.ok) {
      throw new Error(
        `FirstKey MCP server HTTP ${res.status}: ${body.slice(0, 300)}`
      );
    }
    const payload = parseStreamableHttpBody(body);
    if (payload.error) {
      return {
        ok: false,
        text: `MCP error ${payload.error.code}: ${payload.error.message}`,
        raw: payload,
      };
    }
    const result = payload.result ?? {};
    const text = (result.content ?? [])
      .map((c) => (c.type === "text" ? (c.text ?? "") : JSON.stringify(c)))
      .join("\n")
      .trim();
    return {
      ok: !result.isError,
      text: text || JSON.stringify(result),
      raw: result,
    };
  }

  /** Convenience wrappers mirroring the MCP tool names. */
  createWallet() {
    return this.callTool("create_wallet", {});
  }
  claimFaucetGrant(agent: string) {
    return this.callTool("claim_faucet_grant", { agent });
  }
  deploySite(agent: string, files: Array<{ path: string; content_base64: string; content_type?: string }>) {
    return this.callTool("deploy_site", { agent, files });
  }
  uploadChunk(args: {
    agent: string;
    canister: string;
    path: string;
    chunk_index: number;
    chunk_base64: string;
    is_last: boolean;
    content_type?: string;
    total_bytes?: string;
  }) {
    return this.callTool("deploy_upload_chunk", args);
  }
  checkCycles(principal: string) {
    return this.callTool("check_cycles", { principal });
  }
  getFuelLink(principal: string) {
    return this.callTool("get_fuel_link", { principal });
  }
}
