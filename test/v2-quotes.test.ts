import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO,
  V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_OUTPUT_SWAP_COLLATERAL_TO_PNL,
  V2_OUTPUT_SWAP_NONE,
  V2_OUTPUT_SWAP_PNL_TO_COLLATERAL,
  V2_POSITION_COST_QUOTE_VERSION,
  V2_SIDE_LONG,
  V2_SIDE_SHORT,
  calculateV2PositionHealthComponents,
  quoteV2Adl,
  quoteV2CloseOutputSwapPreview,
  quoteV2DecreaseWithOutputSwap,
  quoteV2DecreasePosition,
  quoteV2CvaAllocateToMarket,
  quoteV2CvaDeposit,
  quoteV2CvaMarketWithdraw,
  quoteV2CvaWithdrawRoute,
  quoteV2Liquidation,
  quoteV2LiquidationPrice,
  quoteV2PositionHealth,
  quoteV2LpDeposit,
  maximumV2LpWithdrawableShares,
  quoteV2DirectLpWithdrawCooldown,
  quoteV2LpNavV1,
  quoteV2LpWithdraw,
  quoteV2LpWithdrawWithSwap,
  parseV2MarketFundingBorrowingState,
  quoteV2OpenPosition,
  quoteV2PoolValue,
  quoteV2SingleTokenAdl,
  quoteV2SingleTokenDecrease,
  quoteV2SingleTokenLiquidation,
  quoteV2SingleTokenLpDeposit,
  quoteV2SingleTokenLpWithdraw,
  quoteV2SingleTokenOpen,
  quoteV2SwapExactIn,
  quoteV2SwapRouteExactIn,
} from "../src/index.js";

const SCALE = 1_000_000_000_000n;
const p = (price6: bigint): bigint => price6 * 1_000_000n;
const BTC = 11n;
const USDC = 12n;
const ETH = 13n;

test("V2 CVA deposit projects mandatory active marks before mint", () => {
  const vault = {
    total_cva_shares: 31_974_235n,
    idle_long_amount: 25_000_000n,
    idle_short_amount: 3_000_000n,
    total_allocation_value_usd: 30_000_000n,
    deposit_total_allocation_value_usd: 30_000_000n,
    cva_mint_spread_bps: 20n,
    max_cva_deposit_usd_per_call: 100_000_000_000n,
  };
  const prices = {
    index_price: 88_455_000_000n,
    index_price_min: 88_415_000_000n,
    index_price_max: 88_495_000_000n,
    long_price: 88_415_000_000n,
    long_price_min: 88_415_000_000n,
    long_price_max: 88_495_000_000n,
    short_price: 999_850_000_000n,
    short_price_min: 999_850_000_000n,
    short_price_max: 999_985_000_000n,
  };
  const market = marketState({
    market_id: 7n,
    position_impact_factor_bps: 0n,
  });
  const pool = {
    ...poolState(),
    market_id: 7n,
    long_pool_amount: 0n,
    short_pool_amount: 12_815_386n,
    market_share_supply: 6_000_000n,
  };
  const allocation = { market_id: 7n, lp_share_amount: 6_000_000n };

  const stale = quoteV2CvaDeposit({
    vault,
    longAmount: 1_000_000n,
    shortAmount: 5_000_000n,
    prices,
  });
  const projected = quoteV2CvaDeposit({
    vault,
    longAmount: 1_000_000n,
    shortAmount: 5_000_000n,
    prices,
    allocations: [allocation],
    pools: { "7": pool },
    markets: { "7": market },
    pricesByMarket: { "7": prices },
  });

  assert.equal(projected.ok, true);
  assert.equal(projected.active_marks_projected, true);
  assert.equal(projected.projected_deposit_total_allocation_value_usd, 12_815_193n);
  assert.equal(projected.deposit_nav_usd_before, 18_027_523n);
  assert.equal(projected.pricing_nav_usd, 18_063_578n);
  assert.equal(projected.deposit_value_usd, 5_087_665n);
  assert.equal(projected.cva_shares_out, 9_005_646n);
  assert.notEqual(stale.cva_shares_out, projected.cva_shares_out);
  const adverse = quoteV2CvaDeposit({
    vault,
    longAmount: 1_000_000n,
    shortAmount: 5_000_000n,
    minCvaShares: projected.cva_shares_out as bigint,
    prices,
    allocations: [allocation],
    pools: { "7": { ...pool, short_pool_amount: 25_630_772n } },
    markets: { "7": market },
    pricesByMarket: { "7": prices },
  });
  assert.equal(adverse.ok, false);
  assert.ok((adverse.failure_reasons as string[]).includes("min_cva_shares"));
});

test("V2 position health matches the independent admission fixture", () => {
  const fixture = JSON.parse(readFileSync(
    resolve(process.cwd(), "test/fixtures/v2-admission-liquidation-consistency-v1.json"),
    "utf8",
  )) as {
    base_requests: Record<string, Record<string, number>>;
    vectors: Array<{
      id: string;
      base: string;
      overrides?: Record<string, number>;
      expected: Record<string, number | boolean>;
    }>;
  };
  for (const vector of fixture.vectors) {
    const request = { ...fixture.base_requests[vector.base], ...(vector.overrides ?? {}) };
    const actual = calculateV2PositionHealthComponents({
      side: request.side === 0 ? V2_SIDE_LONG : V2_SIDE_SHORT,
      sizeUsd: request.size_usd,
      sizeTokens: request.size_tokens,
      collateralAmountAfterCostResolution: request.collateral_amount_after_cost_resolution,
      sameTokenCreditAmount: request.same_token_credit_amount,
      entryPrice: request.entry_price,
      currentPrice: request.current_price,
      collateralPrice: request.collateral_price,
      positionConversionScale: request.position_conversion_scale,
      closeFeeBps: request.close_fee_bps,
      minCollateralUsd: request.min_collateral_usd,
      maintenanceMarginBps: request.maintenance_margin_bps,
      maxLiquidationImpactBps: request.max_liquidation_impact_bps,
      rawNegativeImpactUsd: request.raw_negative_impact_usd,
      accruedCostUsd: request.accrued_cost_usd,
    });
    for (const [field, expected] of Object.entries(vector.expected)) {
      const normalizedExpected = typeof expected === "number" ? BigInt(expected) : expected;
      assert.equal(actual[field], normalizedExpected, `${vector.id}:${field}`);
    }
  }
});

test("V2 admission boundaries and recovery paths match the contract policy", () => {
  const market = marketState({
    position_conversion_scale: 100_000_000_000n,
    min_position_size_usd: 1n,
    min_collateral_usd: 5_000_000n,
    initial_margin_bps: 500n,
    maintenance_margin_bps: 250n,
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    open_fee_bps: 6n,
    close_fee_bps: 6n,
    max_liquidation_impact_bps: 50n,
    max_pool_amount_long: 10n ** 15n,
    max_pool_usd_for_deposit_long: 10n ** 18n,
    reserve_factor_long_bps: 10_000n,
  });
  const pool = {
    ...poolState(),
    long_pool_amount: 10n ** 12n,
    short_pool_amount: 10n ** 12n,
  };
  const prices = priceState({
    index_price: 81_900_000_000n,
    index_price_min: 81_731_947_625n,
    index_price_max: 82_197_083_813n,
    long_price: 81_900_000_000n,
  });
  const common = {
    market,
    pool,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 110_000_000n,
    acceptablePrice: 82_197_083_814n,
    prices,
  };

  const reproduced = quoteV2OpenPosition({ ...common, collateralAmount: 5_599_982n });
  const oneBelow = quoteV2OpenPosition({ ...common, collateralAmount: 5_754_466n });
  const exact = quoteV2OpenPosition({ ...common, collateralAmount: 5_754_467n });

  assert.equal(reproduced.ok, true);
  assert.equal(reproduced.size_token_delta, 133_824_699n);
  assert.equal(reproduced.post_action_equity_usd, 4_845_515n);
  assert.equal(reproduced.post_action_liquidatable, false);
  assert.equal(oneBelow.ok, true);
  assert.equal(oneBelow.post_action_equity_usd, 4_999_999n);
  assert.equal(oneBelow.post_action_liquidatable, false);
  assert.equal(exact.ok, true, String(exact.failure_reasons));
  assert.equal(exact.post_action_equity_usd, 5_000_000n);

  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 110_000_000n,
    size_tokens: 133_824_699n,
    collateral_amount: 5_688_467n,
    entry_price: 82_197_083_813n,
  };
  const activeMarket = {
    ...market,
    long_oi_usd_with_short_collateral: 110_000_000n,
    long_oi_tokens_with_short_collateral: 133_824_699n,
  };
  const partial = quoteV2DecreasePosition({
    market: activeMarket,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: 81_731_947_625n,
    prices,
  });
  const full = quoteV2DecreasePosition({
    market: activeMarket,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 110_000_000n,
    acceptablePrice: 81_731_947_625n,
    prices,
  });
  const pureTopUp = quoteV2OpenPosition({
    market: activeMarket,
    pool,
    position: { ...position, collateral_amount: 5_533_982n },
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 1n,
    sizeUsdDelta: 0n,
    acceptablePrice: 82_197_083_814n,
    prices,
  });

  assert.equal(partial.ok, true);
  assert.equal(partial.post_action_equity_usd, 4_545_455n);
  assert.equal(partial.post_action_liquidatable, false);
  assert.equal(full.ok, true, String(full.failure_reasons));
  assert.equal(full.remaining_size, 0n);
  assert.equal(pureTopUp.ok, true, String(pureTopUp.failure_reasons));
  assert.equal(pureTopUp.post_action_liquidatable, false);
});

test("V2 CVA allocation quotes match shared sizing fixture", () => {
  const source = readFileSync(
    resolve(process.cwd(), "test/fixtures/v2-cva-allocation-sizing-v2.json"),
    "utf8",
  );
  const fixture = JSON.parse(source) as {
    cases: Array<{
      name: string;
      input: Record<string, string>;
      expected: Record<string, string>;
    }>;
  };
  const emptyPool = {
    long_pool_amount: 0n,
    short_pool_amount: 0n,
    market_share_supply: 0n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const market = marketState({
    position_impact_factor_bps: 0n,
    max_pool_amount_long: 10n ** 18n,
    max_pool_amount_short: 10n ** 18n,
    max_pool_usd_for_deposit_long: 10n ** 18n,
    max_pool_usd_for_deposit_short: 10n ** 18n,
  });
  for (const vector of fixture.cases) {
    const input = Object.fromEntries(
      Object.entries(vector.input).map(([key, value]) => [key, BigInt(value)]),
    );
    const expected = Object.fromEntries(
      Object.entries(vector.expected).map(([key, value]) => [key, BigInt(value)]),
    );
    const quote = quoteV2CvaAllocateToMarket({
      vault: {
        idle_long_amount: input.idle_long,
        idle_short_amount: input.idle_short,
        total_nav_usd: expected.total_nav_usd,
      },
      allocation: {
        lp_share_amount: 0n,
        last_mark_value_usd: 0n,
        max_deposit_usd_per_call: input.max_deposit_usd_per_call,
        max_weight_bps: 10_000n,
      },
      market,
      pool: emptyPool,
      longAmount: expected.long_amount,
      shortAmount: expected.short_amount,
      prices: priceState({
        index_price: input.long_price_min,
        long_price: input.long_price_min,
        short_price: input.short_price_min,
      }),
    });

    assert.equal(quote.ok, true, vector.name);
    assert.equal(quote.deposit_value_usd, expected.actual_value_usd, vector.name);
    assert.equal(quote.idle_long_amount_after, expected.idle_long_after, vector.name);
    assert.equal(quote.idle_short_amount_after, expected.idle_short_after, vector.name);
    assert.equal(expected.long_amount <= expected.eligible_long, true, vector.name);
    assert.equal(expected.short_amount <= expected.eligible_short, true, vector.name);
    assert.equal(expected.actual_value_usd <= expected.allowed_value_usd, true, vector.name);
    if (expected.eligible_value_usd <= expected.allowed_value_usd) {
      assert.equal(expected.long_amount, expected.eligible_long, vector.name);
      assert.equal(expected.short_amount, expected.eligible_short, vector.name);
    }
  }
});

test("V2 LP NAV matches shared independent fixture", () => {
  const source = readFileSync(
    resolve(process.cwd(), "test/fixtures/v2-lp-nav-v2.json"),
    "utf8",
  );
  const fixture = JSON.parse(source.replace(/:\s*(-?\d+)/g, ': "$1"')) as {
    cases: Array<{
      name: string;
      request: Record<string, string>;
      expected_status: string;
      expected?: Record<string, string>;
    }>;
  };
  for (const vector of fixture.cases) {
    if (vector.expected_status === "pass") {
      const expected = Object.fromEntries(
        Object.entries(vector.expected ?? {}).map(([key, value]) => [key, BigInt(value)]),
      );
      assert.deepEqual(quoteV2LpNavV1(vector.request), expected, vector.name);
    } else {
      assert.throws(
        () => quoteV2LpNavV1(vector.request),
        (error: unknown) => error instanceof Error,
        vector.name,
      );
    }
  }
});

test("V2 funding borrowing parser includes weighted aggregates", () => {
  const manifest = {
    boxes: {
      formats: {
        market_funding_borrowing: {
          fields: [
            "long_funding_fee_per_size_with_long_collateral_milli_bps",
            "long_funding_fee_per_size_with_short_collateral_milli_bps",
            "short_funding_fee_per_size_with_long_collateral_milli_bps",
            "short_funding_fee_per_size_with_short_collateral_milli_bps",
            "long_token_claimable_funding_per_size_for_longs",
            "short_token_claimable_funding_per_size_for_longs",
            "long_token_claimable_funding_per_size_for_shorts",
            "short_token_claimable_funding_per_size_for_shorts",
            "long_borrowing_factor_milli_bps",
            "short_borrowing_factor_milli_bps",
            "last_funding_time",
            "last_borrowing_time",
            "last_oracle_timestamp",
            "long_total_borrowing_snapshot_usd",
            "short_total_borrowing_snapshot_usd",
          ].map((name) => ({ name })),
        },
      },
    },
  };
  const bytes = new Uint8Array(15 * 8);
  for (let index = 0; index < 15; index += 1) {
    new DataView(bytes.buffer).setBigUint64(index * 8, BigInt(index + 1));
  }
  const parsed = parseV2MarketFundingBorrowingState(bytes, manifest);
  assert.equal(parsed.last_oracle_timestamp, 13n);
  assert.equal(parsed.long_total_borrowing_snapshot_usd, 14n);
  assert.equal(parsed.short_total_borrowing_snapshot_usd, 15n);
});

test("V2 LP quotes match current contract path", () => {
  const market = marketState();
  const pool = {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 100_000_000n,
    market_share_supply: 200_000_000n,
    position_impact_pool_qty: 10_000n,
    lent_position_impact_pool_qty: 3_000n,
  };
  const prices = priceState();

  assert.equal(quoteV2PoolValue({ pool, market, prices }), 100_099_650_000n);

  const deposit = quoteV2LpDeposit({
    market,
    pool,
    longAmount: 1_000_000n,
    shortAmount: 10_000_000n,
    minMarketShares: 1n,
    prices,
  });

  assert.equal(deposit.ok, true);
  assert.equal(deposit.deposit_value_usd, 50_010_000_000n);
  assert.equal(deposit.impact_usd, -49_959_996n);
  assert.equal(deposit.impact_negative_usd, 49_959_996n);
  assert.equal(deposit.fee_amount, 0n);
  assert.equal(deposit.long_pool_amount_after, 2_999_001n);
  assert.equal(deposit.swap_impact_pool_long_amount_after, 999n);

  const withdraw = quoteV2LpWithdraw({
    market,
    pool: { ...pool, position_impact_pool_qty: 0n, lent_position_impact_pool_qty: 0n },
    shareAmount: 20_000_000n,
    prices,
  });

  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.long_amount_out, 200_000n);
  assert.equal(withdraw.short_amount_out, 10_000_000n);
  assert.equal(withdraw.withdrawal_fee_usd, 0n);
  assert.equal(withdraw.required_flat_fee_microalgos, 51_000n);
});

