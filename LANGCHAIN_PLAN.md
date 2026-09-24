# LangChain toolkit plan — DO NOT BUILD YET

Status: **design only**. The user explicitly deferred this ("plan only, do not
build yet") behind the ElizaOS plugin. This document is the build spec for when
it's greenlit.

## Why LangChain.js first

The FirstKey MCP client and wallet derivation already exist as plain
TypeScript with zero ElizaOS dependency (`src/mcp.ts`, `src/wallet.ts` in the
ElizaOS plugin). A LangChain.js toolkit reuses them directly. A Python port
(`langchain-firstkey` for PyPI) is phase 2, only if agent demand shows up —
it would reimplement the JSON-RPC client in Python (~150 lines).

## Package

- Name: `@firstkey/langchain` (npm), repo `firstkey/firstkey-langchain`
- Peer deps: `@langchain/core >= 0.3`
- The MCP client + wallet crypto move into a shared dependency:
  `@firstkey/mcp-client` (extracted from the ElizaOS plugin, no framework
  imports) so all three integrations (MCP server, ElizaOS, LangChain) share
  one client implementation instead of forking it.

## Tools (one per MCP operation + local wallet)

Built with `tool()` from `@langchain/core/tools` + zod schemas:

| Tool name | Args | Notes |
|---|---|---|
| `firstkey_generate_wallet` | — | Local Ed25519 keygen; returns principal + PEM **once**. Sets the toolkit's active wallet in memory. Never accepts or returns a key over the network. |
| `firstkey_claim_faucet` | — | Uses active wallet's principal. One claim per principal ever. |
| `firstkey_check_cycles` | `principal?` (defaults to active wallet) | Read-only. |
| `firstkey_deploy_site` | `files: [{path, content?, content_base64?, content_type?}]` | Same ~1.2 MB single-call limit; returns live URL. |
| `firstkey_upload_chunk` | `canister, path, chunk_index, chunk_base64, is_last, content_type?, total_bytes?` | Large-file path. |
| `firstkey_get_fuel_link` | `principal?` | Returns `https://firstkey.io/fuel?for=<principal>`. |

Plus a `FirstkeyToolkit` class (LangChain `BaseToolkit` convention) that takes
an optional `privateKey` (PEM or hex seed) and endpoint override, and exposes
`getTools()`.

## Sovereignty rules (same as the ElizaOS plugin)

- Private keys live in the toolkit instance's memory only; they are never tool
  arguments and never logged.
- The MCP server only ever sees principals.
- No API key, no signup, no config required beyond an optional key restore.

## Test plan

- Unit: principal derivation byte-exact vs `@dfinity/principal` (copy the
  ElizaOS plugin's test — same vectors).
- Unit: tool arg validation (zod rejects bad chunk params, oversized deploys).
- Integration (mocked fetch): all six tools against a canned MCP server.
- Live smoke (read-only): `check_cycles` + `get_fuel_link` against mainnet,
  same as the ElizaOS plugin's `docs/DEMO.md`.

## Publish plan

1. Extract `@firstkey/mcp-client`; point the ElizaOS plugin at it (minor
   version bump there).
2. Build `@firstkey/langchain`, README with ReAct-agent example.
3. Publish to npm; announce on the FirstKey registry board + X.
4. Do NOT submit to `langchain-ai` community repos until there's real usage —
   standalone package keeps the release cadence ours.

## Open questions (decide at build time)

- Should the toolkit sign raw ICP calls (ingress) locally, or stay behind the
  MCP server for all chain writes? Recommendation: stay behind MCP — same as
  ElizaOS, one backend to secure.
- ESM-only or dual CJS/ESM? Recommendation: ESM-only, matching the ElizaOS
  plugin and modern LangChain.js.
