# @firstkeyhq/elizaos-plugin

**FirstKey for ElizaOS — give any Eliza agent its first ICP wallet.**

![FirstKey banner](images/banner.png)

On the Internet Computer, a "wallet" is just an Ed25519 keypair — no signup,
no API key, no human required. The hard parts are funding it and doing
something with it. This plugin gives an ElizaOS agent the whole loop:

1. **Generate a wallet locally** — keypair never leaves the runtime.
2. **Claim free cycles** from the FirstKey faucet (one-time 1T grant per principal).
3. **Deploy a static site** to ICP and get a permanent live URL.
4. **Check balances**, upload large files in chunks, and get a **Fuel refuel
   link** (human pays by card, cycles land in the agent's wallet) when the free
   fuel runs out.

Chain operations run through the live [FirstKey MCP server](https://firstkey.io)
(`https://uwmup-gaaaa-aaaab-qhipa-cai.icp.net/mcp`) — the plugin wraps it, it
doesn't reimplement it. Wallet keys are the one thing that never touch the
network.

## Install

```bash
# inside your ElizaOS project
npx elizaos plugins add @firstkeyhq/elizaos-plugin
# or with npm:
npm install @firstkeyhq/elizaos-plugin
```

Register it in your character file:

```json
{
  "name": "MyAgent",
  "plugins": ["@firstkeyhq/elizaos-plugin"]
}
```

Or programmatically:

```ts
import { firstkeyPlugin } from "@firstkeyhq/elizaos-plugin";
runtime.registerPlugin(firstkeyPlugin);
```

Requires `@elizaos/core >= 1.0.0` (peer dependency, provided by your agent host).

## Configuration

All settings are optional and resolve in this order:
**runtime settings → environment variables → defaults.**

| Variable | Default | Purpose |
|---|---|---|
| `FIRSTKEY_MCP_ENDPOINT` | `https://uwmup-gaaaa-aaaab-qhipa-cai.icp.net/mcp` | FirstKey MCP server URL |
| `FIRSTKEY_ICP_PRIVATE_KEY` | — | Restore an existing wallet: Ed25519 PKCS#8 PEM (`-----BEGIN PRIVATE KEY-----…`) or a 32-byte hex seed |
| `FIRSTKEY_FUEL_URL` | `https://firstkey.io/fuel` | Fuel checkout base URL |

No API key. No signup. The plugin works with zero configuration out of the box.

## Actions

### `FIRSTKEY_GENERATE_WALLET` — create the agent's wallet

Generates an Ed25519 keypair **locally** (Node `crypto`), derives the
self-authenticating ICP principal, and holds it in process memory for the
session. This is the action the agent should run first in any conversation
about getting on ICP.

### `FIRSTKEY_CLAIM_FAUCET` — free starter fuel

Claims the one-time 1T cycles grant from the FirstKey faucet for the agent's
principal. One claim per principal, ever — enough to deploy a first site.

### `FIRSTKEY_CHECK_CYCLES` — balance check

Reads a principal's cycles balance from the cycles ledger. Defaults to the
agent's own wallet; pass `options.principal` to check any other principal.

### `FIRSTKEY_DEPLOY_SITE` — folder in, live URL out

Creates a canister, installs the FirstKey static host, uploads every file, and
returns the live `https://<canister>.icp.net` URL. The agent becomes a
controller of its site canister.

```ts
// options.files — include at least index.html
options: {
  files: [
    { path: "index.html", content: "<h1>hello icp</h1>", content_type: "text/html" },
    { path: "assets/logo.png", content_base64: "iVBORw0…", content_type: "image/png" },
  ]
}
```

Each file takes either `content` (UTF-8 text) or `content_base64` (pre-encoded
bytes). Total payload must fit in one MCP call (~1.2 MB); larger files go
through `FIRSTKEY_UPLOAD_CHUNK`.

### `FIRSTKEY_UPLOAD_CHUNK` — large files, chunk by chunk

For files too big for a single deploy call. Chunks are appended in order; set
`is_last: true` on the final chunk to assemble and publish the file.

```ts
options: {
  canister: "<site canister from FIRSTKEY_DEPLOY_SITE>",
  path: "assets/video.mp4",
  chunk_index: 0,          // 0-based; 0 starts a new upload for this path
  chunk_base64: "AAAA…",   // chunk bytes, base64
  is_last: false,
  content_type: "video/mp4",  // first chunk only
  total_bytes: "42000000",     // first chunk only
}
```

### `FIRSTKEY_GET_FUEL_LINK` — sovereign refuel

Returns the FirstKey Fuel payment link for a principal, prefilled with
`?for=<principal>`. The agent sends this link to its human: the human pays by
card (Stripe), cycles land directly in the agent's wallet. The agent never
touches crypto itself.

## The local-key sovereignty model

This is the load-bearing design decision of the plugin:

- **Key generation is local.** `FIRSTKEY_GENERATE_WALLET` uses the runtime's own
  CSPRNG. The private key exists only in the agent's process memory.
- **Keys never cross the network.** Unlike a hosted wallet API, the plugin never
  sends a private key to any server — not even FirstKey's. The MCP server only
  ever sees *principals* (public identifiers).
- **Restore is opt-in.** Set `FIRSTKEY_ICP_PRIVATE_KEY` to reuse an existing
  wallet across restarts. The plugin never writes keys to disk itself.
- **Derivation is verified.** The principal derivation (SHA-224 of the DER
  SubjectPublicKeyInfo, `0x02` suffix, CRC32-checksummed base32 text) is tested
  byte-for-byte against `@dfinity/principal`'s official implementation on 25
  random keys.

## Providers

**`firstkeyWalletProvider`** — dynamic context provider. Injects the agent's
active ICP principal and its *live* cycles balance into every prompt, so the
agent always knows its wallet state without being asked. Reports "not set up
yet" until a wallet exists.

## Typical agent flow

```
user: get me on ICP
agent: FIRSTKEY_GENERATE_WALLET     → principal oulul-ppq53-…-qqe
agent: FIRSTKEY_CLAIM_FAUCET        → 1T cycles claimed
agent: FIRSTKEY_DEPLOY_SITE         → https://abcde-....icp.net live
user: I'm out of cycles
agent: FIRSTKEY_GET_FUEL_LINK       → https://firstkey.io/fuel?for=oulul-…
```

See [`docs/DEMO.md`](docs/DEMO.md) for a recorded run of this flow.

## Security notes

- **Never expose private keys or seed phrases** in logs, chat, or tool output.
  The plugin's wallet object keeps the seed in memory only.
- The plugin talks to exactly one external host: the configured
  `FIRSTKEY_MCP_ENDPOINT`. Verify it in `src/environment.ts` if you fork this.
- Faucet grants are one per principal and publicly rate-limited; don't build
  retry loops that burn through identities.
- The Fuel flow is human-in-the-loop by design — a card payment can't be made
  by the agent, which is the point: the human funds, the agent keeps building
  with no further approval gates.

## Development

```bash
npm install
npm run typecheck   # strict TS
npm test            # vitest — wallet derivation, env, MCP client, actions
npm run build       # emits dist/
```

The test suite includes a mocked-MCP harness for all six actions and a
byte-exact principal-derivation check against the official SDK.

## Links

- FirstKey: https://firstkey.io
- FirstKey skill (for any AI assistant): https://firstkey.io/skills/firstkey/SKILL.md
- Fuel checkout: https://firstkey.io/fuel
- MCP endpoint: https://uwmup-gaaaa-aaaab-qhipa-cai.icp.net/mcp

MIT © FirstKey
