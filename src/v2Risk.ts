import { concat, uint64Bytes } from "./codec.js";
import type { BigNumberish } from "./constants.js";

export const V2_MATH_FACTOR_SCALE = 1_000_000_000_000n;
const IMPACT_PACK_FLAG = 1_000_000_000_000_000_000n;
const IMPACT_PACK_COMPONENT_SCALE = 1_000_000n;
const IMPACT_PACK_POS_EXP_SCALE = 1_000_000_000_000n;
const IMPACT_PACK_NEG_EXP_SCALE = 1_000_000_000_000_000n;
const IMPACT_PACK_EXP_MOD = 1_000n;
const V2_BPS = 10_000n;
const V2_MAX_BORROWING_FACTOR_MILLI_BPS = 2_000n;
export const V2_DYNAMIC_OI_MARGIN_CONFIG_VERSION = 1n;
export const V2_DYNAMIC_OI_MARGIN_CONFIG_FLAG_ENABLED = 1n;
export const V2_DYNAMIC_OI_MARGIN_CONFIG_SIZE = 32;
export const V2_DYNAMIC_OI_MARGIN_CONFIG_FIELDS = [
  "dynamic_oi_margin_version",
  "dynamic_oi_margin_flags",
  "dynamic_oi_margin_long_factor_scaled",
  "dynamic_oi_margin_short_factor_scaled",
] as const;

export type V2DynamicOiMarginConfigField = (typeof V2_DYNAMIC_OI_MARGIN_CONFIG_FIELDS)[number];
export type V2DynamicOiMarginConfigInput = Partial<
  Record<V2DynamicOiMarginConfigField, BigNumberish> & {
    enabled: boolean;
    dynamic_oi_margin_enabled: boolean;
    long_factor_scaled: BigNumberish;
    short_factor_scaled: BigNumberish;
  }
>;
export type V2DynamicOiMarginConfigValues = Record<V2DynamicOiMarginConfigField, bigint> & {
  dynamic_oi_margin_enabled: boolean;
};

export const V2_MARKET_RISK_FIELDS = [
  "min_position_size_usd",
  "min_collateral_usd",
  "initial_margin_bps",
  "maintenance_margin_bps",
  "max_open_interest_long",
  "max_open_interest_short",
  "max_pool_amount_long",
  "max_pool_amount_short",
  "max_pool_usd_for_deposit_long",
  "max_pool_usd_for_deposit_short",
  "reserve_factor_long_bps",
  "reserve_factor_short_bps",
  "max_pnl_factor_for_deposits_bps",
  "max_pnl_factor_for_withdrawals_bps",
  "max_pnl_factor_for_traders_bps",
  "max_pnl_factor_for_adl_bps",
  "min_pnl_factor_after_adl_bps",
  "position_impact_factor_bps",
  "max_position_impact_bps",
  "swap_impact_factor_bps",
  "max_swap_impact_bps",
  "open_fee_bps",
  "close_fee_bps",
  "liquidation_fee_bps",
  "max_liquidation_impact_bps",
  "funding_factor_milli_bps",
  "funding_interval_seconds",
  "base_borrowing_factor_long_milli_bps",
  "base_borrowing_factor_short_milli_bps",
  "full_usage_borrowing_factor_long_milli_bps",
  "full_usage_borrowing_factor_short_milli_bps",
  "optimal_usage_factor_long_bps",
  "optimal_usage_factor_short_bps",
] as const;

export type V2MarketRiskField = (typeof V2_MARKET_RISK_FIELDS)[number];
export type V2MarketRiskInput = Partial<Record<V2MarketRiskField, BigNumberish>>;
export type V2MarketRiskValues = Record<V2MarketRiskField, bigint>;

export function encodeV2DynamicOiMarginConfig(input: V2DynamicOiMarginConfigInput): Uint8Array {
  const enabled = Boolean(input.enabled ?? input.dynamic_oi_margin_enabled ?? false);
  const flags = enabled ? V2_DYNAMIC_OI_MARGIN_CONFIG_FLAG_ENABLED : 0n;
  const longFactor = bigint(input.long_factor_scaled ?? input.dynamic_oi_margin_long_factor_scaled ?? 0n);
  const shortFactor = bigint(input.short_factor_scaled ?? input.dynamic_oi_margin_short_factor_scaled ?? 0n);
  if (flags === 0n && (longFactor !== 0n || shortFactor !== 0n)) {
    throw new Error("disabled dynamic OI config requires zero factors");
  }
  if (flags === V2_DYNAMIC_OI_MARGIN_CONFIG_FLAG_ENABLED && longFactor === 0n && shortFactor === 0n) {
    throw new Error("enabled dynamic OI config requires at least one non-zero factor");
  }
  return concat([
    uint64Bytes(V2_DYNAMIC_OI_MARGIN_CONFIG_VERSION),
    uint64Bytes(flags),
    uint64Bytes(longFactor),
    uint64Bytes(shortFactor),
  ]);
}

