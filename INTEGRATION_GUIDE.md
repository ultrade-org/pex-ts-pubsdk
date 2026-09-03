# PDex V2 Integration Guide

This guide describes the browser and wallet sequence for a PDex application.
For a continuous example, start with [QUICKSTART.md](./QUICKSTART.md).

## 1. Create the client

```ts
import { createPdexApiClient } from "@pdex/sdk/api";

const pdex = createPdexApiClient({
  baseUrl: import.meta.env.VITE_PDEX_BACKEND_URL,
  publicArtifactBaseUrl: import.meta.env.VITE_PDEX_ARTIFACT_URL,
  network: "testnet",
  accountSessionToken: () => currentAccountToken,
});
```

`publicArtifactBaseUrl` enables cache-friendly latest-price and signed-oracle
reads with automatic backend fallback.

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
