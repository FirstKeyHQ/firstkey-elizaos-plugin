import type { Action } from "@elizaos/core";
import { NO_WALLET_MESSAGE, mcpFor, reply, resolveWallet } from "./common.js";

export interface DeployFileInput {
  path: string;
  /** Raw file text (UTF-8). One of content / content_base64 is required. */
  content?: string;
  /** Pre-encoded file bytes. */
  content_base64?: string;
  content_type?: string;
}

/** Total decoded bytes that fit in a single deploy_site MCP call. */
export const MAX_SINGLE_CALL_BYTES = 1_200_000;

export function encodeDeployFiles(files: DeployFileInput[]): {
  encoded: Array<{ path: string; content_base64: string; content_type?: string }>;
  totalBytes: number;
} {
  let totalBytes = 0;
  const encoded = files.map((f) => {
    if (!f.path) throw new Error("deploy file is missing 'path'");
    const content_base64 =
      f.content_base64 ??
      (f.content !== undefined
        ? Buffer.from(f.content, "utf8").toString("base64")
        : undefined);
    if (!content_base64) {
      throw new Error(`deploy file '${f.path}' needs content or content_base64`);
    }
    totalBytes += Buffer.from(content_base64, "base64").length;
    return {
      path: f.path,
      content_base64,
      ...(f.content_type ? { content_type: f.content_type } : {}),
    };
  });
  return { encoded, totalBytes };
}

export const deploySiteAction: Action = {
  name: "FIRSTKEY_DEPLOY_SITE",
  similes: [
    "DEPLOY_STATIC_SITE",
    "PUBLISH_WEBSITE",
    "FIRSTKEY_DEPLOY",
    "DEPLOY_TO_ICP",
  ],
  description:
    "Deploy a static website to the Internet Computer via FirstKey: creates a " +
    "canister, installs the FirstKey static host, uploads every file, and returns the " +
    "live https URL. The agent becomes a controller of its site canister. One free " +
    "deploy per agent principal from the FirstKey deploy pool. Pass files via " +
    "options.files as [{path, content | content_base64, content_type?}] — include at " +
    "least index.html. Files must fit in one call (~1.2 MB total); larger files go " +
    "through FIRSTKEY_UPLOAD_CHUNK. Requires a FirstKey wallet.",
  validate: async (runtime) => {
    try {
      return (await resolveWallet(runtime)) !== null;
    } catch {
      return false;
    }
  },
  handler: async (runtime, _message, _state, options, callback) => {
    const wallet = await resolveWallet(runtime);
    if (!wallet) return reply(callback, NO_WALLET_MESSAGE, false);

    const files = options?.files as DeployFileInput[] | undefined;
    if (!files || files.length === 0) {
      return reply(
        callback,
        "Nothing to deploy. Pass options.files as an array of " +
          "{path, content | content_base64, content_type?} — include at least index.html.",
        false
      );
    }

    let encoded;
    try {
      encoded = encodeDeployFiles(files);
    } catch (err) {
      return reply(
        callback,
        `Could not prepare files: ${(err as Error).message}`,
        false
      );
    }
    if (encoded.totalBytes > MAX_SINGLE_CALL_BYTES) {
      return reply(
        callback,
        `Payload is ${(encoded.totalBytes / 1_000_000).toFixed(2)} MB — too large for a single ` +
          "deploy call. Deploy a small index.html first with FIRSTKEY_DEPLOY_SITE, then " +
          "upload the large files with FIRSTKEY_UPLOAD_CHUNK.",
        false
      );
    }

    const { client } = await mcpFor(runtime);
    let result;
    try {
      result = await client.deploySite(wallet.principal, encoded.encoded);
    } catch (err) {
      return reply(
        callback,
        `Deploy failed to reach the server: ${(err as Error).message}`,
        false
      );
    }
    return result.ok
      ? reply(callback, `Site deployed for ${wallet.principal}:\n${result.text}`)
      : reply(
          callback,
          `Deploy did not go through:\n${result.text}`,
          false
        );
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "deploy my landing page to the internet computer",
          action: "FIRSTKEY_DEPLOY_SITE",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Deploying your site to ICP now — creating the canister and uploading the files.",
          action: "FIRSTKEY_DEPLOY_SITE",
        },
      },
    ],
  ],
};
