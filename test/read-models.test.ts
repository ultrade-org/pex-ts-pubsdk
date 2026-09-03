import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeV2AccountActivity,
  normalizeV2AccountMargin,
  normalizeV2LiquidityPosition,
  normalizeV2MarketSummary,
  normalizeV2Order,
  normalizeV2Position,
  pdexBigInt,
} from "../src/readModels.js";

test("market summary normalization produces UI-ready identifiers, assets, prices, and integer values", () => {
  const summary = normalizeV2MarketSummary({
    last_indexed_round: 123,
    markets: [{
      market_id: 7,
      index_asset_id: 100,
      long_asset_id: 100,
      short_asset_id: 200,
      backing_asset_id: 100,
      collateral_asset_ids: [0, 200, 200],
      builder_family: "two_token",
      position_conversion_scale: "1000000000",
      index_price: "2500000000000",
      virtual_long_oi_usd: "4000000",
    }],
    pools: [{
      pool_id: 70,
      market_id: 7,
      long_asset_id: 100,
      short_asset_id: 200,
      long_pool_amount: "9000000",
      short_pool_amount: "8000000",
      lp_supply: "7000000",
    }],
    product_catalog: {
      index_markets: { "100": { symbol: "ALGO", quote_symbol: "USD" } },
      custody_assets: {
        "100": { symbol: "pALGO", display_name: "pALGO", decimals: 6 },
        "200": { symbol: "USDC", display_name: "USDC", decimals: 6 },
      },
      market_definitions: { "7": { symbol: "ALGO/USD", display_name: "ALGO Perpetual" } },
    },
  });

  assert.equal(summary.indexedRound, 123);
  assert.equal(summary.markets[0].marketId, "7");
  assert.equal(summary.markets[0].defaultPoolId, "70");
  assert.equal(summary.markets[0].displayName, "ALGO Perpetual");
  assert.deepEqual(summary.markets[0].collateralAssetIds, [0, 200]);
  assert.equal(summary.markets[0].positionTokenScale, 1_000n);
  assert.equal(summary.markets[0].prices.index, 2_500_000_000_000n);
  assert.equal(summary.pools[0].longAmount, 9_000_000n);
  assert.equal(summary.catalog.custodyAssets.get(200)?.symbol, "USDC");
});

test("integer normalization rejects unsafe or non-integer JavaScript numbers", () => {
  assert.equal(pdexBigInt(Number.MAX_SAFE_INTEGER + 1, 7n), 7n);
  assert.equal(pdexBigInt(1.5, 7n), 7n);
  assert.equal(pdexBigInt("9007199254740993"), 9_007_199_254_740_993n);
});

test("account read normalization preserves raw values while exposing stable camel-case fields", () => {
  const position = normalizeV2Position({
    owner: "ADDR",
    market_id: "7",
    side: 1,
    size_usd: "5000000",
    collateral_amount: "1000000",
    collateral_asset_id: 200,
  });
  const order = normalizeV2Order({
    owner: "ADDR",
    owner_order_id: "9",
    market_id: 7,
    order_type: 1,
    size_usd_delta: "2000000",
    keeper_fee_amount: "50000",
    trigger_price: "2400000000000",
  });
  const lp = normalizeV2LiquidityPosition({ owner: "ADDR", market_id: 7, share_amount: "3000000" });
  const margin = normalizeV2AccountMargin({
    equity_usd: "6000000",
    indexed_round: 123,
    positions: [{ market_id: 7, equity_usd: "6000000", pnl_usd: "-100000" }],
  });
  const activity = normalizeV2AccountActivity({
    next_cursor: "cursor-2",
    activities: [{ activity_key: "a-1", root_tx_id: "TX", market_id: 7, detail: { amount: "1" } }],
  });

  assert.equal(position.sizeUsd, 5_000_000n);
  assert.equal(order.orderId, "9");
  assert.equal(order.triggerPrice, 2_400_000_000_000n);
  assert.equal(lp.shares, 3_000_000n);
  assert.equal(margin.positions[0].pnlUsd, -100_000n);
  assert.equal(activity.nextCursor, "cursor-2");
  assert.equal(activity.activities[0].marketId, "7");
  assert.equal(activity.activities[0].detail.amount, "1");
});
