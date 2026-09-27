# Bring your own backend

This package is the frontend SDK. Builders operate their own compatible HTTP
API, Algorand node or node gateway, and any indexing/database services needed
by their product. Do not point `baseUrl` at a PEX-operated API or implement your
backend by proxying that API. PEX publishes the signed oracle/price feed and versioned protocol definitions
on R2; neither requires access to a PEX-operated backend.

This SDK does **not** include a standalone backend server or a complete
chain-indexing implementation. Configuring `baseUrl` does not create those
services. Build the required data endpoints before following the browser
quickstart. You can alternatively supply chain-derived inputs directly to the
low-level parsers, quote functions, and transaction builders without using
`PdexApiClient`.

## Configuration

Example browser build settings for MainNet:

```dotenv
# Replace these two example origins with infrastructure you operate.
VITE_BUILDER_API_URL=https://api.your-app.example
VITE_BUILDER_ALGOD_URL=https://algod.your-app.example
# PEX's published MainNet oracle/price and protocol artifacts; no private credential.
VITE_PDEX_ARTIFACT_URL=https://pub-1e72beea87f04ebfafce248132310425.r2.dev/mainnet
```

The example builder domains are deliberately not live services. The Algod URL
must expose the standard Algorand node API to your application. Keep private
node tokens on your server, not in browser `VITE_*` variables; expose an
appropriately controlled node gateway where needed. Configure CORS for your
application origin. Wallets sign transactions in the frontend.

Set `network: "mainnet"` consistently in bootstrap and account authentication.
Obtain genesis information from your node. Resolve active app/asset IDs from
verified deployment configuration and on-chain registry state rather than
assuming that an example market or old app ID is still current.

## Protocol definitions from R2

MainNet's current protocol pointer is:

```text
https://pub-1e72beea87f04ebfafce248132310425.r2.dev/mainnet/v2/protocol/mainnet/current.json
```

Use the SDK in a browser or Node.js, without a backend request:

```ts
import { loadManifestFromR2 } from "@pdex/sdk/manifest";

const protocol = await loadManifestFromR2({
  publicArtifactBaseUrl: "https://pub-1e72beea87f04ebfafce248132310425.r2.dev/mainnet",
  network: "mainnet",
});
// The verified definition is now installed for SDK parsing and transaction building.
```

The helper refreshes `v2/protocol/{network}/current.json` with `cache: "no-store"`,
checks its format and network, follows its immutable `artifact_path`, and verifies
SHA-256 against `artifact_hash` over the exact downloaded bytes before caching
the V2 manifest. The hash detects corruption and identifies the version; the
HTTPS publication origin remains trusted. This is separate from signed oracle
payloads. You can inject `fetchImpl` for your environment.

`PdexApiClient.loadProtocol()` and `loadPdexContext()` use this helper when both
`publicArtifactBaseUrl` and `network` are configured. They fall back to **your**
`baseUrl`'s `/v2/protocol` only on network/body-read or HTTP failures. They never
select a PEX-operated API automatically. Invalid JSON, format, network, artifact
path, or hash fails without fallback; unsuccessful loading leaves the previous
cached definition unchanged. R2 requests do not receive account credentials.
The standalone helper has no fallback and throws `ProtocolManifestUnavailableError`
for availability failures.

Serve a compatible, reviewed definition on your fallback API and keep its
network aligned with the artifact settings. Definitions come from the release
process; app/asset IDs and current state still come from your own infrastructure.
If you deliberately pin a reviewed definition, use `setProtocolManifest(protocol, 2)`
or the existing API-only `loadManifestFromUrl(baseUrl)`. The current-pointer
loader intentionally follows releases rather than pinning one forever.

## Minimum context API

`loadPdexContext()` uses the following endpoints on **your** `baseUrl`; the
protocol route is only a fallback when R2 loading is configured:

