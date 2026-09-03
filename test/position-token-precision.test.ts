import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  ORACLE_PRICE_SCALE,
  V2_MAX_POSITION_QUANTIZATION_BPS,
  V2_SIDE_LONG,
  V2_SIDE_SHORT,
  V2_ORDER_KIND,
  assertV2OrderPriceCoherent,
  buildV2OpenOrIncreaseCall,
  formatPrice12,
  parsePrice12,
  positionScalesFromConversionScale,
  readV2MarketPositionScales,
  quoteV2OpenPosition,
  quoteV2OpenLimitOrder,
} from "../src/index.js";

type Integer = number | string;
type QuantityVector = {
  name: string;
  size_usd6: Integer;
  price12: Integer;
  position_token_scale: Integer;
  position_conversion_scale: Integer;
  impact_positive_bps: Integer;
  impact_negative_bps: Integer;
  expected_base_qty: Integer;
  expected_represented_usd6: Integer;
  expected_quantization_loss_usd6: Integer;
  expected_impact_positive_usd6: Integer;
  expected_impact_positive_qty: Integer;
  expected_expanded_qty: Integer;
  expected_contracted_qty: Integer;
  expected_entry_price12: Integer;
  expected_expanded_entry_price12: Integer;
  expected_contracted_entry_price12: Integer;
  expected_dynamic_min_usd6: Integer;
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureText = readFileSync(
  join(__dirname, "..", "..", "test", "fixtures", "v2-oracle-position-precision-v1.json"),
  "utf8",
);
// JSON has no integer type. Quote every object integer before parsing so the
// independent uint64 vectors never pass through an unsafe JavaScript number.
const fixture = JSON.parse(
  fixtureText.replace(/(:\s*)(-?\d+)(?=\s*[,}])/g, '$1"$2"'),
) as {
  units: Record<string, Integer>;
  quantity_cases: QuantityVector[];
  decimal_cases: Array<{ input: string; expected: Integer }>;
  decimal_rejections: Array<{ input: string }>;
};

const b = (value: Integer): bigint => BigInt(value);

function market(positionConversionScale: bigint): Record<string, bigint> {
  return {
    market_id: 7n,
    index_asset_id: 11n,
    long_asset_id: 11n,
    short_asset_id: 12n,
    position_conversion_scale: positionConversionScale,
    opposing_trader_share_bps: 10_000n,
    min_position_size_usd: 1n,
    min_collateral_usd: 1n,
    initial_margin_bps: 1_000n,
    maintenance_margin_bps: 500n,
    dynamic_oi_margin_version: 1n,
    dynamic_oi_margin_flags: 0n,
    dynamic_oi_margin_long_factor_scaled: 0n,
    dynamic_oi_margin_short_factor_scaled: 0n,
    max_open_interest_long: 10n ** 15n,
    max_open_interest_short: 10n ** 15n,
    max_pool_amount_long: 10n ** 18n,
    max_pool_amount_short: 10n ** 18n,
    max_pool_usd_for_deposit_long: 10n ** 18n,
    max_pool_usd_for_deposit_short: 10n ** 18n,
    reserve_factor_long_bps: 10_000n,
    reserve_factor_short_bps: 10_000n,
    max_pnl_factor_for_deposits_bps: 10_000n,
    max_pnl_factor_for_withdrawals_bps: 10_000n,
    max_pnl_factor_for_traders_bps: 10_000n,
    max_pnl_factor_for_adl_bps: 10_000n,
    min_pnl_factor_after_adl_bps: 10_000n,
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    swap_impact_factor_bps: 0n,
    max_swap_impact_bps: 0n,
    open_fee_bps: 6n,
    close_fee_bps: 6n,
    liquidation_fee_bps: 0n,
    max_liquidation_impact_bps: 0n,
    funding_factor_milli_bps: 0n,
    funding_interval_seconds: 3_600n,
    base_borrowing_factor_long_milli_bps: 0n,
    base_borrowing_factor_short_milli_bps: 0n,
    full_usage_borrowing_factor_long_milli_bps: 0n,
    full_usage_borrowing_factor_short_milli_bps: 0n,
    optimal_usage_factor_long_bps: 7_000n,
    optimal_usage_factor_short_bps: 7_000n,
  };
}

function pool(): Record<string, bigint> {
  return {
    long_pool_amount: 10n ** 18n,
    short_pool_amount: 10n ** 18n,
    market_share_supply: 10n ** 12n,
    position_impact_pool_qty: 0n,
    lent_position_impact_pool_qty: 0n,
  };
}

function prices(indexPrice: bigint): Record<string, bigint> {
  return {
    index_price: indexPrice,
    index_price_min: indexPrice,
    index_price_max: indexPrice,
    long_price: indexPrice,
    long_price_min: indexPrice,
    long_price_max: indexPrice,
    short_price: ORACLE_PRICE_SCALE,
    short_price_min: ORACLE_PRICE_SCALE,
    short_price_max: ORACLE_PRICE_SCALE,
  };
}