export function decodeV2DynamicOiMarginConfig(data: Uint8Array): V2DynamicOiMarginConfigValues {
  if (data.byteLength !== V2_DYNAMIC_OI_MARGIN_CONFIG_SIZE) {
    throw new Error(`dynamic OI config expects ${V2_DYNAMIC_OI_MARGIN_CONFIG_SIZE} bytes, got ${data.byteLength}`);
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const version = view.getBigUint64(0);
  const flags = view.getBigUint64(8);
  const longFactor = view.getBigUint64(16);
  const shortFactor = view.getBigUint64(24);
  if (version !== V2_DYNAMIC_OI_MARGIN_CONFIG_VERSION) throw new Error("bad dynamic OI config version");
  if (flags !== 0n && flags !== V2_DYNAMIC_OI_MARGIN_CONFIG_FLAG_ENABLED) throw new Error("bad dynamic OI config flags");
  if (flags === 0n && (longFactor !== 0n || shortFactor !== 0n)) {
    throw new Error("disabled dynamic OI config requires zero factors");
  }
  if (flags === V2_DYNAMIC_OI_MARGIN_CONFIG_FLAG_ENABLED && longFactor === 0n && shortFactor === 0n) {
    throw new Error("enabled dynamic OI config requires at least one non-zero factor");
  }
  return {
    dynamic_oi_margin_version: version,
    dynamic_oi_margin_flags: flags,
    dynamic_oi_margin_enabled: flags !== 0n,
    dynamic_oi_margin_long_factor_scaled: longFactor,
    dynamic_oi_margin_short_factor_scaled: shortFactor,
  };
}

export function readV2DynamicOiMarginConfig(input: Record<string, unknown>): {
  ok: boolean;
  missing: Array<V2DynamicOiMarginConfigField | string>;
  values: Partial<V2DynamicOiMarginConfigValues>;
} {
  const nested = input.dynamic_oi_margin;
  const source = nested && typeof nested === "object" ? nested as Record<string, unknown> : input;
  const missing: Array<V2DynamicOiMarginConfigField | string> = [];
  for (const field of V2_DYNAMIC_OI_MARGIN_CONFIG_FIELDS) {
    if (source[field] === undefined || source[field] === null) missing.push(field);
  }
  if (missing.length > 0) return { ok: false, missing, values: {} };
  try {
    const raw = concat(V2_DYNAMIC_OI_MARGIN_CONFIG_FIELDS.map((field) => uint64Bytes(bigint(source[field] as BigNumberish))));
    return { ok: true, missing: [], values: decodeV2DynamicOiMarginConfig(raw) };
  } catch (error) {
    return { ok: false, missing: [(error as Error).message], values: {} };
  }
}

export function encodeV2MarketRisk(input: V2MarketRiskInput): Uint8Array {
  const values = Object.fromEntries(
    V2_MARKET_RISK_FIELDS.map((field) => [field, requiredRiskValue(input, field)]),
  ) as V2MarketRiskValues;
  validateV2MarketRisk(values);
  return concat(V2_MARKET_RISK_FIELDS.map((field) => uint64Bytes(values[field])));
}

export function validateV2MarketRisk(input: V2MarketRiskInput): void {
  const risk = Object.fromEntries(
    V2_MARKET_RISK_FIELDS.map((field) => [field, requiredRiskValue(input, field)]),
  ) as V2MarketRiskValues;
  for (const side of ["long", "short"] as const) {
    const base = risk[`base_borrowing_factor_${side}_milli_bps`];
    const full = risk[`full_usage_borrowing_factor_${side}_milli_bps`];
    if (base <= 0n) throw new Error(`base borrowing factor must be > 0 for ${side}`);
    if (full > V2_MAX_BORROWING_FACTOR_MILLI_BPS) {
      throw new Error(`borrowing factor exceeds maximum for ${side}`);
    }
    if (base > full) {
      throw new Error(`base borrowing factor must not exceed full usage for ${side}`);
    }
  }

  if (!(risk.max_pnl_factor_for_withdrawals_bps <= risk.min_pnl_factor_after_adl_bps
    && risk.min_pnl_factor_after_adl_bps <= risk.max_pnl_factor_for_adl_bps
    && risk.max_pnl_factor_for_adl_bps <= risk.max_pnl_factor_for_deposits_bps
    && risk.max_pnl_factor_for_deposits_bps <= risk.max_pnl_factor_for_traders_bps)) {
    throw new Error("bad pnl cap order");
  }

  const impactLimits: Array<[keyof V2MarketRiskValues, bigint]> = [
    ["position_impact_factor_bps", V2_BPS],
    ["max_position_impact_bps", V2_BPS],
    ["swap_impact_factor_bps", V2_BPS],
    ["max_swap_impact_bps", V2_BPS - 1n],
  ];
  const impactComponents = new Map<keyof V2MarketRiskValues, [bigint, bigint, bigint, bigint]>();
  for (const [field, limit] of impactLimits) {
    const components = decodeV2ImpactSettingComponents(risk[field]);
    if (components[0] > limit || components[1] > limit) throw new Error(`bad ${field}`);
    impactComponents.set(field, components);
  }
  const maxPositionNegative = impactComponents.get("max_position_impact_bps")![1];
  const liquidationEnvelope = risk.liquidation_fee_bps
    + (risk.max_liquidation_impact_bps < maxPositionNegative
      ? risk.max_liquidation_impact_bps
      : maxPositionNegative);
  if (liquidationEnvelope < maxPositionNegative) {
    throw new Error("liquidation fee plus capped impact must cover voluntary close negative impact");
  }
  const maxLiquidationImpact = risk.max_liquidation_impact_bps;
  if (maxPositionNegative > maxLiquidationImpact
    && maxPositionNegative - maxLiquidationImpact >= risk.maintenance_margin_bps) {
    throw new Error("negative impact gap must be below maintenance margin");
  }
}

export function decodeV2ImpactSettingComponents(value: BigNumberish): [bigint, bigint, bigint, bigint] {
  const setting = bigint(value);
  let positive = setting;
  let negative = setting;
  let positiveExponent = 1n;
  let negativeExponent = 1n;
  if (setting >= IMPACT_PACK_FLAG) {
    const body = setting - IMPACT_PACK_FLAG;
    positive = body % IMPACT_PACK_COMPONENT_SCALE;
    negative = (body / IMPACT_PACK_COMPONENT_SCALE) % IMPACT_PACK_COMPONENT_SCALE;
    positiveExponent = (body / IMPACT_PACK_POS_EXP_SCALE) % IMPACT_PACK_EXP_MOD;
    negativeExponent = (body / IMPACT_PACK_NEG_EXP_SCALE) % IMPACT_PACK_EXP_MOD;
    if ((positiveExponent !== 1n && positiveExponent !== 2n)
      || (negativeExponent !== 1n && negativeExponent !== 2n)) {
      throw new Error("bad impact exponent");
    }
  }
  if (positive > negative) throw new Error("bad impact factor");
  return [positive, negative, positiveExponent, negativeExponent];
}

export function readV2MarketRisk(input: Record<string, unknown>): {
  ok: boolean;
  missing: V2MarketRiskField[];
  values: Partial<V2MarketRiskValues>;
} {
  const missing: V2MarketRiskField[] = [];
  const values: Partial<V2MarketRiskValues> = {};
  for (const field of V2_MARKET_RISK_FIELDS) {
    if (input[field] === undefined || input[field] === null) {
      missing.push(field);
      continue;
    }
    try {
      values[field] = bigint(input[field] as BigNumberish);
    } catch {
      missing.push(field);
    }
  }
  return { ok: missing.length === 0, missing, values };
}

function requiredRiskValue(input: V2MarketRiskInput, field: V2MarketRiskField): bigint {
  const value = input[field];
  if (value === undefined || value === null) {
    throw new Error(`missing V2 market risk field: ${field}`);
  }
  return bigint(value);
}

function bigint(value: BigNumberish): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return BigInt(value as unknown as number);
}
