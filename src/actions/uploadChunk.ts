import type { Action } from "@elizaos/core";
import { NO_WALLET_MESSAGE, mcpFor, reply, resolveWallet } from "./common.js";

export interface UploadChunkOptions {
  /** Site canister principal returned by FIRSTKEY_DEPLOY_SITE. */
  canister: string;
  /** Site path, e.g. assets/video.mp4 */
  path: string;
  /** 0-based chunk number. 0 starts a new upload for this path. */
  chunk_index: number;
  /** Chunk bytes, base64-encoded. */
  chunk_base64: string;
  /** True on the final chunk: assembles and publishes the file. */
  is_last: boolean;
  /** MIME type (only used on the first chunk). */
  content_type?: string;
  /** Total file size in bytes, as a decimal string (only used on the first chunk). */
  total_bytes?: string;
}

export const uploadChunkAction: Action = {
  name: "FIRSTKEY_UPLOAD_CHUNK",
  similes: [
    "UPLOAD_FILE_CHUNK",
    "FIRSTKEY_UPLOAD",
    "PUBLISH_LARGE_FILE",
    "APPEND_SITE_FILE",
  ],
  description:
    "Upload one chunk of a large file to an already-deployed agent site (for files " +
    "that don't fit in a single FIRSTKEY_DEPLOY_SITE call). Chunks are appended in " +
    "order; set is_last on the final chunk to publish the file. Pass " +
    "options: {canister, path, chunk_index, chunk_base64, is_last, content_type?, " +
    "total_bytes?}. Requires a FirstKey wallet that owns the site.",
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

    const o = (options ?? {}) as Partial<UploadChunkOptions>;
    if (
      !o.canister ||
      !o.path ||
      o.chunk_index === undefined ||
      !o.chunk_base64 ||
      o.is_last === undefined
    ) {
      return reply(
        callback,
        "Missing chunk parameters. Pass options: {canister, path, chunk_index, " +
          "chunk_base64, is_last, content_type?, total_bytes?}.",
        false
      );
    }

    const { client } = await mcpFor(runtime);
    let result;
    try {
      result = await client.uploadChunk({
        agent: wallet.principal,
        canister: o.canister,
        path: o.path,
        chunk_index: o.chunk_index,
        chunk_base64: o.chunk_base64,
        is_last: o.is_last,
        ...(o.content_type ? { content_type: o.content_type } : {}),
        ...(o.total_bytes ? { total_bytes: o.total_bytes } : {}),
      });
    } catch (err) {
      return reply(
        callback,
        `Chunk upload failed to reach the server: ${(err as Error).message}`,
        false
      );
    }
    return result.ok
      ? reply(callback, `Chunk ${o.chunk_index} uploaded for ${o.path}:\n${result.text}`)
      : reply(
          callback,
          `Chunk upload did not go through:\n${result.text}`,
          false
        );
  },
  examples: [
    [
      {
        name: "{{user1}}",
        content: {
          text: "upload this video to my site in chunks",
          action: "FIRSTKEY_UPLOAD_CHUNK",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Uploading the next chunk to your site now.",
          action: "FIRSTKEY_UPLOAD_CHUNK",
        },
      },
    ],
  ],
};
