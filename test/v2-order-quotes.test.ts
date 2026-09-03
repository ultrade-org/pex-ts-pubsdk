import assert from "node:assert/strict";
import test from "node:test";
import {
  TIME_IN_FORCE,
  V2_OPEN_ORDER_EXECUTION_STORAGE_ESCROW_MICRO_ALGO,
  V2_ORDER_BOX_MBR_MICRO_ALGO,
  V2_ORDER_KIND,
  V2_ORDER_OPS_INLINE_EXECUTION_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_OPS_DECREASE_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_TARGET,
  quoteV2DecreaseOrder,
  quoteV2ExecuteOrder,
  quoteV2OpenLimitOrder,
} from "../src/index.js";

const BTC = 11n;
const USDC = 12n;
const OWNER = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
const p = (price6: bigint): bigint => price6 * 1_000_000n;

test("V2 open-limit order quote executes crossed pair orders", () => {
  const quote = quoteV2OpenLimitOrder({
    market: marketState(),
    pool: poolState(),
    owner: OWNER,
    ownerOrderId: 1n,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    collateralAmount: 6_000_000n,
    triggerPrice: p(50_100_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.type, "v2_open_limit_order_quote");
  assert.equal(quote.crossed, true);
  assert.equal(quote.submission_result, "execute_immediately");
  assert.equal(quote.required_storage_payment_microalgo, BigInt(V2_OPEN_ORDER_EXECUTION_STORAGE_ESCROW_MICRO_ALGO));
  assert.equal(quote.required_flat_fee_microalgos, BigInt(V2_ORDER_OPS_INLINE_EXECUTION_METHOD_FLAT_FEE_MICRO_ALGO));
  assert.equal(quote.escrow_amount, 6_005_000n);
  assert.equal((quote.execution_quote as Record<string, unknown>).type, "v2_open");
});

test("V2 open-limit order quote rejects under-margined resulting positions", () => {
  const quote = quoteV2OpenLimitOrder({
    market: marketState({ initial_margin_bps: 2_000n }),
    pool: poolState(),
    position: longPosition({
      size_usd: 50_000_000n,
      size_tokens: 1_000_000n,
      collateral_amount: 5_050_000n,
    }),
    owner: OWNER,
    ownerOrderId: 11n,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    collateralAmount: 2_010_000n,
    triggerPrice: p(50_100_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal(quote.submission_result, "blocked");
  assert.equal((quote.execution_quote as Record<string, unknown>).type, "v2_open");
  assert.equal(
    ((quote.execution_quote as Record<string, unknown>).failure_reasons as string[]).includes("initial_margin_breach"),
    true,
  );
});

test("V2 open-limit order quote stores resting GTC and refunds resting IOC", () => {
  const base = {
    market: marketState(),
    pool: poolState(),
    owner: OWNER,
    ownerOrderId: 2n,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    collateralAmount: 6_000_000n,
    triggerPrice: p(49_000_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_max: p(50_000_000_000n) }),
  };
  const gtc = quoteV2OpenLimitOrder({ ...base, timeInForce: TIME_IN_FORCE.GTC });
  const ioc = quoteV2OpenLimitOrder({ ...base, ownerOrderId: 3n, timeInForce: TIME_IN_FORCE.IOC });

  assert.equal(gtc.ok, true);
  assert.equal(gtc.crossed, false);
  assert.equal(gtc.submission_result, "store");
  assert.equal(gtc.required_flat_fee_microalgos, BigInt(V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO));
  assert.equal(gtc.execution_quote, null);
  assert.deepEqual(gtc.blocking_reasons, ["not_crossed"]);
  assert.equal(ioc.ok, true);
  assert.equal(ioc.submission_result, "ioc_refund");
});

test("V2 open-limit order quote blocks sub-minimum open limit orders before storage", () => {
  const quote = quoteV2OpenLimitOrder({
    market: marketState(),
    pool: poolState(),
    owner: OWNER,
    ownerOrderId: 12n,
    collateralAssetId: USDC,
    side: 2n,
    sizeUsdDelta: 1_990_000n,
    collateralAmount: 2_000_000n,
    triggerPrice: p(51_000_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_min: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal(quote.submission_result, "blocked");
  assert.equal((quote.failure_reasons as string[]).includes("position_too_small"), true);
  assert.equal((quote.blocking_reasons as string[]).includes("not_crossed"), true);
  assert.equal(quote.execution_quote, null);
});

test("V2 open-limit quote warns that opposite-side order opens a separate position", () => {
  const quote = quoteV2OpenLimitOrder({
    market: marketState(),
    pool: poolState(),
    positions: [longPosition()],
    owner: OWNER,
    ownerOrderId: 4n,
    collateralAssetId: USDC,
    side: 2n,
    sizeUsdDelta: 10_000_000n,
    collateralAmount: 6_000_000n,
    triggerPrice: p(51_000_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_min: p(52_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal((quote.warnings as string[]).includes("opposite_side_open_limit_creates_separate_position"), true);
});

test("V2 decrease order quote routes TP and SL crossed orders to decrease quotes", () => {
  const tp = quoteV2DecreaseOrder({
    market: marketState(),
    pool: poolState(),
    position: { ...longPosition(), collateral_amount: 12_000_000n },
    owner: OWNER,
    ownerOrderId: 5n,
    orderKind: V2_ORDER_KIND.DECREASE_TAKE_PROFIT,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    triggerPrice: p(51_000_000_000n),
    acceptablePrice: p(50_500_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_min: p(51_500_000_000n) }),
  });
  const sl = quoteV2DecreaseOrder({
    market: marketState(),
    pool: poolState(),
    position: { ...longPosition(), collateral_amount: 12_000_000n },
    owner: OWNER,
    ownerOrderId: 6n,
    orderKind: V2_ORDER_KIND.DECREASE_STOP_LOSS,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    triggerPrice: p(49_000_000_000n),
    acceptablePrice: p(48_500_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_min: p(48_800_000_000n) }),
  });

  assert.equal(tp.ok, true);
  assert.equal(tp.submission_result, "execute_immediately");
  assert.equal(tp.required_storage_payment_microalgo, BigInt(V2_ORDER_BOX_MBR_MICRO_ALGO));
  assert.equal(tp.required_flat_fee_microalgos, BigInt(V2_ORDER_OPS_DECREASE_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO));
  assert.equal((tp.execution_quote as Record<string, unknown>).type, "v2_decrease");
  assert.equal(sl.ok, true);
  assert.equal((sl.execution_quote as Record<string, unknown>).type, "v2_decrease");
});

test("V2 decrease order quote blocks missing and oversize reduce orders", () => {
  const missing = quoteV2DecreaseOrder({
    market: marketState(),
    pool: poolState(),
    owner: OWNER,
    orderKind: V2_ORDER_KIND.DECREASE_TAKE_PROFIT,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    triggerPrice: p(51_000_000_000n),
    acceptablePrice: p(50_500_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_min: p(51_500_000_000n) }),
  });
  const oversize = quoteV2DecreaseOrder({
    market: marketState(),
    pool: poolState(),
    position: longPosition(),
    owner: OWNER,
    orderKind: V2_ORDER_KIND.DECREASE_TAKE_PROFIT,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 30_000_000n,
    triggerPrice: p(51_000_000_000n),
    acceptablePrice: p(50_500_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_min: p(51_500_000_000n) }),
  });

  assert.equal(missing.ok, false);
  assert.equal((missing.failure_reasons as string[]).includes("position_missing"), true);
  assert.equal(oversize.ok, false);
  assert.equal((oversize.failure_reasons as string[]).includes("reduce_size_exceeds_position"), true);
});

test("V2 order execution quote handles stored orders", () => {
  const quote = quoteV2ExecuteOrder({
    market: marketState(),
    pool: poolState(),
    order: {
      owner: OWNER,
      owner_order_id: 7n,
      order_kind: V2_ORDER_KIND.OPEN_LIMIT,
      target_kind: V2_ORDER_TARGET.PAIR,
      market_id: 7n,
      side: 1n,
      collateral_asset_id: USDC,
      size_usd_delta: 10_000_000n,
      collateral_amount: 6_000_000n,
      trigger_price: p(50_100_000_000n),
      acceptable_price: p(50_100_000_000n),
      keeper_fee_asset_id: USDC,
      keeper_fee_amount: 5_000n,
    },
    prices: prices({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.type, "v2_order_execution_quote");
  assert.equal((quote.execution_quote as Record<string, unknown>).type, "v2_open");
});

test("V2 order execution quote blocks crossed sub-minimum open limit orders", () => {
  const quote = quoteV2ExecuteOrder({
    market: marketState(),
    pool: poolState(),
    order: {
      owner: OWNER,
      owner_order_id: 13n,
      order_kind: V2_ORDER_KIND.OPEN_LIMIT,
      target_kind: V2_ORDER_TARGET.PAIR,
      market_id: 7n,
      side: 2n,
      collateral_asset_id: USDC,
      size_usd_delta: 1_990_000n,
      collateral_amount: 2_000_000n,
      trigger_price: p(49_900_000_000n),
      acceptable_price: p(49_900_000_000n),
      keeper_fee_asset_id: USDC,
      keeper_fee_amount: 5_000n,
    },
    prices: prices({ index_price_min: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal(quote.submission_result, "not_executable");
  assert.equal((quote.failure_reasons as string[]).includes("position_too_small"), true);
  assert.equal(quote.execution_quote, null);
});

test("V2 order quote routes single-token orders and rejects single-token output swaps", () => {
  const singleMarket = marketState({ long_asset_id: USDC, short_asset_id: USDC, long_price: p(1_000_000n) });
  const open = quoteV2OpenLimitOrder({
    market: singleMarket,
    pool: poolState(),
    owner: OWNER,
    targetKind: V2_ORDER_TARGET.SINGLE_TOKEN,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    collateralAmount: 6_000_000n,
    triggerPrice: p(50_100_000_000n),
    keeperFeeAmount: 5_000n,
    prices: prices({ index_price_max: p(50_000_000_000n), long_price: p(1_000_000n) }),
  });
  const decrease = quoteV2DecreaseOrder({
    market: singleMarket,
    pool: poolState(),
    position: longPosition({ collateral_asset_id: USDC }),
    owner: OWNER,
    targetKind: V2_ORDER_TARGET.SINGLE_TOKEN,
    orderKind: V2_ORDER_KIND.DECREASE_TAKE_PROFIT,
    collateralAssetId: USDC,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    triggerPrice: p(51_000_000_000n),
    acceptablePrice: p(50_500_000_000n),
    keeperFeeAmount: 5_000n,
    outputSwapMode: 1n,
    prices: prices({ index_price_min: p(51_500_000_000n), long_price: p(1_000_000n) }),
  });

  assert.equal((open.execution_quote as Record<string, unknown>).type, "v2_single_token_open");
  assert.equal(decrease.ok, false);
  assert.equal((decrease.failure_reasons as string[]).includes("unsupported_output_swap_mode"), true);
});

function marketState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    market_id: 7n,
    index_asset_id: BTC,
    long_asset_id: BTC,
    short_asset_id: USDC,
    position_conversion_scale: 1_000_000_000_000_000n,
    opposing_trader_share_bps: 10_000n,
    index_price: p(50_000_000_000n),
    index_price_min: p(50_000_000_000n),
    index_price_max: p(50_000_000_000n),
    long_price: p(50_000_000_000n),
    long_price_min: p(50_000_000_000n),
    long_price_max: p(50_000_000_000n),
    short_price: p(1_000_000n),
    short_price_min: p(1_000_000n),
    short_price_max: p(1_000_000n),
    min_position_size_usd: 5_000_000n,
    min_collateral_usd: 5_000_000n,
    initial_margin_bps: 1_000n,
    maintenance_margin_bps: 500n,
    dynamic_oi_margin_version: 1n,
    dynamic_oi_margin_flags: 0n,
    dynamic_oi_margin_long_factor_scaled: 0n,
    dynamic_oi_margin_short_factor_scaled: 0n,
    max_open_interest_long: 1_000_000_000_000n,
    max_open_interest_short: 1_000_000_000_000n,
    max_pool_amount_long: 1_000_000_000n,
    max_pool_amount_short: 1_000_000_000_000n,
    max_pool_usd_for_deposit_long: 1_000_000_000_000n,
    max_pool_usd_for_deposit_short: 1_000_000_000_000n,
    reserve_factor_long_bps: 500n,
    reserve_factor_short_bps: 500n,
    max_pnl_factor_for_deposits_bps: 6_000n,
    max_pnl_factor_for_withdrawals_bps: 4_500n,
    max_pnl_factor_for_traders_bps: 6_000n,
    max_pnl_factor_for_adl_bps: 5_500n,
    min_pnl_factor_after_adl_bps: 5_000n,
    position_impact_factor_bps: 10n,
    max_position_impact_bps: 100n,
    swap_impact_factor_bps: 10n,
    max_swap_impact_bps: 100n,
    open_fee_bps: 10n,
    close_fee_bps: 10n,
    liquidation_fee_bps: 50n,
    max_liquidation_impact_bps: 50n,
    funding_factor_milli_bps: 855n,
    funding_interval_seconds: 3_600n,
    base_borrowing_factor_long_milli_bps: 0n,
    base_borrowing_factor_short_milli_bps: 0n,
    full_usage_borrowing_factor_long_milli_bps: 1_142n,
    full_usage_borrowing_factor_short_milli_bps: 1_142n,
    optimal_usage_factor_long_bps: 7_000n,
    optimal_usage_factor_short_bps: 7_000n,
    ...overrides,
  };
}

function poolState(): Record<string, unknown> {
  return {
    market_id: 7n,
    long_pool_amount: 10_000_000n,
    short_pool_amount: 1_000_000_000n,
    market_share_supply: 500_000_000n,
  };
}

function prices(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const base = marketState();
  const index = BigInt((overrides.index_price ?? base.index_price) as bigint);
  let indexMin = BigInt((overrides.index_price_min ?? index) as bigint);
  let indexMax = BigInt((overrides.index_price_max ?? index) as bigint);
  if (overrides.index_price_min !== undefined && overrides.index_price_max === undefined) {
    indexMax = index > indexMin ? index : indexMin;
  } else if (overrides.index_price_max !== undefined && overrides.index_price_min === undefined) {
    indexMin = index < indexMax ? index : indexMax;
  }
  const long = BigInt((overrides.long_price ?? index) as bigint);
  const short = BigInt((overrides.short_price ?? p(1_000_000n)) as bigint);
  return {
    ...base,
    ...overrides,
    index_price: index,
    index_price_min: indexMin,
    index_price_max: indexMax,
    long_price: long,
    long_price_min: long,
    long_price_max: long,
    short_price: short,
    short_price_min: short,
    short_price_max: short,
  };
}

function longPosition(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    owner: OWNER,
    market_id: 7n,
    collateral_asset_id: USDC,
    side: 1n,
    size_usd: 20_000_000n,
    size_tokens: 400_000n,
    collateral_amount: 8_000_000n,
    entry_price: p(50_000_000_000n),
    ...overrides,
  };
}
