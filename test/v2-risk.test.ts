import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  V2_IMPACT_PACK_COMPONENT_SCALE,
  V2_IMPACT_PACK_FLAG,
  V2_IMPACT_PACK_NEG_EXP_SCALE,
  V2_IMPACT_PACK_POS_EXP_SCALE,
} from "../src/v2Quotes.js";
import {
  V2_MARKET_RISK_FIELDS,
  decodeV2ImpactSettingComponents,
  encodeV2MarketRisk,
  type V2MarketRiskInput,
} from "../src/v2Risk.js";
import {
  decodeV2ImpactSetting,
  quoteV2ImpactPolicy,
} from "../src/v2PositionResolution.js";

interface ImpactVector {
  name: string;
  field: keyof V2MarketRiskInput;
  input: string;
  positive_component_bps: number;
  negative_component_bps: number;
  positive_exponent: number;
  negative_exponent: number;
  accepted: boolean;
}

interface PnlOrderingVector {
  id: string;
  deposit_bps: number;
  withdrawal_bps: number;
  trader_bps: number;
  adl_trigger_bps: number;
  post_adl_floor_bps: number;
  valid: boolean;
}

const impactVectors = JSON.parse(readFileSync(
  resolve(process.cwd(), "test/fixtures/v2-impact-setting-policy-v1.json"),
  "utf8",
)).vectors as ImpactVector[];
const pnlOrderingVectors = JSON.parse(readFileSync(
  resolve(process.cwd(), "test/fixtures/v2_adl_pnl_cap_vectors.json"),
  "utf8",
)).ordering_vectors as PnlOrderingVector[];

function risk(overrides: V2MarketRiskInput = {}): V2MarketRiskInput {
  const value = Object.fromEntries(V2_MARKET_RISK_FIELDS.map((field) => [field, 1n]));
  return {
    ...value,
    close_fee_bps: 6n,
    maintenance_margin_bps: 250n,
    liquidation_fee_bps: 70n,
    max_liquidation_impact_bps: 50n,
    max_position_impact_bps: 110n,
    base_borrowing_factor_long_milli_bps: 1n,
    base_borrowing_factor_short_milli_bps: 1n,
    full_usage_borrowing_factor_long_milli_bps: 1n,
    full_usage_borrowing_factor_short_milli_bps: 1n,
    ...overrides,
  };
}

function packed(positive: bigint, negative: bigint): bigint {
  return V2_IMPACT_PACK_FLAG
    + positive
    + negative * V2_IMPACT_PACK_COMPONENT_SCALE
    + V2_IMPACT_PACK_POS_EXP_SCALE
    + V2_IMPACT_PACK_NEG_EXP_SCALE;
}

test("market risk rejects zero long and short borrowing bases", () => {
  for (const field of [
    "base_borrowing_factor_long_milli_bps",
    "base_borrowing_factor_short_milli_bps",
  ] as const) {
    assert.throws(
      () => encodeV2MarketRisk(risk({ [field]: 0n })),
      /must be > 0/,
    );
  }
});

test("market risk preserves the borrowing maximum", () => {
  for (const side of ["long", "short"] as const) {
    const baseField = `base_borrowing_factor_${side}_milli_bps` as const;
    const fullField = `full_usage_borrowing_factor_${side}_milli_bps` as const;
    assert.equal(
      encodeV2MarketRisk(risk({ [baseField]: 2_000n, [fullField]: 2_000n })).byteLength,
      264,
    );
    assert.throws(
      () => encodeV2MarketRisk(risk({ [fullField]: 2_001n })),
      /exceeds maximum/,
    );
  }
});

for (const row of pnlOrderingVectors) {
  test(`shared PnL recovery ordering: ${row.id}`, () => {
    const configured = risk({
      max_pnl_factor_for_deposits_bps: BigInt(row.deposit_bps),
      max_pnl_factor_for_withdrawals_bps: BigInt(row.withdrawal_bps),
      max_pnl_factor_for_traders_bps: BigInt(row.trader_bps),
      max_pnl_factor_for_adl_bps: BigInt(row.adl_trigger_bps),
      min_pnl_factor_after_adl_bps: BigInt(row.post_adl_floor_bps),
    });
    if (row.valid) {
      assert.equal(encodeV2MarketRisk(configured).byteLength, 264);
    } else {
      assert.throws(() => encodeV2MarketRisk(configured), /bad pnl cap order/);
    }
  });
}