| Method and route | Required data |
| --- | --- |
| `GET /v2/protocol` | Fallback (or API-only) public V2 definitions: app methods, argument types, box and receipt formats, constants and version context. |
| `GET /v2/networks/mainnet/deployments` | Network/deployment metadata with active app and asset mappings. |
| `GET /v2/sdk/bootstrap` | App references, assets and supported market capabilities. |
| `GET /v2/sdk/resources` | Current app/asset and transaction resource metadata. |
| `GET /v2/summary/markets` | Market and pool records, product catalog, prices and indexed-round context. |

Supply real state from your node and published protocol definitions; an empty
success response is not a compatible implementation. The response types in
[`src/api.ts`](./src/api.ts), normalization in
[`src/readModels.ts`](./src/readModels.ts), and protocol/deployment handling in
[`src/manifest.ts`](./src/manifest.ts) define the SDK's current input shapes.
Unit-test fixtures are examples, not deployment manifests or live financial data.

## Add endpoints for the features you expose

[`src/api.ts`](./src/api.ts) contains the complete method-to-route mapping.
Implement only the features your product uses; the following groups explain
the responsibilities rather than prescribing a new server framework.

| Feature | Backend responsibility |
| --- | --- |
| Market/pool reads and quotes | Read current configuration, positions, pool accounting, factors and provider state; serve `/v2/markets`, `/v2/pools` and the scoped or quote routes your app calls. Keep integer values exact. |
| Account reads | Implement `/v2/auth/session` and logout plus your required `/v2/accounts/...` routes. Verify the signed challenge, network, genesis, origin, expiry and nonce; for rekeyed accounts verify the current on-chain signer. Your backend issues its own sessions. |
| Payouts | Implement `/v2/resource-registry/market-yield` and `POST /v2/market-yield/action-recall-plan` from current owned cash, receipts, provider resources and limits. Follow [recall preparation](./INTEGRATION_GUIDE.md#recall-preparation); an ordinary price quote is insufficient. |
| Orders and CVA | Supply the order policy, order/account state, vault/allocation state and quote routes needed by the chosen action family. |
| History, performance and candles | Index confirmed activity and maintain the required history yourself. State snapshots alone cannot reconstruct complete historical activity or returns. Report unavailable/incomplete coverage honestly. |

This is a compatibility guide, not a complete backend implementation or a
claim that all response schemas fully specify the financial calculations.
Qualify your backend and frontend together against the current contracts.
Do not serve transaction groups from the API as a requirement of this SDK:
frontend builders assemble groups, user limits, oracle arguments and resources;
the wallet signs, and your node submits/simulates them.

## Oracle transport

With the MainNet artifact base above and `network: "mainnet"`, the client reads:

- `v2/latest-prices/mainnet/current.json` for the latest-price bundle;
- `v2/oracle-payloads/mainnet/current.json` for target-specific signed messages.

These paths are relative to the artifact base, including its `/mainnet` suffix.
The oracle helper can fall back to `GET /v2/oracle/{marketId}` on **your**
configured backend. Your implementation must use the published signed payloads
and reject missing, expired or mismatched targets. Do not generate substitute
signatures or relay requests to a PEX API. Latest-price bundle reads fail on
artifact errors rather than automatically retrying through the backend.

The transport/decoding helper is not complete trust verification. Validate the
signature against the signer configured on-chain, target app and assets,
network/deployment context, and freshness before using prices or signing.
Fetch and revalidate a fresh payload at final group preparation. Stale or absent
oracle data must block price-sensitive actions, including when your node is healthy.

## Before enabling real transactions

Verify consistent registry/state generations, exact integer units, real
funding/borrowing accrual, rekeyed signatures, signed slippage/share limits,
and zero-idle-cash recall paths. Simulate the complete unsigned group, obtain
the user's signatures, submit through your node and confirm the result.
Refresh indexed state through at least the confirmation round. A successful
bootstrap or a green mocked HTTP test does not establish trading readiness.
