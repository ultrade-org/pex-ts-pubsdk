# PDex TypeScript SDK

Browser-first TypeScript tools for building trading, liquidity, analytics, and
wallet experiences on PDex V2.

**Bring your own backend and node.** This is a frontend SDK, not a standalone
backend. Builders provide the compatible data API and chain infrastructure;
PEX provides the published R2 oracle/price feed. Do not use or proxy a
PEX-operated backend API. See [backend integration](./BACKEND_INTEGRATION.md)
for the required services and current limitations.

**License:** [PEX Builder License 1.0](./LICENSE), a source-available license.
Commercial, independently branded products and self-hosted infrastructure on
official PEX deployments are permitted. Using this code or its derivatives
for a separate competing protocol is not. Your separate application code can
remain proprietary. See the license for the complete conditions.

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
source is pinned. For the unreleased 0.5.0 candidate, replace the reference below
with the supplied commit; do not activate it against the older contracts:

```bash
git clone https://github.com/ultrade-org/pex-ts-pubsdk.git
cd pex-ts-pubsdk
git checkout YOUR_REVIEWED_0_5_0_REF
npm ci --ignore-scripts
npm run build
npm pack --ignore-scripts
```

The final command creates `pdex-sdk-0.5.0.tgz`. Install that exact tarball in
your application while continuing to suppress dependency lifecycle scripts:

```bash
npm install --save-exact /path/to/pdex-sdk-0.5.0.tgz --ignore-scripts
```

## Updating to 0.5.0 (breaking)

Coordinate activation with the position-identity contract upgrade. Prepare and
test beforehand; new transaction builders are not compatible with the older
contracts. Rebuild cached unsigned transactions and reload clients at cutover.

- Update position/order parsers and protocol definitions, including your own
  backend or indexer. Use `position_id` to distinguish position lifetimes;
  verified existing positions have ID zero. Never substitute zero for missing data.
- Direct decrease/close and order-submission ABIs changed. Use the updated
  builders even for manual closes and standalone limit entries.
- Existing-position TP/SL requires `expectedPositionId`. Use the attachment
  helpers for same-group entries and pending brackets. See the
  [order integration notes](./INTEGRATION_GUIDE.md#position-bound-orders-050).
- Refresh order storage funding and resource preparation through SDK helpers.
  Entry/increase order builders need the market's current yield registry.
- Old TP/SL and linked entry brackets retire, with refunds, rather than trade.
  Tell affected users to recreate protection; old standalone entries remain valid.
  Treat orphan/legacy cancellation receipts as cancellations, not trading volume.

Existing position balances need no migration. LP and swap ABIs are unchanged.

## Oracle consumption (since 0.4.0)

Oracle support consumes published signed payloads: fetch, decode, verify, and
pass the received bytes to transaction builders. Oracle requests select the
application and market or asset; they do not accept custom prices or timestamps.
Fetch with `v2OracleArgs()` and use its returned message and signature unchanged.

## Corrections included from 0.3.2

Builders using an earlier version should upgrade and rebuild their application.
Version 0.3.2 adds single-token funding and native-ALGO backing corrections.
It includes the 0.3.1 corrections to position health, admission, funding and borrowing
breakdowns, unsigned previews for rekeyed accounts, and composition of groups
containing repeated Math helper calls. It also exports `quoteV2LiquidationPrice`.

The minimum collateral setting remains an admission requirement. Falling below
it alone does not make an existing position liquidatable; maintenance equity
includes accrued costs, close fees, and capped negative liquidation impact.
Use `post_action_liquidatable` to assess an ADL survivor separately from
`adl_survivor_contract_admissible`, which describes emergency admissibility.

The 0.3.2 corrections introduced no new required inputs relative to 0.3.0;
0.5.0 has the breaking changes above. From 0.2.x, also apply the
[recall preparation migration](./INTEGRATION_GUIDE.md#recall-preparation).
Rebuild and regroup unsigned transactions with the updated SDK before signing.

## Initialize

For browser applications, the integration helper loads and normalizes the
public context in one call:

```ts
import { loadPdexContext } from "@pdex/sdk/integration";

const pdex = await loadPdexContext({
  baseUrl: import.meta.env.VITE_BUILDER_API_URL, // Your compatible backend.
  publicArtifactBaseUrl: "https://pub-1e72beea87f04ebfafce248132310425.r2.dev/mainnet",
  network: "mainnet",
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
  baseUrl: import.meta.env.VITE_BUILDER_API_URL,
  publicArtifactBaseUrl: "https://pub-1e72beea87f04ebfafce248132310425.r2.dev/mainnet",
  network: "mainnet",
});

await pdex.loadProtocol();

const [deployment, bootstrap, resources] = await Promise.all([
  pdex.deployment("mainnet"),
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

Backend quote methods call your compatible server for trading,
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

## Closing positions and preparing payouts

Version 0.3.0 requires explicit recall preparation for payout builders. Existing
calls that omitted `yieldRecallMode` now fail before a wallet request. Use
`prepareV2DecreaseOrCloseTransactions(client, input, suggestedParams)` for pair
closes: it loads recall policy and resources, authorizes bounded recall for both
possible output assets, and builds the complete group. The contract withdraws
from yield only when the market needs it at execution time.

See the [recall preparation workflow](./INTEGRATION_GUIDE.md#recall-preparation)
for the close example and other payout families. A normal price quote alone is
not recall preparation.

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
