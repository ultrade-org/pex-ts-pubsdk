# PDex V2 Integration Guide

This guide describes the browser and wallet sequence for a PDex application.
For a continuous example, start with [QUICKSTART.md](./QUICKSTART.md).
First implement the required [builder-operated backend](./BACKEND_INTEGRATION.md).
This package does not include a server, and the integration does not use PEX's
hosted backend API.

## 1. Create the client

```ts
import { createPdexApiClient } from "@pdex/sdk/api";

const pdex = createPdexApiClient({
  baseUrl: import.meta.env.VITE_BUILDER_API_URL,
  publicArtifactBaseUrl: import.meta.env.VITE_PDEX_ARTIFACT_URL,
  network: "mainnet",
  accountSessionToken: () => currentAccountToken,
});
```

Use the MainNet artifact URL and builder-owned API/node settings in
[Configuration](./BACKEND_INTEGRATION.md#configuration).
`publicArtifactBaseUrl` enables latest-price and signed-oracle bundle reads.
Oracle payload reads can fall back to your configured backend; latest-price
artifact errors fail the read. No fallback selects a PEX-operated backend.

## 2. Load protocol resources

Most browser applications can replace the separate setup calls with:

```ts
import { loadPdexContext } from "@pdex/sdk/integration";

const pdex = await loadPdexContext({ baseUrl, publicArtifactBaseUrl, network });
```

The returned context contains normalized markets and pools, the public catalog,
resolved app and asset IDs, and `appRefs` ready to spread into pair-market
transaction builders.

Call `loadProtocol()` once before parsing state or building transactions. Use
`deployment()`, `v2SdkBootstrap()`, `v2SdkResources()`, and
`v2StaticMetadataCurrent()` to resolve application IDs, asset IDs, feature
flags, box prefixes, and display metadata from one deployment generation.

Select pair and single-token builders from the returned `market_family` and
`builder_family` fields.

## 3. Read product state

The primary scoped reads are:

- `v2MarketSummary()`, `v2Markets()`, `v2Market()`, `v2Pools()`, and `v2Pool()`;
- `v2LatestPrice()` and `v2PriceCandles()`;
- `v2PoolPerformance()` and `v2CvaPerformance()`;
- `v2OrderPolicy()` and the order read methods;
- the CVA vault, allocation, and account methods;
- the market-yield strategy, observation, health, and resource methods.

Cache responses according to their HTTP headers. Treat stale price, oracle,
deployment, or indexed-state signals as a blocked preparation state.

Use `@pdex/sdk/readModels` to convert JSON integer strings and snake-case public
records into stable camel-case models with `bigint` amounts. Every normalized
model retains its original record in `raw` for forward-compatible access.

## 4. Authenticate account reads

Create the canonical message with `buildAccountSessionMessage()`, have the
connected Algorand account sign those exact bytes, and exchange the signature
through `createAccountSession()`. Configure the resulting bearer token on the
client with `setAccountSessionToken()`.

The authenticated account methods cover:

- trader state and margin;
- positions, orders, and LP balances;
- confirmed trades and paginated activity;
- CVA share state.

Use `logoutAccountSession()` when the wallet disconnects or the application
ends the session.

`authorizePdexAccount()` provides the standard browser flow when the wallet can
sign arbitrary bytes. It creates the canonical message, invokes the supplied
signing callback, exchanges the signature, and configures the client token.

## 5. Quote with fresh inputs

Local quote modules provide deterministic previews for positions, margin,
liquidity, swaps, orders, CVA, liquidation, health, and position-cost
resolution. Backend quote methods can be used for server confirmation.

Keep integer domains intact:

- token and USD amounts are integer Amount6/Usd6 values;
- signed prices are Price12 decimal strings or `bigint` values;
- market position quantity uses its manifest-defined scale;
- values above JavaScript's safe integer range remain strings or `bigint`.

## Recall preparation

Every payout transaction needs a current recall plan. This includes closes,
margin withdrawals, LP withdrawals, swaps, order execution, liquidations, and
market-routed CVA withdrawals. Recall authorization is included even when idle
cash currently covers the quote; the contract checks the actual shortfall at
execution. This adds resource carriers and a worst-case fee budget even when
no provider withdrawal occurs.

For pair closes, use the prepared builder instead of calling the synchronous
builder with omitted recall fields:

```ts
import { prepareV2DecreaseOrCloseTransactions } from "@pdex/sdk/transactions";

const transactions = await prepareV2DecreaseOrCloseTransactions(
  pdex.client,
  {
    ...pdex.appRefs,
    ...pdexMarketAssetRefs(market),
    sender: address,
    marketId: market.marketId,
    collateralAssetId,
    side,
    sizeUsdDelta,
    acceptablePrice,
    minPrimaryOutput: minCollateralOutput,
    minSecondaryOutputAmount: minPnlOutput,
    oracleMessage: oracle.message,
    oracleSignature: oracle.signature,
  },
  suggestedParams,
);
```

The helper plans both possible payout assets, including native ALGO `0`, even
when a preview reports no PnL output. An optional fourth argument supplies
known `{ assetId, requiredHotAmount }` outputs for an early liquidity check.
Those preview quantities never set the final on-chain payout.

For other payout builders, call `prepareV2ActionRecall` from
`@pdex/sdk/marketYield` with the market ID, `expectedMarketsAppId` from the deployment,
`expectedNetwork` (or the configured client network), **every possible output asset ID**,
and any known quote outputs. It returns `yieldRecallMode`,
`marketYieldRegistry`, and `capForAsset(assetId)`. Pass the returned mode and
registry plus the corresponding builder cap fields:

| Builder family | Receipt cap fields |
| --- | --- |
| Pair close, margin withdrawal, LP withdrawal, liquidation, market-routed CVA withdrawal | `maxLongReceiptAmount`, `maxShortReceiptAmount` |
| Single-token payouts | `maxBackingReceiptAmount` |
| Direct swap | `maxOutputReceiptAmount` for the output token |
| Two-hop swap | Prepare each market separately; `maxOutputReceiptAmount0`, `maxOutputReceiptAmount1` and matching registry resources |
| Pair order execution | `maxLongReceiptAmount`, `maxShortReceiptAmount` |

The planner authorizes available receipts within configured limits. Do not
replace those caps with an unlimited integer or turn off recall because the
preview says none is currently necessary. Missing or inconsistent metadata,
provider blockers, or unavailable planning must stop preparation.

Low-level synchronous builders remain available for callers that supply a
complete plan themselves. `yieldRecallMode: 0` is an explicit advanced choice;
it must not be used as a migration shortcut to silence the preparation error.
Use the prepared result, including its explicit zero mode for a market with no
configured yield. The SDK cannot secure transactions constructed by other
clients or replace contract enforcement of market-owned liquidity.

### Position-bound orders (0.5.0)

Read the current position's `position_id` and pass it as `expectedPositionId`
when adding protection to that position, including an explicitly verified zero.
Match displayed active protection by owner, market, collateral, side **and ID**.
Use the SDK attachment helpers for entry-plus-TP/SL groups; they derive the
same-group references. Pending bracket children bind when their entry fills.

Use updated parsers for both legacy V3 and new V4 orders. Legacy TP/SL and linked
brackets no longer protect positions after cutover and must be recreated. Keep
orphan and legacy-retirement cancellation outcomes separate from executed trades.
Use SDK storage constants and supply the current `marketYieldRegistry` when
building entry/increase orders so automatic cost settlement has its resources.
If an attachment group exceeds the chain limit, do not split it silently: obtain
explicit approval for an entry followed by protection, using the confirmed ID,
and report the position as unprotected if the second step fails.

### Already-triggered TP and SL submissions

Standalone `submit_order` can execute immediately when its signed OrderOps
oracle has already crossed the trigger. That inline branch has no recall-cap
arguments. For a crossed TP/SL, obtain a Trading (or SingleTokenTrading) oracle,
recheck the trigger against that exact message, and submit the recall-prepared
close instead. Use index minimum for a long and index maximum for a short;
TP crosses at `>=` for long and `<=` for short, SL at `<=` for long and `>=`
for short. Preserve size, acceptable price and minimum output, and pass the
verified `expectedPositionId` to the direct close builder. If the trigger
is no longer crossed, refresh rather than signing a direct close. For GTD,
require the close oracle's expiry to be strictly before the order deadline;
otherwise stop and request a later deadline. The contract oracle age limit
then also bounds the close by the user's deadline.

Uncrossed orders remain stored, and their signed oracle fixes that submission
decision during wallet signing. Keeper `execute_order` must prepare its own
fresh recall plan. Active linked child TP/SL orders are stored even when
crossed and use this keeper path. Do not assume that passing recall resources
alone adds recall authorization to standalone submission.

## 6. Fetch signed oracle data

Use `v2OracleArgs()` with the destination application ID and action target. The
helper validates protocol version, message version, Price12 scale, and integer
encoding before returning message and signature bytes.

```ts
const oracle = await pdex.v2OracleArgs({
  marketId,
  appId: tradingAppId,
  target: "trading",
});
```

Refresh oracle data during the final pre-sign preparation pass.

## 7. Build the complete group

Transaction builders are available for these application flows:

| Flow | Builder family |
| --- | --- |
| Pair liquidity | `buildV2DepositLiquidityTransactions`, `buildV2WithdrawLiquidityTransactions`, `buildV2WithdrawLiquidityWithSwapTransactions` |
| Pair swaps | `buildV2SwapExactInTransactions`, `buildV2SwapRouteExactInTransactions` |
| Pair positions | `buildV2OpenOrIncreaseTransactions`, `buildV2AddPositionMarginTransactions`, `buildV2WithdrawPositionMarginTransactions`, `buildV2DecreaseOrCloseTransactions`, `buildV2DecreaseOrCloseWithSwapTransactions`, `buildV2LiquidateTransactions` |
| Stored orders | `buildV2SubmitOrderTransactions`, `buildV2SubmitLinkedOrderTransactions`, `buildV2MarketOpenWithAttachedOrdersTransactions`, `buildV2ActiveAttachedOrdersTransactions`, `buildV2OpenLimitWithAttachedOrdersTransactions`, `buildV2ExecuteOrderTransactions`, `buildV2CancelOrderTransactions`, `buildV2CancelExpiredOrderTransactions` |
| Single-token liquidity | `buildV2SingleTokenDepositLiquidityTransactions`, `buildV2SingleTokenWithdrawLiquidityTransactions` |
| Single-token positions | `buildV2SingleTokenOpenOrIncreaseTransactions`, `buildV2SingleTokenAddPositionMarginTransactions`, `buildV2SingleTokenWithdrawPositionMarginTransactions`, `buildV2SingleTokenDecreaseOrCloseTransactions`, `buildV2SingleTokenLiquidateTransactions` |
| CVA | `buildV2CvaDepositTransactions`, `buildV2CvaWithdrawTransactions`, `buildV2CvaWithdrawFromMarketTransactions` |
| Freshness | `buildV2MarketYieldPublicMarkCalls` |

Storage-first variants combine initial storage funding with the requested
position action. Planner helpers return structured validation failures and a
resource manifest for supported flows.

### Builder fees

Supported pair-position, pair-order, and direct-swap inputs accept
`builderFee: { builderAddress, builderFeeBps }`. Position and order fees are
capped at 10 bps and swaps at 100 bps. Quote results report the builder amount
and total wallet debit; transaction builders add the authorized transfer and
adjust the primary index automatically. Always display the fee and final debit
before requesting a wallet signature.

## 8. Review, sign, and confirm

Immediately before wallet signing:

1. refresh scoped market, pool, account, and oracle data;
2. recompute the quote and transaction group;
3. present amounts, assets, applications, fees, and group size to the user;
4. pass the complete group to the wallet in the returned order;
5. submit the signed group and wait for Algorand confirmation;
6. refresh account and market state from the confirmed-chain backend.

Any material quote change starts a new user review.

`submitPdexTransactionGroup()` implements steps 4 through 5 for any transaction
array returned by a PDex builder. It rejects missing signatures, submits the
complete group, waits for confirmation, and returns the decoded receipt.