test("V2 LP quotes enforce the post-action uncapped PnL guard", () => {
  const pairMarket = marketState({
    position_impact_factor_bps: 0n,
    short_oi_usd_with_short_collateral: 1_000_000_000n,
    short_oi_tokens_with_short_collateral: 20_000_000n,
  });
  const pairPool = poolState();
  const pairPrices = priceState({ index_price: p(40_000_000_000n) });

  const pairDeposit = quoteV2LpDeposit({
    market: pairMarket,
    pool: pairPool,
    longAmount: 0n,
    shortAmount: 1_000_000n,
    prices: pairPrices,
  });
  const pairWithdraw = quoteV2LpWithdraw({
    market: pairMarket,
    pool: pairPool,
    shareAmount: 1_000_000n,
    prices: pairPrices,
  });

  assert.equal(pairDeposit.ok, false);
  assert.equal(pairWithdraw.ok, false);
  assert.equal((pairDeposit.failure_reasons as string[]).includes("deposit_pre_short_pnl_cap"), true);
  assert.equal((pairDeposit.failure_reasons as string[]).includes("deposit_post_short_pnl_cap"), true);
  assert.equal((pairWithdraw.failure_reasons as string[]).includes("withdraw_post_short_pnl_cap"), true);

  const singleMarket = singleTokenMarketState({
    short_oi_usd_with_short_collateral: 100_000_000_000n,
    short_oi_tokens_with_short_collateral: 2_000_000_000n,
  });
  const singlePool = {
    ...poolState(),
    short_pool_amount: 0n,
    market_share_supply: 100_000_000n,
  };
  const singlePrices = priceState({
    index_price: p(18_000_000_000n),
    long_price: p(50_000_000_000n),
  });

  const singleDeposit = quoteV2SingleTokenLpDeposit({
    market: singleMarket,
    pool: singlePool,
    backingAmount: 100_000n,
    prices: singlePrices,
  });
  const singleWithdraw = quoteV2SingleTokenLpWithdraw({
    market: singleMarket,
    pool: singlePool,
    shareAmount: 1_000_000n,
    prices: singlePrices,
  });

  assert.equal(singleDeposit.ok, false);
  assert.equal(singleWithdraw.ok, false);
  assert.equal((singleDeposit.failure_reasons as string[]).includes("deposit_pre_short_pnl_cap"), true);
  assert.equal((singleDeposit.failure_reasons as string[]).includes("deposit_post_short_pnl_cap"), true);
  assert.equal((singleWithdraw.failure_reasons as string[]).includes("withdraw_post_short_pnl_cap"), true);
});