test("independent Price12 and per-market quantity vectors cover both sides", () => {
  for (const vector of fixture.quantity_cases) {
    const sizeUsd = b(vector.size_usd6);
    const price = b(vector.price12);
    const q = b(vector.position_token_scale);
    const k = b(vector.position_conversion_scale);
    const baseQty: bigint = (sizeUsd * k) / price;
    const representedUsd: bigint = (baseQty * price) / k;
    const positiveUsd: bigint = (sizeUsd * b(vector.impact_positive_bps)) / 10_000n;
    const positiveQty: bigint = (positiveUsd * k) / price;
    const negativeUsd: bigint = (sizeUsd * b(vector.impact_negative_bps)) / 10_000n;
    const negativeQty: bigint = (negativeUsd * k) / price;

    assert.deepEqual(positionScalesFromConversionScale(k), {
      position_token_scale: q,
      position_conversion_scale: k,
    });
    assert.equal(baseQty, b(vector.expected_base_qty), vector.name);
    assert.equal(representedUsd, b(vector.expected_represented_usd6), vector.name);
    assert.equal(sizeUsd - representedUsd, b(vector.expected_quantization_loss_usd6), vector.name);
    assert.equal(positiveUsd, b(vector.expected_impact_positive_usd6), vector.name);
    assert.equal(positiveQty, b(vector.expected_impact_positive_qty), vector.name);
    assert.equal(baseQty + positiveQty, b(vector.expected_expanded_qty), vector.name);
    assert.equal(baseQty - negativeQty, b(vector.expected_contracted_qty), vector.name);
    assert.equal((sizeUsd * k) / baseQty, b(vector.expected_entry_price12), vector.name);
    assert.equal((sizeUsd * k) / (baseQty + positiveQty), b(vector.expected_expanded_entry_price12), vector.name);
    assert.equal((sizeUsd * k) / (baseQty - negativeQty), b(vector.expected_contracted_entry_price12), vector.name);

    for (const side of [V2_SIDE_LONG, V2_SIDE_SHORT]) {
      const quote = quoteV2OpenPosition({
        market: market(k),
        pool: pool(),
        owner: "alice",
        collateralAssetId: 12n,
        side,
        collateralAmount: sizeUsd,
        sizeUsdDelta: sizeUsd,
        acceptablePrice: side === V2_SIDE_LONG ? (price * 101n) / 100n : (price * 99n) / 100n,
        prices: prices(price),
      });
      assert.equal(quote.ok, true, `${vector.name}:${side}:${String(quote.failure_reasons)}`);
      assert.equal(quote.position_token_scale, q, vector.name);
      assert.equal(quote.position_conversion_scale, k, vector.name);
      assert.equal(quote.base_size_token_delta, baseQty, vector.name);
      assert.equal(quote.size_token_delta, baseQty, vector.name);
      assert.equal(quote.position_entry_price_after, b(vector.expected_entry_price12), vector.name);
      assert.equal(quote.dynamic_min_position_size_usd, b(vector.expected_dynamic_min_usd6), vector.name);
      assert.equal(quote.max_position_quantization_bps, V2_MAX_POSITION_QUANTIZATION_BPS, vector.name);
    }
  }
});

test("market position precision fails closed when the per-market conversion scale is absent", () => {
  assert.throws(
    () => readV2MarketPositionScales({}),
    /market position conversion scale is required/,
  );
  assert.throws(
    () => readV2MarketPositionScales({ position_conversion_scale: 0n }),
    /invalid market position conversion scale/,
  );
});

test("Price12 decimal parsing is exact and rejects lossy inputs", () => {
  for (const vector of fixture.decimal_cases) {
    const raw = parsePrice12(vector.input);
    assert.equal(raw, b(vector.expected), vector.input);
    assert.equal(parsePrice12(formatPrice12(raw)), raw, vector.input);
  }
  for (const vector of fixture.decimal_rejections) {
    assert.throws(() => parsePrice12(vector.input), vector.input);
  }
  assert.throws(() => parsePrice12("1e1000000"), /ceiling/);
});

test("official TypeScript price inputs reject unsafe numbers before signing or quoting", () => {
  const unsafe = Number(50_000_000_000_000_001n);
  assert.equal(Number.isSafeInteger(unsafe), false);
  assert.throws(
    () => buildV2OpenOrIncreaseCall({ acceptablePrice: unsafe } as never),
    /safe integer/,
  );
  assert.throws(
    () => assertV2OrderPriceCoherent({
      orderKind: V2_ORDER_KIND.OPEN_LIMIT,
      side: V2_SIDE_LONG,
      triggerPrice: unsafe,
      acceptablePrice: 50_000_000_000_000_000n,
    }),
    /safe integer/,
  );
  assert.throws(
    () => quoteV2OpenLimitOrder({
      market: market(1_000_000_000_000_000n),
      pool: pool(),
      owner: "alice",
      collateralAssetId: 12n,
      side: V2_SIDE_LONG,
      sizeUsdDelta: 10_000_000n,
      collateralAmount: 2_000_000n,
      triggerPrice: unsafe,
      keeperFeeAmount: 5_000n,
      prices: prices(50_000_000_000_000_000n),
    }),
    /safe integer/,
  );
});
