# PDex TypeScript SDK

Browser-first TypeScript tools for building trading, liquidity, analytics, and
wallet experiences on PDex V2.

The SDK provides:

- typed access to PDex protocol, deployment, market, pool, account, price,
  performance, order, CVA, and yield data;
- typed OracleMessageV3 decoding and signature validation;
- deterministic local quotes, health calculations, and position-cost
  resolution;
- box-key helpers, state parsers, and receipt codecs;
- wallet-safe asset opt-in and test-network ALGO return helpers;
- wallet-ready Algorand transaction groups for public PDex actions.

See [PUBLIC_API.md](./PUBLIC_API.md) for the supported module and capability
contract and [INTEGRATION_GUIDE.md](./INTEGRATION_GUIDE.md) for the complete
browser workflow. [QUICKSTART.md](./QUICKSTART.md) is the shortest end-to-end
path from configuration to a confirmed wallet transaction.

## Install from source

Clone the repository and check out a reviewed commit or release tag so the SDK
source is pinned:

```bash
git clone https://github.com/ultrade-org/pex-ts-pubsdk.git
cd pex-ts-pubsdk
git checkout <reviewed-commit-or-tag>
npm ci --ignore-scripts
npm run build
npm pack --ignore-scripts
```

The final command creates `pdex-sdk-0.1.0.tgz`. Install that exact tarball in
your application while continuing to suppress dependency lifecycle scripts:

```bash
npm install --save-exact /path/to/pdex-sdk-0.1.0.tgz --ignore-scripts
```

## Initialize

For browser applications, the integration helper loads and normalizes the
public context in one call:

```ts
import { loadPdexContext } from "@pdex/sdk/integration";

const pdex = await loadPdexContext({
  baseUrl: "https://api.example",
  publicArtifactBaseUrl: "https://artifacts.example",
  network: "testnet",
});

const market = pdex.markets[0];
const pool = pdex.pools.find((item) => item.marketId === market.marketId);
```

The returned context includes the configured API client, protocol and
deployment data, normalized markets and pools, resolved app and asset IDs, and
canonical transaction-builder references.

The lower-level initialization sequence remains available when an application
needs to control each request:

Load the protocol manifest before using decoders or transaction builders. Load
deployment and resource metadata from the same backend generation:

```ts
import {
  createPdexApiClient,
  deploymentAppIds,
  deploymentAssets,
} from "@pdex/sdk";

const pdex = createPdexApiClient({
  baseUrl: "https://api.example",
  network: "testnet",
});

await pdex.loadProtocol();

const [deployment, bootstrap, resources] = await Promise.all([
  pdex.deployment("testnet"),
  pdex.v2SdkBootstrap(),
  pdex.v2SdkResources(),
]);

const appIds = deploymentAppIds(deployment);
const assets = deploymentAssets(deployment);
```

## Read market data

Use the scoped data methods for application state and analytics:

```ts
const [summary, markets, pools, price, candles] = await Promise.all([
  pdex.v2MarketSummary(),
  pdex.v2Markets(),
  pdex.v2Pools(),
  pdex.v2LatestPrice(marketId),
  pdex.v2PriceCandles({ marketId, period: "1h", limit: 200 }),
]);

const performance = await pdex.v2PoolPerformance(poolId, "30d");
```

Account positions, orders, LP balances, trades, activity, margin, and CVA
shares use wallet-authenticated read sessions. Supply the returned session
token directly or through an async token provider when creating the client.
`authorizePdexAccount()` handles canonical message creation, signature
encoding, session creation, and client token configuration through a
wallet-provided signing callback.

## Quote an action

Local quote functions consume explicit state and price inputs, which makes the
preview reproducible:

```ts
import { quoteV2OpenPosition } from "@pdex/sdk";

const quote = quoteV2OpenPosition({
  market,
  pool,
  position,
  owner: address,
  side: 1,
  collateralAssetId,
  collateralAmount,
  sizeUsdDelta,
  acceptablePrice,
  prices,
});

if (!quote.ok) throw new Error(String(quote.failure_reasons));
```

Backend quote methods provide an independent server calculation for trading,
margin, liquidity, swaps, orders, CVA, and liquidation workflows.

## Build a transaction group

Fetch a target-specific signed oracle payload immediately before building the
group:

```ts
import { buildV2OpenOrIncreaseTransactions } from "@pdex/sdk/transactions";

const oracle = await pdex.v2OracleArgs({
  marketId,
  appId: appIds.PDexV2Trading,
  target: "trading",
});

const transactions = buildV2OpenOrIncreaseTransactions(
  {
    ...appRefs,
    sender: address,
    marketId,
    collateralAssetId,
    side,
    collateralAmount,
    sizeUsdDelta,
    acceptablePrice,
    oracleMessage: oracle.message,
    oracleSignature: oracle.signature,
  },
  suggestedParams,
);
```

Pass the complete ordered group to the wallet. The returned group already
contains its resource carriers, storage payments, app and asset references,
accounts, boxes, prerequisites, and fee shape.

Pair position actions, pair stored orders, and direct swaps accept an optional
`builderFee` containing a builder address and basis-point rate. Position and
order fees are capped at 10 bps; swap fees are capped at 100 bps. The SDK adds
the authorized builder transfer to the group and includes it in quote totals,
so applications can show the complete wallet debit before signing.

`submitPdexTransactionGroup()` validates a complete wallet signature result,
submits the signed group, waits for confirmation, and decodes the receipt.

## Public action families

- Pair and single-token liquidity deposits and withdrawals.
- Exact-input swaps and one- or two-hop swap routes.
- Position storage, open/increase, decrease/close, output selection, and margin
  adjustment.
- Open Limit, Take Profit, Stop Loss, linked and active attached orders,
  execution, cancellation, and expiry cleanup.
- CVA deposits and routed withdrawals.
- Liquidation and public market-yield freshness calls.

Native ALGO uses asset ID `0`. Custody and collateral amounts use six decimal
places, oracle values use Price12, and position quantity precision comes from
the selected market manifest.

## Development

```bash
npm ci --ignore-scripts
npm run check:package
npm test
npm pack --dry-run --ignore-scripts --json
```
