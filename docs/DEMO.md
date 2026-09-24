# Working demo — recorded 2026-09-24

This is a real run of the plugin's compiled actions against the **live**
FirstKey MCP endpoint (`https://uwmup-gaaaa-aaaab-qhipa-cai.icp.net/mcp`),
executed with Node directly on `dist/`. No test doubles: `generateWallet`
ran locally, `checkCycles` and `getFuelLink` went over the network.

The demo wallet (`cwqyi-imnuo-b2aq5-bes7p-qz4jv-73ysb-7dxjw-6cfh3-6ueww-dxhnq-rae`)
is a throwaway. No faucet claim was made and no funds moved — the demo uses
read-only MCP tools only.

## 1. FIRSTKEY_GENERATE_WALLET

```
FirstKey wallet created. The keypair was generated locally and never left this runtime.

Principal: cwqyi-imnuo-b2aq5-bes7p-qz4jv-73ysb-7dxjw-6cfh3-6ueww-dxhnq-rae

Private key (PKCS#8 PEM) — shown exactly once. Save it as FIRSTKEY_ICP_PRIVATE_KEY:
-----BEGIN PRIVATE KEY-----
…
```
success=true

## 2. FIRSTKEY_CHECK_CYCLES (faucet canister, live)

```
Cycles balance for 3l667-lyaaa-aaaam-ajkqa-cai:
{"cycles":"76_038_400_000_000","principal":"3l667-lyaaa-aaaam-ajkqa-cai"}
```
success=true — the faucet pool held ~76T cycles at the time of the run.

## 3. FIRSTKEY_GET_FUEL_LINK (fresh wallet, live)

```
FirstKey Fuel link for cwqyi-imnuo-b2aq5-bes7p-qz4jv-73ysb-7dxjw-6cfh3-6ueww-dxhnq-rae — send this to your human; they pay by card and cycles land straight in the wallet:
{"fuel_url":"https://firstkey.io/fuel?for=cwqyi-imnuo-b2aq5-bes7p-qz4jv-73ysb-7dxjw-6cfh3-6ueww-dxhnq-rae"}
```
success=true — the prefilled `?for=` param matches the wallet principal exactly.

## 4. FIRSTKEY_CLAIM_FAUCET / FIRSTKEY_DEPLOY_SITE / FIRSTKEY_UPLOAD_CHUNK

Not exercised live here: claims are one-per-principal and deploys spend real
cycles. Both are covered by the mocked-MCP action tests (`test/actions.test.ts`)
and were verified against the live server during the MCP build itself.

## Reproduce

```bash
npm run build
node --input-type=module -e "
import { firstkeyPlugin } from './dist/index.js';
const runtime = { getSetting: (k) => process.env[k] ?? null };
const callback = async (c) => { console.log(c.text); return []; };
const gen = firstkeyPlugin.actions.find(a => a.name === 'FIRSTKEY_GENERATE_WALLET');
await gen.handler(runtime, { content: { text: '' } }, undefined, {}, callback);
"
```