test("market risk accepts liquidation ordering equality for scalar and packed impact", () => {
  assert.equal(encodeV2MarketRisk(risk({ max_position_impact_bps: 120n })).byteLength, 264);
  assert.equal(
    encodeV2MarketRisk(risk({ max_position_impact_bps: packed(100n, 120n), close_fee_bps: 500n })).byteLength,
    264,
  );
});

test("market risk rejects one-unit-below liquidation ordering", () => {
  for (const cap of [121n, packed(100n, 121n)]) {
    assert.throws(
      () => encodeV2MarketRisk(risk({ max_position_impact_bps: cap })),
      /liquidation fee plus capped impact/,
    );
  }
});

test("market risk rejects impact domains and the maintenance-margin liveness gap", () => {
  for (const field of [
    "position_impact_factor_bps",
    "max_position_impact_bps",
    "swap_impact_factor_bps",
  ] as const) {
    assert.throws(
      () => encodeV2MarketRisk(risk({ [field]: 10_001n })),
      new RegExp(`bad ${field}`),
    );
  }
  assert.throws(
    () => encodeV2MarketRisk(risk({ max_swap_impact_bps: 10_000n })),
    /bad max_swap_impact_bps/,
  );
  assert.throws(
    () => encodeV2MarketRisk(risk({
      maintenance_margin_bps: 50n,
      max_position_impact_bps: 101n,
      liquidation_fee_bps: 100n,
    })),
    /negative impact gap/,
  );
});

for (const row of impactVectors) {
  test(`shared impact setting policy: ${row.name}`, () => {
    const value = BigInt(row.input);
    const expected = [
      BigInt(row.positive_component_bps),
      BigInt(row.negative_component_bps),
      BigInt(row.positive_exponent),
      BigInt(row.negative_exponent),
    ] as const;
    const decoded = decodeV2ImpactSetting(value);
    assert.deepEqual(
      [
        decoded.positive_component_bps,
        decoded.negative_component_bps,
        decoded.positive_exponent,
        decoded.negative_exponent,
      ],
      expected,
    );
    const structuralValid = expected[0] <= expected[1]
      && [1n, 2n].includes(expected[2])
      && [1n, 2n].includes(expected[3]);
    if (structuralValid) {
      assert.deepEqual(decodeV2ImpactSettingComponents(value), expected);
    } else {
      assert.throws(() => decodeV2ImpactSettingComponents(value));
    }

    const overrides: V2MarketRiskInput = { [row.field]: value };
    if (row.field === "max_position_impact_bps") {
      const negative = expected[1];
      overrides.max_liquidation_impact_bps = negative < 10_000n ? negative : 10_000n;
      overrides.liquidation_fee_bps = negative > 10_000n ? negative - 10_000n : 0n;
      overrides.maintenance_margin_bps = 10_000n;
    }
    const configuredRisk = risk(overrides) as Record<string, bigint>;
    const policy = quoteV2ImpactPolicy({
      position_impact_factor_bps: configuredRisk.position_impact_factor_bps,
      max_position_impact_bps: configuredRisk.max_position_impact_bps,
      swap_impact_factor_bps: configuredRisk.swap_impact_factor_bps,
      max_swap_impact_bps: configuredRisk.max_swap_impact_bps,
      maintenance_margin_bps: configuredRisk.maintenance_margin_bps,
      max_liquidation_impact_bps: configuredRisk.max_liquidation_impact_bps,
    });
    assert.equal(policy.valid, row.accepted);
    if (row.accepted) {
      assert.equal(encodeV2MarketRisk(configuredRisk).byteLength, 264);
    } else {
      assert.throws(() => encodeV2MarketRisk(configuredRisk));
    }
  });
}