test("V2 LP deposit quote rejects an invalid pre-state even when the deposit repairs it", () => {
  const quote = quoteV2LpDeposit({
    market: marketState({
      position_impact_factor_bps: 0n,
      max_pool_amount_short: 2_000_000_000n,
      short_oi_usd_with_short_collateral: 1_000_000_000n,
      short_oi_tokens_with_short_collateral: 20_000_000n,
    }),
    pool: poolState(),
    longAmount: 0n,
    shortAmount: 1_000_000_000n,
    prices: priceState({ index_price: p(40_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal((quote.failure_reasons as string[]).includes("deposit_pre_short_pnl_cap"), true);
  assert.equal((quote.failure_reasons as string[]).includes("deposit_post_short_pnl_cap"), false);
});

test("V2 direct LP withdraw cooldown has an exact timestamp boundary", () => {
  const before = quoteV2DirectLpWithdrawCooldown({
    lastDepositTimestamp: 100n,
    currentTimestamp: 3_699n,
  });
  const boundary = quoteV2DirectLpWithdrawCooldown({
    lastDepositTimestamp: 100n,
    currentTimestamp: 3_700n,
  });

  assert.equal(before.blocked, true);
  assert.deepEqual(before.failure_reasons, ["withdraw_cooldown"]);
  assert.equal(before.ready_timestamp, 3_700n);
  assert.equal(before.remaining_seconds, 1n);
  assert.equal(boundary.ok, true);
  assert.equal(boundary.remaining_seconds, 0n);
});

test("V2 maximum LP withdrawable shares finds the stress boundary", () => {
  const market = marketState({
    short_oi_usd_with_short_collateral: 1_000_000_000n,
    short_oi_tokens_with_short_collateral: 20_000_000n,
  });
  const pool = poolState();
  const prices = priceState({ index_price: p(48_000_000_000n) });
  const maximum = maximumV2LpWithdrawableShares({
    market,
    pool,
    availableShareAmount: 150_000_000n,
    prices,
  });

  assert(maximum > 0n);
  assert.equal(
    quoteV2LpWithdraw({ market, pool, shareAmount: maximum, prices }).ok,
    true,
  );
  const firstRejected = quoteV2LpWithdraw({
    market,
    pool,
    shareAmount: maximum + 1n,
    prices,
  });
  assert.equal(firstRejected.ok, false);
  assert(
    (firstRejected.failure_reasons as string[]).includes(
      "withdraw_post_short_pnl_cap",
    ),
  );
});

test("V2 LP quotes subtract capped positive PnL for NAV pricing", () => {
  const market = marketState({
    position_impact_factor_bps: 0n,
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const pool = {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 100_000_000n,
    market_share_supply: 200_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const prices = priceState({ index_price_max: p(60_000_000_000n), long_price: p(50_000_000_000n) });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 10_000_000n,
    entry_price: p(50_000_000_000n),
  };

  const rawPoolValue = quoteV2PoolValue({
    pool,
    prices,
    market: marketState({ position_impact_factor_bps: 0n }),
  });
  const economicPoolValue = quoteV2PoolValue({
    pool,
    prices,
    market,
    positions: [position],
    pnlContext: "withdrawals",
  });
  assert.equal(rawPoolValue, 100_100_000_000n);
  assert.equal(economicPoolValue, 100_080_000_000n);

  const rawDeposit = quoteV2LpDeposit({
    market: marketState({ position_impact_factor_bps: 0n }),
    pool,
    longAmount: 100_000n,
    shortAmount: 0n,
    prices,
  });
  const economicDeposit = quoteV2LpDeposit({
    market,
    pool,
    longAmount: 100_000n,
    shortAmount: 0n,
    prices,
    positions: [position],
  });
  assert.equal(economicDeposit.market_shares_out, rawDeposit.market_shares_out);

  const rawWithdraw = quoteV2LpWithdraw({
    market: marketState({ position_impact_factor_bps: 0n }),
    pool,
    shareAmount: 20_000_000n,
    prices,
  });
  const economicWithdraw = quoteV2LpWithdraw({
    market,
    pool,
    shareAmount: 20_000_000n,
    prices,
    positions: [position],
  });
  assert.equal(rawWithdraw.long_amount_out, 200_000n);
  assert.equal(rawWithdraw.short_amount_out, 10_000_000n);
  assert.equal(economicWithdraw.long_amount_out, 199_960n);
  assert.equal(economicWithdraw.short_amount_out, 9_998_001n);
});

test("V2 CVA quotes subtract capped positive PnL for market NAV", () => {
  const market = marketState({
    position_impact_factor_bps: 0n,
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const pool = {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 100_000_000n,
    market_share_supply: 200_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const prices = priceState({ index_price_max: p(60_000_000_000n), long_price: p(50_000_000_000n) });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 10_000_000n,
    entry_price: p(50_000_000_000n),
  };
  const vault = {
    total_cva_shares: 100_000_000n,
    total_allocation_value_usd: 100_100_000_000n,
    idle_long_amount: 0n,
    idle_short_amount: 0n,
    min_cva_withdraw_usd: 0n,
    total_nav_usd: 100_100_000_000n,
  };
  const allocation = {
    market_id: 7n,
    lp_share_amount: 200_000_000n,
    last_mark_value_usd: 100_100_000_000n,
    max_withdraw_usd_per_call: 200_000_000_000n,
    min_weight_bps: 0n,
    max_deposit_usd_per_call: 200_000_000_000n,
    max_weight_bps: 10_000n,
    status: 1n,
  };

  const rawWithdraw = quoteV2CvaMarketWithdraw({
    vault,
    allocation,
    pool,
    shareAmount: 10_000_000n,
    prices,
    market: marketState({ position_impact_factor_bps: 0n }),
    activeMarksProjected: true,
  });
  const economicWithdraw = quoteV2CvaMarketWithdraw({
    vault: { ...vault, total_allocation_value_usd: 100_080_000_000n },
    allocation: { ...allocation, last_mark_value_usd: 100_080_000_000n },
    pool,
    shareAmount: 10_000_000n,
    prices,
    market,
    positions: [position],
    activeMarksProjected: true,
  });
  assert.equal(economicWithdraw.ok, true);
  assert.equal(rawWithdraw.long_amount_out, 200_000n);
  assert.equal(rawWithdraw.short_amount_out, 10_000_000n);
  assert.equal(economicWithdraw.long_amount_out, 199_960n);
  assert.equal(economicWithdraw.short_amount_out, 9_998_001n);
  assert.equal(economicWithdraw.market_mark_value_usd_after, 90_072_001_999n);

  const route = quoteV2CvaWithdrawRoute({
    vault,
    allocations: [allocation],
    pools: { 7: pool },
    shareAmount: 10_000_000n,
    prices,
    pricesByMarket: {
      7: {
        ...prices,
        index_price: p(50_000_000_000n),
        index_price_min: p(50_000_000_000n),
        index_price_max: p(60_000_000_000n),
      },
    },
    markets: { 7: market },
    positions: [position],
  });
  assert.equal(route.ok, true);
  assert.equal(route.route_type, "single_market");
  assert.equal((route.recommended_route as Record<string, unknown>).long_amount_out, 199_960n);
  assert.equal((route.recommended_route as Record<string, unknown>).short_amount_out, 9_998_001n);

  const distinctMarketPrices = quoteV2CvaWithdrawRoute({
    vault,
    allocations: [allocation],
    pools: { 7: pool },
    shareAmount: 10_000_000n,
    prices,
    pricesByMarket: {
      7: {
        ...prices,
        index_price: p(40_000_000_000n),
        index_price_min: p(40_000_000_000n),
        index_price_max: p(40_000_000_000n),
      },
    },
    markets: { 7: market },
  });
  assert.notEqual(
    (distinctMarketPrices.recommended_route as Record<string, unknown>).market_mark_value_usd_after,
    (route.recommended_route as Record<string, unknown>).market_mark_value_usd_after,
  );

  const staleBlocked = quoteV2CvaWithdrawRoute({
    vault,
    allocations: [{ ...allocation, mark_stale: 1n }],
    pools: { 7: pool },
    shareAmount: 10_000_000n,
    prices,
    markets: { 7: market },
    positions: [position],
  });
  assert.equal(staleBlocked.ok, false);
  assert.equal(staleBlocked.route_type, "needs_mark_refresh");

  const staleRefreshable = quoteV2CvaWithdrawRoute({
    vault,
    allocations: [{ ...allocation, mark_stale: 1n }],
    pools: { 7: pool },
    shareAmount: 10_000_000n,
    prices,
    markets: { 7: market },
    positions: [position],
    allowMarkRefresh: true,
  });
  assert.equal(staleRefreshable.ok, true);
  assert.equal(staleRefreshable.route_type, "single_market");
  assert.equal((staleRefreshable.recommended_route as Record<string, unknown>).mark_refresh_required, true);

  const rawAllocate = quoteV2CvaAllocateToMarket({
    vault: { ...vault, idle_long_amount: 100_000n },
    allocation,
    market: marketState({ position_impact_factor_bps: 0n }),
    pool,
    longAmount: 100_000n,
    shortAmount: 0n,
    prices,
  });
  const economicAllocate = quoteV2CvaAllocateToMarket({
    vault: { ...vault, idle_long_amount: 100_000n },
    allocation,
    market,
    pool,
    longAmount: 100_000n,
    shortAmount: 0n,
    prices,
    positions: [position],
  });
  assert.equal(rawAllocate.pool_value_before, 100_100_000_000n);
  assert.equal(economicAllocate.pool_value_before, 100_100_000_000n);
  assert.equal(economicAllocate.market_shares_out, rawAllocate.market_shares_out);
});

test("V2 CVA withdrawal routes isolate unavailable market candidates", () => {
  const source = readFileSync(
    resolve(process.cwd(), "test/fixtures/v2-cva-withdraw-route-v1.json"),
    "utf8",
  );
  const fixture = JSON.parse(source) as {
    cases: Array<{
      name: string;
      vault: Record<string, string>;
      allocation: Record<string, string>;
      pool: Record<string, string>;
      market_overrides: Record<string, string>;
      prices: Record<string, string>;
      share_amount: string;
      expected: Record<string, string>;
    }>;
  };
  const integers = (values: Record<string, string>): Record<string, bigint> =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, BigInt(value)]));

  for (const vector of fixture.cases) {
    const vault = integers(vector.vault);
    const allocation = integers(vector.allocation);
    const pool = integers(vector.pool);
    const market = marketState(integers(vector.market_overrides));
    const prices = integers(vector.prices);
    const marketId = allocation.market_id;

    const route = quoteV2CvaWithdrawRoute({
      vault,
      allocations: [allocation],
      pools: { [marketId.toString()]: pool },
      shareAmount: BigInt(vector.share_amount),
      prices,
      markets: { [marketId.toString()]: market },
    });
    assert.equal(route.ok, true, vector.name);
    assert.equal(route.route_type, vector.expected.route_type, vector.name);
    assert.equal(
      (route.recommended_route as Record<string, unknown>).long_amount_out,
      BigInt(vector.expected.idle_long_amount_out),
      vector.name,
    );
    assert.equal(
      (route.recommended_route as Record<string, unknown>).short_amount_out,
      BigInt(vector.expected.idle_short_amount_out),
      vector.name,
    );
    const unavailable = route.unavailable_routes as Array<Record<string, unknown>>;
    assert.equal(unavailable.length, 1, vector.name);
    assert.equal(unavailable[0].market_id, BigInt(vector.expected.unavailable_market_id), vector.name);
    assert.deepEqual(unavailable[0].failure_reasons, [vector.expected.unavailable_reason], vector.name);

    assert.throws(
      () => quoteV2CvaWithdrawRoute({
        vault,
        allocations: [allocation],
        pools: { [marketId.toString()]: pool },
        shareAmount: BigInt(vector.share_amount),
        prices,
        pricesByMarket: {
          [marketId.toString()]: {
            ...prices,
            index_price_min: 0n,
          },
        },
        markets: { [marketId.toString()]: market },
      }),
      /Price12/,
      vector.name,
    );
  }
});

test("V2 CVA withdrawal projects every active mark before routing", () => {
  const source = readFileSync(
    resolve(process.cwd(), "test/fixtures/v2-cva-active-mark-withdraw-v1.json"),
    "utf8",
  );
  const vector = JSON.parse(source) as {
    vault: Record<string, string>;
    share_amount: string;
    allocations: Array<Record<string, string>>;
    pools: Record<string, Record<string, string>>;
    prices: Record<string, string>;
    expected: Record<string, string>;
  };
  const integers = (values: Record<string, string>): Record<string, bigint> =>
    Object.fromEntries(Object.entries(values).map(([key, value]) => [key, BigInt(value)]));
  const vault = integers(vector.vault);
  const allocations = vector.allocations.map(integers);
  const pools = Object.fromEntries(
    Object.entries(vector.pools).map(([marketId, value]) => [marketId, integers(value)]),
  );
  const prices = integers(vector.prices);
  const markets = Object.fromEntries(
    Object.keys(pools).map((marketId) => [
      marketId,
      marketState({ market_id: BigInt(marketId), position_impact_factor_bps: 0n }),
    ]),
  );
  const expected = integers(vector.expected);
  const pricesByMarket = Object.fromEntries(Object.keys(pools).map((marketId) => [marketId, prices]));

  const route = quoteV2CvaWithdrawRoute({
    vault,
    allocations,
    pools,
    markets,
    shareAmount: BigInt(vector.share_amount),
    prices,
    pricesByMarket,
  });

  assert.equal(route.ok, true, String(route.failure_reasons));
  assert.equal(route.active_marks_projected, true);
  assert.equal(route.projected_total_allocation_value_usd, expected.projected_total_allocation_value_usd);
  const selected = route.recommended_route as Record<string, unknown>;
  for (const field of [
    "withdraw_value_usd",
    "market_id",
    "market_share_amount",
    "long_amount_out",
    "short_amount_out",
    "market_mark_value_usd_after",
    "total_nav_usd_after",
    "post_withdraw_weight_bps",
  ]) {
    assert.equal(selected[field], expected[field], field);
  }

  const missingActivePrice = quoteV2CvaWithdrawRoute({
    vault,
    allocations,
    pools,
    markets,
    shareAmount: BigInt(vector.share_amount),
    prices,
    pricesByMarket: { "7": prices },
  });
  assert.equal(missingActivePrice.ok, false);
  assert.deepEqual(missingActivePrice.failure_reasons, ["active_mark_state_unavailable:8"]);
});

test("V2 CVA idle withdrawal uses projected active-mark total", () => {
  const prices = priceState({
    index_price: p(1_000_000n),
    long_price: p(1_000_000n),
    short_price: p(1_000_000n),
  });
  const route = quoteV2CvaWithdrawRoute({
    vault: {
      total_cva_shares: 100_000_000n,
      total_allocation_value_usd: 100_000_000n,
      deposit_total_allocation_value_usd: 100_000_000n,
      idle_long_amount: 0n,
      idle_short_amount: 200_000_000n,
      min_cva_withdraw_usd: 0n,
      max_cva_withdraw_usd_per_call: 0n,
      cva_burn_spread_bps: 0n,
    },
    allocations: [{
      market_id: 7n,
      status: 1n,
      lp_share_amount: 100_000_000n,
      last_mark_value_usd: 100_000_000n,
      last_deposit_mark_value_usd: 100_000_000n,
      max_withdraw_usd_per_call: 1_000_000_000n,
      min_weight_bps: 0n,
    }],
    pools: { "7": {
      market_id: 7n,
      long_pool_amount: 100_000_000n,
      short_pool_amount: 100_000_000n,
      market_share_supply: 100_000_000n,
      position_impact_pool_qty: 0n,
      lent_position_impact_pool_qty: 0n,
    } },
    markets: { "7": marketState({ market_id: 7n, position_impact_factor_bps: 0n }) },
    shareAmount: 10_000_000n,
    prices,
  });
  assert.equal(route.ok, true, String(route.failure_reasons));
  assert.equal(route.projected_total_allocation_value_usd, 200_000_000n);
  const idle = route.idle_route as Record<string, unknown>;
  assert.equal(idle.withdraw_value_usd, 40_000_000n);
  assert.equal(idle.short_amount_out, 40_000_000n);
  assert.equal(route.route_type, "idle");
  assert.equal(route.recommended_route, route.idle_route);
});

test("V2 CVA withdrawal active-mark projection matches randomized integer model", () => {
  let state = 0x4356414d41524b53n;
  const next = (minimum: bigint, maximumExclusive: bigint): bigint => {
    state = (state * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n) & ((1n << 64n) - 1n);
    return minimum + (state % (maximumExclusive - minimum));
  };
  const prices = priceState({
    index_price: p(1_000_000n),
    long_price: p(1_000_000n),
    short_price: p(1_000_000n),
  });
  const totalCvaShares = 100_000_000n;
  const marketShareSupply = 100_000_000n;
  const markets = {
    "7": marketState({ market_id: 7n, position_impact_factor_bps: 0n }),
    "8": marketState({ market_id: 8n, position_impact_factor_bps: 0n }),
  };
  for (let index = 0; index < 250; index += 1) {
    const poolValues: Record<string, bigint> = {
      "7": next(80_000_000n, 240_000_000n),
      "8": next(80_000_000n, 240_000_000n),
    };
    const pools = Object.fromEntries(
      Object.entries(poolValues).map(([marketId, value]) => [marketId, {
        market_id: BigInt(marketId),
        long_pool_amount: value / 3n,
        short_pool_amount: value - value / 3n,
        market_share_supply: marketShareSupply,
        position_impact_pool_qty: 0n,
        lent_position_impact_pool_qty: 0n,
      }]),
    );
    const allocations = [7n, 8n].map((marketId) => ({
      market_id: marketId,
      status: 1n,
      lp_share_amount: marketShareSupply,
      last_mark_value_usd: next(1n, 300_000_000n),
      last_deposit_mark_value_usd: next(1n, 300_000_000n),
      max_withdraw_usd_per_call: 1_000_000_000n,
      min_weight_bps: 0n,
    }));
    const shareAmount = next(1n, 20_000_001n);
    const projectedTotal = poolValues["7"] + poolValues["8"];
    const withdrawValue = (shareAmount * projectedTotal) / totalCvaShares;
    const vault = {
      total_cva_shares: totalCvaShares,
      total_allocation_value_usd: next(1n, 600_000_000n),
      deposit_total_allocation_value_usd: next(1n, 600_000_000n),
      idle_long_amount: 0n,
      idle_short_amount: 0n,
      min_cva_withdraw_usd: 0n,
      max_cva_withdraw_usd_per_call: 0n,
      cva_burn_spread_bps: 0n,
    };
    const route = quoteV2CvaWithdrawRoute({
      vault,
      allocations,
      pools,
      markets,
      shareAmount,
      prices,
      pricesByMarket: { "7": prices, "8": prices },
    });
    assert.equal(route.ok, true, String(route.failure_reasons));
    assert.equal(route.projected_total_allocation_value_usd, projectedTotal);
    const candidates = [
      route.recommended_route as Record<string, unknown>,
      ...((route.alternative_routes as Array<Record<string, unknown>>) ?? []),
    ];
    const byMarket = new Map(candidates.map((candidate) => [String(candidate.market_id), candidate]));
    for (const marketId of ["7", "8"]) {
      const poolValue = poolValues[marketId];
      let marketShares = (withdrawValue * marketShareSupply) / poolValue;
      if (marketShares === 0n) marketShares = 1n;
      const lpWithdrawValue = (marketShares * poolValue) / marketShareSupply;
      const longPool = BigInt(pools[marketId].long_pool_amount);
      const shortPool = BigInt(pools[marketId].short_pool_amount);
      const longOut = (lpWithdrawValue * longPool) / poolValue;
      const shortOut = (lpWithdrawValue * shortPool) / poolValue;
      const newMark = poolValue - longOut - shortOut;
      const totalNavAfter = projectedTotal - poolValue + newMark;
      const candidate = byMarket.get(marketId);
      assert(candidate !== undefined);
      assert.equal(candidate.withdraw_value_usd, withdrawValue);
      assert.equal(candidate.market_share_amount, marketShares);
      assert.equal(candidate.long_amount_out, longOut);
      assert.equal(candidate.short_amount_out, shortOut);
      assert.equal(candidate.market_mark_value_usd_after, newMark);
      assert.equal(candidate.total_nav_usd_after, totalNavAfter);
    }
  }
});

test("V2 CVA withdrawal ranks value reduction before post-withdraw weight", () => {
  const prices = priceState({
    index_price: p(1_000_000n),
    long_price: p(1_000_000n),
    short_price: p(1_000_000n),
  });
  const poolValues: Record<string, bigint> = {
    "7": 204_654_594n,
    "8": 186_521_101n,
  };
  const pools = Object.fromEntries(
    Object.entries(poolValues).map(([marketId, value]) => [marketId, {
      market_id: BigInt(marketId),
      long_pool_amount: value / 3n,
      short_pool_amount: value - value / 3n,
      market_share_supply: 100_000_000n,
      position_impact_pool_qty: 0n,
      lent_position_impact_pool_qty: 0n,
    }]),
  );
  const allocations = [
    {
      market_id: 7n,
      status: 1n,
      lp_share_amount: 100_000_000n,
      last_mark_value_usd: 244_401_260n,
      last_deposit_mark_value_usd: 168_879_255n,
      max_withdraw_usd_per_call: 1_000_000_000n,
      min_weight_bps: 0n,
    },
    {
      market_id: 8n,
      status: 1n,
      lp_share_amount: 100_000_000n,
      last_mark_value_usd: 29_497_217n,
      last_deposit_mark_value_usd: 259_466_354n,
      max_withdraw_usd_per_call: 1_000_000_000n,
      min_weight_bps: 0n,
    },
  ];
  const route = quoteV2CvaWithdrawRoute({
    vault: {
      total_cva_shares: 100_000_000n,
      total_allocation_value_usd: 9_982_232n,
      deposit_total_allocation_value_usd: 196_085_532n,
      idle_long_amount: 0n,
      idle_short_amount: 0n,
      min_cva_withdraw_usd: 0n,
      max_cva_withdraw_usd_per_call: 0n,
      cva_burn_spread_bps: 0n,
    },
    allocations,
    pools,
    markets: {
      "7": marketState({ market_id: 7n, position_impact_factor_bps: 0n }),
      "8": marketState({ market_id: 8n, position_impact_factor_bps: 0n }),
    },
    shareAmount: 6_222_130n,
    prices,
    pricesByMarket: { "7": prices, "8": prices },
  });
  assert.equal(route.ok, true, String(route.failure_reasons));
  const candidates = [
    route.recommended_route as Record<string, unknown>,
    ...((route.alternative_routes as Array<Record<string, unknown>>) ?? []),
  ];
  const reductions = Object.fromEntries(candidates.map((candidate) => {
    const marketId = String(candidate.market_id);
    return [marketId, poolValues[marketId] - BigInt(candidate.market_mark_value_usd_after as bigint)];
  }));
  assert.deepEqual(reductions, { "7": 24_339_457n, "8": 24_339_458n });
  assert.equal((route.recommended_route as Record<string, unknown>).market_id, 8n);
});

test("V2 quotes accept the complete min/max bands carried by signed oracle snapshots", () => {
  const fullPrices = priceState({
    index_price: p(50_000_000_000n),
    index_price_min: p(49_900_000_000n),
    index_price_max: p(50_100_000_000n),
  });
  const signedBandPrices = {
    index_price_min: fullPrices.index_price_min,
    index_price_max: fullPrices.index_price_max,
    long_price_min: fullPrices.long_price_min,
    long_price_max: fullPrices.long_price_max,
    short_price_min: fullPrices.short_price_min,
    short_price_max: fullPrices.short_price_max,
  };
  const vault = {
    total_cva_shares: 10_000_000n,
    total_allocation_value_usd: 0n,
    idle_long_amount: 1_000_000n,
    idle_short_amount: 5_000_000n,
    min_cva_withdraw_usd: 0n,
  };

  const full = quoteV2CvaWithdrawRoute({
    vault,
    allocations: [],
    pools: {},
    markets: {},
    shareAmount: 1_000_000n,
    prices: fullPrices,
  });
  const bandOnly = quoteV2CvaWithdrawRoute({
    vault,
    allocations: [],
    pools: {},
    markets: {},
    shareAmount: 1_000_000n,
    prices: signedBandPrices,
  });

  assert.deepEqual(bandOnly, full);
});

test("V2 LP quotes recognize negative PnL and pending borrowing", () => {
  const market = marketState({
    position_impact_factor_bps: 0n,
    long_oi_usd_with_short_collateral: 150_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
    long_borrowing_factor_milli_bps: 1_000n,
    long_total_borrowing_snapshot_usd: 5_000n,
  });
  const pool = {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 100_000_000n,
    market_share_supply: 200_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const prices = priceState({ index_price: p(60_000_000_000n), long_price: p(50_000_000_000n) });
  const quote = quoteV2LpWithdraw({
    market,
    pool,
    shareAmount: 20_000_000n,
    prices,
  });
  assert.equal(quote.ok, true, String(quote.failure_reasons));
  assert.equal(quote.pending_borrowing_total_usd, 10_000n);
  assert.equal((quote.long_amount_out as bigint) > 200_000n, true);
  assert.equal((quote.short_amount_out as bigint) > 10_000_000n, true);

  const deposit = quoteV2LpDeposit({
    market,
    pool,
    longAmount: 1_000_000n,
    shortAmount: 10_000_000n,
    minMarketShares: 1n,
    prices,
  });
  assert.equal(deposit.ok, true, String(deposit.failure_reasons));
  assert.equal(deposit.pending_borrowing_long_usd, 10_000n);
  assert.equal(deposit.pending_borrowing_short_usd, 0n);
  assert.equal(deposit.pending_borrowing_total_usd, 10_000n);
});

test("V2 open quote uses current fee, impact, margin, and pending-qty path", () => {
  const quote = quoteV2OpenPosition({
    market: marketState(),
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 20_000_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(50_100_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.fee_amount, 100_000n);
  assert.equal(quote.impact_negative_usd, 100_000n);
  assert.equal(quote.base_size_token_delta, 2_000_000n);
  assert.equal(quote.impact_negative_qty, 2_000n);
  assert.equal(quote.size_token_delta, 1_998_000n);
  assert.equal(quote.position_collateral_after, 19_900_000n);
  assert.equal(quote.pending_impact_negative_qty, 2_000n);
});

test("V2 open quote uses configured market risk instead of defaults", () => {
  const thirtyX = marketState({
    min_collateral_usd: 2_000_000n,
    initial_margin_bps: 333n,
    maintenance_margin_bps: 166n,
    open_fee_bps: 6n,
    close_fee_bps: 6n,
  });
  const quote = quoteV2OpenPosition({
    market: thirtyX,
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 4_060_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(50_100_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.fee_amount, 60_000n);
  assert.equal(quote.position_collateral_after, 4_000_000n);
  assert.equal(quote.initial_margin_required_usd, 3_330_000n);
  assert.equal(quote.maintenance_margin_required_usd, 1_660_000n);
  assert.equal(quote.min_collateral_required_usd, 2_000_000n);

  const strict = quoteV2OpenPosition({
    market: marketState({
      min_collateral_usd: 2_000_000n,
      initial_margin_bps: 2_000n,
      maintenance_margin_bps: 1_000n,
      open_fee_bps: 6n,
      close_fee_bps: 6n,
    }),
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 11_060_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });
  assert.equal(strict.ok, false);
  assert.equal((strict.failure_reasons as string[]).includes("initial_margin_breach"), true);

  const missing = marketState();
  delete missing.open_fee_bps;
  const missingQuote = quoteV2OpenPosition({
    market: missing,
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 20_000_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });
  assert.equal(missingQuote.ok, false);
  assert.equal((missingQuote.failure_reasons as string[]).includes("market_risk_missing"), true);
});

test("V2 open quote requires explicit dynamic OI margin config", () => {
  const market = marketState();
  delete market.dynamic_oi_margin_version;
  delete market.dynamic_oi_margin_flags;
  delete market.dynamic_oi_margin_long_factor_scaled;
  delete market.dynamic_oi_margin_short_factor_scaled;

  const quote = quoteV2OpenPosition({
    market,
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 20_000_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal((quote.failure_reasons as string[]).includes("dynamic_oi_margin_missing"), true);
});

test("V2 open quote applies dynamic OI margin on side OI after", () => {
  const quote = quoteV2OpenPosition({
    market: marketState({
      dynamic_oi_margin_flags: 1n,
      dynamic_oi_margin_long_factor_scaled: 50_000n,
      long_oi_usd_with_short_collateral: 100_000_000n,
    }),
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 50_050_500_000n,
    sizeUsdDelta: 100_000_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal(quote.side_oi_after_usd, 100_100_000_000n);
  assert.equal(quote.baseline_initial_margin_bps, 1_000n);
  assert.equal(quote.dynamic_initial_margin_bps, 5_005n);
  assert.equal(quote.effective_initial_margin_bps, 5_005n);
  assert.equal(quote.initial_margin_required_usd, 50_050_000_000n);
  assert.equal((quote.failure_reasons as string[]).includes("initial_margin_breach"), true);
});

test("V2 open quote enforces initial margin on the resulting position", () => {
  const market = marketState({
    initial_margin_bps: 2_000n,
    position_impact_factor_bps: 0n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 50_000_000n,
    size_tokens: 1_000_000n,
    collateral_amount: 5_050_000n,
    entry_price: p(50_000_000_000n),
  };
  const quote = quoteV2OpenPosition({
    market,
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 2_010_000n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal(quote.position_collateral_after, 7_050_000n);
  assert.equal(quote.initial_margin_required_usd, 12_000_000n);
  assert.equal((quote.failure_reasons as string[]).includes("initial_margin_breach"), true);

  const healthy = quoteV2OpenPosition({
    market,
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 7_010_000n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });
  assert.equal(healthy.ok, true);
  assert.equal(healthy.position_collateral_after, 12_050_000n);
});

test("V2 open quote uses virtual inventory for worse negative impact", () => {
  const quote = quoteV2OpenPosition({
    market: marketState({
      position_impact_factor_bps: 100n,
      max_position_impact_bps: 1_000n,
      virtual_position_inventory: {
        index_asset_id: BTC,
        long_oi_usd: 200_000_000n,
        short_oi_usd: 0n,
      },
    }),
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 20_000_000n,
    sizeUsdDelta: 50_000_000n,
    acceptablePrice: p(51_000_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.impact_negative_usd, 500_000n);
});

test("V2 open quote caps positive position impact to liquid pool", () => {
  const market = marketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    position_impact_factor_bps: 100n,
    max_position_impact_bps: 1_000n,
  });
  const common = {
    market,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    collateralAmount: 20_000_000n,
    sizeUsdDelta: 50_000_000n,
    acceptablePrice: p(49_900_000_000n),
    prices: priceState({ index_price_min: p(50_000_000_000n) }),
  };

  const empty = quoteV2OpenPosition({ ...common, pool: poolState() });
  const funded = quoteV2OpenPosition({
    ...common,
    pool: { ...poolState(), position_impact_pool_qty: 10_000n },
  });

  assert.equal(empty.ok, true);
  assert.equal(empty.impact_positive_usd, 0n);
  assert.equal(empty.impact_positive_qty, 0n);
  assert.equal(funded.ok, true);
  assert.equal(funded.impact_positive_usd, 500_000n);
  assert.equal(funded.impact_positive_qty, 10_000n);
});

test("V2 quote settlement charges funding in the position collateral token", () => {
  const position = {
    market_id: 7n,
    collateral_asset_id: BTC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 10_000n,
    entry_price: p(50_000_000_000n),
  };
  const quote = quoteV2OpenPosition({
    market: marketState({ long_funding_fee_per_size_with_long_collateral_milli_bps: 10n, long_borrowing_factor_milli_bps: 5_000n }),
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: BTC,
    side: V2_SIDE_LONG,
    collateralAmount: 10_000n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.funding_fee_collateral_amount, 0n);
  assert.equal(quote.borrowing_fee_collateral_amount, 1n);
  assert.equal(quote.settlement_collateral_decrease, 1n);
  assert.equal(quote.collateral_funding_net_amount, -1n);
});

test("V2 quote settlement nets same-token claimable and outputs other-token claimable", () => {
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_SHORT,
    size_usd: 50_000_000n,
    size_tokens: 1_000_000n,
    collateral_amount: 10_000_000n,
    entry_price: p(50_000_000_000n),
  };
  const quote = quoteV2OpenPosition({
    market: marketState({
      short_funding_fee_per_size_with_short_collateral_milli_bps: 5n,
      short_borrowing_factor_milli_bps: 3_000n,
      long_token_claimable_funding_per_size_for_shorts: 20_000_000n,
      short_token_claimable_funding_per_size_for_shorts: 2_000_000_000n,
    }),
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    collateralAmount: 10_000_000n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(49_900_000_000n),
    prices: priceState({ index_price_min: p(50_000_000_000n) }),
  });

  assert.equal(quote.funding_fee_collateral_amount, 25n);
  assert.equal(quote.borrowing_fee_collateral_amount, 15_000n);
  assert.equal(quote.settlement_collateral_increase, 84_975n);
  assert.equal(quote.claimable_long_token_output, 1_000n);
  assert.equal(quote.claimable_short_token_output, 0n);
});

test("V2 quote settlement applies current receiver share once", () => {
  const fundingState = {
    short_funding_fee_per_size_with_short_collateral_milli_bps: 5n,
    short_borrowing_factor_milli_bps: 3_000n,
    long_token_claimable_funding_per_size_for_shorts: 20_000_000n,
    short_token_claimable_funding_per_size_for_shorts: 2_000_000_000n,
  };
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_SHORT,
    size_usd: 50_000_000n,
    size_tokens: 1_000_000n,
    collateral_amount: 10_000_000n,
    entry_price: p(50_000_000_000n),
  };
  const common = {
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    collateralAmount: 10_000_000n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(49_900_000_000n),
    prices: priceState({ index_price_min: p(50_000_000_000n) }),
  };
  const full = quoteV2OpenPosition({ market: marketState(fundingState), ...common });
  const splitMarket = marketState(fundingState);
  delete splitMarket.opposing_trader_share_bps;
  splitMarket.adaptive_funding = { opposing_trader_share_bps: 2_500n };
  const split = quoteV2OpenPosition({ market: splitMarket, ...common });

  assert.equal(split.funding_fee_collateral_amount, full.funding_fee_collateral_amount);
  assert.equal(split.borrowing_fee_collateral_amount, full.borrowing_fee_collateral_amount);
  assert.equal(full.claimable_long_token_output, 1_000n);
  assert.equal(split.claimable_long_token_output, 250n);
  assert.equal(full.settlement_collateral_increase, 84_975n);
  assert.equal(split.settlement_collateral_increase, 9_975n);
});

test("V2 single-token quote scales floored claim components before summing", () => {
  const position = {
    market_id: 7n,
    collateral_asset_id: BTC,
    side: V2_SIDE_LONG,
    size_usd: 2n,
    size_tokens: 1n,
    collateral_amount: 1_000_000n,
    entry_price: p(50_000_000_000n),
  };
  const fundingState = {
    long_token_claimable_funding_per_size_for_longs: 1_000_000_000_000n,
    short_token_claimable_funding_per_size_for_longs: 1_000_000_000_000n,
  };
  const common = {
    pool: poolState(),
    position,
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_LONG,
    collateralAmount: 10_000n,
    sizeUsdDelta: 5_000_000n,
    acceptablePrice: p(50_100_000_000n),
    prices: priceState(),
  };
  const full = quoteV2SingleTokenOpen({ market: singleTokenMarketState(fundingState), ...common });
  const split = quoteV2SingleTokenOpen({
    market: singleTokenMarketState({ ...fundingState, opposing_trader_share_bps: 2_500n }),
    ...common,
  });

  assert.equal(full.settlement_collateral_increase, 4n);
  assert.equal(split.settlement_collateral_increase, 0n);
  assert.equal(split.collateral_funding_net_amount, 0n);
});

test("V2 quote settlement assigns the combined conversion residual", () => {
  const quote = quoteV2OpenPosition({
    market: marketState({
      long_funding_fee_per_size_with_short_collateral_milli_bps: 5n,
      long_borrowing_factor_milli_bps: 5n,
    }),
    pool: poolState(),
    position: {
      market_id: 7n,
      collateral_asset_id: USDC,
      side: V2_SIDE_LONG,
      size_usd: 1_000_000n,
      size_tokens: 20_000n,
      collateral_amount: 1_000_000n,
      entry_price: p(50_000_000_000n),
    },
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 10_000_000n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.funding_fee_collateral_amount, 0n);
  assert.equal(quote.borrowing_fee_collateral_amount, 1n);
  assert.equal(quote.settlement_collateral_decrease, 1n);
});

test("V2 deficit close quotes use slice cost and preserve other-token claim", () => {
  const market = marketState({
    close_fee_bps: 0n,
    liquidation_fee_bps: 0n,
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    max_pnl_factor_for_traders_bps: 10_000n,
    long_funding_fee_per_size_with_short_collateral_milli_bps: 1_000_000n,
    long_token_claimable_funding_per_size_for_longs: 100_000_000_000n,
    long_oi_usd_with_short_collateral: 10_000_000n,
    long_oi_tokens_with_short_collateral: 200_000n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 10_000_000n,
    size_tokens: 200_000n,
    collateral_amount: 999_999n,
    entry_price: p(50_000_000_000n),
  };
  const voluntary = quoteV2DecreasePosition({
    market,
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_000_000_000n),
    prices: priceState({
      index_price: p(50_000_010_000n),
      long_price: p(50_000_010_000n),
    }),
  });

  assert.equal(voluntary.ok, true, JSON.stringify(voluntary.failure_reasons));
  assert.equal(voluntary.cost_deficit, true);
  assert.equal(voluntary.minimum_top_up, 1n);
  assert.equal(voluntary.requested_close_resolves, true);
  assert.equal(voluntary.remaining_snapshot_mode, "FULL_DELETE");
  assert.equal(voluntary.accrued_position_cost_usd, 1_000_000n);
  assert.equal(voluntary.claimable_long_token_output, 1_000_000n);
  assert.equal(voluntary.claimable_short_token_output, 0n);
  assert.equal(voluntary.expected_long_claim_output, 1_000_000n);
  assert.equal(voluntary.expected_voluntary_unpaid_amount, 0n);
  assert.equal(voluntary.position_token_scale, 1_000_000_000n);
  assert.equal(voluntary.position_conversion_scale, 1_000_000_000_000_000n);

  const forced = quoteV2Liquidation({
    market,
    pool: poolState(),
    position: { ...position, collateral_amount: 500_000n },
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({
      index_price: p(45_000_000_000n),
      long_price: p(45_000_000_000n),
    }),
  });

  assert.equal(forced.ok, true, JSON.stringify(forced.failure_reasons));
  assert.equal(forced.cost_deficit, true);
  assert.equal(forced.claimable_long_token_output, 1_000_000n);
  assert.equal(forced.forced_unpaid_cost_usd, 1_500_000n);
  assert.equal(forced.unpaid_cost_usd, 1_500_000n);
});

test("collectible V2 liquidation reports pending cost without double charge", () => {
  const quote = quoteV2Liquidation({
    market: marketState({
      close_fee_bps: 0n,
      liquidation_fee_bps: 0n,
      position_impact_factor_bps: 0n,
      max_position_impact_bps: 0n,
      long_funding_fee_per_size_with_short_collateral_milli_bps: 1_000_000n,
    }),
    pool: poolState(),
    position: {
      market_id: 7n,
      collateral_asset_id: USDC,
      side: V2_SIDE_LONG,
      size_usd: 10_000_000n,
      size_tokens: 200_000n,
      collateral_amount: 2_000_000n,
      entry_price: p(50_000_000_000n),
    },
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({
      index_price: p(40_000_000_000n),
      long_price: p(40_000_000_000n),
    }),
  });

  assert.equal(quote.cost_deficit, false);
  assert.equal(quote.accrued_position_cost_usd, 1_000_000n);
  assert.equal(quote.expected_collateral_debit, 1_000_000n);
  assert.equal(quote.unpaid_cost_usd, 1_000_000n);
});

test("V2 LP deposit quote uses swap impact settings", () => {
  const deposit = quoteV2LpDeposit({
    market: marketState({
      position_impact_factor_bps: 9_999n,
      max_position_impact_bps: 9_999n,
      swap_impact_factor_bps: 0n,
      max_swap_impact_bps: 100n,
    }),
    pool: poolState(),
    longAmount: 1_000_000n,
    shortAmount: 10_000_000n,
    minMarketShares: 1n,
    prices: priceState(),
  });

  assert.equal(deposit.ok, true);
  assert.equal(deposit.impact_usd, 0n);
  assert.equal(deposit.impact_negative_usd, 0n);
});

test("V2 swap exact-in quote covers fee, impact, and min output", () => {
  const market = marketState();
  const pool = { ...poolState(), short_pool_amount: 200_000_000_000n, swap_impact_pool_short_amount: 10_000_000n };
  const improve = quoteV2SwapExactIn({
    market,
    pool,
    tokenInAssetId: BTC,
    amountIn: 500_000n,
    prices: priceState(),
  });

  assert.equal(improve.ok, true);
  assert.equal(improve.token_out_asset_id, USDC);
  assert.equal((improve.impact_positive_usd as bigint) > 0n, true);
  assert.equal(improve.impact_negative_usd, 0n);
  assert.equal(improve.fee_amount, 200n);
  assert.equal(improve.pool_fee_amount, 140n);
  assert.equal(improve.protocol_fee_amount, 20n);
  assert.equal(improve.insurance_fee_amount, 40n);
  assert.equal(
    (improve.pool_fee_amount as bigint) + (improve.protocol_fee_amount as bigint) + (improve.insurance_fee_amount as bigint),
    improve.fee_amount,
  );

  const customSplit = quoteV2SwapExactIn({
    market: {
      ...market,
      fee_splits: {
        standard_pool_bps: 5_000n,
        standard_protocol_bps: 2_500n,
        standard_insurance_bps: 2_500n,
      },
    },
    pool,
    tokenInAssetId: BTC,
    amountIn: 500_000n,
    prices: priceState(),
  });
  assert.equal(customSplit.fee_amount, 200n);
  assert.equal(customSplit.pool_fee_amount, 100n);
  assert.equal(customSplit.protocol_fee_amount, 50n);
  assert.equal(customSplit.insurance_fee_amount, 50n);

  const residualToInsurance = quoteV2SwapExactIn({
    market: {
      ...market,
      fee_splits: {
        standard_pool_bps: 3_333n,
        standard_protocol_bps: 3_333n,
        standard_insurance_bps: 3_334n,
      },
    },
    pool,
    tokenInAssetId: BTC,
    amountIn: 2_500n,
    prices: priceState(),
  });
  assert.equal(residualToInsurance.ok, true);
  assert.equal(residualToInsurance.fee_amount, 1n);
  assert.equal(residualToInsurance.pool_fee_amount, 0n);
  assert.equal(residualToInsurance.protocol_fee_amount, 0n);
  assert.equal(residualToInsurance.insurance_fee_amount, 1n);

  const fail = quoteV2SwapExactIn({
    market,
    pool,
    tokenInAssetId: BTC,
    amountIn: 100_000n,
    minAmountOut: 10_000_000_000n,
    prices: priceState(),
  });

  assert.equal(fail.ok, false);
  assert.equal((fail.failure_reasons as string[]).includes("min_amount_out"), true);
});

test("V2 one-hop route matches direct swap quote", () => {
  const market = marketState();
  const pool = poolState();
  const direct = quoteV2SwapExactIn({
    market,
    pool,
    tokenInAssetId: USDC,
    amountIn: 10_000_000n,
    prices: priceState(),
  });
  const route = quoteV2SwapRouteExactIn({
    hops: [{ market_id: 7n, token_in_asset_id: USDC, amount_in: 10_000_000n }],
    markets: { "7": market },
    pools: { "7": pool },
    pricesByMarket: { "7": priceState() },
  });

  assert.equal(route.ok, true);
  assert.equal(route.final_amount_out, direct.amount_out);
  assert.equal((route.hops as Record<string, unknown>[])[0].amount_out, direct.amount_out);
  assert.equal((route.hops as Record<string, unknown>[])[0].fee_amount, direct.fee_amount);
  assert.equal((route.hops as Record<string, unknown>[])[0].pool_fee_amount, direct.pool_fee_amount);
  assert.equal((route.hops as Record<string, unknown>[])[0].protocol_fee_amount, direct.protocol_fee_amount);
  assert.equal((route.hops as Record<string, unknown>[])[0].insurance_fee_amount, direct.insurance_fee_amount);
  assert.equal(direct.required_flat_fee_microalgos, 1_000n + BigInt(V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO));
  assert.equal(route.required_flat_fee_microalgos, 1_000n + BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO));
});

test("V2 two-hop route composes and validates route limits", () => {
  const btcMarket = marketState({ market_id: 7n });
  const ethMarket = marketState({ market_id: 8n, index_asset_id: ETH, long_asset_id: ETH });
  const route = quoteV2SwapRouteExactIn({
    hops: [
      { market_id: 7n, token_in_asset_id: BTC, amount_in: 1_000n },
      { market_id: 8n, token_in_asset_id: USDC },
    ],
    markets: { "7": btcMarket, "8": ethMarket },
    pools: { "7": poolState(), "8": poolState() },
    pricesByMarket: {
      "7": priceState(),
      "8": priceState({ index_price: p(3_000_000_000n), long_price: p(3_000_000_000n) }),
    },
  });
  assert.equal(route.ok, true);
  assert.equal((route.hops as Record<string, unknown>[]).length, 2);
  assert.equal((route.hops as Record<string, unknown>[])[1].amount_in, (route.hops as Record<string, unknown>[])[0].amount_out);
  assert.equal(route.final_token_out_asset_id, ETH);
  assert.equal((route.required_flat_fee_microalgos as bigint) > (route.required_method_flat_fee_microalgos as bigint), true);

  const mismatch = quoteV2SwapRouteExactIn({
    hops: [
      { market_id: 7n, token_in_asset_id: BTC, amount_in: 1_000n },
      { market_id: 8n, token_in_asset_id: BTC },
    ],
    markets: { "7": btcMarket, "8": ethMarket },
    pools: { "7": poolState(), "8": poolState() },
    pricesByMarket: {
      "7": priceState(),
      "8": priceState({ index_price: p(3_000_000_000n), long_price: p(3_000_000_000n) }),
    },
  });
  assert.deepEqual(mismatch.failure_reasons, ["route_token_mismatch"]);

  const duplicate = quoteV2SwapRouteExactIn({
    hops: [
      { market_id: 7n, token_in_asset_id: BTC, amount_in: 1_000n },
      { market_id: 7n, token_in_asset_id: USDC },
    ],
    markets: { "7": btcMarket },
    pools: { "7": poolState() },
    pricesByMarket: { "7": priceState() },
  });
  assert.equal((duplicate.failure_reasons as string[]).includes("duplicate_route_market"), true);

  const minFail = quoteV2SwapRouteExactIn({
    hops: [{ market_id: 7n, token_in_asset_id: BTC, amount_in: 1_000n }],
    markets: { "7": btcMarket },
    pools: { "7": poolState() },
    pricesByMarket: { "7": priceState() },
    minFinalAmountOut: 10n ** 18n,
  });
  assert.equal((minFail.failure_reasons as string[]).includes("min_final_amount_out"), true);

  const tooMany = quoteV2SwapRouteExactIn({
    hops: [
      { market_id: 7n, token_in_asset_id: BTC, amount_in: 1_000n },
      { market_id: 8n, token_in_asset_id: USDC },
      { market_id: 9n, token_in_asset_id: ETH },
    ],
    markets: { "7": btcMarket, "8": ethMarket, "9": marketState({ market_id: 9n }) },
    pools: { "7": poolState(), "8": poolState(), "9": poolState() },
    pricesByMarket: { "7": priceState(), "8": priceState(), "9": priceState() },
  });
  assert.equal((tooMany.failure_reasons as string[]).includes("too_many_hops"), true);
});

test("V2 withdraw-with-swap and close-output preview compose swap quotes", () => {
  const market = marketState();
  const pool = { ...poolState(), short_pool_amount: 20_000_000_000n };
  const withdrawal = quoteV2LpWithdrawWithSwap({
    market,
    pool,
    shareAmount: 20_000_000n,
    outputTokenAssetId: USDC,
    prices: priceState(),
  });

  assert.equal(withdrawal.ok, true);
  assert.equal(withdrawal.final_long_amount_out, 0n);
  assert.equal((withdrawal.final_short_amount_out as bigint) > (withdrawal.short_amount_out_before_swap as bigint), true);
  assert.notEqual(withdrawal.swap_quote, null);
  const withdrawalSwapQuote = withdrawal.swap_quote as Record<string, unknown>;
  assert.equal(withdrawal.swap_fee_amount, withdrawalSwapQuote.fee_amount);
  assert.equal(withdrawal.swap_pool_fee_amount, withdrawalSwapQuote.pool_fee_amount);
  assert.equal(withdrawal.swap_protocol_fee_amount, withdrawalSwapQuote.protocol_fee_amount);
  assert.equal(withdrawal.swap_insurance_fee_amount, withdrawalSwapQuote.insurance_fee_amount);
  assert.equal(withdrawal.required_flat_fee_microalgos, 22_000n);

  const marketWithOi = marketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 1_998_000n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 1_998_000n,
    collateral_amount: 19_900_000n,
    entry_price: p(50_050_050_050n),
  };
  const close = quoteV2DecreasePosition({
    market: marketWithOi,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    prices: priceState({ index_price_min: p(55_000_000_000n), long_price: p(55_000_000_000n) }),
  });
  const preview = quoteV2CloseOutputSwapPreview({
    market: marketWithOi,
    pool,
    closeQuote: close,
    outputTokenAssetId: USDC,
    prices: priceState({ index_price_min: p(55_000_000_000n), long_price: p(55_000_000_000n) }),
  });

  assert.equal(preview.ok, true);
  assert.equal((preview.final_output_amount as bigint) > (close.primary_output_amount as bigint), true);
  assert.equal((preview.swap_quotes as Record<string, unknown>[]).length, 1);
});

test("V2 open quote unpacks packed position impact settings", () => {
  const packedFactor =
    1_000_000_000_000_000_000n +
    20n +
    30n * 1_000_000n +
    2n * 1_000_000_000_000n +
    1n * 1_000_000_000_000_000n;
  const packedCap = 1_000_000_000_000_000_000n + 500n + 600n * 1_000_000n;
  const quote = quoteV2OpenPosition({
    market: marketState({
      position_impact_factor_bps: packedFactor,
      max_position_impact_bps: packedCap,
    }),
    pool: poolState(),
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 20_000_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(51_000_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.impact_negative_usd, 300_000n);
  assert.equal(quote.impact_negative_qty, 6_000n);
  assert.equal(quote.size_token_delta, 1_994_000n);
});

test("V2 decrease quote handles two-asset output and pending impact", () => {
  const market = marketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 1_998_000n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 1_998_000n,
    collateral_amount: 19_900_000n,
    entry_price: p(50_050_050_050n),
    pending_impact_qty_signed: 1_000_000_000_000_000_000n - 2n,
  };

  const quote = quoteV2DecreasePosition({
    market,
    pool: poolState(),
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    prices: priceState({ index_price_min: p(55_000_000_000n), long_price: p(55_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.primary_output_asset_id, USDC);
  assert.equal(quote.pnl_output_asset_id, BTC);
  assert.equal((quote.pnl_output_amount as bigint) > 0n, true);
  assert.equal(quote.remaining_size, 0n);
  assert.equal(quote.pending_impact_negative_qty, 0n);
});

test("V2 decrease-with-output-swap quotes no-swap and pnl-to-collateral modes", () => {
  const market = marketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 1_998_000n,
  });
  const pool = poolState();
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 1_998_000n,
    collateral_amount: 19_900_000n,
    entry_price: p(50_050_050_050n),
  };
  const prices = priceState({ index_price_min: p(55_000_000_000n), long_price: p(55_000_000_000n) });

  const noSwap = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_NONE,
    prices,
  });
  const converted = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_PNL_TO_COLLATERAL,
    minPrimaryOutputAmount: 1n,
    prices,
  });

  assert.equal(noSwap.ok, true);
  assert.equal((noSwap.final_secondary_output_amount as bigint) > 0n, true);
  assert.equal(noSwap.secondary_output_asset_id, BTC);
  assert.equal(converted.ok, true);
  assert.equal(converted.final_secondary_output_amount, 0n);
  assert.equal(converted.swap_token_in, BTC);
  assert.equal(converted.swap_token_out, USDC);
  assert.equal((converted.final_primary_output_amount as bigint) > (noSwap.final_primary_output_amount as bigint), true);
  assert.notEqual(converted.swap_quote, null);
  const convertedSwapQuote = converted.swap_quote as Record<string, unknown>;
  assert.equal(converted.swap_fee_amount, convertedSwapQuote.fee_amount);
  assert.equal(converted.swap_pool_fee_amount, convertedSwapQuote.pool_fee_amount);
  assert.equal(converted.swap_protocol_fee_amount, convertedSwapQuote.protocol_fee_amount);
  assert.equal(converted.swap_insurance_fee_amount, convertedSwapQuote.insurance_fee_amount);
  assert.equal(converted.required_flat_fee_microalgos, 37_000n);

  const minPrimaryFail = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_PNL_TO_COLLATERAL,
    minPrimaryOutputAmount: (converted.final_primary_output_amount as bigint) + 1n,
    prices,
  });
  const minSecondaryFail = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_NONE,
    minSecondaryOutputAmount: (noSwap.final_secondary_output_amount as bigint) + 1n,
    prices,
  });
  const collateralToPnl = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_COLLATERAL_TO_PNL,
    prices,
  });
  const minSecondaryMode2Fail = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_COLLATERAL_TO_PNL,
    minSecondaryOutputAmount: 1n,
    prices,
  });

  assert.equal(minPrimaryFail.ok, false);
  assert.equal((minPrimaryFail.failure_reasons as string[]).includes("min_primary_output_amount"), true);
  assert.equal(minSecondaryFail.ok, false);
  assert.equal((minSecondaryFail.failure_reasons as string[]).includes("min_secondary_output_amount"), true);
  assert.equal(collateralToPnl.ok, true);
  assert.equal(collateralToPnl.primary_output_asset_id, BTC);
  assert.equal(collateralToPnl.final_secondary_output_amount, 0n);
  assert.equal(collateralToPnl.swap_token_in, USDC);
  assert.equal(collateralToPnl.swap_token_out, BTC);
  assert.equal(collateralToPnl.swap_amount_in, noSwap.collateral_output);
  assert.equal(
    collateralToPnl.final_primary_output_amount,
    (collateralToPnl.pnl_output_amount as bigint) + (collateralToPnl.swap_amount_out as bigint),
  );
  assert.equal(minSecondaryMode2Fail.ok, false);
  assert.equal((minSecondaryMode2Fail.failure_reasons as string[]).includes("min_secondary_output_amount"), true);
});

test("V2 decrease-with-output-swap flags reserve-worsening fallback", () => {
  const market = marketState({
    long_oi_tokens_with_short_collateral: 40_000_000_000n,
    long_oi_usd_with_short_collateral: 2_000_000_000_000n,
    short_oi_usd_with_long_collateral: 100_000_000n,
    short_oi_tokens_with_long_collateral: 2_000_000n,
  });
  const pool = poolState();
  const position = {
    market_id: 7n,
    collateral_asset_id: BTC,
    side: V2_SIDE_SHORT,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 1_000_000n,
    entry_price: p(50_000_000_000n),
  };
  const prices = priceState({
    index_price: p(45_000_000_000n),
    index_price_min: p(45_000_000_000n),
    index_price_max: p(45_000_000_000n),
    long_price: p(45_000_000_000n),
  });

  const noSwap = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: BTC,
    side: V2_SIDE_SHORT,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(46_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_NONE,
    prices,
  });
  const converted = quoteV2DecreaseWithOutputSwap({
    market,
    pool,
    position,
    owner: "alice",
    collateralAssetId: BTC,
    side: V2_SIDE_SHORT,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(46_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_PNL_TO_COLLATERAL,
    prices,
  });

  assert.equal(noSwap.ok, true);
  assert.equal(converted.ok, false);
  assert.equal((converted.failure_reasons as string[]).includes("output_swap_worsens_long_reserves"), true);
  assert.equal(converted.swap_token_in, USDC);
  assert.equal(converted.swap_token_out, BTC);
});

test("V2 decrease-with-output-swap quotes collateral-to-PnL edge cases", () => {
  const losingLong = quoteV2DecreaseWithOutputSwap({
    market: marketState({ long_oi_usd_with_short_collateral: 100_000_000n, long_oi_tokens_with_short_collateral: 2_000_000n }),
    pool: poolState(),
    position: {
      market_id: 7n,
      collateral_asset_id: USDC,
      side: V2_SIDE_LONG,
      size_usd: 100_000_000n,
      size_tokens: 2_000_000n,
      collateral_amount: 19_900_000n,
      entry_price: p(50_000_000_000n),
    },
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(44_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_COLLATERAL_TO_PNL,
    prices: priceState({ index_price: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });
  const shortWithLongCollateral = quoteV2DecreaseWithOutputSwap({
    market: marketState({ short_oi_usd_with_long_collateral: 100_000_000n, short_oi_tokens_with_long_collateral: 2_000_000n }),
    pool: poolState(),
    position: {
      market_id: 7n,
      collateral_asset_id: BTC,
      side: V2_SIDE_SHORT,
      size_usd: 100_000_000n,
      size_tokens: 2_000_000n,
      collateral_amount: 400n,
      entry_price: p(50_000_000_000n),
    },
    owner: "alice",
    collateralAssetId: BTC,
    side: V2_SIDE_SHORT,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(46_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_COLLATERAL_TO_PNL,
    prices: priceState({ index_price: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });
  const sameToken = quoteV2DecreaseWithOutputSwap({
    market: marketState({ long_oi_usd_with_long_collateral: 100_000_000n, long_oi_tokens_with_long_collateral: 2_000_000n }),
    pool: poolState(),
    position: {
      market_id: 7n,
      collateral_asset_id: BTC,
      side: V2_SIDE_LONG,
      size_usd: 100_000_000n,
      size_tokens: 2_000_000n,
      collateral_amount: 400n,
      entry_price: p(50_000_000_000n),
    },
    owner: "alice",
    collateralAssetId: BTC,
    side: V2_SIDE_LONG,
    sizeUsdDelta: 50_000_000n,
    acceptablePrice: p(54_000_000_000n),
    outputSwapMode: V2_OUTPUT_SWAP_COLLATERAL_TO_PNL,
    prices: priceState({ index_price_min: p(55_000_000_000n), long_price: p(55_000_000_000n) }),
  });

  assert.equal(losingLong.ok, true);
  assert.equal(losingLong.pnl_output_amount, 0n);
  assert.equal(losingLong.primary_output_asset_id, BTC);
  assert.equal(losingLong.swap_token_in, USDC);
  assert.equal(losingLong.swap_token_out, BTC);
  assert.equal(losingLong.final_primary_output_amount, losingLong.swap_amount_out);
  assert.equal(shortWithLongCollateral.ok, true);
  assert.equal(shortWithLongCollateral.primary_output_asset_id, USDC);
  assert.equal(shortWithLongCollateral.swap_token_in, BTC);
  assert.equal(shortWithLongCollateral.swap_token_out, USDC);
  assert.equal(shortWithLongCollateral.final_secondary_output_amount, 0n);
  assert.equal(sameToken.ok, true);
  assert.equal(sameToken.primary_output_asset_id, BTC);
  assert.equal(sameToken.swap_amount_in, 0n);
  assert.equal(sameToken.swap_amount_out, 0n);
  assert.equal(
    sameToken.final_primary_output_amount,
    (sameToken.collateral_output as bigint) + (sameToken.pnl_output_amount as bigint),
  );
});

test("V2 liquidation quote reports non-liquidatable positions until maintenance breach", () => {
  const market = marketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 11_000_000n,
    entry_price: p(50_000_000_000n),
  };

  const safe = quoteV2Liquidation({
    market,
    pool: poolState(),
    position,
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(48_000_000_000n), long_price: p(48_000_000_000n) }),
  });
  assert.equal(safe.ok, false);
  assert.deepEqual((safe.failure_reasons as string[]).includes("not_liquidatable"), true);

  const unsafe = quoteV2Liquidation({
    market,
    pool: poolState(),
    position,
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });
  assert.equal(unsafe.ok, true);
  assert.equal(unsafe.liquidatable, true);
  assert.equal(unsafe.close_fee_usd, (100_000_000n * (market.close_fee_bps as bigint)) / 10_000n);

  const customSplit = quoteV2Liquidation({
    market: {
      ...market,
      fee_splits: {
        liquidation_pool_bps: 5_000n,
        liquidation_protocol_bps: 2_000n,
        liquidation_insurance_bps: 1_000n,
        liquidation_keeper_bps: 2_000n,
      },
    },
    pool: poolState(),
    position,
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });
  assert.equal(customSplit.liquidation_pool_fee_bps, 5_000n);
  assert.equal(customSplit.liquidation_protocol_fee_bps, 2_000n);
  assert.equal(customSplit.liquidation_insurance_fee_bps, 1_000n);
  assert.equal(customSplit.liquidation_keeper_fee_bps, 2_000n);

  const dustMarket = marketState({
    long_oi_usd_with_short_collateral: 100_000_200n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const dustPosition = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_200n,
    size_tokens: 2_000_000n,
    collateral_amount: 11_000_000n,
    entry_price: p(50_000_100_000n),
  };
  const residualToPool = quoteV2Liquidation({
    market: dustMarket,
    pool: poolState(),
    position: dustPosition,
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });
  assert.equal(residualToPool.ok, true);
  assert.equal(residualToPool.fee_amount, 500_001n);
  assert.equal(residualToPool.liquidation_protocol_fee_amount, 50_000n);
  assert.equal(residualToPool.liquidation_insurance_fee_amount, 50_000n);
  assert.equal(residualToPool.liquidation_keeper_reward_amount, 100_000n);
  assert.equal(residualToPool.liquidation_pool_fee_amount, 300_001n);
  assert.equal(
    (residualToPool.liquidation_pool_fee_amount as bigint)
      + (residualToPool.liquidation_protocol_fee_amount as bigint)
      + (residualToPool.liquidation_insurance_fee_amount as bigint)
      + (residualToPool.liquidation_keeper_reward_amount as bigint),
    residualToPool.fee_amount,
  );
});

test("V2 liquidation quote caps negative impact", () => {
  const market = marketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
    short_oi_usd_with_short_collateral: 200_000_000n,
    position_impact_factor_bps: 100n,
    max_position_impact_bps: 1_000n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 11_000_000n,
    entry_price: p(50_000_000_000n),
  };

  const quote = quoteV2Liquidation({
    market,
    pool: poolState(),
    position,
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.impact_negative_usd, 500_000n);
});

test("V2 liquidation quote ignores positive impact for eligibility", () => {
  const market = marketState({
    long_oi_usd_with_short_collateral: 50_000_000n,
    long_oi_tokens_with_short_collateral: 1_000_000n,
    position_impact_factor_bps: 40n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 50_000_000n,
    size_tokens: 1_000_000n,
    collateral_amount: 5_950_000n,
    entry_price: p(50_000_000_000n),
  };

  const quote = quoteV2Liquidation({
    market,
    pool: { ...poolState(), position_impact_pool_qty: 5_000n },
    position,
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(45_000_000_000n), long_price: p(45_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.impact_positive_usd, 200_000n);
  assert.equal(quote.equity_usd, 900_000n);
  assert.equal(quote.liquidatable, true);
});

test("V2 ADL quote uses ADL cap and reports keeper fields", () => {
  const market = marketState({
    max_pnl_factor_for_traders_bps: 10_000n,
    max_pnl_factor_for_adl_bps: 6_000n,
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const pool = { ...poolState(), long_pool_amount: 1_000n };
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 10_000_000n,
    entry_price: p(50_000_000_000n),
  };

  const quote = quoteV2Adl({
    market,
    pool,
    position,
    positions: [position],
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(100_000_000_000n), long_price: p(100_000_000_000n) }),
  });

  assert.equal(quote.ok, true);
  assert.equal(quote.adl_threshold_breached, true);
  assert.equal(quote.side_positive_pnl_usd, 100_000_000n);
  assert.equal(quote.side_pool_usd, 100_000_000n);
  assert.equal(quote.side_pnl_cap_usd, 60_000_000n);
  assert.equal(quote.trader_pnl_cap_usd, 100_000_000n);
  assert.equal(quote.adl_payout_cap_usd, 100_000_000n);
  assert.equal(quote.effective_profit_usd, 100_000_000n);
  assert.equal(quote.liquidation_pool_fee_bps, 6_000n);
  assert.equal(quote.liquidation_protocol_fee_bps, 1_000n);
  assert.equal(quote.liquidation_insurance_fee_bps, 1_000n);
  assert.equal(quote.liquidation_keeper_fee_bps, 2_000n);
  assert.equal(quote.fee_amount, 0n);
  assert.equal(quote.liquidation_keeper_reward_amount, 0n);
  assert.equal(quote.keeper_reward_amount, 0n);
  assert.equal(quote.keeper_reward_asset_id, USDC);
  assert.equal(quote.keeper_reward_source, "none");
  assert.equal(quote.required_flat_fee_microalgos, 33_000n);

  const partial = quoteV2Adl({
    market,
    pool,
    position,
    positions: [position],
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price_min: p(100_000_000_000n), long_price: p(100_000_000_000n) }),
    sizeUsdDelta: 40_000_000n,
  });
  assert.equal(partial.ok, true);
  assert.equal(partial.size_token_delta, 800_000n);
  assert.equal(partial.remaining_size, 60_000_000n);
  assert.equal(partial.remaining_collateral, 6_000_000n);
});

test("V2 pair and single-token ADL quotes use same cap economics", () => {
  const position = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_SHORT,
    size_usd: 100_000_000n,
    size_tokens: 100_000_000_000n,
    collateral_amount: 10_000_000n,
    entry_price: 2n * SCALE,
  };
  const pair = quoteV2Adl({
    market: marketState({
      max_pnl_factor_for_traders_bps: 10_000n,
      max_pnl_factor_for_adl_bps: 6_000n,
      short_oi_usd_with_short_collateral: 200_000_000n,
      short_oi_tokens_with_short_collateral: 100_000_000_000n,
    }),
    pool: { ...poolState(), short_pool_amount: 100_000_000n },
    position,
    positions: [position],
    target: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    prices: priceState({ index_price_max: SCALE, long_price: p(50_000_000_000n), short_price: SCALE }),
  });
  const single = quoteV2SingleTokenAdl({
    market: marketState({
      long_asset_id: USDC,
      short_asset_id: USDC,
      max_pnl_factor_for_traders_bps: 10_000n,
      max_pnl_factor_for_adl_bps: 6_000n,
      short_oi_usd_with_short_collateral: 200_000_000n,
      short_oi_tokens_with_short_collateral: 100_000_000_000n,
    }),
    pool: { ...poolState(), long_pool_amount: 100_000_000n, short_pool_amount: 0n },
    position,
    positions: [position],
    target: "alice",
    backingAssetId: USDC,
    side: V2_SIDE_SHORT,
    prices: priceState({ index_price_max: SCALE, long_price: SCALE, short_price: SCALE }),
  });

  assert.equal(pair.ok, true);
  assert.equal(single.ok, true);
  for (const key of ["side_pool_usd", "side_pnl_cap_usd", "effective_profit_usd", "pnl_output_amount"] as const) {
    assert.equal(single[key], pair[key]);
  }
});

test("V2 single-token LP quotes use canonical backing pool", () => {
  const market = singleTokenMarketState();
  const pool = {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 0n,
    market_share_supply: 100_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const deposit = quoteV2SingleTokenLpDeposit({
    market,
    pool,
    backingAmount: 100_000n,
    minMarketShares: 1n,
    prices: priceState(),
  });

  assert.equal(deposit.ok, true);
  assert.equal(deposit.type, "v2_single_token_lp_deposit");
  assert.equal(deposit.backing_asset_id, BTC);
  assert.equal(deposit.short_amount, 0n);
  assert.equal(deposit.short_pool_amount_after, 0n);
  assert.equal((deposit.shares_minted as bigint) > 0n, true);
  assert.equal(deposit.required_flat_fee_microalgos, 50_000n);

  const withdraw = quoteV2SingleTokenLpWithdraw({
    market,
    pool: {
      ...pool,
      long_pool_amount: deposit.long_pool_amount_after as bigint,
      market_share_supply: deposit.market_share_supply_after as bigint,
    },
    shareAmount: deposit.shares_minted as bigint,
    minBackingAmount: 1n,
    prices: priceState(),
  });

  assert.equal(withdraw.ok, true);
  assert.equal(withdraw.type, "v2_single_token_lp_withdraw");
  assert.equal(withdraw.short_amount_out, 0n);
  assert.equal(withdraw.short_pool_amount_after, 0n);
});

test("V2 single-token LP withdraw scales outputs for positive PnL liability", () => {
  const market = singleTokenMarketState();
  const economicMarket = singleTokenMarketState({
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const pool = {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 0n,
    market_share_supply: 100_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const position = {
    market_id: 7n,
    collateral_asset_id: BTC,
    side: V2_SIDE_LONG,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 10_000n,
    entry_price: p(50_000_000_000n),
  };
  const prices = priceState({ index_price_max: p(60_000_000_000n), long_price: p(50_000_000_000n) });

  const raw = quoteV2SingleTokenLpWithdraw({
    market,
    pool,
    shareAmount: 10_000_000n,
    prices,
  });
  const economic = quoteV2SingleTokenLpWithdraw({
    market: economicMarket,
    pool,
    shareAmount: 10_000_000n,
    prices,
    positions: [position],
  });

  assert.equal(raw.backing_amount_out, 200_000n);
  assert.equal(economic.backing_amount_out, 199_960n);
});

test("V2 single-token position quotes return backing token for both sides", () => {
  const market = singleTokenMarketState({
    max_pnl_factor_for_traders_bps: 10_000n,
    max_pnl_factor_for_adl_bps: 6_000n,
    long_oi_usd_with_short_collateral: 100_000_000n,
    long_oi_tokens_with_short_collateral: 2_000_000n,
    short_oi_usd_with_short_collateral: 100_000_000n,
    short_oi_tokens_with_short_collateral: 2_000_000n,
  });
  const pool = {
    long_pool_amount: 4_000_000n,
    short_pool_amount: 0n,
    market_share_supply: 200_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const open = quoteV2SingleTokenOpen({
    market,
    pool,
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_SHORT,
    collateralAmount: 20_000n,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(49_900_000_000n),
    prices: priceState({ index_price_min: p(50_000_000_000n) }),
  });

  assert.equal(open.ok, true);
  assert.equal(open.type, "v2_single_token_open");
  assert.equal(open.collateral_asset_id, BTC);
  assert.equal(open.position_conversion_scale, market.position_conversion_scale);
  assert.equal(open.required_flat_fee_microalgos, 30_000n);

  const position = {
    market_id: 7n,
    collateral_asset_id: BTC,
    side: V2_SIDE_SHORT,
    size_usd: 100_000_000n,
    size_tokens: 2_000_000n,
    collateral_amount: 20_000n,
    entry_price: p(50_000_000_000n),
  };
  const decrease = quoteV2SingleTokenDecrease({
    market,
    pool,
    position,
    positions: [position],
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_SHORT,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(51_000_000_000n),
    prices: priceState({ index_price_max: p(49_000_000_000n) }),
  });

  assert.equal(decrease.ok, true);
  assert.equal(decrease.primary_output_asset_id, BTC);
  assert.equal(decrease.pnl_output_asset_id, BTC);
  assert.equal(decrease.claimable_long_token_output, 0n);
  assert.equal(decrease.claimable_short_token_output, 0n);
  assert.equal(decrease.position_token_scale, 1_000_000_000n);
  assert.equal(decrease.position_conversion_scale, market.position_conversion_scale);
  assert.equal(decrease.required_flat_fee_microalgos, 37_000n);
  const overriddenDecrease = quoteV2SingleTokenDecrease({
    market,
    pool,
    position,
    positions: [position],
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_SHORT,
    sizeUsdDelta: 100_000_000n,
    acceptablePrice: p(51_000_000_000n),
    prices: priceState({ index_price_max: p(49_000_000_000n) }),
    flatFeeMicroAlgo: 42_000n,
  });
  assert.equal(overriddenDecrease.required_flat_fee_microalgos, 42_000n);
  assert.equal(overriddenDecrease.required_method_flat_fee_microalgos, 42_000n);
  assert.equal(overriddenDecrease.required_group_flat_fee_microalgos, 43_000n);

  const liquidation = quoteV2SingleTokenLiquidation({
    market,
    pool,
    position: { ...position, collateral_amount: 1n },
    target: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_SHORT,
    prices: priceState({ index_price_max: p(60_000_000_000n) }),
  });
  assert.equal(liquidation.ok, true);
  assert.equal(liquidation.type, "v2_single_token_liquidation");
  assert.equal(liquidation.required_flat_fee_microalgos, 29_000n);

  const adl = quoteV2SingleTokenAdl({
    market,
    pool: { ...pool, long_pool_amount: 1_000n },
    position,
    positions: [position],
    target: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_SHORT,
    prices: priceState({ index_price_max: p(1_000_000_000n) }),
  });
  assert.equal(adl.ok, true);
  assert.equal(adl.type, "v2_single_token_adl");
  assert.equal(adl.side_pool_usd, (1_000n * p(50_000_000_000n)) / SCALE);
  assert.equal(adl.side_pnl_cap_usd, 30_000_000n);
  assert.equal(adl.trader_pnl_cap_usd, 50_000_000n);
  assert.equal(adl.adl_payout_cap_usd, adl.trader_pnl_cap_usd);
  assert.equal(adl.effective_profit_usd, adl.trader_pnl_cap_usd);
  assert.equal(adl.fee_amount, 0n);
  assert.equal(adl.liquidation_keeper_reward_amount, 0n);
  assert.equal(adl.keeper_reward_amount, 0n);
  assert.equal(adl.keeper_reward_asset_id, BTC);
  assert.equal(adl.required_flat_fee_microalgos, 33_000n);
});

test("V2 single-token open quote enforces initial margin on the resulting position", () => {
  const market = singleTokenMarketState({
    initial_margin_bps: 2_000n,
    position_impact_factor_bps: 0n,
  });
  const position = {
    market_id: 7n,
    collateral_asset_id: BTC,
    side: V2_SIDE_LONG,
    size_usd: 50_000_000n,
    size_tokens: 1_000_000n,
    collateral_amount: 101n,
    entry_price: p(50_000_000_000n),
  };
  const quote = quoteV2SingleTokenOpen({
    market,
    pool: { ...poolState(), short_pool_amount: 0n },
    position,
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_LONG,
    collateralAmount: 40n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });

  assert.equal(quote.ok, false);
  assert.equal(quote.position_collateral_after, 141n);
  assert.equal(quote.initial_margin_required_usd, 12_000_000n);
  assert.equal((quote.failure_reasons as string[]).includes("initial_margin_breach"), true);

  const healthy = quoteV2SingleTokenOpen({
    market,
    pool: { ...poolState(), short_pool_amount: 0n },
    position,
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_LONG,
    collateralAmount: 140n,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: p(50_010_000_000n),
    prices: priceState({ index_price_max: p(50_000_000_000n) }),
  });
  assert.equal(healthy.ok, true);
  assert.equal(healthy.position_collateral_after, 241n);
});

test("V2 pair and single increases report the stable top-up requirement", () => {
  const pairMarket = marketState({
    long_borrowing_factor_milli_bps: 10_000_000n,
  });
  const pairPosition = {
    market_id: 7n,
    collateral_asset_id: USDC,
    side: V2_SIDE_LONG,
    size_usd: 10_000_000n,
    size_tokens: 200_000n,
    collateral_amount: 6_000_000n,
    entry_price: p(50_000_000_000n),
    borrowing_factor_snapshot_milli_bps: 0n,
  };
  const pair = quoteV2OpenPosition({
    market: pairMarket,
    pool: poolState(),
    position: pairPosition,
    owner: "alice",
    collateralAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 100_000_000n,
    sizeUsdDelta: 5_000_000n,
    acceptablePrice: p(50_100_000_000n),
    prices: priceState(),
  });
  assert.equal(pair.ok, false);
  assert.equal((pair.failure_reasons as string[]).includes("top_up_required"), true);
  assert.equal(pair.cost_deficit, true);
  assert.equal(pair.minimum_top_up, 4_000_000n);
  assert.equal(pair.requested_close_resolves, false);
  assert.equal(pair.blocked_reason, "top_up_required");
  assert.equal(pair.settlement_collateral_decrease, 0n);
  assert.equal(
    (pair.position_cost_resolution as Record<string, unknown>).version,
    V2_POSITION_COST_QUOTE_VERSION,
  );

  const singleMarket = singleTokenMarketState({
    long_borrowing_factor_milli_bps: 10_000_000n,
  });
  const single = quoteV2SingleTokenOpen({
    market: singleMarket,
    pool: { ...poolState(), short_pool_amount: 0n },
    position: {
      ...pairPosition,
      collateral_asset_id: BTC,
      collateral_amount: 100n,
    },
    owner: "alice",
    backingAssetId: BTC,
    side: V2_SIDE_LONG,
    collateralAmount: 1_000n,
    sizeUsdDelta: 5_000_000n,
    acceptablePrice: p(50_100_000_000n),
    prices: priceState(),
  });
  assert.equal(single.ok, false);
  assert.equal((single.failure_reasons as string[]).includes("top_up_required"), true);
  assert.equal(single.minimum_top_up, 100n);
  assert.equal(single.blocked_reason, "top_up_required");
  assert.equal(
    (single.position_cost_resolution as Record<string, unknown>).version,
    V2_POSITION_COST_QUOTE_VERSION,
  );
});

test("V2 synthetic single-token quotes use index for position and backing for collateral", () => {
  const market = marketState({
    long_asset_id: USDC,
    short_asset_id: USDC,
    max_pnl_factor_for_traders_bps: 10_000n,
    max_pool_amount_long: 20_000_000_000n,
  });
  const pool = {
    long_pool_amount: 10_000_000_000n,
    short_pool_amount: 0n,
    market_share_supply: 10_000_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
  const prices = priceState({ long_price: SCALE, short_price: SCALE });

  const deposit = quoteV2SingleTokenLpDeposit({
    market,
    pool,
    backingAmount: 1_000_000_000n,
    minMarketShares: 1n,
    prices,
  });
  assert.equal(deposit.ok, true);
  assert.equal(deposit.backing_asset_id, USDC);
  assert.equal(deposit.deposit_value_usd, 1_000_000_000n);

  const open = quoteV2SingleTokenOpen({
    market,
    pool,
    owner: "alice",
    backingAssetId: USDC,
    side: V2_SIDE_LONG,
    collateralAmount: 200_000_000n,
    sizeUsdDelta: 1_000_000_000n,
    acceptablePrice: p(50_100_000_000n),
    prices,
  });
  assert.equal(open.ok, true);
  assert.equal(open.collateral_asset_id, USDC);
  assert.equal(open.fee_amount, 1_000_000n);
  assert.equal(open.base_size_token_delta, 20_000_000n);
});

function marketState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    market_id: 7n,
    index_asset_id: BTC,
    long_asset_id: BTC,
    short_asset_id: USDC,
    position_conversion_scale: 1_000_000_000_000_000n,
    min_position_size_usd: 5_000_000n,
    min_collateral_usd: 5_000_000n,
    initial_margin_bps: 1_000n,
    maintenance_margin_bps: 500n,
    dynamic_oi_margin_version: 1n,
    dynamic_oi_margin_flags: 0n,
    dynamic_oi_margin_long_factor_scaled: 0n,
    dynamic_oi_margin_short_factor_scaled: 0n,
    max_open_interest_long: 1_000_000_000n,
    max_open_interest_short: 1_000_000_000n,
    max_pool_amount_long: 1_000_000_000n,
    max_pool_amount_short: 1_000_000_000n,
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
    opposing_trader_share_bps: 10_000n,
    base_borrowing_factor_long_milli_bps: 0n,
    base_borrowing_factor_short_milli_bps: 0n,
    full_usage_borrowing_factor_long_milli_bps: 1_142n,
    full_usage_borrowing_factor_short_milli_bps: 1_142n,
    optimal_usage_factor_long_bps: 7_000n,
    optimal_usage_factor_short_bps: 7_000n,
    long_oi_usd_with_long_collateral: 0n,
    long_oi_usd_with_short_collateral: 0n,
    short_oi_usd_with_long_collateral: 0n,
    short_oi_usd_with_short_collateral: 0n,
    long_oi_tokens_with_long_collateral: 0n,
    long_oi_tokens_with_short_collateral: 0n,
    short_oi_tokens_with_long_collateral: 0n,
    short_oi_tokens_with_short_collateral: 0n,
    ...overrides,
  };
}

function singleTokenMarketState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return marketState({ short_asset_id: BTC, ...overrides });
}

function poolState(): Record<string, bigint> {
  return {
    long_pool_amount: 2_000_000n,
    short_pool_amount: 100_000_000n,
    market_share_supply: 200_000_000n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
}

function priceState(
  overrides: Partial<Record<"index_price" | "index_price_min" | "index_price_max" | "long_price" | "short_price", bigint>> = {},
): Record<string, bigint> {
  const index = overrides.index_price ?? p(50_000_000_000n);
  let indexMin = overrides.index_price_min ?? index;
  let indexMax = overrides.index_price_max ?? index;
  if (overrides.index_price_min !== undefined && overrides.index_price_max === undefined) {
    indexMax = index > indexMin ? index : indexMin;
  } else if (overrides.index_price_max !== undefined && overrides.index_price_min === undefined) {
    indexMin = index < indexMax ? index : indexMax;
  }
  const long = overrides.long_price ?? index;
  const short = overrides.short_price ?? SCALE;
  return {
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

test("V2 position health exposes exact pending carry components", () => {
  const market = marketState({
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    close_fee_bps: 6n,
    opposing_trader_share_bps: 2_500n,
    short_funding_fee_per_size_with_short_collateral_milli_bps: 1_000n,
    short_borrowing_factor_milli_bps: 3_000n,
    short_token_claimable_funding_per_size_for_shorts: 40_000_000n,
  });
  const health = quoteV2PositionHealth({
    market,
    pool: poolState(),
    position: {
      side: V2_SIDE_SHORT,
      size_usd: 5_000_000n,
      size_tokens: 100_000n,
      collateral_amount: 5_007_000n,
      entry_price: 50_000_000_000_000_000n,
    },
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    prices: priceState(),
  });

  assert.equal(health.pending_funding_fee_usd, 500n);
  assert.equal(health.pending_borrowing_fee_usd, 1_500n);
  assert.equal(health.pending_total_fee_usd, 2_000n);
  assert.equal(health.pending_funding_claim_short_amount, 50n);
  assert.equal(health.pending_funding_claim_usd, 50n);
  assert.equal(health.pending_net_funding_usd, -450n);
  assert.equal(health.pending_net_carry_usd, -1_950n);
});

test("V2 liquidation price is the exact index-only health boundary", () => {
  const backingAsset = 99n;
  const market = marketState({
    index_asset_id: BTC,
    long_asset_id: backingAsset,
    position_conversion_scale: 100_000_000_000n,
    min_collateral_usd: 5_000_000n,
    maintenance_margin_bps: 250n,
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    close_fee_bps: 6n,
    max_liquidation_impact_bps: 50n,
    opposing_trader_share_bps: 2_500n,
    short_funding_fee_per_size_with_short_collateral_milli_bps: 0n,
    short_borrowing_factor_milli_bps: 56n,
    short_token_claimable_funding_per_size_for_shorts: 46_719_800_000n,
  });
  const pool = poolState();
  const position = {
    side: V2_SIDE_SHORT,
    size_usd: 5_000_000n,
    size_tokens: 5_520_093n,
    collateral_amount: 5_007_000n,
    entry_price: 90_578_184_099n,
  };
  const prices = {
    index_price: 95_350_000_000n,
    index_price_min: 95_350_000_000n,
    index_price_max: 95_350_000_000n,
    long_price: 8_000_000_000_000n,
    long_price_min: 8_000_000_000_000n,
    long_price_max: 8_000_000_000_000n,
    short_price: SCALE,
    short_price_min: SCALE,
    short_price_max: SCALE,
  };
  const estimate = quoteV2LiquidationPrice({
    market,
    pool,
    position,
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    prices,
  });

  assert.equal(estimate.ok, true);
  assert.equal(estimate.direction, "at_or_above");
  const boundary = estimate.liquidation_price as bigint;
  const atBoundary = quoteV2PositionHealth({
    market,
    pool,
    position,
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    prices: { ...prices, index_price: boundary, index_price_min: boundary, index_price_max: boundary },
  });
  const beforeBoundary = quoteV2PositionHealth({
    market,
    pool,
    position,
    collateralAssetId: USDC,
    side: V2_SIDE_SHORT,
    prices: { ...prices, index_price: boundary - 1n, index_price_min: boundary - 1n, index_price_max: boundary - 1n },
  });
  assert.equal(atBoundary.liquidatable, true);
  assert.equal(beforeBoundary.liquidatable, false);
});

test("V2 liquidation price reprices a collateral leg backed by the index asset", () => {
  const market = marketState({
    min_collateral_usd: 5_000_000n,
    maintenance_margin_bps: 500n,
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    close_fee_bps: 0n,
    max_liquidation_impact_bps: 0n,
  });
  const pool = poolState();
  const position = {
    side: V2_SIDE_LONG,
    size_usd: 5_000_000n,
    size_tokens: 100_000_000n,
    collateral_amount: 200_000n,
    entry_price: 50_000_000_000_000n,
  };
  const prices = priceState({ index_price: 50_000_000_000_000n });
  const estimate = quoteV2LiquidationPrice({
    market,
    pool,
    position,
    collateralAssetId: BTC,
    side: V2_SIDE_LONG,
    prices,
  });

  assert.equal(estimate.ok, true);
  assert.equal(estimate.direction, "at_or_below");
  const boundary = estimate.liquidation_price as bigint;
  const atBoundary = quoteV2PositionHealth({
    market,
    pool,
    position,
    collateralAssetId: BTC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price: boundary, long_price: boundary }),
  });
  const afterBoundary = quoteV2PositionHealth({
    market,
    pool,
    position,
    collateralAssetId: BTC,
    side: V2_SIDE_LONG,
    prices: priceState({ index_price: boundary + 1n, long_price: boundary + 1n }),
  });
  assert.equal(atBoundary.liquidatable, true);
  assert.equal(afterBoundary.liquidatable, false);
});

test("V2 entry floor stays in admission but does not trigger liquidation", () => {
  const common = {
    market: marketState({ maintenance_margin_bps: 250n, close_fee_bps: 6n,
      position_impact_factor_bps: 0n, max_position_impact_bps: 0n }),
    pool: poolState(), collateralAssetId: USDC, side: V2_SIDE_SHORT,
    prices: priceState(), position: { size_usd: 5_000_000n, size_tokens: 100_000n,
      collateral_amount: 4_999_999n, entry_price: p(50_000_000_000n) },
  };
  const maintenance = quoteV2PositionHealth(common);
  const admission = quoteV2PositionHealth({ ...common, enforceInitialMargin: true });
  assert.equal(maintenance.liquidatable, false);
  assert.equal(maintenance.required_remaining_usd, 125_000n);
  assert.equal(admission.initial_margin_breach, true);
  assert.equal(admission.minimum_collateral_amount_for_admission, 5_000_000n);
  assert.equal(admission.liquidatable, false);
});

test("ADL survivor accounting matches hand-derived contract vectors", () => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "test/fixtures/v2-adl-survivor-policy-v1.json"), "utf8"),
    (_key, value) => typeof value === "number" ? BigInt(value) : value);
  for (const vector of fixture.cases) {
    const args = {
      market: { ...fixture.market, ...vector.market },
      pool: { ...fixture.pool, ...vector.pool },
      position: { ...fixture.position, ...vector.position },
      prices: { ...fixture.prices, ...vector.prices },
      sizeUsdDelta: vector.size_usd_delta ?? fixture.size_usd_delta,
      side: vector.position?.side ?? 1n,
    };
    const quote = vector.family === "single_token"
      ? quoteV2SingleTokenAdl({ ...args, backingAssetId: 12n })
      : quoteV2Adl({ ...args, collateralAssetId: 12n });
    for (const [key, expected] of Object.entries(vector.expected)) {
      assert.deepEqual(quote[key], expected, `${vector.id}: ${key}`);
    }
  }
});

test("open quote reports admission collateral separately from liquidation health", () => {
  const fixture = JSON.parse(readFileSync(resolve(process.cwd(), "test/fixtures/v2-adl-survivor-policy-v1.json"), "utf8"),
    (_key, value) => typeof value === "number" ? BigInt(value) : value);
  const quote = quoteV2OpenPosition({
    market: { ...fixture.market, position_impact_factor_bps: 0n },
    pool: fixture.pool, prices: fixture.prices, side: 1n,
    collateralAssetId: 12n, sizeUsdDelta: 5_000_000n,
    collateralAmount: 100_000n, acceptablePrice: 2_000_000_000_000n,
  });
  assert.equal(quote.ok, false);
  assert.equal((quote.post_action_health as any).pending_total_fee_usd, 0n);
  assert.equal(quote.post_action_minimum_collateral_amount, 5_000_000n);
  assert.ok((quote.post_action_health as any).minimum_collateral_amount < 5_000_000n);
});
