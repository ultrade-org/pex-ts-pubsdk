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

Obtain and pin the public protocol definition using
[Protocol definitions from R2](./BACKEND_INTEGRATION.md#protocol-definitions-from-r2).
Your backend serves that copy through its `/v2/protocol` route.

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
Match V4 active protection by owner, market, collateral, side **and ID**.
Match legacy V3 protection by those coordinates without an ID comparison; a
legacy waiting child becomes eligible after its parent is absent.
Use the SDK attachment helpers for entry-plus-TP/SL groups; they derive the
same-group references. Pending bracket children bind when their entry fills.

Use updated parsers for both legacy V3 and new V4 orders. Legacy TP/SL and linked
brackets keep their original coordinate matching and execution. V4 protection
binds a specific position ID. Legacy triggers may affect a reopened position at
the same coordinates; recreating them to gain V4 binding is optional. Keep
orphan cancellations separate from trades.
Use SDK storage constants and supply the current `marketYieldRegistry` when
building entry/increase orders so automatic cost settlement has its resources.
If an attachment group exceeds the chain limit, do not split it silently: obtain
explicit approval for an entry followed by protection, using the confirmed ID,
and report the position as unprotected if the second step fails.

### Building TP/SL orders

Choose the helper that matches the user's action:

| Action | Helper | Position binding |
| --- | --- | --- |
| Market entry/increase plus TP/SL, atomically | `buildV2MarketOpenWithAttachedOrdersTransactions` | SDK derives the entry offset; contract binds the actual resulting position. |
| Limit entry plus bracket TP/SL | `buildV2OpenLimitWithAttachedOrdersTransactions` | Children wait for the entry to fill, then bind its position. An immediately filled entry binds in the same group. |
| Add TP/SL to an already-open position | `buildV2ActiveAttachedOrdersTransactions` | Supply its freshly read `expectedPositionId`. No entry transaction is created. |

**Time in force is not zero-based.** Import `TIME_IN_FORCE` from
`@pdex/sdk/constants`: `GTC = 1`, `GTD = 2`, `IOC = 3`. Linked orders (including
bracket entries and both children) allow only GTC or GTD. Standalone
`buildV2SubmitOrderTransactions` also supports IOC. Invalid values throw during
construction in 0.6.4; `0` never means GTC.

Each child's setting is resolved as `leg.timeInForce ?? childTimeInForce ??
TIME_IN_FORCE.GTC`. The limit parent's `timeInForce` does **not** become the
child default. Set both deliberately when needed. GTD requires `expiryTime`
(or `childExpiryTime` for children) in **Unix seconds**, later than the current
chain timestamp and within the current `max_gtd_expiry_seconds` policy. The
contract checks that deadline at submission; the SDK's enum check does not
certify that an expiry is valid. GTC can use expiry zero.

For a pair-market entry, obtain **two separately targeted published oracle
payloads**. The entry uses Trading; each child uses OrderOps. Never reuse the
Trading payload for an OrderOps call. Fetch these through your configured
client's R2 oracle source; do not create or alter signed payloads.

```ts
import {
  buildV2MarketOpenWithAttachedOrdersTransactions,
  V2_ORDER_TARGET,
} from "@pdex/sdk/transactions";
import { TIME_IN_FORCE } from "@pdex/sdk/constants";

// entryInputs: your prepared market-entry inputs, including sender, manifest,
// current deployment app IDs, market/asset IDs, side, collateral, size,
// acceptable entry price, and current marketYieldRegistry.
// tp/slTriggerPrice and tp/slAcceptablePrice: the user's validated Price12 values.
// keeperFeeRaw: per-child fee in collateral token base units, meeting current policy.
const entryOracle = await pdex.v2OracleArgs({
  marketId: entryInputs.marketId,
  appId: entryInputs.v2TradingAppId,
  target: "trading",
});
const orderOracle = await pdex.v2OracleArgs({
  marketId: entryInputs.marketId,
  appId: entryInputs.v2OrderOpsAppId,
  target: "order_ops",
});
const childOracle = {
  oracleMessage: orderOracle.message,
  oracleSignature: orderOracle.signature,
};
const protection = {
  baseOrderId: unusedBaseOrderId,
  childTimeInForce: TIME_IN_FORCE.GTC,
  childKeeperFeeAmount: keeperFeeRaw,
  takeProfit: {
    ...childOracle,
    triggerPrice: tpTriggerPrice,
    acceptablePrice: tpAcceptablePrice,
    sizeUsdDelta: protectedSizeUsd,
  },
  stopLoss: {
    ...childOracle,
    triggerPrice: slTriggerPrice,
    acceptablePrice: slAcceptablePrice,
    sizeUsdDelta: protectedSizeUsd,
  },
};
const transactions = buildV2MarketOpenWithAttachedOrdersTransactions({
  ...entryInputs,
  ...protection,
  targetKind: V2_ORDER_TARGET.PAIR,
  oracleMessage: entryOracle.message,
  oracleSignature: entryOracle.signature,
}, suggestedParams);
```

For an existing position, use `buildV2ActiveAttachedOrdersTransactions` with
its matching owner/market/collateral/side, `expectedPositionId:
selectedPosition.position_id`, and the same `protection` fields. Supply the
OrderOps oracle at the top level too. Do not guess the ID or substitute zero
for an unsuccessful read. For a limit entry, use
`buildV2OpenLimitWithAttachedOrdersTransactions` with your prepared limit-order
inputs, top-level OrderOps oracle, explicit parent `timeInForce`, and the same
`protection` fields. Let the helper set child IDs, link modes and offsets;
never hand-set these to imitate another flow. Single-token entries use
`V2_ORDER_TARGET.SINGLE_TOKEN`, their backing asset and SingleTokenTrading
oracle for the entry; children still use OrderOps.

Required preparation details:

- Reserve an unused base ID for the owner and its two child IDs: TP = base + 1,
  SL = base + 2. Include only the requested leg(s). Keep each child's requested
  reduction within the intended position size; the default is the input
  `sizeUsdDelta`, which may only be the increase amount on an existing position.
- Prices use Price12 (`1 USD = 10^12`); size uses micro-USD (`1 USD = 10^6`).
  Amounts/keeper fees use token base units. Use bigint or decimal strings.
- Long TP triggers at index minimum **>=** trigger; long SL at **<=** trigger.
  Short TP triggers at index maximum **<=** trigger; short SL at **>=** trigger.
  Both long reductions require acceptable price **<=** trigger; both short
  reductions require acceptable price **>=** trigger. Acceptable price is the
  user's execution limit; a crossed trigger alone does not guarantee a fill.
- Fund each child's keeper fee in its collateral asset according to current
  order policy. Keep SDK storage/fee defaults unless you have a verified reason
  to override them. There is no separate OrderOps user-registration step; the
  helper includes escrow transfers, storage funding and resource carriers.
- Simulate the **complete returned group**, then sign and submit it atomically.
  Preserve its order and grouping; refresh expired oracle payloads and rebuild.
  Do not silently submit an unprotected entry after an attachment build failure.
  Confirm receipts and stored orders before displaying protection as active.

Active linked children are stored for keeper execution even if already crossed.
Standalone TP/SL submissions have different immediate-execution behavior; see
[Already-triggered TP and SL submissions](#already-triggered-tp-and-sl-submissions).

### Direct closes and margin withdrawals (0.6.0)

All pair and single-token decrease/close and margin-withdrawal builders require
`expectedPositionId`, including transaction and asynchronous preparation helpers.
Use the ID of the position the user selected, checked against current chain state:

```ts
const call = buildV2DecreaseOrCloseCall({
  ...closeInputs,
  expectedPositionId: selectedPosition.position_id,
});
```

An explicitly verified zero is valid. If the selected position has been replaced,
refresh the view and ask the user to review it; do not silently substitute the new
ID. The signed ID also protects against a replacement after the pre-signing read.
Omission and invalid IDs throw. The explicit `UNCHECKED_CLOSE_POSITION_ID` opt-out
is only for intentional coordinate-only execution, never for missing state or TP/SL.
Margin deposits and position increases do not gain a new required input.

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

### Dynamic OI margin configuration (`doi:`)

The canonical manifest entry is `boxes.formats.dynamic_oi_margin_config`.
If your cached manifest predates this entry, add the following entry to its
`boxes.formats` object. This documents an existing layout, not an on-chain
migration. Pin it with the SDK version in your backend.

```json
{
  "dynamic_oi_margin_config": {
    "example_key_size": 12,
    "example_mbr_microalgos": 20100,
    "fields": [
      {
        "name": "version",
        "size": 8,
        "type": "uint64"
      },
      {
        "name": "flags",
        "size": 8,
        "type": "uint64"
      },
      {
        "name": "long_factor",
        "size": 8,
        "type": "uint64"
      },
      {
        "name": "short_factor",
        "size": 8,
        "type": "uint64"
      }
    ],
    "key_parts": [
      "prefix",
      "market_id:uint64"
    ],
    "owner_app": "PDexV2TradingRiskOps",
    "prefix_hex": "646f693a",
    "value_size": 32,
    "value_type": "DynamicOiMarginConfigV1"
  }
}
```

Read from **PDexV2TradingRiskOps**, using `v2DynamicOiMarginBoxKey(marketId)`
from `@pdex/sdk/boxes`. The key is ASCII `doi:` followed by the market ID as
an 8-byte big-endian uint64. Decode with `decodeV2DynamicOiMarginConfig` from
`@pdex/sdk/v2Risk`; it validates the length, version and flags.

The 32-byte value contains four big-endian uint64s: `version` at offset 0,
`flags` at 8, `long_factor` at 16, and `short_factor` at 24. Version is 1;
flags 0 disables the feature and requires zero factors; flags 1 enables it
and requires at least one nonzero factor. Factors use scale `10^12`, not raw
basis points: dynamic margin bps is
`min(10000, floor(side_oi_after_micro_usd * side_factor / 10^12))`.
The effective initial margin is the greater of the base requirement and this
value. Use the SDK's risk calculations; do not reinterpret an unknown version.

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

### Order receipt codes

Import `V2_ORDER_STATUS` and `V2_ORDER_BRACKET_CLEANUP_REASON` from `@pdex/sdk`
or `@pdex/sdk/constants`. Constants are numbers; decoded receipt values remain
`bigint`, so compare with `BigInt(V2_ORDER_STATUS.POSITION_MISSING)`, for example.
The manifest also describes these mappings in `receipts.enums`; each affected
receipt's `field_enums` maps the field name to its registry name. Older manifests
without this metadata still decode identically.

`v2_order_bracket_cleanup` (235), `reason`:

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `PARENT_CANCELLED` | Entry was cancelled; its attached child was removed. |
| 2 | `PARENT_EXPIRED` | Expired entry was cancelled; its attached child was removed. |
| 3 | `OCO_SIBLING_CANCELLED` | Linked TP/SL executed; the other child was removed. |
| 4 | `PARENT_RETIRED` | Reserved historical value; not emitted by current contracts. |

Remove the order identified by **`owner` + `child_order_id`**, not
`base_order_id`. The receipt reports storage refund, keeper-fee refund and
keeper-fee payment separately.

`V2_ORDER_STATUS` applies to submitted (230), executed (231) and cancelled
(232) receipts:

| Code | Name | Meaning |
| --- | --- | --- |
| 1 | `STORED` | Resting order stored. |
| 2 | `EXECUTED_IMMEDIATELY` | Filled during submission. |
| 3 | `IOC_NOT_FILLED` | Immediate-or-cancel order did not fill. |
| 4 | `EXECUTED` | Previously stored order executed. |
| 5 | `CANCELLED` | Owner cancelled the order. |
| 6 | `EXPIRED_CANCELLED` | Expired order cancelled. |
| 7 | `POSITION_MISSING` | Execution attempt cancelled a reduce order whose position no longer exists. |
| 8 | `POSITION_REPLACED` | Execution attempt cancelled a V4 reduce order whose stored position ID no longer matches. |
| 9 | `LEGACY_RETIRED` | Reserved historical value; not emitted by current contracts. |

Codes 5–9 belong to `v2_order_cancelled`. Codes **7/8 are successful cleanup,
not fills or failed transactions**: remove `owner` + `owner_order_id`. The
executor receives the stored keeper fee and the owner receives the storage
refund. Cleanup requires an execution attempt; closing a position alone does
not immediately emit these codes. Eligible orphan cleanup does not require the
price trigger to be met. Legacy V3 orders still use coordinate matching, so code
8 applies only to V4 orders. Owner cancellation or linked-sibling cleanup can
remove an order before codes 7/8 are ever observed.

Preserve unknown future numeric codes instead of treating them as fills or
mapping them to a known reason.
