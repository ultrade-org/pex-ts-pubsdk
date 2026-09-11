# Browser Quickstart

This walkthrough shows the complete public application path: load deployment
context, select normalized market data, authorize account reads, build a wallet
group, submit it, and decode its receipt.

All token and USD amounts are integer Amount6 values. Oracle prices are Price12
integers. Keep values as `bigint` until formatting them for display.

## 1. Load the current deployment and market catalog

```ts
import { loadPdexContext } from "@pdex/sdk/integration";

const pdex = await loadPdexContext({
  baseUrl: "https://api.example",
  publicArtifactBaseUrl: "https://artifacts.example",
  network: "testnet",
});

const market = pdex.markets.find((item) => item.marketId === "7");
if (!market) throw new Error("Market 7 is unavailable");

const pool = pdex.pools.find((item) => item.marketId === market.marketId);
if (!pool) throw new Error(`Pool for market ${market.marketId} is unavailable`);
```

`loadPdexContext()` loads the protocol manifest first, then resolves deployment
IDs, assets, resources, and a normalized market summary from the same backend.
The original backend records remain available through each model's `raw`
property.

## 2. Authorize wallet-scoped account reads

```ts
import { authorizePdexAccount } from "@pdex/sdk/integration";

const { session } = await authorizePdexAccount({
  client: pdex.client,
  address,
  network: "testnet",
  genesisId,
  genesisHash,
  origin: window.location.origin,
  signMessage: (message) => wallet.signBytes(message),
});

console.log(`Account session expires at ${session.expires_at}`);
```

The helper creates the canonical short-lived message, converts byte signatures
to the backend format, opens the account session, and installs its bearer token
on `pdex.client` for later account reads.

```ts
import {
  normalizeV2AccountMargin,
  normalizeV2Order,
  normalizeV2Position,
} from "@pdex/sdk/readModels";

const account = await pdex.client.v2Account(address);
const positions = account.positions.map(normalizeV2Position);
const orders = account.orders.map(normalizeV2Order);
const margin = normalizeV2AccountMargin(account.margin);
```

## 3. Quote and build a pair-market position group

Obtain fresh suggested parameters from the Algorand node and a target-specific
oracle payload immediately before constructing the group.

```ts
import { SIDE, pdexBigInt } from "@pdex/sdk";
import {
  pdexMarketAssetRefs,
  submitPdexTransactionGroup,
} from "@pdex/sdk/integration";
import { buildV2OpenOrIncreaseTransactions } from "@pdex/sdk/transactions";

if (market.singleToken) {
  throw new Error("Select the single-token builder family for this market");
}

const collateralAssetId = market.collateralAssetIds[0];
if (collateralAssetId === undefined) throw new Error("Market has no collateral asset");
const indicativePrice = market.prices.index;
if (indicativePrice === undefined) throw new Error("Market price is unavailable");
const quote = await pdex.client.v2QuoteOpen({
  owner: address,
  market_id: Number(market.marketId),
  pool_id: Number(pool.poolId),
  side: SIDE.LONG,
  collateral_asset_id: collateralAssetId,
  collateral_amount: collateralAmount,
  size_usd_delta: sizeUsdDelta,
  acceptable_price: indicativePrice,
  current_time: Math.floor(Date.now() / 1_000),
});

if (quote.ok === false) throw new Error(String(quote.failure_reasons));

const acceptablePrice = pdexBigInt(
  quote.acceptable_price,
  indicativePrice,
);
if (acceptablePrice <= 0n) throw new Error("A fresh acceptable price is required");

const oracle = await pdex.client.v2OracleArgs({
  marketId: market.marketId,
  appId: pdex.appRefs.v2TradingAppId,
  target: "trading",
});
const suggestedParams = await algod.getTransactionParams().do();

const transactions = buildV2OpenOrIncreaseTransactions({
  ...pdex.appRefs,
  ...pdexMarketAssetRefs(market),
  sender: address,
  marketId: market.marketId,
  side: SIDE.LONG,
  collateralAssetId,
  collateralAmount,
  sizeUsdDelta,
  acceptablePrice,
  oracleMessage: oracle.message,
  oracleSignature: oracle.signature,
}, suggestedParams);
```

Integrations that charge a disclosed builder fee can add
`builderFee: { builderAddress, builderFeeBps }` to supported pair-position,
stored-order, and direct-swap inputs. Keep the field absent for a zero-fee
action. The SDK enforces the action cap and adds the transfer to both the quote
and transaction group; display that additional debit before wallet signing.

## 4. Review, sign, submit, and confirm

Render the transaction count, transfers, applications, assets, boxes, fees, and
quote expiry for user review before calling the submission helper.

```ts
const result = await submitPdexTransactionGroup({
  transactions,
  algod,
  signTransactions: (group, indexes) => wallet.signTransactions(group, indexes),
  onProgress: ({ phase, txId }) => updateTransactionStatus(phase, txId),
});

console.log(result.txId, result.confirmedRound, result.receipt);
```

The helper signs the complete ordered group, rejects partial wallet results,
submits the signed bytes, waits for confirmation, and decodes a PDex receipt
when one is present.

After confirmation, reload the scoped account and market data. If a refreshed
quote changes materially before signing, present a new review rather than
submitting the earlier group.

## Close the position

Use the asynchronous `prepareV2DecreaseOrCloseTransactions` builder described
in [Recall preparation](./INTEGRATION_GUIDE.md#recall-preparation). It prepares
bounded recall automatically. The opening example above does not replace this
payout preparation step.
