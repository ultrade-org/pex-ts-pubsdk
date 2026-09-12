import {
  decodeV2PendingImpactQty,
  HEAVY_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ADL_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ADMIN_OPS_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_DECREASE_OR_CLOSE_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_DECREASE_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_SIGNED_QTY_BIAS,
  V2_LIQUIDATION_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO,
  V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_SINGLE_TOKEN_DECREASE_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_TRADING_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_WITHDRAW_LIQUIDITY_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_WITHDRAW_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO,
  type BigNumberish,
} from "./constants.js";
import {
  V2_MATH_FACTOR_SCALE,
  readV2DynamicOiMarginConfig,
  readV2MarketRisk,
  type V2MarketRiskField,
  type V2MarketRiskValues,
} from "./v2Risk.js";
import {
  V2_POSITION_COST_QUOTE_VERSION,
  quoteV2PositionCostSlice,
} from "./v2PositionResolution.js";
import { readV2MarketPositionScales } from "./boxes.js";
import { MAX_ORACLE_PRICE, ORACLE_PRICE_SCALE, validateRawPrice12, type RawPrice12 } from "./oracle.js";
import {
  MAX_POSITION_BUILDER_FEE_BPS,
  MAX_SWAP_BUILDER_FEE_BPS,
  normalizeBuilderFee,
  type BuilderFeeInput,
} from "./transactions.js";

export type V2StateRecord = Record<string, unknown>;
export type V2QuoteResult = Record<string, unknown>;

export const V2_BPS = 10_000n;
export const V2_BORROWING_FACTOR_SCALE = 1_000n;
export const V2_BORROWING_FACTOR_DENOMINATOR = V2_BPS * V2_BORROWING_FACTOR_SCALE;
export const V2_MAX_BORROWING_FACTOR_MILLI_BPS = 2_000n;
export const V2_MAX_FUNDING_FACTOR_MILLI_BPS = 3_000n;
export const V2_USD_SCALE = 1_000_000n;
export const V2_MAX_POSITION_QUANTIZATION_BPS = 1n;
export const V2_SIDE_LONG = 1n;
export const V2_SIDE_SHORT = 2n;
export const V2_DEFAULT_SWAP_FEE_IMPROVE_BPS = 4n;
export const V2_DEFAULT_SWAP_FEE_WORSEN_BPS = 6n;
export const V2_WITHDRAW_OUTPUT_BOTH = 0n;
export const V2_WITHDRAW_OUTPUT_LONG_ONLY = 1n;
export const V2_WITHDRAW_OUTPUT_SHORT_ONLY = 2n;
export const V2_OUTPUT_SWAP_NONE = 0n;
export const V2_OUTPUT_SWAP_PNL_TO_COLLATERAL = 1n;
export const V2_OUTPUT_SWAP_COLLATERAL_TO_PNL = 2n;
export const V2_DEFAULT_POSITION_IMPACT_FACTOR_BPS = 10n;
export const V2_DEFAULT_MAX_POSITION_IMPACT_BPS = 100n;
export const V2_DEFAULT_SWAP_IMPACT_FACTOR_BPS = 10n;
export const V2_DEFAULT_MAX_SWAP_IMPACT_BPS = 100n;
export const V2_DEFAULT_MAX_PNL_FACTOR_FOR_TRADERS_BPS = 5_000n;
export const V2_DEFAULT_MAX_PNL_FACTOR_FOR_ADL_BPS = 6_000n;
export const V2_DEFAULT_STANDARD_POOL_FEE_BPS = 7_000n;
export const V2_DEFAULT_STANDARD_PROTOCOL_FEE_BPS = 1_000n;
export const V2_DEFAULT_STANDARD_INSURANCE_FEE_BPS = 2_000n;
export const V2_DEFAULT_LIQUIDATION_POOL_FEE_BPS = 6_000n;
export const V2_DEFAULT_LIQUIDATION_PROTOCOL_FEE_BPS = 1_000n;
export const V2_DEFAULT_LIQUIDATION_INSURANCE_FEE_BPS = 1_000n;
export const V2_DEFAULT_LIQUIDATION_KEEPER_FEE_BPS = 2_000n;
export const V2_FUNDING_CLAIM_SCALE = 1_000_000_000_000n;
export const V2_IMPACT_PACK_FLAG = 1_000_000_000_000_000_000n;
export const V2_IMPACT_PACK_COMPONENT_SCALE = 1_000_000n;
export const V2_IMPACT_PACK_POS_EXP_SCALE = 1_000_000_000_000n;
export const V2_IMPACT_PACK_NEG_EXP_SCALE = 1_000_000_000_000_000n;
export const V2_IMPACT_PACK_EXP_MOD = 1_000n;
export const V2_HEAVY_METHOD_FLAT_FEE_MICRO_ALGO = BigInt(HEAVY_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_ADMIN_OPS_QUOTE_METHOD_FLAT_FEE_MICRO_ALGO = BigInt(V2_ADMIN_OPS_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_WITHDRAW_LIQUIDITY_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO =
  BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_WITHDRAW_LIQUIDITY_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_WITHDRAW_WITH_SWAP_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO =
  BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_WITHDRAW_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_ROUTE_SWAP_QUOTE_ONE_HOP_FLAT_FEE_MICRO_ALGO =
  1_000n + BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_SWAP_QUOTE_ONE_HOP_FLAT_FEE_MICRO_ALGO = 1_000n + BigInt(V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_ROUTE_SWAP_QUOTE_TWO_HOP_FLAT_FEE_MICRO_ALGO =
  1_000n + 2n * BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_TRADING_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO =
  BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_TRADING_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_LIQUIDATION_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO =
  BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_LIQUIDATION_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_ADL_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO =
  BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO) + BigInt(V2_ADL_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_SINGLE_TOKEN_QUOTE_FLAT_FEE_MICRO_ALGO = V2_HEAVY_METHOD_FLAT_FEE_MICRO_ALGO;
const V2_SINGLE_TOKEN_TRADING_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO = V2_TRADING_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO;
const V2_SINGLE_TOKEN_DECREASE_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO =
  BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO)
  + BigInt(V2_SINGLE_TOKEN_DECREASE_METHOD_FLAT_FEE_MICRO_ALGO);
const V2_SINGLE_TOKEN_LIQUIDATION_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO = V2_LIQUIDATION_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO;
const V2_SINGLE_TOKEN_ADL_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO = V2_ADL_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO;
const V2_CVA_QUOTE_FLAT_FEE_MICRO_ALGO = V2_HEAVY_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_CVA_MARKET_STATUS_NORMAL = 1n;
export const V2_CVA_MARKET_STATUS_WITHDRAW_ONLY = 3n;
export const V2_DIRECT_LP_WITHDRAW_COOLDOWN_SECONDS = 3_600n;
const V2_UINT64_MAX = (1n << 64n) - 1n;
const V2_LP_NAV_REQUEST_FIELDS = [
  "version", "flags", "pool_long", "pool_short", "impact_qty", "lent_qty",
  "long_oi", "short_oi", "long_tokens", "short_tokens", "index_min", "index_max",
  "long_min", "long_max", "short_min", "short_max", "deposit_cap_bps",
  "withdraw_cap_bps", "long_borrowing_factor", "short_borrowing_factor",
  "long_total_borrowing", "short_total_borrowing", "supply", "share_amount",
  "position_conversion_scale",
] as const;
const V2_LP_NAV_RESULT_FIELDS = [
  "version", "flags", "deposit_value", "withdraw_value", "withdraw_usd", "long_out",
  "short_out", "pending_long", "pending_short", "pending_total", "deposit_long_positive",
  "deposit_short_positive", "withdraw_long_positive", "withdraw_short_positive",
  "deposit_long_negative", "deposit_short_negative", "withdraw_long_negative",
  "withdraw_short_negative",
] as const;

export interface V2DirectLpWithdrawCooldown {
  ok: boolean;
  blocked: boolean;
  failure_reasons: string[];
  last_deposit_timestamp: bigint;
  current_timestamp: bigint;
  ready_timestamp: bigint;
  remaining_seconds: bigint;
  cooldown_seconds: bigint;
}

export function quoteV2DirectLpWithdrawCooldown(input: {
  lastDepositTimestamp: BigNumberish;
  currentTimestamp: BigNumberish;
}): V2DirectLpWithdrawCooldown {
  const lastDeposit = max(0n, n(input.lastDepositTimestamp));
  const current = max(0n, n(input.currentTimestamp));
  const ready = lastDeposit > 0n ? lastDeposit + V2_DIRECT_LP_WITHDRAW_COOLDOWN_SECONDS : 0n;
  const blocked = ready > 0n && current < ready;
  return {
    ok: !blocked,
    blocked,
    failure_reasons: blocked ? ["withdraw_cooldown"] : [],
    last_deposit_timestamp: lastDeposit,
    current_timestamp: current,
    ready_timestamp: ready,
    remaining_seconds: blocked ? ready - current : 0n,
    cooldown_seconds: V2_DIRECT_LP_WITHDRAW_COOLDOWN_SECONDS,
  };
}

export function quoteV2LpNavV1(request: Record<string, BigNumberish>): Record<string, bigint> {
  const keys = Object.keys(request).sort();
  const expectedKeys = [...V2_LP_NAV_REQUEST_FIELDS].sort();
  if (keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    throw new Error("bad request fields");
  }
  const values: Record<string, bigint> = {};
  for (const field of V2_LP_NAV_REQUEST_FIELDS) values[field] = v2U64(n(request[field]));
  if (values.version !== 2n || (values.flags !== 0n && values.flags !== 1n)) {
    throw new Error("bad version or flags");
  }
  if (values.flags === 1n && values.pool_short !== 0n) throw new Error("bad single pool");
  for (const [low, high] of [["index_min", "index_max"], ["long_min", "long_max"], ["short_min", "short_max"]] as const) {
    if (values[low] <= 0n || values[high] < values[low]) throw new Error("bad price");
  }
  if (values.share_amount > values.supply) throw new Error("bad shares");

  const pendingLong = v2PendingBorrowing(values.long_oi, values.long_borrowing_factor, values.long_total_borrowing);
  const pendingShort = v2PendingBorrowing(values.short_oi, values.short_borrowing_factor, values.short_total_borrowing);
  const pendingTotal = v2U64(pendingLong + pendingShort);
  const deposit = v2LpNavContext(values, true);
  const withdraw = v2LpNavContext(values, false);
  const depositValue = v2U64(deposit[0] + pendingTotal);
  const withdrawValue = v2U64(withdraw[0] + pendingTotal);

  let withdrawUsd = 0n;
  let longOut = 0n;
  let shortOut = 0n;
  if (values.share_amount > 0n) {
    if (values.supply === 0n) throw new Error("bad supply");
    withdrawUsd = v2MulDiv(values.share_amount, withdrawValue, values.supply);
    if (values.flags === 1n) {
      longOut = v2MulDiv(withdrawUsd, ORACLE_PRICE_SCALE, values.long_max);
    } else {
      const longPoolUsd = v2MulDiv(values.pool_long, values.long_max, ORACLE_PRICE_SCALE);
      const shortPoolUsd = v2MulDiv(values.pool_short, values.short_max, ORACLE_PRICE_SCALE);
      const rawPoolUsd = v2U64(longPoolUsd + shortPoolUsd);
      if (rawPoolUsd === 0n) throw new Error("zero raw pool");
      const longOutputUsd = v2MulDiv(withdrawUsd, longPoolUsd, rawPoolUsd);
      const shortOutputUsd = v2MulDiv(withdrawUsd, shortPoolUsd, rawPoolUsd);
      longOut = v2MulDiv(longOutputUsd, ORACLE_PRICE_SCALE, values.long_max);
      shortOut = v2MulDiv(shortOutputUsd, ORACLE_PRICE_SCALE, values.short_max);
    }
    if (longOut > values.pool_long || shortOut > values.pool_short) throw new Error("output exceeds pool");
  }
  const resultValues = [
    2n, values.flags, depositValue, withdrawValue, withdrawUsd, longOut, shortOut,
    pendingLong, pendingShort, pendingTotal, deposit[1], deposit[2], withdraw[1],
    withdraw[2], deposit[3], deposit[4], withdraw[3], withdraw[4],
  ];
  return Object.fromEntries(V2_LP_NAV_RESULT_FIELDS.map((field, index) => [field, resultValues[index]]));
}

function v2U64(value: bigint): bigint {
  if (value < 0n || value > V2_UINT64_MAX) throw new RangeError("uint64 overflow");
  return value;
}

function v2MulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("zero denominator");
  return v2U64((a * b) / denominator);
}

function v2PendingBorrowing(oiUsd: bigint, factor: bigint, aggregate: bigint): bigint {
  const weighted = v2MulDiv(oiUsd, factor, V2_BORROWING_FACTOR_DENOMINATOR);
  if (weighted < aggregate) throw new Error("borrowing aggregate underflow");
  return weighted - aggregate;
}

function v2SidePnl(
  side: bigint,
  oiUsd: bigint,
  tokens: bigint,
  price: bigint,
  positionConversionScale: bigint,
): [bigint, bigint] {
  const value = v2MulDiv(tokens, price, positionConversionScale);
  const signed = side === V2_SIDE_LONG ? value - oiUsd : oiUsd - value;
  return [max(signed, 0n), max(-signed, 0n)];
}

function v2LpNavContext(request: Record<string, bigint>, deposit: boolean): [bigint, bigint, bigint, bigint, bigint] {
  const single = request.flags === 1n;
  const longPoolPrice = deposit ? request.long_max : request.long_min;
  const shortPoolPrice = deposit ? request.short_max : request.short_min;
  const longIndex = deposit ? request.index_min : request.index_max;
  const shortIndex = deposit ? request.index_max : request.index_min;
  const impactPrice = deposit ? request.index_min : request.index_max;
  const lentPrice = deposit ? request.index_max : request.index_min;
  const capBps = deposit ? request.deposit_cap_bps : request.withdraw_cap_bps;
  const longPoolUsd = v2MulDiv(request.pool_long, longPoolPrice, ORACLE_PRICE_SCALE);
  const shortPoolUsd = single ? longPoolUsd : v2MulDiv(request.pool_short, shortPoolPrice, ORACLE_PRICE_SCALE);
  const rawPoolUsd = single ? longPoolUsd : v2U64(longPoolUsd + shortPoolUsd);
  let value = v2U64(
    rawPoolUsd + v2MulDiv(request.lent_qty, lentPrice, request.position_conversion_scale),
  );
  value = max(
    0n,
    value - v2MulDiv(request.impact_qty, impactPrice, request.position_conversion_scale),
  );
  let [longPositive, longNegative] = v2SidePnl(V2_SIDE_LONG, request.long_oi, request.long_tokens, longIndex, request.position_conversion_scale);
  let [shortPositive, shortNegative] = v2SidePnl(V2_SIDE_SHORT, request.short_oi, request.short_tokens, shortIndex, request.position_conversion_scale);
  longPositive = min(longPositive, (longPoolUsd * capBps) / V2_BPS);
  shortPositive = min(shortPositive, (shortPoolUsd * capBps) / V2_BPS);
  value = v2U64(value + longNegative + shortNegative);
  value = max(0n, value - longPositive - shortPositive);
  return [value, longPositive, shortPositive, longNegative, shortNegative];
}
type V2PnlContext = "traders" | "deposits" | "withdrawals" | "adl";
export interface V2PriceInput extends V2StateRecord {
  index_price?: BigNumberish;
  indexPrice?: BigNumberish;
  index_price_min?: BigNumberish;
  indexPriceMin?: BigNumberish;
  index_price_max?: BigNumberish;
  indexPriceMax?: BigNumberish;
  long_price?: BigNumberish;
  longPrice?: BigNumberish;
  long_price_min?: BigNumberish;
  longPriceMin?: BigNumberish;
  long_price_max?: BigNumberish;
  longPriceMax?: BigNumberish;
  short_price?: BigNumberish;
  shortPrice?: BigNumberish;
  short_price_min?: BigNumberish;
  shortPriceMin?: BigNumberish;
  short_price_max?: BigNumberish;
  shortPriceMax?: BigNumberish;
}

interface V2PriceSet extends V2StateRecord {
  index_price: bigint;
  index_price_min: bigint;
  index_price_max: bigint;
  long_price: bigint;
  long_price_min: bigint;
  long_price_max: bigint;
  short_price: bigint;
  short_price_min: bigint;
  short_price_max: bigint;
}

export function quoteV2PoolValue(input: {
  pool: V2StateRecord;
  market: V2StateRecord;
  prices: V2PriceInput;
  positions?: V2StateRecord[];
  pnlContext?: V2PnlContext;
  poolLongAmount?: BigNumberish;
  poolShortAmount?: BigNumberish;
}): bigint {
  const prices = priceSet(input.prices);
  const pnlMarket = input.market;
  const longAmount = input.poolLongAmount === undefined ? get(input.pool, "long_pool_amount") : n(input.poolLongAmount);
  const shortAmount = input.poolShortAmount === undefined ? get(input.pool, "short_pool_amount") : n(input.poolShortAmount);
  const context = input.pnlContext ?? "traders";
  const quote = quoteV2LpNavV1(lpNavRequest({
    market: pnlMarket,
    pool: input.pool,
    prices,
    pnlContext: context,
    poolLongAmount: longAmount,
    poolShortAmount: shortAmount,
  }));
  return context === "deposits" ? quote.deposit_value : quote.withdraw_value;
}

export function quoteV2LpDeposit(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  longAmount: BigNumberish;
  shortAmount: BigNumberish;
  minMarketShares?: BigNumberish;
  prices?: V2PriceInput;
  positions?: V2StateRecord[];
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const longAmount = n(input.longAmount);
  const shortAmount = n(input.shortAmount);
  const reasons: string[] = [];
  requiredMarketRisk(input.market, reasons);
  const navQuote = quoteV2LpNavV1(lpNavRequest({
    market: input.market,
    pool: input.pool,
    prices,
    pnlContext: "deposits",
  }));
  const poolValueBefore = navQuote.deposit_value;
  const depositPrices = { ...prices, long_price: prices.long_price_max, short_price: prices.short_price_max };
  checkLpMaxPnlFactor(
    input.market,
    get(input.pool, "long_pool_amount"),
    get(input.pool, "short_pool_amount"),
    prices.index_price_max,
    prices.index_price_min,
    depositPrices.long_price,
    depositPrices.short_price,
    "deposits",
    reasons,
    "deposit_pre",
  );
  const depositValue = (longAmount * depositPrices.long_price) / ORACLE_PRICE_SCALE + (shortAmount * depositPrices.short_price) / ORACLE_PRICE_SCALE;
  const impact = depositImpact(input.pool, input.market, longAmount, shortAmount, depositPrices);
  const adjusted = max(0n, depositValue + impact.positiveValueUsd - impact.negativeValueUsd);
  const fee = 0n;
  const supply = get(input.pool, "market_share_supply");
  const minted = supply <= 0n ? adjusted : poolValueBefore > 0n ? (adjusted * supply) / poolValueBefore : 0n;
  const longAfter = get(input.pool, "long_pool_amount") + impact.longAdd;
  const shortAfter = get(input.pool, "short_pool_amount") + impact.shortAdd;
  if (longAmount <= 0n && shortAmount <= 0n) reasons.push("empty_deposit");
  if (adjusted <= 0n) reasons.push("deposit_value_too_small");
  if (minted < n(input.minMarketShares ?? 0n)) reasons.push("min_market_shares");
  checkPoolCaps(input.market, longAfter, shortAfter, depositPrices, reasons);
  checkLpMaxPnlFactor(
    input.market,
    longAfter,
    shortAfter,
    prices.index_price_max,
    prices.index_price_min,
    depositPrices.long_price,
    depositPrices.short_price,
    "deposits",
    reasons,
    "deposit_post",
  );
  return withV2Meta({
    type: "v2_lp_deposit",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    long_amount: longAmount,
    short_amount: shortAmount,
    deposit_value_usd: depositValue,
    impact_usd: impact.positiveValueUsd - impact.negativeValueUsd,
    impact_positive_usd: impact.positiveValueUsd,
    impact_negative_usd: impact.negativeValueUsd,
    fee_amount: fee,
    market_shares_out: minted,
    long_pool_amount_after: longAfter,
    short_pool_amount_after: shortAfter,
    swap_impact_pool_long_amount_after: impact.swapImpactPoolLongAfter,
    swap_impact_pool_short_amount_after: impact.swapImpactPoolShortAfter,
    market_share_supply_after: supply + minted,
    pool_value_before: poolValueBefore,
    pending_borrowing_long_usd: navQuote.pending_long,
    pending_borrowing_short_usd: navQuote.pending_short,
    pending_borrowing_total_usd: navQuote.pending_total,
    required_flat_fee_microalgos: V2_ADMIN_OPS_QUOTE_METHOD_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2LpWithdraw(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  shareAmount: BigNumberish;
  minLongAmount?: BigNumberish;
  minShortAmount?: BigNumberish;
  prices?: V2PriceInput;
  positions?: V2StateRecord[];
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const shareAmount = n(input.shareAmount);
  const supply = get(input.pool, "market_share_supply");
  const longPool = get(input.pool, "long_pool_amount");
  const shortPool = get(input.pool, "short_pool_amount");
  const reasons: string[] = [];
  requiredMarketRisk(input.market, reasons);
  if (shareAmount <= 0n || shareAmount > supply) reasons.push("invalid_share_amount");
  const navQuote = quoteV2LpNavV1(lpNavRequest({
    market: input.market,
    pool: input.pool,
    prices,
    pnlContext: "withdrawals",
    shareAmount: shareAmount > 0n && shareAmount <= supply ? shareAmount : 0n,
  }));
  const longOut = navQuote.long_out;
  const shortBeforeFee = navQuote.short_out;
  const feeUsd = 0n;
  const shortFee = 0n;
  const shortOut = shortBeforeFee;
  if (longOut < n(input.minLongAmount ?? 0n)) reasons.push("min_long_amount");
  if (shortOut < n(input.minShortAmount ?? 0n)) reasons.push("min_short_amount");
  const longAfter = max(0n, longPool - longOut);
  const shortAfter = max(0n, shortPool - shortOut);
  checkLpMaxPnlFactor(
    input.market,
    longAfter,
    shortAfter,
    prices.index_price_max,
    prices.index_price_min,
    prices.long_price_min,
    prices.short_price_min,
    "withdrawals",
    reasons,
    "withdraw_post",
  );
  checkReserves(input.market, { ...input.pool, long_pool_amount: longAfter, short_pool_amount: shortAfter }, prices, reasons);
  return withV2Meta({
    type: "v2_lp_withdraw",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    share_amount: shareAmount,
    long_amount_out: longOut,
    short_amount_out: shortOut,
    withdrawal_value_usd: navQuote.withdraw_usd,
    pending_borrowing_long_usd: navQuote.pending_long,
    pending_borrowing_short_usd: navQuote.pending_short,
    pending_borrowing_total_usd: navQuote.pending_total,
    fee_amount: shortFee,
    withdrawal_fee_usd: feeUsd,
    long_pool_amount_after: longAfter,
    short_pool_amount_after: shortAfter,
    market_share_supply_after: max(0n, supply - shareAmount),
    required_flat_fee_microalgos: V2_WITHDRAW_LIQUIDITY_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2CvaNav(input: { vault: V2StateRecord; prices: V2PriceInput; navContext?: "deposit" | "mint" | "withdraw" | "burn" }): bigint {
  const prices = priceSet(input.prices);
  const depositContext = input.navContext === "deposit" || input.navContext === "mint";
  const longPrice = depositContext ? prices.long_price_max : prices.long_price;
  const shortPrice = depositContext ? prices.short_price_max : prices.short_price;
  const allocationValue = depositContext
    ? get(input.vault, "deposit_total_allocation_value_usd", "depositTotalAllocationValueUsd")
    : get(input.vault, "total_allocation_value_usd", "totalAllocationValueUsd");
  const idleValue =
    (get(input.vault, "idle_long_amount") * longPrice) / ORACLE_PRICE_SCALE +
    (get(input.vault, "idle_short_amount") * shortPrice) / ORACLE_PRICE_SCALE;
  return idleValue + allocationValue;
}

function cvaMintSpreadNav(vault: V2StateRecord, navValue: bigint): bigint {
  const spreadBps = get(vault, "cva_mint_spread_bps", "cvaMintSpreadBps");
  return spreadBps > 0n ? navValue + feeFromBps(navValue, spreadBps) : navValue;
}

function cvaBurnSpreadValue(vault: V2StateRecord, withdrawValue: bigint): bigint {
  const spreadBps = get(vault, "cva_burn_spread_bps", "cvaBurnSpreadBps");
  if (spreadBps <= 0n) return withdrawValue;
  const spread = feeFromBps(withdrawValue, spreadBps);
  return spread >= withdrawValue ? 0n : withdrawValue - spread;
}

function quoteV2CvaActiveMarkProjection(input: {
  allocations: V2StateRecord[];
  pools: Record<string, V2StateRecord> | V2StateRecord[];
  markets: Record<string, V2StateRecord> | V2StateRecord[];
  pricesByMarket: Record<string, V2PriceInput>;
}): {
  allocations: Map<string, V2StateRecord>;
  withdrawTotal: bigint;
  depositTotal: bigint;
  reasons: string[];
} {
  const poolMap = byMarketId(input.pools);
  const marketMap = byMarketId(input.markets);
  let withdrawTotal = 0n;
  let depositTotal = 0n;
  const allocations = new Map<string, V2StateRecord>();
  const reasons: string[] = [];
  for (const allocation of input.allocations) {
    const lpShareAmount = get(allocation, "lp_share_amount", "lpShareAmount");
    const marketId = get(allocation, "market_id", "marketId");
    const marketKey = marketId.toString();
    if (lpShareAmount <= 0n) {
      allocations.set(marketKey, allocation);
      continue;
    }
    const pool = poolMap.get(marketKey);
    const market = marketMap.get(marketKey);
    const marketPrices = input.pricesByMarket[marketKey];
    if (pool === undefined || market === undefined || marketPrices === undefined) {
      reasons.push(`active_mark_state_unavailable:${marketKey}`);
      continue;
    }
    const supply = get(pool, "market_share_supply", "share_supply");
    if (supply <= 0n) {
      reasons.push(`active_mark_bad_share_supply:${marketKey}`);
      continue;
    }
    const withdrawPoolValue = quoteV2PoolValue({
      pool,
      market,
      prices: marketPrices,
      pnlContext: "withdrawals",
    });
    const depositPoolValue = quoteV2PoolValue({
      pool,
      market,
      prices: marketPrices,
      pnlContext: "deposits",
    });
    const withdrawMark = (withdrawPoolValue * lpShareAmount) / supply;
    const depositMark = (depositPoolValue * lpShareAmount) / supply;
    withdrawTotal += withdrawMark;
    depositTotal += depositMark;
    allocations.set(marketKey, {
      ...allocation,
      last_mark_value_usd: withdrawMark,
      last_deposit_mark_value_usd: depositMark,
    });
  }
  return { allocations, withdrawTotal, depositTotal, reasons };
}

export function quoteV2CvaDeposit(input: {
  vault: V2StateRecord;
  longAmount: BigNumberish;
  shortAmount: BigNumberish;
  minCvaShares?: BigNumberish;
  prices: V2PriceInput;
  allocations?: V2StateRecord[];
  pools?: Record<string, V2StateRecord> | V2StateRecord[];
  markets?: Record<string, V2StateRecord> | V2StateRecord[];
  pricesByMarket?: Record<string, V2PriceInput>;
}): V2QuoteResult {
  const prices = priceSet(input.prices);
  const longAmount = n(input.longAmount);
  const shortAmount = n(input.shortAmount);
  const reasons: string[] = [];
  let quoteVault = input.vault;
  const activeMarksProjected = input.allocations !== undefined
    && input.pools !== undefined
    && input.markets !== undefined
    && input.pricesByMarket !== undefined;
  if (activeMarksProjected) {
    const projected = quoteV2CvaActiveMarkProjection({
      allocations: input.allocations ?? [],
      pools: input.pools ?? [],
      markets: input.markets ?? [],
      pricesByMarket: input.pricesByMarket ?? {},
    });
    reasons.push(...projected.reasons);
    quoteVault = {
      ...input.vault,
      total_allocation_value_usd: projected.withdrawTotal,
      deposit_total_allocation_value_usd: projected.depositTotal,
    };
  }
  const navBefore = quoteV2CvaNav({ vault: quoteVault, prices, navContext: "deposit" });
  const withdrawNavBefore = quoteV2CvaNav({ vault: quoteVault, prices, navContext: "withdraw" });
  const depositValue =
    (longAmount * prices.long_price) / ORACLE_PRICE_SCALE +
    (shortAmount * prices.short_price) / ORACLE_PRICE_SCALE;
  const totalShares = get(quoteVault, "total_cva_shares");
  const mintPricingNav = cvaMintSpreadNav(quoteVault, navBefore);
  const sharesOut =
    totalShares <= 0n
      ? depositValue
      : mintPricingNav > 0n
        ? (depositValue * totalShares) / mintPricingNav
        : 0n;
  const maxDeposit = get(input.vault, "max_cva_deposit_usd_per_call", "maxCvaDepositUsdPerCall");
  if (longAmount <= 0n && shortAmount <= 0n) reasons.push("empty_deposit");
  if (totalShares > 0n && navBefore <= 0n) reasons.push("zero_nav");
  if (maxDeposit > 0n && depositValue > maxDeposit) reasons.push("deposit_cap");
  if (sharesOut <= 0n) reasons.push("zero_shares");
  if (sharesOut < n(input.minCvaShares ?? 0n)) reasons.push("min_cva_shares");
  return withV2Meta({
    type: "v2_cva_deposit",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    long_amount: longAmount,
    short_amount: shortAmount,
    deposit_value_usd: depositValue,
    pricing_nav_usd: mintPricingNav,
    deposit_nav_usd_before: navBefore,
    withdraw_nav_usd_before: withdrawNavBefore,
    active_marks_projected: activeMarksProjected,
    projected_total_allocation_value_usd: get(quoteVault, "total_allocation_value_usd", "totalAllocationValueUsd"),
    projected_deposit_total_allocation_value_usd: get(quoteVault, "deposit_total_allocation_value_usd", "depositTotalAllocationValueUsd"),
    mint_spread_bps: get(input.vault, "cva_mint_spread_bps", "cvaMintSpreadBps"),
    mint_spread_usd: max(0n, mintPricingNav - navBefore),
    max_cva_deposit_usd_per_call: maxDeposit,
    cva_shares_out: sharesOut,
    total_cva_shares_after: totalShares + sharesOut,
    idle_long_amount_after: get(input.vault, "idle_long_amount") + longAmount,
    idle_short_amount_after: get(input.vault, "idle_short_amount") + shortAmount,
    total_nav_usd_after: withdrawNavBefore + depositValue,
    required_flat_fee_microalgos: V2_CVA_QUOTE_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2CvaIdleWithdraw(input: {
  vault: V2StateRecord;
  shareAmount: BigNumberish;
  minLongAmount?: BigNumberish;
  minShortAmount?: BigNumberish;
  prices: V2PriceInput;
}): V2QuoteResult {
  const prices = priceSet(input.prices);
  const shareAmount = n(input.shareAmount);
  const reasons: string[] = [];
  const totalShares = get(input.vault, "total_cva_shares");
  const navBefore = quoteV2CvaNav({ vault: input.vault, prices, navContext: "withdraw" });
  const idleLong = get(input.vault, "idle_long_amount");
  const idleShort = get(input.vault, "idle_short_amount");
  const idleValue = (idleLong * prices.long_price) / ORACLE_PRICE_SCALE + (idleShort * prices.short_price) / ORACLE_PRICE_SCALE;
  const grossWithdrawValue = totalShares > 0n ? (shareAmount * navBefore) / totalShares : 0n;
  const withdrawValue = cvaBurnSpreadValue(input.vault, grossWithdrawValue);
  const longOut = idleValue > 0n ? (idleLong * withdrawValue) / idleValue : 0n;
  const shortOut = idleValue > 0n ? (idleShort * withdrawValue) / idleValue : 0n;
  const minWithdraw = get(input.vault, "min_cva_withdraw_usd", "minCvaWithdrawUsd");
  const maxWithdraw = get(input.vault, "max_cva_withdraw_usd_per_call", "maxCvaWithdrawUsdPerCall");
  if (shareAmount <= 0n || shareAmount > totalShares) reasons.push("invalid_share_amount");
  if (minWithdraw > 0n && withdrawValue < minWithdraw) reasons.push("min_cva_withdraw");
  if (maxWithdraw > 0n && withdrawValue > maxWithdraw) reasons.push("withdraw_cap");
  if (idleValue < withdrawValue) reasons.push("insufficient_idle");
  if (longOut < n(input.minLongAmount ?? 0n)) reasons.push("min_long_amount");
  if (shortOut < n(input.minShortAmount ?? 0n)) reasons.push("min_short_amount");
  return withV2Meta({
    type: "v2_cva_idle_withdraw",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    share_amount: shareAmount,
    withdraw_value_usd: withdrawValue,
    gross_withdraw_value_usd: grossWithdrawValue,
    burn_spread_bps: get(input.vault, "cva_burn_spread_bps", "cvaBurnSpreadBps"),
    burn_spread_usd: max(0n, grossWithdrawValue - withdrawValue),
    max_cva_withdraw_usd_per_call: maxWithdraw,
    long_amount_out: longOut,
    short_amount_out: shortOut,
    total_cva_shares_after: max(0n, totalShares - shareAmount),
    idle_long_amount_after: max(0n, idleLong - longOut),
    idle_short_amount_after: max(0n, idleShort - shortOut),
    total_nav_usd_after: max(0n, navBefore - withdrawValue),
    required_flat_fee_microalgos: V2_CVA_QUOTE_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2CvaMarketWithdraw(input: {
  vault: V2StateRecord;
  allocation: V2StateRecord;
  pool: V2StateRecord;
  market: V2StateRecord;
  shareAmount: BigNumberish;
  minLongAmount?: BigNumberish;
  minShortAmount?: BigNumberish;
  prices: V2PriceInput;
  minCvaWithdrawUsd?: BigNumberish;
  positions?: V2StateRecord[];
  allowMarkRefresh?: boolean;
  activeMarksProjected?: boolean;
}): V2QuoteResult {
  const prices = priceSet(input.prices);
  const shareAmount = n(input.shareAmount);
  const reasons: string[] = [];
  const totalShares = get(input.vault, "total_cva_shares");
  const navBefore = quoteV2CvaNav({ vault: input.vault, prices, navContext: "withdraw" });
  const grossWithdrawValue = totalShares > 0n ? (shareAmount * navBefore) / totalShares : 0n;
  const withdrawValue = cvaBurnSpreadValue(input.vault, grossWithdrawValue);
  const minWithdraw =
    input.minCvaWithdrawUsd === undefined
      ? get(input.vault, "min_cva_withdraw_usd")
      : n(input.minCvaWithdrawUsd);
  const maxWithdraw = get(input.vault, "max_cva_withdraw_usd_per_call", "maxCvaWithdrawUsdPerCall");
  const lpShareAmount = get(input.allocation, "lp_share_amount");
  const lastMark = get(input.allocation, "last_mark_value_usd");
  const supply = get(input.pool, "market_share_supply", "share_supply");
  let marketShareAmount = lastMark > 0n ? (withdrawValue * lpShareAmount) / lastMark : 0n;
  if (marketShareAmount === 0n && withdrawValue > 0n) marketShareAmount = 1n;
  const longPool = get(input.pool, "long_pool_amount");
  const shortPool = get(input.pool, "short_pool_amount");
  const lpQuote = quoteV2LpWithdraw({
    market: input.market,
    pool: input.pool,
    shareAmount: marketShareAmount,
    prices,
  });
  const longOut = n(lpQuote.long_amount_out as BigNumberish);
  const shortBeforeFee = n(lpQuote.short_amount_out as BigNumberish);
  const feeUsd = 0n;
  const shortFee = 0n;
  const shortOut = shortBeforeFee;
  const poolLongAfter = max(0n, longPool - longOut);
  const poolShortAfter = max(0n, shortPool - shortOut);
  const supplyAfter = max(0n, supply - marketShareAmount);
  const remainingLp = max(0n, lpShareAmount - marketShareAmount);
  const poolValueAfter = quoteV2PoolValue({
    pool: input.pool,
    prices,
    market: input.market,
    positions: input.positions,
    pnlContext: "withdrawals",
    poolLongAmount: poolLongAfter,
    poolShortAmount: poolShortAfter,
  });
  const newMark = remainingLp > 0n && supplyAfter > 0n ? (poolValueAfter * remainingLp) / supplyAfter : 0n;
  const allocationAfter =
    max(0n, get(input.vault, "total_allocation_value_usd") - lastMark) + newMark;
  const idleValue =
    (get(input.vault, "idle_long_amount") * prices.long_price) / ORACLE_PRICE_SCALE +
    (get(input.vault, "idle_short_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
  const totalNavAfter = idleValue + allocationAfter;
  const postWeightBps = totalNavAfter > 0n ? (newMark * V2_BPS) / totalNavAfter : 0n;
  const status = get(input.allocation, "status", undefined, undefined, V2_CVA_MARKET_STATUS_NORMAL);
  const markRefreshRequired = get(input.allocation, "mark_stale") > 0n || get(input.allocation, "needs_mark_refresh") > 0n;
  if (input.activeMarksProjected !== true) reasons.push("active_marks_not_projected");
  if (shareAmount <= 0n || shareAmount > totalShares) reasons.push("invalid_share_amount");
  if (minWithdraw > 0n && withdrawValue < minWithdraw) reasons.push("min_cva_withdraw");
  if (maxWithdraw > 0n && withdrawValue > maxWithdraw) reasons.push("withdraw_cap");
  if (status !== V2_CVA_MARKET_STATUS_NORMAL && status !== V2_CVA_MARKET_STATUS_WITHDRAW_ONLY) reasons.push("bad_market_status");
  if (markRefreshRequired && !input.allowMarkRefresh) reasons.push("mark_stale");
  if (lpShareAmount <= 0n) reasons.push("zero_market_allocation");
  if (supply <= 0n) reasons.push("bad_share_supply");
  if (lastMark < withdrawValue) reasons.push("market_value_insufficient");
  if (withdrawValue > get(input.allocation, "max_withdraw_usd_per_call")) reasons.push("withdraw_cap");
  if (longOut < n(input.minLongAmount ?? 0n)) reasons.push("min_long_amount");
  if (shortOut < n(input.minShortAmount ?? 0n)) reasons.push("min_short_amount");
  if (
    status === V2_CVA_MARKET_STATUS_NORMAL &&
    totalNavAfter > 0n &&
    postWeightBps < get(input.allocation, "min_weight_bps")
  ) {
    reasons.push("min_weight");
  }
  return withV2Meta({
    type: "v2_cva_market_withdraw",
    route_type: "single_market",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.allocation, "market_id"),
    share_amount: shareAmount,
    withdraw_value_usd: withdrawValue,
    gross_withdraw_value_usd: grossWithdrawValue,
    burn_spread_bps: get(input.vault, "cva_burn_spread_bps", "cvaBurnSpreadBps"),
    burn_spread_usd: max(0n, grossWithdrawValue - withdrawValue),
    max_cva_withdraw_usd_per_call: maxWithdraw,
    market_share_amount: marketShareAmount,
    long_amount_out: longOut,
    short_amount_out: shortOut,
    withdrawal_fee_usd: feeUsd,
    short_fee_amount: shortFee,
    market_lp_quote: lpQuote,
    pending_borrowing_total_usd: n(lpQuote.pending_borrowing_total_usd as BigNumberish),
    market_mark_value_usd_after: newMark,
    mark_refresh_required: markRefreshRequired,
    active_marks_projected: input.activeMarksProjected === true,
    total_nav_usd_after: totalNavAfter,
    post_withdraw_weight_bps: postWeightBps,
    total_cva_shares_after: max(0n, totalShares - shareAmount),
    yield_recall_required: false,
    required_flat_fee_microalgos: V2_CVA_QUOTE_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2CvaWithdrawRoute(input: {
  vault: V2StateRecord;
  allocations: V2StateRecord[];
  pools: Record<string, V2StateRecord> | V2StateRecord[];
  shareAmount: BigNumberish;
  minLongAmount?: BigNumberish;
  minShortAmount?: BigNumberish;
  prices: V2PriceInput;
  pricesByMarket?: Record<string, V2PriceInput>;
  minCvaWithdrawUsd?: BigNumberish;
  markets: Record<string, V2StateRecord> | V2StateRecord[];
  positions?: V2StateRecord[];
  allowMarkRefresh?: boolean;
}): V2QuoteResult {
  const allocationList = [...input.allocations];
  const activeMarketIds = allocationList
    .filter((allocation) => get(allocation, "lp_share_amount", "lpShareAmount") > 0n)
    .map((allocation) => get(allocation, "market_id", "marketId").toString());
  const effectivePricesByMarket = { ...(input.pricesByMarket ?? {}) };
  if (activeMarketIds.length === 1 && effectivePricesByMarket[activeMarketIds[0]] === undefined) {
    effectivePricesByMarket[activeMarketIds[0]] = input.prices;
  }
  const projected = quoteV2CvaActiveMarkProjection({
    allocations: allocationList,
    pools: input.pools,
    markets: input.markets,
    pricesByMarket: effectivePricesByMarket,
  });
  if (projected.reasons.length > 0) {
    return withV2Meta({
      type: "v2_cva_withdraw_route",
      ok: false,
      route_type: "unavailable",
      failure_reasons: projected.reasons,
      recommended_route: null,
      alternative_routes: [],
      idle_route: null,
      unavailable_routes: [],
      active_marks_projected: false,
    });
  }
  const projectedVault: V2StateRecord = {
    ...input.vault,
    total_allocation_value_usd: projected.withdrawTotal,
    deposit_total_allocation_value_usd: projected.depositTotal,
  };
  const projectedAllocationList = allocationList.map((allocation) => {
    const marketId = get(allocation, "market_id", "marketId").toString();
    return projected.allocations.get(marketId) ?? allocation;
  });
  const idle = quoteV2CvaIdleWithdraw({
    vault: projectedVault,
    shareAmount: input.shareAmount,
    minLongAmount: input.minLongAmount,
    minShortAmount: input.minShortAmount,
    prices: input.prices,
  });
  const marketRoutes: V2QuoteResult[] = [];
  const unavailable: V2QuoteResult[] = [];
  const poolMap = byMarketId(input.pools);
  const marketMap = byMarketId(input.markets);
  for (const allocation of allocationList) {
    const marketId = get(allocation, "market_id");
    const projectedAllocation = projected.allocations.get(marketId.toString()) ?? allocation;
    const pool = poolMap.get(marketId.toString()) ?? { market_id: marketId };
    const market = marketMap.get(marketId.toString());
    if (market === undefined) throw new Error("market position conversion scale is required");
    const marketPrices = effectivePricesByMarket[marketId.toString()] ?? input.prices;
    let route: V2QuoteResult;
    try {
      route = quoteV2CvaMarketWithdraw({
        vault: projectedVault,
        allocation: projectedAllocation,
        pool,
        shareAmount: input.shareAmount,
        minLongAmount: input.minLongAmount,
        minShortAmount: input.minShortAmount,
        prices: marketPrices,
        minCvaWithdrawUsd: input.minCvaWithdrawUsd,
        market,
        positions: input.positions,
        allowMarkRefresh: input.allowMarkRefresh,
        activeMarksProjected: true,
      });
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "output exceeds pool") throw error;
      route = withV2Meta({
        type: "v2_cva_market_withdraw",
        route_type: "single_market",
        ok: false,
        failure_reasons: ["market_output_exceeds_pool"],
        market_id: marketId,
        share_amount: n(input.shareAmount),
      });
    }
    if (route.ok) marketRoutes.push(route);
    else unavailable.push(route);
  }
  marketRoutes.sort((left, right) => {
    const leftAllocation = allocationForRoute(projectedAllocationList, n(left.market_id as BigNumberish));
    const rightAllocation = allocationForRoute(projectedAllocationList, n(right.market_id as BigNumberish));
    const leftReduction = get(leftAllocation, "last_mark_value_usd") - n(left.market_mark_value_usd_after as BigNumberish);
    const rightReduction = get(rightAllocation, "last_mark_value_usd") - n(right.market_mark_value_usd_after as BigNumberish);
    if (rightReduction !== leftReduction) return rightReduction > leftReduction ? 1 : -1;
    const leftWeight = n(left.post_withdraw_weight_bps as BigNumberish);
    const rightWeight = n(right.post_withdraw_weight_bps as BigNumberish);
    return rightWeight > leftWeight ? 1 : rightWeight < leftWeight ? -1 : 0;
  });
  let routeType: string;
  let recommended: V2QuoteResult | null;
  let ok: boolean;
  let reasons: string[];
  if (idle.ok) {
    routeType = "idle";
    recommended = idle;
    ok = true;
    reasons = [];
  } else if (marketRoutes.length > 0) {
    routeType = "single_market";
    recommended = marketRoutes[0];
    ok = true;
    reasons = [];
  } else if (unavailable.some((route) => ((route.failure_reasons as string[] | undefined) ?? []).includes("mark_stale"))) {
    routeType = "needs_mark_refresh";
    recommended = null;
    ok = false;
    reasons = ["mark_stale"];
  } else {
    routeType = "unavailable";
    recommended = null;
    ok = false;
    reasons = [
      ...new Set(
        [idle, ...unavailable].flatMap((route) => (route.failure_reasons as string[] | undefined) ?? []),
      ),
    ].sort();
  }
  return withV2Meta({
    type: "v2_cva_withdraw_route",
    ok,
    route_type: routeType,
    failure_reasons: reasons,
    recommended_route: recommended,
    alternative_routes: routeType === "single_market" ? marketRoutes.slice(1) : marketRoutes,
    idle_route: idle,
    unavailable_routes: unavailable,
    active_marks_projected: true,
    projected_total_allocation_value_usd: projected.withdrawTotal,
    projected_deposit_total_allocation_value_usd: projected.depositTotal,
  });
}

export function quoteV2CvaAllocateToMarket(input: {
  vault: V2StateRecord;
  allocation: V2StateRecord;
  market: V2StateRecord;
  pool: V2StateRecord;
  longAmount: BigNumberish;
  shortAmount: BigNumberish;
  minMarketShares?: BigNumberish;
  prices: V2PriceInput;
  positions?: V2StateRecord[];
}): V2QuoteResult {
  const quote = quoteV2LpDeposit({
    market: input.market,
    pool: input.pool,
    longAmount: input.longAmount,
    shortAmount: input.shortAmount,
    minMarketShares: input.minMarketShares,
    prices: input.prices,
    positions: input.positions,
  });
  const reasons = [...(quote.failure_reasons as string[])];
  const longAmount = n(input.longAmount);
  const shortAmount = n(input.shortAmount);
  const depositValue = n(quote.deposit_value_usd as BigNumberish);
  if (longAmount > get(input.vault, "idle_long_amount")) reasons.push("long_idle_insufficient");
  if (shortAmount > get(input.vault, "idle_short_amount")) reasons.push("short_idle_insufficient");
  if (depositValue > get(input.allocation, "max_deposit_usd_per_call")) reasons.push("deposit_cap");
  const totalNav = get(input.vault, "total_nav_usd");
  if (totalNav > 0n) {
    const nextMark = get(input.allocation, "last_mark_value_usd") + depositValue;
    const nextNav = totalNav + depositValue;
    if ((nextMark * V2_BPS) / nextNav > get(input.allocation, "max_weight_bps")) reasons.push("max_weight");
  }
  return {
    ...quote,
    type: "v2_cva_allocate",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    cva_market_lp_shares_after:
      get(input.allocation, "lp_share_amount") + n(quote.market_shares_out as BigNumberish),
    idle_long_amount_after: max(0n, get(input.vault, "idle_long_amount") - longAmount),
    idle_short_amount_after: max(0n, get(input.vault, "idle_short_amount") - shortAmount),
    required_flat_fee_microalgos: V2_CVA_QUOTE_FLAT_FEE_MICRO_ALGO,
  };
}

export function quoteV2SingleTokenLpDeposit(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  backingAmount: BigNumberish;
  minMarketShares?: BigNumberish;
  prices?: V2PriceInput;
  positions?: V2StateRecord[];
}): V2QuoteResult {
  const prices = singleTokenPrices(input.market, input.prices);
  const backingAmount = n(input.backingAmount);
  const reasons = singleTokenMarketReasons(input.market);
  requiredMarketRisk(input.market, reasons);
  const backingPrice = prices.long_price;
  checkLpMaxPnlFactor(
    input.market,
    get(input.pool, "long_pool_amount"),
    0n,
    prices.index_price_max,
    prices.index_price_min,
    backingPrice,
    backingPrice,
    "deposits",
    reasons,
    "deposit_pre",
  );
  const navQuote = quoteV2LpNavV1(lpNavRequest({
    market: input.market,
    pool: input.pool,
    prices,
    pnlContext: "deposits",
  }));
  const poolValueBefore = navQuote.deposit_value;
  const depositValue = (backingAmount * backingPrice) / ORACLE_PRICE_SCALE;
  const feeUsd = 0n;
  const feeAmount = 0n;
  const adjustedValue = depositValue;
  const supply = get(input.pool, "market_share_supply");
  const minted = supply <= 0n ? adjustedValue : poolValueBefore > 0n ? (adjustedValue * supply) / poolValueBefore : 0n;
  const longAfter = get(input.pool, "long_pool_amount") + backingAmount;
  const shortAfter = 0n;
  if (backingAmount <= 0n) reasons.push("empty_deposit");
  if (adjustedValue <= 0n) reasons.push("deposit_value_too_small");
  if (minted < n(input.minMarketShares ?? 0n)) reasons.push("min_market_shares");
  checkPoolCaps(input.market, longAfter, shortAfter, prices, reasons);
  checkLpMaxPnlFactor(
    input.market,
    longAfter,
    shortAfter,
    prices.index_price_max,
    prices.index_price_min,
    backingPrice,
    backingPrice,
    "deposits",
    reasons,
    "deposit_post",
  );
  return withV2Meta({
    type: "v2_single_token_lp_deposit",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    backing_asset_id: get(input.market, "long_asset_id"),
    backing_amount: backingAmount,
    long_amount: backingAmount,
    short_amount: 0n,
    deposit_value_usd: depositValue,
    fee_amount: feeAmount,
    fee_usd: feeUsd,
    market_shares_out: minted,
    shares_minted: minted,
    long_pool_amount_after: longAfter,
    short_pool_amount_after: shortAfter,
    market_share_supply_after: supply + minted,
    pool_value_before: poolValueBefore,
    pending_borrowing_long_usd: navQuote.pending_long,
    pending_borrowing_short_usd: navQuote.pending_short,
    pending_borrowing_total_usd: navQuote.pending_total,
    required_flat_fee_microalgos: V2_SINGLE_TOKEN_QUOTE_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2SingleTokenLpWithdraw(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  shareAmount: BigNumberish;
  minBackingAmount?: BigNumberish;
  prices?: V2PriceInput;
  positions?: V2StateRecord[];
}): V2QuoteResult {
  const prices = singleTokenPrices(input.market, input.prices);
  const shareAmount = n(input.shareAmount);
  const reasons = singleTokenMarketReasons(input.market);
  requiredMarketRisk(input.market, reasons);
  const supply = get(input.pool, "market_share_supply");
  const longPool = get(input.pool, "long_pool_amount");
  if (shareAmount <= 0n || shareAmount > supply) reasons.push("invalid_share_amount");
  const navQuote = quoteV2LpNavV1(lpNavRequest({
    market: input.market,
    pool: input.pool,
    prices,
    pnlContext: "withdrawals",
    shareAmount: shareAmount > 0n && shareAmount <= supply ? shareAmount : 0n,
  }));
  const grossOut = navQuote.long_out;
  const feeUsd = 0n;
  const feeAmount = 0n;
  const backingOut = grossOut;
  if (backingOut < n(input.minBackingAmount ?? 0n)) reasons.push("min_backing_amount");
  const longAfter = max(0n, longPool - grossOut);
  const shortAfter = 0n;
  checkLpMaxPnlFactor(
    input.market,
    longAfter,
    shortAfter,
    prices.index_price_max,
    prices.index_price_min,
    prices.long_price_min,
    prices.long_price_min,
    "withdrawals",
    reasons,
    "withdraw_post",
  );
  checkReserves(input.market, { ...input.pool, long_pool_amount: longAfter, short_pool_amount: shortAfter }, prices, reasons);
  return withV2Meta({
    type: "v2_single_token_lp_withdraw",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    backing_asset_id: get(input.market, "long_asset_id"),
    share_amount: shareAmount,
    shares_burned: shareAmount,
    backing_amount_out: backingOut,
    long_amount_out: backingOut,
    short_amount_out: 0n,
    fee_amount: feeAmount,
    withdrawal_fee_usd: feeUsd,
    withdrawal_value_usd: navQuote.withdraw_usd,
    pending_borrowing_long_usd: navQuote.pending_long,
    pending_borrowing_short_usd: navQuote.pending_short,
    pending_borrowing_total_usd: navQuote.pending_total,
    long_pool_amount_after: longAfter,
    short_pool_amount_after: shortAfter,
    market_share_supply_after: max(0n, supply - shareAmount),
    required_flat_fee_microalgos: V2_SINGLE_TOKEN_QUOTE_FLAT_FEE_MICRO_ALGO,
  });
}

export function maximumV2LpWithdrawableShares(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  availableShareAmount: BigNumberish;
  prices?: V2PriceInput;
  singleToken?: boolean;
}): bigint {
  const supply = get(input.pool, "market_share_supply", "share_supply");
  let high = min(max(0n, n(input.availableShareAmount)), supply);
  if (high <= 0n) return 0n;

  const succeeds = (shareAmount: bigint): boolean => {
    const quote = input.singleToken
      ? quoteV2SingleTokenLpWithdraw({
          market: input.market,
          pool: input.pool,
          shareAmount,
          prices: input.prices,
        })
      : quoteV2LpWithdraw({
          market: input.market,
          pool: input.pool,
          shareAmount,
          prices: input.prices,
        });
    return quote.ok === true;
  };

  if (succeeds(high)) return high;
  let low = 0n;
  while (low + 1n < high) {
    const middle = (low + high) / 2n;
    if (succeeds(middle)) low = middle;
    else high = middle;
  }
  return low;
}

export function quoteV2SwapExactIn(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  tokenInAssetId: BigNumberish;
  amountIn: BigNumberish;
  minAmountOut?: BigNumberish;
  prices?: V2PriceInput;
  builderFee?: BuilderFeeInput;
}): V2QuoteResult {
  const [builderAddress, builderFeeBps] = normalizeBuilderFee(
    input.builderFee,
    MAX_SWAP_BUILDER_FEE_BPS,
  );
  const amountIn = n(input.amountIn);
  const builderFeeAmount = feeFromBps(amountIn, builderFeeBps);
  const quote = swapHopQuote({
    market: input.market,
    pool: { ...input.pool },
    tokenInAssetId: n(input.tokenInAssetId),
    amountIn,
    minAmountOut: n(input.minAmountOut ?? 0n),
    prices: priceSet(input.prices ?? input.market),
  });
  return {
    ...quote,
    builder_address: builderAddress,
    builder_fee_bps: builderFeeBps,
    builder_fee_amount: builderFeeAmount,
    protocol_swap_input: amountIn,
    total_wallet_debit: amountIn + builderFeeAmount,
    required_group_flat_fee_microalgos:
      (quote.required_flat_fee_microalgos as bigint)
      + (builderFeeAmount > 0n ? 1_000n : 0n),
  };
}

export function quoteV2SwapRouteExactIn(input: {
  hops: V2StateRecord[];
  markets: V2StateRecord | Record<string, V2StateRecord> | V2StateRecord[];
  pools: V2StateRecord | Record<string, V2StateRecord> | V2StateRecord[];
  pricesByMarket?: Record<string, V2PriceInput>;
  prices?: V2PriceInput;
  minFinalAmountOut?: BigNumberish;
  min_final_amount_out?: BigNumberish;
  builderFee?: BuilderFeeInput;
}): V2QuoteResult {
  const reasons: string[] = [];
  const quotes: V2QuoteResult[] = [];
  const poolStateByMarket = new Map<string, V2StateRecord>();
  const initialAmount = input.hops.length > 0 ? get(input.hops[0], "amount_in", "amountIn") : 0n;
  let currentAmount = initialAmount;
  const [builderAddress, builderFeeBps] = normalizeBuilderFee(
    input.builderFee,
    MAX_SWAP_BUILDER_FEE_BPS,
  );
  const builderFeeAmount = feeFromBps(initialAmount, builderFeeBps);
  let previousTokenOut = 0n;
  if (input.hops.length === 0) reasons.push("empty_route");
  if (input.hops.length > 2) reasons.push("too_many_hops");
  const marketIds = input.hops.map((hop) => get(hop, "market_id", "marketId").toString());
  if (new Set(marketIds).size !== marketIds.length) reasons.push("duplicate_route_market");
  for (const [index, hop] of input.hops.slice(0, 2).entries()) {
    const marketId = get(hop, "market_id", "marketId");
    const marketKey = marketId.toString();
    const tokenIn = get(hop, "token_in_asset_id", "tokenInAssetId");
    if (index > 0 && previousTokenOut !== tokenIn) {
      reasons.push("route_token_mismatch");
      break;
    }
    const market = lookupStateRecord(input.markets, marketId);
    const pool = poolStateByMarket.get(marketKey) ?? { ...lookupStateRecord(input.pools, marketId) };
    const prices = priceSet(input.pricesByMarket?.[marketKey] ?? input.prices ?? (market as V2PriceInput));
    const quote = swapHopQuote({
      market,
      pool,
      tokenInAssetId: tokenIn,
      amountIn: currentAmount,
      minAmountOut: get(hop, "min_amount_out", "minAmountOut"),
      prices,
    });
    quotes.push(quote);
    reasons.push(...((quote.failure_reasons as string[] | undefined) ?? []));
    previousTokenOut = quote.token_out_asset_id as bigint;
    if (!quote.ok) break;
    poolStateByMarket.set(marketKey, {
      ...pool,
      long_pool_amount: quote.pool_long_amount_after,
      short_pool_amount: quote.pool_short_amount_after,
      swap_impact_pool_long_amount: quote.swap_impact_pool_long_amount_after,
      swap_impact_pool_short_amount: quote.swap_impact_pool_short_amount_after,
    });
    currentAmount = quote.amount_out as bigint;
  }
  const finalAmountOut = quotes.length > 0 ? (quotes[quotes.length - 1].amount_out as bigint) : 0n;
  const minFinalAmountOut = n(input.minFinalAmountOut ?? input.min_final_amount_out ?? 0n);
  if (finalAmountOut < minFinalAmountOut) reasons.push("min_final_amount_out");
  const requiredFee =
    input.hops.length >= 2 ? V2_ROUTE_SWAP_QUOTE_TWO_HOP_FLAT_FEE_MICRO_ALGO : V2_ROUTE_SWAP_QUOTE_ONE_HOP_FLAT_FEE_MICRO_ALGO;
  return withV2Meta({
    type: "v2_swap_route_exact_in",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    amount_in: initialAmount,
    builder_address: builderAddress,
    builder_fee_bps: builderFeeBps,
    builder_fee_amount: builderFeeAmount,
    protocol_swap_input: initialAmount,
    total_wallet_debit: initialAmount + builderFeeAmount,
    final_token_out_asset_id: previousTokenOut,
    final_amount_out: finalAmountOut,
    min_final_amount_out: minFinalAmountOut,
    hops: quotes,
    required_flat_fee_microalgos: requiredFee + (builderFeeAmount > 0n ? 1_000n : 0n),
    required_method_flat_fee_microalgos: BigInt(V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO),
    required_carrier_count: BigInt(Math.min(input.hops.length, 2)),
  });
}

export function quoteV2LpWithdrawWithSwap(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  shareAmount: BigNumberish;
  outputTokenAssetId?: BigNumberish;
  outputMode?: BigNumberish;
  minOutputAmount?: BigNumberish;
  minPrimaryAmount?: BigNumberish;
  minSecondaryAmount?: BigNumberish;
  prices?: V2PriceInput;
  positions?: V2StateRecord[];
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const base = quoteV2LpWithdraw({
    market: input.market,
    pool: input.pool,
    shareAmount: input.shareAmount,
    prices,
    positions: input.positions,
  });
  const reasons = [...((base.failure_reasons as string[] | undefined) ?? [])];
  let outputToken = n(input.outputTokenAssetId ?? 0n);
  const longAsset = get(input.market, "long_asset_id");
  const shortAsset = get(input.market, "short_asset_id");
  let outputMode =
    input.outputMode !== undefined
      ? n(input.outputMode)
      : input.outputTokenAssetId === undefined
        ? V2_WITHDRAW_OUTPUT_BOTH
        : outputToken === longAsset
          ? V2_WITHDRAW_OUTPUT_LONG_ONLY
          : outputToken === shortAsset
            ? V2_WITHDRAW_OUTPUT_SHORT_ONLY
            : -1n;
  if (input.outputTokenAssetId === undefined) {
    if (outputMode === V2_WITHDRAW_OUTPUT_LONG_ONLY) outputToken = longAsset;
    else if (outputMode === V2_WITHDRAW_OUTPUT_SHORT_ONLY) outputToken = shortAsset;
    else outputToken = 0n;
  }
  let finalLong = base.long_amount_out as bigint;
  let finalShort = base.short_amount_out as bigint;
  let swapQuote: V2QuoteResult | null = null;
  const tempPool = {
    ...input.pool,
    long_pool_amount: base.long_pool_amount_after,
    short_pool_amount: base.short_pool_amount_after,
  };
  if (outputMode === V2_WITHDRAW_OUTPUT_LONG_ONLY) {
    if (finalShort > 0n) {
      swapQuote = quoteV2SwapExactIn({
        market: input.market,
        pool: tempPool,
        tokenInAssetId: shortAsset,
        amountIn: finalShort,
        prices,
      });
      finalLong += swapQuote.amount_out as bigint;
      finalShort = 0n;
      reasons.push(...((swapQuote.failure_reasons as string[] | undefined) ?? []));
    }
  } else if (outputMode === V2_WITHDRAW_OUTPUT_SHORT_ONLY) {
    if (finalLong > 0n) {
      swapQuote = quoteV2SwapExactIn({
        market: input.market,
        pool: tempPool,
        tokenInAssetId: longAsset,
        amountIn: finalLong,
        prices,
      });
      finalShort += swapQuote.amount_out as bigint;
      finalLong = 0n;
      reasons.push(...((swapQuote.failure_reasons as string[] | undefined) ?? []));
    }
  } else if (outputMode !== V2_WITHDRAW_OUTPUT_BOTH) {
    reasons.push("invalid_output_mode");
  }
  if (outputMode === V2_WITHDRAW_OUTPUT_LONG_ONLY && outputToken !== 0n && outputToken !== longAsset) reasons.push("invalid_output_token");
  if (outputMode === V2_WITHDRAW_OUTPUT_SHORT_ONLY && outputToken !== 0n && outputToken !== shortAsset) reasons.push("invalid_output_token");
  if (outputMode === V2_WITHDRAW_OUTPUT_BOTH && input.outputTokenAssetId !== undefined && outputToken !== 0n) reasons.push("invalid_output_token");
  const primaryOutput =
    outputMode === V2_WITHDRAW_OUTPUT_BOTH || outputMode === V2_WITHDRAW_OUTPUT_LONG_ONLY
      ? finalLong
      : finalShort;
  const secondaryOutput =
    outputMode === V2_WITHDRAW_OUTPUT_SHORT_ONLY ? finalLong : finalShort;
  if (primaryOutput < n(input.minPrimaryAmount ?? input.minOutputAmount ?? 0n)) reasons.push("min_primary_amount");
  if (secondaryOutput < n(input.minSecondaryAmount ?? 0n)) reasons.push("min_secondary_amount");
  const poolLongAfter = swapQuote ? (swapQuote.pool_long_amount_after as bigint) : (base.long_pool_amount_after as bigint);
  const poolShortAfter = swapQuote ? (swapQuote.pool_short_amount_after as bigint) : (base.short_pool_amount_after as bigint);
  for (let index = reasons.length - 1; index >= 0; index -= 1) {
    if (
      reasons[index] === "long_pnl_cap"
      || reasons[index] === "short_pnl_cap"
      || reasons[index] === "withdraw_post_long_pnl_cap"
      || reasons[index] === "withdraw_post_short_pnl_cap"
    ) reasons.splice(index, 1);
  }
  checkLpMaxPnlFactor(
    input.market,
    poolLongAfter,
    poolShortAfter,
    prices.index_price_max,
    prices.index_price_min,
    prices.long_price_min,
    prices.short_price_min,
    "withdrawals",
    reasons,
    "withdraw_post",
  );
  const swapLongAfter = swapQuote
    ? (swapQuote.swap_impact_pool_long_amount_after as bigint)
    : get(input.pool, "swap_impact_pool_long_amount");
  const swapShortAfter = swapQuote
    ? (swapQuote.swap_impact_pool_short_amount_after as bigint)
    : get(input.pool, "swap_impact_pool_short_amount");
  return withV2Meta({
    type: "v2_lp_withdraw_with_swap",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    share_amount: n(input.shareAmount),
    shares_burned: n(input.shareAmount),
    output_mode: outputMode,
    output_token_asset_id: outputToken,
    long_amount_out_before_swap: base.long_amount_out,
    short_amount_out_before_swap: base.short_amount_out,
    proportional_long_out: base.long_amount_out,
    proportional_short_out: base.short_amount_out,
    final_long_amount_out: finalLong,
    final_short_amount_out: finalShort,
    final_long_amount: finalLong,
    final_short_amount: finalShort,
    final_output_amount: primaryOutput,
    swapped_token_in: swapQuote ? swapQuote.token_in_asset_id : 0n,
    swapped_token_out: swapQuote ? swapQuote.token_out_asset_id : 0n,
    swapped_amount_in: swapQuote ? swapQuote.amount_in : 0n,
    swapped_amount_out: swapQuote ? swapQuote.amount_out : 0n,
    swap_fee_amount: swapQuote ? swapQuote.fee_amount : 0n,
    swap_pool_fee_amount: swapQuote ? swapQuote.pool_fee_amount : 0n,
    swap_protocol_fee_amount: swapQuote ? swapQuote.protocol_fee_amount : 0n,
    swap_insurance_fee_amount: swapQuote ? swapQuote.insurance_fee_amount : 0n,
    withdrawal_fee_amount: base.fee_amount,
    long_pool_amount_after: poolLongAfter,
    short_pool_amount_after: poolShortAfter,
    pool_long_amount_after: poolLongAfter,
    pool_short_amount_after: poolShortAfter,
    swap_impact_pool_long_after: swapLongAfter,
    swap_impact_pool_short_after: swapShortAfter,
    swap_impact_pool_long_amount_after: swapLongAfter,
    swap_impact_pool_short_amount_after: swapShortAfter,
    market_share_supply_after: base.market_share_supply_after,
    base_withdraw_quote: base,
    swap_quote: swapQuote,
    required_flat_fee_microalgos: V2_WITHDRAW_WITH_SWAP_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
  });
}

export function quoteV2CloseOutputSwapPreview(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  closeQuote: V2StateRecord;
  outputTokenAssetId: BigNumberish;
  minOutputAmount?: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const reasons = [...((input.closeQuote.failure_reasons as string[] | undefined) ?? [])];
  const outputToken = n(input.outputTokenAssetId);
  let tempPool = poolAfterCloseQuote(input.market, input.pool, input.closeQuote);
  let finalOutput = 0n;
  const swapQuotes: V2QuoteResult[] = [];
  for (const [assetField, amountField] of [
    ["primary_output_asset_id", "primary_output_amount"],
    ["pnl_output_asset_id", "pnl_output_amount"],
  ] as const) {
    const assetId = get(input.closeQuote, assetField);
    const amount = get(input.closeQuote, amountField);
    if (amount <= 0n || assetId < 0n) continue;
    if (assetId === outputToken) {
      finalOutput += amount;
      continue;
    }
    const swap = quoteV2SwapExactIn({
      market: input.market,
      pool: tempPool,
      tokenInAssetId: assetId,
      amountIn: amount,
      prices,
    });
    swapQuotes.push(swap);
    reasons.push(...((swap.failure_reasons as string[] | undefined) ?? []));
    finalOutput += swap.amount_out as bigint;
    if (swap.ok) {
      tempPool = {
        ...tempPool,
        long_pool_amount: swap.pool_long_amount_after,
        short_pool_amount: swap.pool_short_amount_after,
        swap_impact_pool_long_amount: swap.swap_impact_pool_long_amount_after,
        swap_impact_pool_short_amount: swap.swap_impact_pool_short_amount_after,
      };
    }
  }
  if (outputToken !== get(input.market, "long_asset_id") && outputToken !== get(input.market, "short_asset_id")) {
    reasons.push("invalid_output_token");
  }
  if (finalOutput < n(input.minOutputAmount ?? 0n)) reasons.push("min_output_amount");
  return withV2Meta({
    type: "v2_close_output_swap_preview",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    output_token_asset_id: outputToken,
    final_output_amount: finalOutput,
    close_quote: input.closeQuote,
    swap_quotes: swapQuotes,
    pool_long_amount_after_preview: tempPool.long_pool_amount ?? 0n,
    pool_short_amount_after_preview: tempPool.short_pool_amount ?? 0n,
    required_flat_fee_microalgos: V2_TRADING_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
  });
}

export function calculateV2PositionHealthComponents(input: {
  side: BigNumberish;
  sizeUsd: BigNumberish;
  sizeTokens: BigNumberish;
  collateralAmountAfterCostResolution: BigNumberish;
  sameTokenCreditAmount: BigNumberish;
  entryPrice: BigNumberish;
  currentPrice: BigNumberish;
  collateralPrice: BigNumberish;
  positionConversionScale: BigNumberish;
  closeFeeBps: BigNumberish;
  minCollateralUsd: BigNumberish;
  maintenanceMarginBps: BigNumberish;
  maxLiquidationImpactBps: BigNumberish;
  rawNegativeImpactUsd: BigNumberish;
  accruedCostUsd: BigNumberish;
}): V2QuoteResult {
  const side = n(input.side);
  const sizeUsd = n(input.sizeUsd);
  const collateralAmount = n(input.collateralAmountAfterCostResolution);
  const sameTokenCreditAmount = n(input.sameTokenCreditAmount);
  const currentPrice = n(input.currentPrice);
  const collateralPrice = n(input.collateralPrice);
  const [profitUsd, lossUsd] = pnlParts(
    { entry_price: n(input.entryPrice) },
    side,
    n(input.sizeTokens),
    currentPrice,
    n(input.positionConversionScale),
  );
  const rawNegativeImpactUsd = n(input.rawNegativeImpactUsd);
  const cappedNegativeImpactUsd = min(
    rawNegativeImpactUsd,
    feeFromBps(sizeUsd, n(input.maxLiquidationImpactBps)),
  );
  const closeFeeUsd = feeFromBps(sizeUsd, n(input.closeFeeBps));
  const accruedCostUsd = n(input.accruedCostUsd);
  const collateralValueUsd = (
    (collateralAmount + sameTokenCreditAmount) * collateralPrice
  ) / ORACLE_PRICE_SCALE;
  const creditsUsd = collateralValueUsd + profitUsd;
  const costsUsd = lossUsd + cappedNegativeImpactUsd + closeFeeUsd + accruedCostUsd;
  const remainingUsd = max(0n, creditsUsd - costsUsd);
  const maintenanceRequirementUsd = feeFromBps(sizeUsd, n(input.maintenanceMarginBps));
  const minCollateralUsd = n(input.minCollateralUsd);
  const requiredRemainingUsd = maintenanceRequirementUsd;
  const liquidatable = currentPrice > 0n && (
    creditsUsd <= costsUsd
    || remainingUsd < maintenanceRequirementUsd
  );
  const requiredCollateralValueUsd = max(
    0n,
    costsUsd + requiredRemainingUsd - profitUsd,
  );
  let minimumCollateralAmount = collateralPrice > 0n
    ? ceilDiv(requiredCollateralValueUsd * ORACLE_PRICE_SCALE, collateralPrice)
    : 0n;
  minimumCollateralAmount = max(0n, minimumCollateralAmount - sameTokenCreditAmount);
  return {
    profit_usd: profitUsd,
    loss_usd: lossUsd,
    raw_negative_impact_usd: rawNegativeImpactUsd,
    capped_negative_impact_usd: cappedNegativeImpactUsd,
    close_fee_usd: closeFeeUsd,
    accrued_cost_usd: accruedCostUsd,
    collateral_value_usd: collateralValueUsd,
    credits_usd: creditsUsd,
    costs_usd: costsUsd,
    remaining_usd: remainingUsd,
    equity_usd: remainingUsd,
    maintenance_requirement_usd: maintenanceRequirementUsd,
    min_collateral_required_usd: minCollateralUsd,
    required_remaining_usd: requiredRemainingUsd,
    required_collateral_value_usd: requiredCollateralValueUsd,
    minimum_collateral_amount: minimumCollateralAmount,
    minimum_additional_collateral_amount: max(0n, minimumCollateralAmount - collateralAmount),
    below_or_equal_costs: creditsUsd <= costsUsd,
    below_min_collateral: remainingUsd < minCollateralUsd,
    below_maintenance: remainingUsd < maintenanceRequirementUsd,
    liquidatable,
    healthy: !liquidatable,
  };
}

export function quoteV2PositionHealth(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position: V2StateRecord;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  prices?: V2PriceInput;
  enforceInitialMargin?: boolean;
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const position = positionWithDefaults(input.position);
  const collateralAssetId = n(input.collateralAssetId);
  const side = n(input.side);
  const reasons: string[] = [];
  const risk = requiredMarketRisk(input.market, reasons);
  const sizeUsd = get(position, "size_usd");
  const collateralPrice = assetPrice(collateralAssetId, input.market, prices);
  const indexPrice = indexPriceForClose(side, prices);
  if (sizeUsd <= 0n || get(position, "size_tokens") <= 0n) {
    reasons.push("position_quantity_unavailable");
  }
  if (collateralPrice <= 0n || indexPrice <= 0n) reasons.push("position_price_unavailable");
  const costQuote = sizeUsd > 0n && collateralPrice > 0n
    ? positionCostQuote(position, input.market, collateralAssetId, collateralPrice, sizeUsd)
    : null;
  const fullNetCost = costQuote?.full_net_collateral_cost ?? 0n;
  const fullSameCredit = costQuote?.full_same_token_credit ?? 0n;
  const costDeficit = fullNetCost > get(position, "collateral_amount");
  const collateralAfterCost = costDeficit
    ? get(position, "collateral_amount")
    : get(position, "collateral_amount") - fullNetCost + fullSameCredit;
  const sameTokenCredit = costDeficit ? fullSameCredit : 0n;
  const accruedCostUsd = costDeficit
    ? (fullNetCost * collateralPrice) / ORACLE_PRICE_SCALE
    : 0n;
  const factorDeltas = (costQuote?.factor_deltas ?? {}) as V2StateRecord;
  const fullFloors = (costQuote?.full_floors ?? {}) as V2StateRecord;
  const fundingFeeUsd = (sizeUsd * get(factorDeltas, "funding_pay"))
    / V2_BORROWING_FACTOR_DENOMINATOR;
  const totalFeeUsd = get(fullFloors, "pay_usd");
  const borrowingFeeUsd = max(0n, totalFeeUsd - fundingFeeUsd);
  const fundingFeeCollateralAmount = collateralPrice > 0n
    ? (fundingFeeUsd * ORACLE_PRICE_SCALE) / collateralPrice
    : 0n;
  const totalFeeCollateralAmount = get(fullFloors, "pay_collateral");
  const borrowingFeeCollateralAmount = max(
    0n,
    totalFeeCollateralAmount - fundingFeeCollateralAmount,
  );
  const fundingClaimLongAmount = get(fullFloors, "long_claim");
  const fundingClaimShortAmount = get(fullFloors, "short_claim");
  const fundingClaimLongUsd = (fundingClaimLongAmount * prices.long_price)
    / ORACLE_PRICE_SCALE;
  const fundingClaimShortUsd = (fundingClaimShortAmount * prices.short_price)
    / ORACLE_PRICE_SCALE;
  const fundingClaimUsd = fundingClaimLongUsd + fundingClaimShortUsd;
  const netFundingUsd = fundingClaimUsd - fundingFeeUsd;
  const [, rawNegativeImpact] = sizeUsd > 0n && indexPrice > 0n
    ? positionImpact(input.market, input.pool, side, sizeUsd, false, indexPrice)
    : [0n, 0n];
  const health = calculateV2PositionHealthComponents({
    side,
    sizeUsd,
    sizeTokens: get(position, "size_tokens"),
    collateralAmountAfterCostResolution: collateralAfterCost,
    sameTokenCreditAmount: sameTokenCredit,
    entryPrice: get(position, "entry_price"),
    currentPrice: indexPrice,
    collateralPrice,
    positionConversionScale: readV2MarketPositionScales(input.market).position_conversion_scale,
    closeFeeBps: risk.close_fee_bps,
    minCollateralUsd: risk.min_collateral_usd,
    maintenanceMarginBps: risk.maintenance_margin_bps,
    maxLiquidationImpactBps: risk.max_liquidation_impact_bps,
    rawNegativeImpactUsd: rawNegativeImpact,
    accruedCostUsd,
  });
  const enforceInitialMargin = Boolean(input.enforceInitialMargin);
  const dynamicMargin = enforceInitialMargin
    ? dynamicOiMarginForOpen(input.market, side, 0n, risk.initial_margin_bps, reasons)
    : {
      baseline_initial_margin_bps: risk.initial_margin_bps,
      dynamic_initial_margin_bps: 0n,
      effective_initial_margin_bps: risk.initial_margin_bps,
      effective_max_leverage_bps: risk.initial_margin_bps <= 0n
        ? 0n
        : (V2_BPS * V2_BPS) / risk.initial_margin_bps,
      side_oi_after_usd: side === V2_SIDE_LONG ? totalLongOi(input.market) : totalShortOi(input.market),
    };
  const initialMarginRequiredUsd = feeFromBps(
    sizeUsd,
    dynamicMargin.effective_initial_margin_bps,
  );
  const initialMarginRequiredAmount = collateralPrice > 0n
    ? ceilDiv(max(initialMarginRequiredUsd, risk.min_collateral_usd) * ORACLE_PRICE_SCALE, collateralPrice)
    : 0n;
  const minimumCollateralAmountForInitialMargin = max(
    0n,
    initialMarginRequiredAmount + fullNetCost - fullSameCredit,
  );
  const minimumCollateralAmountForAdmission = max(
    n(health.minimum_collateral_amount as BigNumberish),
    enforceInitialMargin ? minimumCollateralAmountForInitialMargin : 0n,
  );
  const initialMarginBreach = enforceInitialMargin
    && (collateralAfterCost * collateralPrice) / ORACLE_PRICE_SCALE < max(initialMarginRequiredUsd, risk.min_collateral_usd);
  return {
    ...health,
    ok: reasons.length === 0,
    failure_reasons: [...new Set(reasons)],
    index_price: indexPrice,
    collateral_price: collateralPrice,
    collateral_amount_before_cost_resolution: get(position, "collateral_amount"),
    collateral_amount_after_cost_resolution: collateralAfterCost,
    same_token_credit_amount: sameTokenCredit,
    cost_deficit: costDeficit,
    position_cost_resolution: costQuote,
    pending_funding_fee_usd: fundingFeeUsd,
    pending_borrowing_fee_usd: borrowingFeeUsd,
    pending_total_fee_usd: totalFeeUsd,
    pending_funding_fee_collateral_amount: fundingFeeCollateralAmount,
    pending_borrowing_fee_collateral_amount: borrowingFeeCollateralAmount,
    pending_total_fee_collateral_amount: totalFeeCollateralAmount,
    pending_funding_claim_long_amount: fundingClaimLongAmount,
    pending_funding_claim_short_amount: fundingClaimShortAmount,
    pending_funding_claim_long_usd: fundingClaimLongUsd,
    pending_funding_claim_short_usd: fundingClaimShortUsd,
    pending_funding_claim_usd: fundingClaimUsd,
    pending_net_funding_usd: netFundingUsd,
    pending_net_carry_usd: netFundingUsd - borrowingFeeUsd,
    initial_margin_enforced: enforceInitialMargin,
    initial_margin_breach: initialMarginBreach,
    initial_margin_required_usd: initialMarginRequiredUsd,
    baseline_initial_margin_bps: dynamicMargin.baseline_initial_margin_bps,
    dynamic_initial_margin_bps: dynamicMargin.dynamic_initial_margin_bps,
    effective_initial_margin_bps: dynamicMargin.effective_initial_margin_bps,
    side_oi_after_usd: dynamicMargin.side_oi_after_usd,
    minimum_collateral_amount_for_initial_margin: minimumCollateralAmountForInitialMargin,
    minimum_collateral_amount_for_admission: minimumCollateralAmountForAdmission,
    minimum_additional_collateral_amount_for_admission: max(
      0n,
      minimumCollateralAmountForAdmission - get(position, "collateral_amount"),
    ),
    admissible: !Boolean(health.liquidatable) && !initialMarginBreach,
  };
}

export function quoteV2LiquidationPrice(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position: V2StateRecord;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const side = n(input.side);
  if (side !== V2_SIDE_LONG && side !== V2_SIDE_SHORT) {
    return { ok: false, failure_reason: "invalid_side", liquidation_price: 0n, direction: "" };
  }
  const anchorPrice = indexPriceForClose(side, prices);
  if (anchorPrice <= 0n) {
    return { ok: false, failure_reason: "position_price_unavailable", liquidation_price: 0n, direction: "" };
  }

  // Reprice legs backed by the index ASA, but keep distinct backing/collateral
  // assets fixed so synthetic markets do not imply false correlation.
  const healthAt = (indexPrice: bigint): V2QuoteResult => quoteV2PositionHealth({
    market: input.market,
    pool: input.pool,
    position: input.position,
    collateralAssetId: input.collateralAssetId,
    side,
    prices: (() => {
      const candidate: V2PriceSet = {
        ...prices,
        index_price: indexPrice,
        index_price_min: indexPrice,
        index_price_max: indexPrice,
      };
      if (
        Object.prototype.hasOwnProperty.call(input.market, "index_asset_id")
        && Object.prototype.hasOwnProperty.call(input.market, "long_asset_id")
        && get(input.market, "index_asset_id") === get(input.market, "long_asset_id")
      ) {
        candidate.long_price = indexPrice;
        candidate.long_price_min = indexPrice;
        candidate.long_price_max = indexPrice;
      }
      if (
        Object.prototype.hasOwnProperty.call(input.market, "index_asset_id")
        && Object.prototype.hasOwnProperty.call(input.market, "short_asset_id")
        && get(input.market, "index_asset_id") === get(input.market, "short_asset_id")
      ) {
        candidate.short_price = indexPrice;
        candidate.short_price_min = indexPrice;
        candidate.short_price_max = indexPrice;
      }
      return candidate;
    })(),
  });

  const anchorHealth = healthAt(anchorPrice);
  if (!Boolean(anchorHealth.ok)) {
    return { ok: false, failure_reason: "position_health_unavailable", liquidation_price: 0n, direction: "" };
  }
  const anchorLiquidatable = Boolean(anchorHealth.liquidatable);
  const searchUp = (side === V2_SIDE_SHORT) !== anchorLiquidatable;
  let cursor = anchorPrice;
  let cursorHealth = anchorHealth;
  let oppositePrice = 0n;
  let oppositeHealth: V2QuoteResult | null = null;
  while (true) {
    const candidatePrice = searchUp
      ? min(MAX_ORACLE_PRICE, max(cursor + 1n, cursor * 2n))
      : max(1n, cursor / 2n);
    if (candidatePrice === cursor) break;
    const candidateHealth = healthAt(candidatePrice);
    if (!Boolean(candidateHealth.ok)) break;
    if (Boolean(candidateHealth.liquidatable) !== anchorLiquidatable) {
      oppositePrice = candidatePrice;
      oppositeHealth = candidateHealth;
      break;
    }
    cursor = candidatePrice;
    cursorHealth = candidateHealth;
  }
  if (!oppositeHealth) {
    return {
      ok: false,
      failure_reason: "liquidation_boundary_not_found",
      liquidation_price: 0n,
      direction: "",
      current_liquidatable: anchorLiquidatable,
    };
  }

  let lowPrice = min(cursor, oppositePrice);
  let highPrice = max(cursor, oppositePrice);
  const cursorIsLow = cursor === lowPrice;
  const lowLiquidatable = Boolean((cursorIsLow ? cursorHealth : oppositeHealth).liquidatable);
  const highLiquidatable = Boolean((cursorIsLow ? oppositeHealth : cursorHealth).liquidatable);
  while (highPrice - lowPrice > 1n) {
    const midPrice = (lowPrice + highPrice) / 2n;
    if (Boolean(healthAt(midPrice).liquidatable) === lowLiquidatable) lowPrice = midPrice;
    else highPrice = midPrice;
  }

  if (side === V2_SIDE_LONG) {
    if (!lowLiquidatable || highLiquidatable) {
      return { ok: false, failure_reason: "non_monotonic_liquidation_boundary", liquidation_price: 0n, direction: "" };
    }
    return {
      ok: true,
      failure_reason: "",
      liquidation_price: lowPrice,
      direction: "at_or_below",
      current_index_price: anchorPrice,
      current_liquidatable: anchorLiquidatable,
    };
  }
  if (lowLiquidatable || !highLiquidatable) {
    return { ok: false, failure_reason: "non_monotonic_liquidation_boundary", liquidation_price: 0n, direction: "" };
  }
  return {
    ok: true,
    failure_reason: "",
    liquidation_price: highPrice,
    direction: "at_or_above",
    current_index_price: anchorPrice,
    current_liquidatable: anchorLiquidatable,
  };
}

export function quoteV2OpenPosition(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  owner?: string;
  marketId?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  collateralAmount: BigNumberish;
  sizeUsdDelta: BigNumberish;
  acceptablePrice: BigNumberish;
  prices?: V2PriceInput;
  builderFee?: BuilderFeeInput;
}): V2QuoteResult {
  const side = n(input.side);
  const collateralAssetId = n(input.collateralAssetId);
  const sizeUsdDelta = n(input.sizeUsdDelta);
  const prices = priceSet(input.prices ?? input.market);
  const positionScales = readV2MarketPositionScales(input.market);
  const positionConversionScale = positionScales.position_conversion_scale;
  const indexPrice = indexPriceForOpen(side, prices);
  const collateralPrice = assetPrice(collateralAssetId, input.market, prices);
  const [builderAddress, builderFeeBps] = normalizeBuilderFee(
    input.builderFee,
    MAX_POSITION_BUILDER_FEE_BPS,
  );
  const reasons: string[] = [];
  const risk = requiredMarketRisk(input.market, reasons);
  const original = positionWithDefaults(input.position ?? null);
  const existingSize = get(original, "size_usd");
  const pureTopUp = sizeUsdDelta === 0n && existingSize > 0n;
  const costQuote = existingSize > 0n
    ? positionCostQuote(
        original,
        input.market,
        collateralAssetId,
        collateralPrice,
        existingSize,
      )
    : null;
  const costDeficit = costQuote?.cost_deficit ?? false;
  let settled: V2StateRecord;
  let settlement: V2SettlementResult;
  if (pureTopUp) {
    settled = original;
    settlement = emptySettlement();
  } else if (costDeficit) {
    settled = original;
    settlement = emptySettlement();
    reasons.push("top_up_required");
  } else {
    [settled, settlement] = settledPosition(
      input.position,
      input.market,
      collateralAssetId,
      collateralPrice,
      true,
    );
  }
  if (existingSize === 0n) {
    // New positions start at current factors, with no historical carry/claims.
    const [funding, longClaim, shortClaim, borrowing] = positionFactors(input.market, collateralAssetId, side);
    settled.funding_fee_per_size_snapshot_milli_bps = funding;
    settled.claimable_long_token_funding_per_size_snapshot = longClaim;
    settled.claimable_short_token_funding_per_size_snapshot = shortClaim;
    settled.borrowing_factor_snapshot_milli_bps = borrowing;
  }
  const feeAmount = tokenAmountFromUsd(feeFromBps(sizeUsdDelta, risk.open_fee_bps), collateralPrice);
  const builderFeeAmount = tokenAmountFromUsd(
    feeFromBps(sizeUsdDelta, builderFeeBps),
    collateralPrice,
  );
  const totalFeeAmount = feeAmount + builderFeeAmount;
  const positionCollateralDelta = max(0n, n(input.collateralAmount) - totalFeeAmount);
  const baseSizeTokenDelta = indexPrice > 0n
    ? (sizeUsdDelta * positionConversionScale) / indexPrice
    : 0n;
  const [impactPositive, impactNegative] = positionImpact(input.market, input.pool, side, sizeUsdDelta, true, indexPrice);
  const impactPositiveQty = positionQtyFromUsd(impactPositive, indexPrice, positionConversionScale);
  const impactNegativeQty = positionQtyFromUsd(impactNegative, indexPrice, positionConversionScale);
  let sizeTokenDelta = side === V2_SIDE_LONG
    ? baseSizeTokenDelta + impactPositiveQty
    : baseSizeTokenDelta + impactNegativeQty;
  const impactConsumed = side === V2_SIDE_LONG
    ? sizeTokenDelta <= impactNegativeQty
    : sizeTokenDelta <= impactPositiveQty;
  if (impactConsumed && !pureTopUp) {
    sizeTokenDelta = 0n;
    reasons.push("impact_consumes_size");
  } else {
    sizeTokenDelta -= side === V2_SIDE_LONG ? impactNegativeQty : impactPositiveQty;
  }
  const executionPrice = executionPriceFromRational(
    sizeUsdDelta * positionConversionScale,
    sizeTokenDelta,
    side === V2_SIDE_LONG,
  );
  const sizeAfter = get(settled, "size_usd") + sizeUsdDelta;
  const tokensAfter = get(settled, "size_tokens") + sizeTokenDelta;
  const collateralAfter = get(settled, "collateral_amount") + positionCollateralDelta;
  const collateralValueAfter = (collateralAfter * collateralPrice) / ORACLE_PRICE_SCALE;
  const dynamicMargin = pureTopUp
    ? {
        baseline_initial_margin_bps: risk.initial_margin_bps,
        dynamic_initial_margin_bps: 0n,
        effective_initial_margin_bps: risk.initial_margin_bps,
        effective_max_leverage_bps: risk.initial_margin_bps <= 0n
          ? 0n
          : (V2_BPS * V2_BPS) / risk.initial_margin_bps,
        side_oi_after_usd: side === V2_SIDE_LONG
          ? totalLongOi(input.market)
          : totalShortOi(input.market),
      }
    : dynamicOiMarginForOpen(input.market, side, sizeUsdDelta, risk.initial_margin_bps, reasons);
  const initialMarginRequired = feeFromBps(sizeAfter, dynamicMargin.effective_initial_margin_bps);
  const entryAfter = pureTopUp
    ? get(original, "entry_price")
    : tokensAfter > 0n
      ? (sizeAfter * positionConversionScale) / tokensAfter
      : 0n;
  const pendingAfter = pendingEncodedAfter(settled, { addPositive: impactPositiveQty, addNegative: impactNegativeQty });
  if (n(input.acceptablePrice) <= 0n) reasons.push("acceptable_price_required");
  else if (!pureTopUp && openPriceUnacceptable(side, sizeUsdDelta, sizeTokenDelta, n(input.acceptablePrice), positionConversionScale)) reasons.push("price_slippage");
  if (pureTopUp && builderFeeBps > 0n) reasons.push("builder_fee_not_allowed_for_margin_only");
  if (n(input.collateralAmount) <= totalFeeAmount) reasons.push("fee_exceeds_collateral");
  if (!pureTopUp && collateralValueAfter < risk.min_collateral_usd) reasons.push("collateral_too_small");
  if (!pureTopUp && collateralValueAfter < initialMarginRequired) reasons.push("initial_margin_breach");
  if (!pureTopUp && get(settled, "size_usd") <= 0n && sizeUsdDelta < risk.min_position_size_usd) reasons.push("position_too_small");
  const dynamicMinPositionSizeUsd = ceilDiv(
    indexPrice * V2_BPS,
    positionConversionScale * V2_MAX_POSITION_QUANTIZATION_BPS,
  );
  const effectiveMinPositionSizeUsd = max(risk.min_position_size_usd, dynamicMinPositionSizeUsd);
  const representedSizeUsd = baseSizeTokenDelta > 0n
    ? (baseSizeTokenDelta * indexPrice) / positionConversionScale
    : 0n;
  const quantizationLossUsd = max(0n, sizeUsdDelta - representedSizeUsd);
  if (!pureTopUp && (
    indexPrice * V2_BPS
    > sizeUsdDelta * positionConversionScale * V2_MAX_POSITION_QUANTIZATION_BPS
  )) reasons.push("position_quantization");
  if (!pureTopUp && baseSizeTokenDelta <= 0n) reasons.push("zero_tokens");
  if (!pureTopUp) {
    checkOiAfter(input.market, side, sizeUsdDelta, true, reasons);
    checkReservesAfterTrade(input.market, input.pool, side, sizeUsdDelta, sizeTokenDelta, true, prices, reasons);
  }
  const postPosition: V2StateRecord = {
    ...settled,
    market_id: n(input.marketId ?? get(input.market, "market_id")),
    collateral_asset_id: collateralAssetId,
    side,
    size_usd: sizeAfter,
    size_tokens: tokensAfter,
    collateral_amount: collateralAfter,
    entry_price: entryAfter,
    pending_impact_qty_signed: pendingAfter,
  };
  const postMarket = marketAfterPositionOiDelta(input.market, {
    collateralAssetId,
    side,
    sizeUsdDelta,
    increasing: true,
  });
  const postHealth = quoteV2PositionHealth({
    market: postMarket,
    pool: input.pool,
    position: postPosition,
    collateralAssetId,
    side,
    prices,
  });
  const postLiquidationPrice = quoteV2LiquidationPrice({
    market: postMarket,
    pool: input.pool,
    position: postPosition,
    collateralAssetId,
    side,
    prices,
  });
  if (!pureTopUp && Boolean(postHealth.liquidatable)) reasons.push("position_health_breach");
  const uniqueReasons = [...new Set(reasons)];
  return withV2Meta({
    type: "v2_open",
    ok: uniqueReasons.length === 0,
    failure_reasons: uniqueReasons,
    owner: input.owner ?? "",
    market_id: n(input.marketId ?? get(input.market, "market_id")),
    collateral_asset_id: collateralAssetId,
    side,
    index_price: indexPrice,
    execution_price: executionPrice,
    acceptable_price: n(input.acceptablePrice),
    size_usd_delta: sizeUsdDelta,
    size_token_delta: sizeTokenDelta,
    base_size_token_delta: baseSizeTokenDelta,
    impact_positive_usd: impactPositive,
    impact_negative_usd: impactNegative,
    impact_positive_qty: impactPositiveQty,
    impact_negative_qty: impactNegativeQty,
    fee_amount: feeAmount,
    gross_collateral_transfer: n(input.collateralAmount),
    platform_fee_amount: feeAmount,
    builder_address: builderAddress,
    builder_fee_bps: builderFeeBps,
    builder_fee_assessed: builderFeeAmount,
    builder_fee_paid: builderFeeAmount,
    net_position_collateral: positionCollateralDelta,
    position_size_after: sizeAfter,
    position_tokens_after: tokensAfter,
    position_collateral_after: collateralAfter,
    position_entry_price_after: entryAfter,
    ...decodeV2PendingImpactQty(pendingAfter),
    position_pending_impact_qty_signed_after: pendingAfter,
    collateral_value_after_usd: collateralValueAfter,
    initial_margin_required_usd: initialMarginRequired,
    baseline_initial_margin_bps: dynamicMargin.baseline_initial_margin_bps,
    dynamic_initial_margin_bps: dynamicMargin.dynamic_initial_margin_bps,
    effective_initial_margin_bps: dynamicMargin.effective_initial_margin_bps,
    effective_max_leverage_bps: dynamicMargin.effective_max_leverage_bps,
    side_oi_after_usd: dynamicMargin.side_oi_after_usd,
    maintenance_margin_required_usd: feeFromBps(sizeAfter, risk.maintenance_margin_bps),
    min_collateral_required_usd: risk.min_collateral_usd,
    min_position_size_usd: risk.min_position_size_usd,
    dynamic_min_position_size_usd: dynamicMinPositionSizeUsd,
    effective_min_position_size_usd: effectiveMinPositionSizeUsd,
    position_quantization_loss_usd: quantizationLossUsd,
    max_position_quantization_bps: V2_MAX_POSITION_QUANTIZATION_BPS,
    position_token_scale: positionScales.position_token_scale,
    position_conversion_scale: positionConversionScale,
    liquidation_price_estimate: get(postLiquidationPrice, "liquidation_price"),
    liquidation_price_direction: String(postLiquidationPrice.direction ?? ""),
    liquidation_price_basis: "index_asset_linked_health_boundary",
    ...postActionHealthFields(postHealth, !pureTopUp),
    settlement_collateral_decrease: settlement.collateralDecrease,
    settlement_collateral_increase: settlement.collateralIncrease,
    funding_fee_collateral_amount: settlement.fundingFeeCollateralAmount,
    borrowing_fee_collateral_amount: settlement.borrowingFeeCollateralAmount,
    collateral_funding_net_amount: settlement.collateralFundingNetAmount,
    claimable_long_token_output: settlement.claimableLongTokenOutput,
    claimable_short_token_output: settlement.claimableShortTokenOutput,
    normal_settlement_available: !costDeficit,
    cost_deficit: costDeficit,
    minimum_top_up: costQuote?.minimum_top_up ?? 0n,
    requested_close_resolves: !costDeficit,
    minimum_resolving_close_size: null,
    remaining_snapshot_mode: costDeficit
      ? "UNSETTLED_SLICE"
      : "SETTLED_CURRENT",
    expected_collateral_debit: costDeficit ? 0n : settlement.collateralDecrease,
    expected_collateral_credit: costDeficit ? 0n : settlement.collateralIncrease,
    expected_long_claim_output: costDeficit ? 0n : settlement.claimableLongTokenOutput,
    expected_short_claim_output: costDeficit ? 0n : settlement.claimableShortTokenOutput,
    expected_voluntary_unpaid_amount: 0n,
    blocked_reason: costDeficit && !pureTopUp ? "top_up_required" : "",
    position_cost_resolution: costQuote,
    required_flat_fee_microalgos: V2_TRADING_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO
      + (builderFeeAmount > 0n ? 1_000n : 0n),
  });
}

export function quoteV2DecreasePosition(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  owner?: string;
  marketId?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta: BigNumberish;
  acceptablePrice: BigNumberish;
  minPrimaryOutput?: BigNumberish;
  prices?: V2PriceInput;
  flatFeeMicroAlgo?: BigNumberish;
  builderFee?: BuilderFeeInput;
}): V2QuoteResult {
  return quoteV2CloseLike({ ...input, liquidation: false });
}

export function quoteV2DecreaseWithOutputSwap(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  owner?: string;
  marketId?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta: BigNumberish;
  acceptablePrice: BigNumberish;
  outputSwapMode?: BigNumberish;
  minPrimaryOutputAmount?: BigNumberish;
  minSecondaryOutputAmount?: BigNumberish;
  minPrimaryOutput?: BigNumberish;
  minSecondaryOutput?: BigNumberish;
  prices?: V2PriceInput;
  flatFeeMicroAlgo?: BigNumberish;
  builderFee?: BuilderFeeInput;
}): V2QuoteResult {
  const prices = priceSet(input.prices ?? input.market);
  const closeQuote = quoteV2DecreasePosition({
    ...input,
    minPrimaryOutput: 0n,
    prices,
  });
  const reasons = [...((closeQuote.failure_reasons as string[] | undefined) ?? [])];
  const mode = n(input.outputSwapMode ?? V2_OUTPUT_SWAP_NONE);
  const collateralAssetId = n(input.collateralAssetId);
  const collateralOutput = closeQuote.primary_output_amount as bigint;
  let primaryOutput = collateralOutput;
  let secondaryOutput = 0n;
  const payoutAssetId = closeQuote.pnl_output_asset_id as bigint;
  const payoutAmount = closeQuote.pnl_output_amount as bigint;
  const pnlAssetId = n(input.side) === V2_SIDE_LONG ? get(input.market, "long_asset_id") : get(input.market, "short_asset_id");
  let primaryOutputAssetId = collateralAssetId;
  let secondaryOutputAssetId = 0n;
  const tempPool = poolAfterCloseQuote(input.market, input.pool, closeQuote);
  let swapQuote: V2QuoteResult | null = null;

  if (mode > V2_OUTPUT_SWAP_COLLATERAL_TO_PNL) reasons.push("unsupported_output_swap_mode");

  if (mode === V2_OUTPUT_SWAP_COLLATERAL_TO_PNL) {
    primaryOutputAssetId = pnlAssetId;
    primaryOutput = payoutAmount;
    if (collateralOutput > 0n) {
      if (collateralAssetId === pnlAssetId) {
        primaryOutput += collateralOutput;
      } else {
        swapQuote = quoteV2SwapExactIn({
          market: input.market,
          pool: tempPool,
          tokenInAssetId: collateralAssetId,
          amountIn: collateralOutput,
          prices,
        });
        reasons.push(...((swapQuote.failure_reasons as string[] | undefined) ?? []));
        primaryOutput += swapQuote.amount_out as bigint;
      }
    }
  } else if (payoutAmount > 0n) {
    if (payoutAssetId === collateralAssetId) {
      primaryOutput += payoutAmount;
    } else if (mode === V2_OUTPUT_SWAP_PNL_TO_COLLATERAL) {
      swapQuote = quoteV2SwapExactIn({
        market: input.market,
        pool: tempPool,
        tokenInAssetId: payoutAssetId,
        amountIn: payoutAmount,
        prices,
      });
      reasons.push(...((swapQuote.failure_reasons as string[] | undefined) ?? []));
      primaryOutput += swapQuote.amount_out as bigint;
    } else {
      secondaryOutput = payoutAmount;
      secondaryOutputAssetId = payoutAssetId;
    }
  }

  if (primaryOutput < n(input.minPrimaryOutputAmount ?? input.minPrimaryOutput ?? 0n)) reasons.push("min_primary_output_amount");
  if (secondaryOutput < n(input.minSecondaryOutputAmount ?? input.minSecondaryOutput ?? 0n)) reasons.push("min_secondary_output_amount");

  const poolLongAfter = swapQuote ? (swapQuote.pool_long_amount_after as bigint) : get(tempPool, "long_pool_amount");
  const poolShortAfter = swapQuote ? (swapQuote.pool_short_amount_after as bigint) : get(tempPool, "short_pool_amount");
  const swapLongAfter = swapQuote ? (swapQuote.swap_impact_pool_long_amount_after as bigint) : get(input.pool, "swap_impact_pool_long_amount");
  const swapShortAfter = swapQuote ? (swapQuote.swap_impact_pool_short_amount_after as bigint) : get(input.pool, "swap_impact_pool_short_amount");
  if (swapQuote) {
    checkOutputSwapReservesNotWorsened(
      input.market,
      tempPool,
      { long_pool_amount: poolLongAfter, short_pool_amount: poolShortAfter },
      closeQuote,
      prices,
      reasons,
    );
  }

  return withV2Meta({
    type: "v2_decrease_with_output_swap",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    owner: input.owner ?? "",
    market_id: n(input.marketId ?? get(input.market, "market_id")),
    collateral_asset_id: collateralAssetId,
    side: n(input.side),
    size_usd_delta: closeQuote.size_usd_delta,
    remaining_size: closeQuote.remaining_size,
    remaining_collateral: closeQuote.remaining_collateral,
    output_swap_mode: mode,
    primary_output_asset_id: primaryOutputAssetId,
    primary_output_amount: primaryOutput,
    secondary_output_asset_id: secondaryOutputAssetId,
    secondary_output_amount: secondaryOutput,
    final_primary_output_amount: primaryOutput,
    final_secondary_output_amount: secondaryOutput,
    collateral_output: collateralOutput,
    pnl_output_asset_id: payoutAssetId,
    pnl_output_amount: payoutAmount,
    pnl_output_before_swap: payoutAmount,
    swap_token_in: swapQuote ? swapQuote.token_in_asset_id : 0n,
    swap_token_out: swapQuote ? swapQuote.token_out_asset_id : 0n,
    swap_amount_in: swapQuote ? swapQuote.amount_in : 0n,
    swap_amount_out: swapQuote ? swapQuote.amount_out : 0n,
    swap_fee_amount: swapQuote ? swapQuote.fee_amount : 0n,
    swap_pool_fee_amount: swapQuote ? swapQuote.pool_fee_amount : 0n,
    swap_protocol_fee_amount: swapQuote ? swapQuote.protocol_fee_amount : 0n,
    swap_insurance_fee_amount: swapQuote ? swapQuote.insurance_fee_amount : 0n,
    fee_amount: closeQuote.fee_amount,
    unpaid_cost_usd: closeQuote.unpaid_cost_usd,
    pool_long_amount_after: poolLongAfter,
    pool_short_amount_after: poolShortAfter,
    swap_impact_pool_long_after: swapLongAfter,
    swap_impact_pool_short_after: swapShortAfter,
    close_quote: closeQuote,
    swap_quote: swapQuote,
    required_flat_fee_microalgos: n(input.flatFeeMicroAlgo ?? V2_DECREASE_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO),
    required_method_flat_fee_microalgos: n(input.flatFeeMicroAlgo ?? V2_DECREASE_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO),
    required_group_flat_fee_microalgos:
      BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO)
      + n(input.flatFeeMicroAlgo ?? V2_DECREASE_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO),
  });
}

export function quoteV2Liquidation(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  target?: string;
  marketId?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  return quoteV2CloseLike({
    ...input,
    owner: input.target ?? "",
    sizeUsdDelta: get(input.position ?? {}, "size_usd"),
    acceptablePrice: 1n,
    minPrimaryOutput: 0n,
    liquidation: true,
  });
}

export function quoteV2Adl(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  target?: string;
  marketId?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta?: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  return quoteV2CloseLike({
    ...input,
    owner: input.target ?? "",
    sizeUsdDelta: input.sizeUsdDelta === undefined
      ? get(input.position ?? {}, "size_usd")
      : n(input.sizeUsdDelta),
    acceptablePrice: 1n,
    minPrimaryOutput: 0n,
    liquidation: false,
    adl: true,
  });
}

export function quoteV2SingleTokenOpen(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  owner?: string;
  marketId?: BigNumberish;
  backingAssetId?: BigNumberish;
  side: BigNumberish;
  collateralAmount: BigNumberish;
  sizeUsdDelta: BigNumberish;
  acceptablePrice: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  const backingAssetId = singleTokenBackingAssetId(input.market, input.backingAssetId);
  return asSingleTokenPositionQuote(
    quoteV2OpenPosition({
      ...input,
      collateralAssetId: backingAssetId,
      prices: singleTokenPrices(input.market, input.prices),
    }),
    "v2_single_token_open",
    input.market,
    backingAssetId,
  );
}

export function quoteV2SingleTokenDecrease(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  owner?: string;
  marketId?: BigNumberish;
  backingAssetId?: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta: BigNumberish;
  acceptablePrice: BigNumberish;
  minPrimaryOutput?: BigNumberish;
  prices?: V2PriceInput;
  flatFeeMicroAlgo?: BigNumberish;
}): V2QuoteResult {
  const backingAssetId = singleTokenBackingAssetId(input.market, input.backingAssetId);
  return asSingleTokenPositionQuote(
    quoteV2DecreasePosition({
      ...input,
      collateralAssetId: backingAssetId,
      prices: singleTokenPrices(input.market, input.prices),
    }),
    "v2_single_token_decrease",
    input.market,
    backingAssetId,
  );
}

export function quoteV2SingleTokenLiquidation(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  target?: string;
  marketId?: BigNumberish;
  backingAssetId?: BigNumberish;
  side: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  const backingAssetId = singleTokenBackingAssetId(input.market, input.backingAssetId);
  return asSingleTokenPositionQuote(
    quoteV2Liquidation({
      ...input,
      collateralAssetId: backingAssetId,
      prices: singleTokenPrices(input.market, input.prices),
    }),
    "v2_single_token_liquidation",
    input.market,
    backingAssetId,
  );
}

export function quoteV2SingleTokenAdl(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  target?: string;
  marketId?: BigNumberish;
  backingAssetId?: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta?: BigNumberish;
  prices?: V2PriceInput;
}): V2QuoteResult {
  const backingAssetId = singleTokenBackingAssetId(input.market, input.backingAssetId);
  return asSingleTokenPositionQuote(
    quoteV2Adl({
      ...input,
      collateralAssetId: backingAssetId,
      prices: singleTokenPrices(input.market, input.prices),
    }),
    "v2_single_token_adl",
    input.market,
    backingAssetId,
  );
}

function quoteV2CloseLike(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  owner?: string;
  marketId?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta: BigNumberish;
  acceptablePrice: BigNumberish;
  minPrimaryOutput?: BigNumberish;
  prices?: V2PriceInput;
  liquidation: boolean;
  adl?: boolean;
  flatFeeMicroAlgo?: BigNumberish;
  builderFee?: BuilderFeeInput;
}): V2QuoteResult {
  const adl = Boolean(input.adl);
  const market = adl
    ? marketWithPositionAggregates(input.market, input.positions ?? [])
    : input.market;
  const side = n(input.side);
  const collateralAssetId = n(input.collateralAssetId);
  const prices = priceSet(input.prices ?? market);
  const positionConversionScale = readV2MarketPositionScales(market).position_conversion_scale;
  const indexPrice = indexPriceForClose(side, prices);
  const collateralPrice = assetPrice(collateralAssetId, market, prices);
  const [builderAddress, builderFeeBps] = normalizeBuilderFee(
    input.builderFee,
    input.liquidation || adl ? 0 : MAX_POSITION_BUILDER_FEE_BPS,
  );
  const reasons: string[] = [];
  const risk = requiredMarketRisk(market, reasons);
  let position = input.position ?? null;
  if (!position) {
    reasons.push("position_not_found");
    position = { size_usd: 0n, size_tokens: 0n, collateral_amount: 0n, entry_price: 0n, side, pending_impact_qty_signed: V2_SIGNED_QTY_BIAS };
  }
  const original = positionWithDefaults(position);
  const sizeBefore = get(original, "size_usd");
  const requestedDelta = n(input.sizeUsdDelta);
  if (requestedDelta <= 0n || requestedDelta > sizeBefore) reasons.push("invalid_size_delta");
  const sizeDelta = min(max(requestedDelta, 0n), sizeBefore);
  const costQuote = sizeDelta > 0n && sizeBefore > 0n
    ? positionCostQuote(original, market, collateralAssetId, collateralPrice, sizeDelta)
    : null;
  const costDeficit = costQuote?.cost_deficit ?? false;
  let settled: V2StateRecord;
  let settlement: V2SettlementResult;
  if (costQuote && !costDeficit) {
    [settled, settlement] = settledPosition(
      original,
      market,
      collateralAssetId,
      collateralPrice,
      true,
    );
  } else {
    settled = original;
    settlement = emptySettlement();
  }
  const forcedAccruedCostUsd = costDeficit && costQuote
    ? (costQuote.slice_net_collateral_cost * collateralPrice) / ORACLE_PRICE_SCALE
    : 0n;
  const accruedPositionCostUsd = input.liquidation && costQuote
    ? (costQuote.full_net_collateral_cost * collateralPrice) / ORACLE_PRICE_SCALE
    : forcedAccruedCostUsd;
  const sliceSameTokenCredit = costDeficit && costQuote
    ? costQuote.slice_same_token_credit
    : 0n;
  const sliceLongClaim = costDeficit && costQuote
    ? costQuote.slice_long_claim
    : 0n;
  const sliceShortClaim = costDeficit && costQuote
    ? costQuote.slice_short_claim
    : 0n;
  const sizeTokenDelta = sizeBefore > 0n ? (get(settled, "size_tokens") * sizeDelta) / sizeBefore : 0n;
  const collateralDelta = sizeBefore > 0n ? (get(settled, "collateral_amount") * sizeDelta) / sizeBefore : 0n;
  const pending = pendingParts(settled);
  const pendingPositiveDelta = sizeBefore > 0n ? (pending.pending_impact_positive_qty * sizeDelta) / sizeBefore : 0n;
  const pendingNegativeDelta = sizeBefore > 0n ? (pending.pending_impact_negative_qty * sizeDelta) / sizeBefore : 0n;
  const closeFeeUsd = feeFromBps(sizeDelta, risk.close_fee_bps);
  const feeAmount = tokenAmountFromUsd(closeFeeUsd, collateralPrice);
  const builderFeeAssessed = tokenAmountFromUsd(
    feeFromBps(sizeDelta, builderFeeBps),
    collateralPrice,
  );
  const [profitUsd, lossUsd] = pnlParts(
    settled,
    side,
    sizeTokenDelta,
    indexPrice,
    positionConversionScale,
  );
  const [impactPositive, rawImpactNegative] = positionImpact(market, input.pool, side, sizeDelta, false, indexPrice);
  const impactNegative = input.liquidation
    ? min(rawImpactNegative, feeFromBps(sizeDelta, risk.max_liquidation_impact_bps))
    : rawImpactNegative;
  let sidePositivePnlUsd = 0n;
  let sidePoolUsd = 0n;
  let sidePnlCapUsd = 0n;
  let traderPnlCapUsd = 0n;
  let sidePnlFactorBps = 0n;
  const maxPnlFactorForAdlBps = risk.max_pnl_factor_for_adl_bps;
  const maxPnlFactorForTradersBps = risk.max_pnl_factor_for_traders_bps;
  let adlPayoutCapUsd = 0n;
  let effectiveProfitUsd = profitUsd;
  if (adl) {
    if (profitUsd <= 0n) reasons.push("adl_target_not_profitable");
    sidePositivePnlUsd = aggregateSidePositivePnl(market, side, indexPrice);
    sidePoolUsd = sidePoolValue(input.pool, side, prices, market);
    sidePnlCapUsd = feeFromBps(sidePoolUsd, maxPnlFactorForAdlBps);
    traderPnlCapUsd = feeFromBps(sidePoolUsd, maxPnlFactorForTradersBps);
    if (sidePoolUsd <= 0n) reasons.push("adl_empty_side_pool");
    else sidePnlFactorBps = (sidePositivePnlUsd * V2_BPS) / sidePoolUsd;
    if (sidePositivePnlUsd <= sidePnlCapUsd) reasons.push("adl_threshold_not_breached");
    adlPayoutCapUsd = traderPnlCapUsd;
    if (sidePositivePnlUsd > traderPnlCapUsd) {
      effectiveProfitUsd = (profitUsd * traderPnlCapUsd) / sidePositivePnlUsd;
    }
  }
  let payoutUsd = effectiveProfitUsd + impactPositive;
  let costUsd = lossUsd + impactNegative;
  if (input.liquidation || adl) {
    costUsd += closeFeeUsd + forcedAccruedCostUsd;
  }
  let payoutAssetId = 0n;
  let payoutAmount = 0n;
  let poolCreditAssetId = 0n;
  let poolCreditAmount = 0n;
  let collateralOutput = collateralDelta + sliceSameTokenCredit;
  let unpaidCostUsd = 0n;
  if (payoutUsd > costUsd) {
    payoutAssetId = pnlAssetId(side, market);
    payoutAmount = tokenAmountFromUsd(payoutUsd - costUsd, assetPrice(payoutAssetId, market, prices));
    if (!adl) checkTraderPnlCap(market, input.pool, payoutAssetId, payoutAmount, prices, reasons);
  } else if (costUsd > payoutUsd) {
    poolCreditAssetId = collateralAssetId;
    const desiredCreditUsd = costUsd - payoutUsd;
    const desiredCredit = tokenAmountFromUsd(desiredCreditUsd, collateralPrice);
    if (input.liquidation || adl) {
      poolCreditAmount = min(collateralOutput, desiredCredit);
      unpaidCostUsd += max(0n, desiredCreditUsd - (poolCreditAmount * collateralPrice) / ORACLE_PRICE_SCALE);
    } else {
      poolCreditAmount = desiredCredit;
      if (collateralOutput < poolCreditAmount) {
        reasons.push("close_size_insufficient");
        poolCreditAmount = collateralOutput;
      }
    }
    collateralOutput -= poolCreditAmount;
  }
  const liquidationFeeUsd = input.liquidation ? feeFromBps(sizeDelta, risk.liquidation_fee_bps) : 0n;
  const liquidationFeeAmount = tokenAmountFromUsd(liquidationFeeUsd, collateralPrice);
  let feePaid = feeAmount;
  if (input.liquidation) {
    feePaid = min(collateralOutput, liquidationFeeAmount);
    collateralOutput -= feePaid;
  } else if (adl) {
    feePaid = 0n;
  } else {
    if (collateralOutput < feeAmount) {
      reasons.push("close_size_insufficient");
      feePaid = collateralOutput;
    }
    collateralOutput -= feePaid;
  }
  const collateralOutputBeforeBuilderFee = collateralOutput;
  const builderFeePaid = !input.liquidation && !adl
    ? min(builderFeeAssessed, collateralOutputBeforeBuilderFee)
    : 0n;
  collateralOutput -= builderFeePaid;
  if (!input.liquidation && !adl) {
    if (n(input.acceptablePrice) <= 0n) reasons.push("acceptable_price_required");
    if (collateralOutput + payoutAmount < n(input.minPrimaryOutput ?? 0n)) reasons.push("min_primary_output");
  }
  const executionNumerator = closeExecutionNumerator(
    side,
    indexPrice,
    sizeTokenDelta,
    impactPositive,
    impactNegative,
    positionConversionScale,
  );
  const executionPrice = executionPriceFromRational(
    executionNumerator,
    sizeTokenDelta,
    side === V2_SIDE_SHORT,
  );
  if (!input.liquidation && !adl && n(input.acceptablePrice) > 0n
    && closePriceUnacceptable(side, executionNumerator, sizeTokenDelta, n(input.acceptablePrice))) {
    reasons.push("price_slippage");
  }
  const eligibilityImpactPositive = input.liquidation ? 0n : impactPositive;
  const creditsUsd = (
    ((get(settled, "collateral_amount") + sliceSameTokenCredit) * collateralPrice)
    / ORACLE_PRICE_SCALE
  ) + profitUsd + eligibilityImpactPositive;
  const costsUsd = lossUsd
    + impactNegative
    + closeFeeUsd
    + forcedAccruedCostUsd;
  const remainingUsd = max(0n, creditsUsd - costsUsd);
  const maintenance = feeFromBps(sizeBefore, risk.maintenance_margin_bps);
  const liquidatable = indexPrice > 0n && (creditsUsd <= costsUsd || remainingUsd < maintenance);
  if (input.liquidation && !liquidatable) reasons.push("not_liquidatable");
  const remainingSize = max(0n, sizeBefore - sizeDelta);
  const remainingCollateral = remainingSize === 0n ? 0n : max(0n, get(settled, "collateral_amount") - collateralDelta);
  const pendingAfter = pendingEncodedAfter(settled, { removePositive: pendingPositiveDelta, removeNegative: pendingNegativeDelta });
  const feeSplit = input.liquidation
    ? splitV2LiquidationFeeForQuote(feePaid, market, collateralAssetId)
    : adl
      ? zeroV2LiquidationFeeForQuote(market, collateralAssetId)
      : {};
  let claimableLongTokenOutput = settlement.claimableLongTokenOutput;
  let claimableShortTokenOutput = settlement.claimableShortTokenOutput;
  if (costDeficit && costQuote) {
    if (costQuote.other_claim_asset_id === get(market, "long_asset_id")) {
      claimableLongTokenOutput += sliceLongClaim;
    } else if (costQuote.other_claim_asset_id === get(market, "short_asset_id")) {
      claimableShortTokenOutput += sliceShortClaim;
    }
  }
  const requestedCloseResolves = costQuote !== null
    && !reasons.includes("close_size_insufficient");
  const remainingSnapshotMode = remainingSize === 0n
    ? "FULL_DELETE"
    : costDeficit
      ? "UNSETTLED_SLICE"
      : "SETTLED_CURRENT";
  const expectedCollateralDebit = costDeficit && costQuote
    ? costQuote.slice_net_collateral_cost
    : settlement.collateralDecrease;
  const expectedCollateralCredit = costDeficit && costQuote
    ? costQuote.slice_same_token_credit
    : settlement.collateralIncrease;
  let postHealth: V2QuoteResult | null = null;
  let postLiquidationPrice: V2QuoteResult | null = null;
  let adlSurvivorEquityUsd = 0n;
  let adlSurvivorMaintenanceUsd = 0n;
  let adlSurvivorContractAdmissible = true;
  if (adl) {
    // RiskOps emergency admissibility is distinct from liquidation health.
    if (risk.min_position_size_usd <= 0n) reasons.push("adl_bad_position_floor");
    if (sizeTokenDelta <= 0n) reasons.push("adl_zero_tokens");
    if (collateralDelta <= 0n) reasons.push("adl_zero_collateral");
    if (remainingSize > 0n) {
      const remainingTokens = get(settled, "size_tokens") - sizeTokenDelta;
      const [profit, loss] = pnlParts(settled, side, remainingTokens, indexPrice, positionConversionScale);
      const remainingCredit = costDeficit ? costQuote?.remaining_same_token_credit ?? 0n : 0n;
      const remainingCost = costDeficit ? costQuote?.remaining_net_collateral_cost ?? 0n : 0n;
      const credits = (remainingCollateral + remainingCredit) * collateralPrice / ORACLE_PRICE_SCALE + profit;
      const costs = remainingCost * collateralPrice / ORACLE_PRICE_SCALE + loss;
      adlSurvivorEquityUsd = credits - costs;
      adlSurvivorMaintenanceUsd = feeFromBps(remainingSize, risk.maintenance_margin_bps);
      adlSurvivorContractAdmissible = remainingSize >= risk.min_position_size_usd
        && remainingTokens > 0n && credits >= costs
        && adlSurvivorEquityUsd >= adlSurvivorMaintenanceUsd;
      if (!adlSurvivorContractAdmissible) reasons.push("adl_survivor_guard_breach");
    }
  }
  if (!input.liquidation && remainingSize > 0n) {
    const postPosition: V2StateRecord = {
      ...settled,
      market_id: n(input.marketId ?? get(market, "market_id")),
      collateral_asset_id: collateralAssetId,
      side,
      size_usd: remainingSize,
      size_tokens: max(0n, get(settled, "size_tokens") - sizeTokenDelta),
      collateral_amount: remainingCollateral,
      entry_price: get(settled, "entry_price"),
      pending_impact_qty_signed: pendingAfter,
    };
    const postMarket = marketAfterPositionOiDelta(market, {
      collateralAssetId,
      side,
      sizeUsdDelta: sizeDelta,
      increasing: false,
    });
    postHealth = quoteV2PositionHealth({
      market: postMarket,
      pool: input.pool,
      position: postPosition,
      collateralAssetId,
      side,
      prices,
    });
    postLiquidationPrice = adl ? null : quoteV2LiquidationPrice({
      market: postMarket,
      pool: input.pool,
      position: postPosition,
      collateralAssetId,
      side,
      prices,
    });
    if (Boolean(postHealth.liquidatable) && !adl) reasons.push("position_health_breach");
  }
  const dedupedReasons = [...new Set(reasons)];
  const closeMethodFee = n(input.flatFeeMicroAlgo ?? V2_DECREASE_OR_CLOSE_METHOD_FLAT_FEE_MICRO_ALGO);
  if (closeMethodFee <= 0n) throw new Error("invalid_close_fee_microalgos");
  return withV2Meta({
    type: adl ? "v2_adl" : input.liquidation ? "v2_liquidation" : "v2_decrease",
    adl_survivor_contract_admissible: adl ? adlSurvivorContractAdmissible : null,
    adl_survivor_equity_usd: adlSurvivorEquityUsd,
    adl_survivor_maintenance_usd: adlSurvivorMaintenanceUsd,
    ok: dedupedReasons.length === 0,
    failure_reasons: dedupedReasons,
    owner: input.owner ?? "",
    target: input.owner ?? "",
    market_id: n(input.marketId ?? get(market, "market_id")),
    collateral_asset_id: collateralAssetId,
    side,
    index_price: indexPrice,
    execution_price: executionPrice,
    acceptable_price: n(input.acceptablePrice),
    size_usd_delta: sizeDelta,
    size_token_delta: sizeTokenDelta,
    collateral_delta: collateralDelta,
    fee_amount: feePaid,
    platform_fee_amount: feePaid,
    builder_address: builderAddress,
    builder_fee_bps: builderFeeBps,
    builder_fee_assessed: builderFeeAssessed,
    builder_fee_payable: builderFeePaid,
    builder_fee_paid: builderFeePaid,
    builder_fee_status: builderFeePaid === builderFeeAssessed && builderFeePaid > 0n
      ? "paid"
      : builderFeePaid > 0n
        ? "clipped"
        : builderFeeAssessed > 0n
          ? "waived"
          : "none",
    collateral_output_before_builder_fee: collateralOutputBeforeBuilderFee,
    close_fee_usd: closeFeeUsd,
    liquidation_fee_usd: liquidationFeeUsd,
    liquidation_fee_amount: liquidationFeeAmount,
    accrued_position_cost_usd: accruedPositionCostUsd,
    profit_usd: profitUsd,
    effective_profit_usd: effectiveProfitUsd,
    loss_usd: lossUsd,
    realized_pnl_usd: profitUsd - lossUsd,
    impact_positive_usd: impactPositive,
    impact_negative_usd: impactNegative,
    pending_impact_positive_qty_delta: pendingPositiveDelta,
    pending_impact_negative_qty_delta: pendingNegativeDelta,
    primary_output_asset_id: collateralAssetId,
    primary_output_amount: collateralOutput,
    pnl_output_asset_id: payoutAssetId,
    pnl_output_amount: payoutAmount,
    pool_credit_asset_id: poolCreditAssetId,
    pool_credit_amount: poolCreditAmount,
    remaining_size: remainingSize,
    remaining_collateral: remainingCollateral,
    liquidation_price_estimate: postLiquidationPrice
      ? get(postLiquidationPrice, "liquidation_price")
      : 0n,
    liquidation_price_direction: postLiquidationPrice
      ? String(postLiquidationPrice.direction ?? "")
      : "",
    liquidation_price_basis: "index_asset_linked_health_boundary",
    ...readV2MarketPositionScales(market),
    ...decodeV2PendingImpactQty(pendingAfter),
    position_pending_impact_qty_signed_after: pendingAfter,
    equity_usd: remainingUsd,
    maintenance_margin_required_usd: maintenance,
    min_collateral_required_usd: risk.min_collateral_usd,
    liquidatable,
    ...postActionHealthFields(postHealth),
    adl_threshold_breached: adl && sidePositivePnlUsd > sidePnlCapUsd,
    side_positive_pnl_usd: sidePositivePnlUsd,
    side_pool_usd: sidePoolUsd,
    side_pnl_cap_usd: sidePnlCapUsd,
    trader_pnl_cap_usd: traderPnlCapUsd,
    side_pnl_factor_bps: sidePnlFactorBps,
    max_pnl_factor_for_adl_bps: maxPnlFactorForAdlBps,
    max_pnl_factor_for_traders_bps: maxPnlFactorForTradersBps,
    adl_payout_cap_usd: adlPayoutCapUsd,
    unpaid_cost_usd: unpaidCostUsd,
    normal_settlement_available: !costDeficit,
    cost_deficit: costDeficit,
    minimum_top_up: costQuote?.minimum_top_up ?? 0n,
    requested_close_resolves: requestedCloseResolves,
    minimum_resolving_close_size: null,
    remaining_snapshot_mode: remainingSnapshotMode,
    expected_collateral_debit: expectedCollateralDebit,
    expected_collateral_credit: expectedCollateralCredit,
    expected_long_claim_output: claimableLongTokenOutput,
    expected_short_claim_output: claimableShortTokenOutput,
    expected_voluntary_unpaid_amount: 0n,
    forced_unpaid_cost_usd: input.liquidation || adl ? unpaidCostUsd : 0n,
    blocked_reason: requestedCloseResolves ? "" : "close_size_insufficient",
    position_cost_resolution: costQuote,
    settlement_collateral_decrease: settlement.collateralDecrease,
    settlement_collateral_increase: settlement.collateralIncrease,
    funding_fee_collateral_amount: settlement.fundingFeeCollateralAmount,
    borrowing_fee_collateral_amount: settlement.borrowingFeeCollateralAmount,
    collateral_funding_net_amount: settlement.collateralFundingNetAmount,
    claimable_long_token_output: claimableLongTokenOutput,
    claimable_short_token_output: claimableShortTokenOutput,
    ...feeSplit,
    required_flat_fee_microalgos: adl
      ? V2_ADL_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO
      : input.liquidation
        ? V2_LIQUIDATION_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO
        : closeMethodFee + (builderFeePaid > 0n ? 1_000n : 0n),
    required_method_flat_fee_microalgos: adl
      ? BigInt(V2_ADL_METHOD_FLAT_FEE_MICRO_ALGO)
      : input.liquidation
        ? BigInt(V2_LIQUIDATION_METHOD_FLAT_FEE_MICRO_ALGO)
        : closeMethodFee + (builderFeePaid > 0n ? 1_000n : 0n),
    required_group_flat_fee_microalgos: adl
      ? V2_ADL_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO
      : input.liquidation
        ? V2_LIQUIDATION_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO
        : BigInt(V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO)
          + closeMethodFee
          + (builderFeePaid > 0n ? 1_000n : 0n),
  });
}

function swapHopQuote(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  tokenInAssetId: bigint;
  amountIn: bigint;
  minAmountOut: bigint;
  prices: V2PriceSet;
}): V2QuoteResult {
  const reasons: string[] = [];
  requiredMarketRisk(input.market, reasons);
  const longAsset = get(input.market, "long_asset_id");
  const shortAsset = get(input.market, "short_asset_id");
  if (longAsset === shortAsset) reasons.push("single_token_market");
  const inputIsLong = input.tokenInAssetId === longAsset;
  const inputIsShort = input.tokenInAssetId === shortAsset;
  if (!inputIsLong && !inputIsShort) reasons.push("invalid_token_in");
  const tokenOut = inputIsLong ? shortAsset : longAsset;
  if (input.amountIn <= 0n) reasons.push("invalid_amount_in");
  const inputMid = swapAssetPrice(input.tokenInAssetId, input.market, input.prices, "mid");
  const outputMid = swapAssetPrice(tokenOut, input.market, input.prices, "mid");
  const inputMin = swapAssetPrice(input.tokenInAssetId, input.market, input.prices, "min");
  const outputMax = swapAssetPrice(tokenOut, input.market, input.prices, "max");
  if (inputMid <= 0n || outputMid <= 0n || inputMin <= 0n || outputMax <= 0n) reasons.push("price_required");
  const fullValue = inputMid > 0n ? (input.amountIn * inputMid) / ORACLE_PRICE_SCALE : 0n;
  const [preFeePositive] = swapPoolBalanceImpact(
    input.market,
    input.pool,
    inputIsLong ? fullValue : -fullValue,
    inputIsLong ? -fullValue : fullValue,
    input.prices,
    fullValue,
  );
  const fee = feeFromBps(input.amountIn, swapFeeBps(input.market, preFeePositive > 0n));
  const standardSplit = standardFeeSplitBps(input.market);
  const poolFee = (fee * standardSplit.poolBps) / V2_BPS;
  const protocolFee = (fee * standardSplit.protocolBps) / V2_BPS;
  const insuranceFee = fee - poolFee - protocolFee;
  const amountAfterFee = max(0n, input.amountIn - fee);
  const effectiveValue = inputMid > 0n ? (amountAfterFee * inputMid) / ORACLE_PRICE_SCALE : 0n;
  const [impactPositive, impactNegative] = swapPoolBalanceImpact(
    input.market,
    input.pool,
    inputIsLong ? effectiveValue : -effectiveValue,
    inputIsLong ? -effectiveValue : effectiveValue,
    input.prices,
    effectiveValue,
  );
  const outputPool = inputIsLong ? get(input.pool, "short_pool_amount") : get(input.pool, "long_pool_amount");
  const inputImpactPool = inputIsLong ? get(input.pool, "swap_impact_pool_long_amount") : get(input.pool, "swap_impact_pool_short_amount");
  const outputImpactPool = inputIsLong ? get(input.pool, "swap_impact_pool_short_amount") : get(input.pool, "swap_impact_pool_long_amount");
  let impactToken = 0n;
  let amountOut = 0n;
  let poolInAdd = amountAfterFee + poolFee;
  let poolOutSubtract = 0n;
  let inputImpactPoolAfter = inputImpactPool;
  let outputImpactPoolAfter = outputImpactPool;
  if (impactNegative > 0n) {
    impactToken = min(tokenAmountFromUsd(impactNegative, inputMid), amountAfterFee);
    const effectiveInput = max(0n, amountAfterFee - impactToken);
    amountOut = outputMax > 0n ? (effectiveInput * inputMin) / outputMax : 0n;
    poolInAdd = effectiveInput + poolFee;
    poolOutSubtract = amountOut;
    inputImpactPoolAfter = inputImpactPool + impactToken;
  } else {
    const baseOut = outputMax > 0n ? (amountAfterFee * inputMin) / outputMax : 0n;
    impactToken = min(tokenAmountFromUsd(impactPositive, outputMid), outputImpactPool);
    amountOut = baseOut + impactToken;
    poolOutSubtract = baseOut;
    outputImpactPoolAfter = outputImpactPool - impactToken;
  }
  const longAfter = inputIsLong ? get(input.pool, "long_pool_amount") + poolInAdd : get(input.pool, "long_pool_amount") - poolOutSubtract;
  const shortAfter = inputIsLong ? get(input.pool, "short_pool_amount") - poolOutSubtract : get(input.pool, "short_pool_amount") + poolInAdd;
  const impactLongAfter = inputIsLong ? inputImpactPoolAfter : outputImpactPoolAfter;
  const impactShortAfter = inputIsLong ? outputImpactPoolAfter : inputImpactPoolAfter;
  if (fee >= input.amountIn) reasons.push("fee_consumes_input");
  if (poolOutSubtract > outputPool) reasons.push("insufficient_pool_output");
  checkReserves(input.market, { ...input.pool, long_pool_amount: longAfter, short_pool_amount: shortAfter }, input.prices, reasons);
  if (amountOut < input.minAmountOut) reasons.push("min_amount_out");
  return withV2Meta({
    type: "v2_swap_exact_in",
    ok: reasons.length === 0,
    failure_reasons: reasons,
    market_id: get(input.market, "market_id"),
    token_in_asset_id: input.tokenInAssetId,
    token_out_asset_id: tokenOut,
    amount_in: input.amountIn,
    amount_in_after_fees: amountAfterFee,
    fee_amount: fee,
    pool_fee_amount: poolFee,
    protocol_fee_amount: protocolFee,
    insurance_fee_amount: insuranceFee,
    impact_positive_usd: impactPositive,
    impact_negative_usd: impactNegative,
    impact_token_amount: impactToken,
    amount_out: amountOut,
    pool_long_amount_after: longAfter,
    pool_short_amount_after: shortAfter,
    swap_impact_pool_long_amount_after: impactLongAfter,
    swap_impact_pool_short_amount_after: impactShortAfter,
    required_flat_fee_microalgos: V2_SWAP_QUOTE_ONE_HOP_FLAT_FEE_MICRO_ALGO,
  });
}

function swapPoolBalanceImpact(
  market: V2StateRecord,
  pool: V2StateRecord,
  longDeltaUsd: bigint,
  shortDeltaUsd: bigint,
  prices: V2PriceSet,
  capValueUsd: bigint,
): [bigint, bigint] {
  const beforeLong = (get(pool, "long_pool_amount") * prices.long_price) / ORACLE_PRICE_SCALE;
  const beforeShort = (get(pool, "short_pool_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
  const afterLong = beforeLong + longDeltaUsd;
  const afterShort = beforeShort + shortDeltaUsd;
  const beforeDiff = abs(beforeLong - beforeShort);
  const afterDiff = abs(afterLong - afterShort);
  const settings = swapImpactSettings(market);
  if (afterDiff < beforeDiff) {
    const raw = impactCurveDelta(beforeDiff, afterDiff, settings.positiveExponent);
    return [min(feeFromBps(raw, settings.positiveFactorBps), feeFromBps(capValueUsd, settings.maxPositiveImpactBps)), 0n];
  }
  if (afterDiff > beforeDiff) {
    const raw = impactCurveDelta(afterDiff, beforeDiff, settings.negativeExponent);
    return [0n, min(feeFromBps(raw, settings.negativeFactorBps), feeFromBps(capValueUsd, settings.maxNegativeImpactBps))];
  }
  return [0n, 0n];
}

function swapAssetPrice(assetId: bigint, market: V2StateRecord, prices: V2PriceSet, selector: "mid" | "min" | "max"): bigint {
  if (assetId === get(market, "long_asset_id")) {
    if (selector === "min") return prices.long_price_min;
    if (selector === "max") return prices.long_price_max;
    return prices.long_price;
  }
  if (assetId === get(market, "short_asset_id")) {
    if (selector === "min") return prices.short_price_min;
    if (selector === "max") return prices.short_price_max;
    return prices.short_price;
  }
  return 0n;
}

function swapFeeBps(market: V2StateRecord, improvesBalance: boolean): bigint {
  if (improvesBalance) {
    return get(
      market,
      "swap_fee_factor_improve_bps",
      "swap_fee_improve_bps",
      undefined,
      get(market, "swap_fee_bps", undefined, undefined, V2_DEFAULT_SWAP_FEE_IMPROVE_BPS),
    );
  }
  return get(
    market,
    "swap_fee_factor_worsen_bps",
    "swap_fee_worsen_bps",
    undefined,
    get(market, "swap_fee_bps", undefined, undefined, V2_DEFAULT_SWAP_FEE_WORSEN_BPS),
  );
}

function poolAfterCloseQuote(market: V2StateRecord, pool: V2StateRecord, closeQuote: V2StateRecord): V2StateRecord {
  const result: V2StateRecord = { ...pool };
  for (const [assetField, amountField, direction] of [
    ["pnl_output_asset_id", "pnl_output_amount", -1n],
    ["pool_credit_asset_id", "pool_credit_amount", 1n],
  ] as const) {
    const assetId = get(closeQuote, assetField);
    const amount = get(closeQuote, amountField);
    if (amount <= 0n) continue;
    if (assetId === get(market, "long_asset_id")) {
      result.long_pool_amount = max(0n, get(result, "long_pool_amount") + direction * amount);
    } else if (assetId === get(market, "short_asset_id")) {
      result.short_pool_amount = max(0n, get(result, "short_pool_amount") + direction * amount);
    }
  }
  return result;
}

function lookupStateRecord(records: V2StateRecord | Record<string, V2StateRecord> | V2StateRecord[], key: bigint): V2StateRecord {
  if (Array.isArray(records)) {
    return records.find((record) => get(record, "market_id", "marketId") === key) ?? {};
  }
  if ("market_id" in records || "marketId" in records) return records;
  const keyed = (records as Record<string, V2StateRecord>)[key.toString()];
  if (keyed) return keyed;
  for (const value of Object.values(records as Record<string, V2StateRecord>)) {
    if (typeof value === "object" && value && get(value, "market_id", "marketId") === key) return value;
  }
  return {};
}

function priceSet(source: V2PriceInput): V2PriceSet {
  // Signed oracle snapshots carry authoritative min/max bands and do not carry
  // separate midpoint fields. Quotes that need a mark price use the lower band
  // as the deterministic anchor; deposit/withdraw contexts consume the full
  // min/max pair below.
  const index = requiredPrice(
    source,
    "index_price",
    "indexPrice",
    "oracle_price",
    "index_price_min",
    "indexPriceMin",
    "index_price_max",
    "indexPriceMax",
  );
  const indexMin = optionalPrice(source, ["index_price_min", "indexPriceMin"], index);
  const indexMax = optionalPrice(source, ["index_price_max", "indexPriceMax"], index);
  const long = requiredPrice(
    source,
    "long_price",
    "longPrice",
    "long_price_min",
    "longPriceMin",
    "long_price_max",
    "longPriceMax",
  );
  const longMin = optionalPrice(source, ["long_price_min", "longPriceMin"], long);
  const longMax = optionalPrice(source, ["long_price_max", "longPriceMax"], long);
  const short = requiredPrice(
    source,
    "short_price",
    "shortPrice",
    "short_price_min",
    "shortPriceMin",
    "short_price_max",
    "shortPriceMax",
  );
  const shortMin = optionalPrice(source, ["short_price_min", "shortPriceMin"], short);
  const shortMax = optionalPrice(source, ["short_price_max", "shortPriceMax"], short);
  const result = {
    index_price: index,
    index_price_min: indexMin,
    index_price_max: indexMax,
    long_price: longMin || long,
    long_price_min: longMin,
    long_price_max: longMax,
    short_price: shortMin || short,
    short_price_min: shortMin,
    short_price_max: shortMax,
  };
  if (indexMax < indexMin || longMax < longMin || shortMax < shortMin) {
    throw new Error("Price12 maximum must be at least its minimum");
  }
  return result;
}

function requiredPrice(source: V2PriceInput, ...names: string[]): bigint {
  for (const name of names) {
    const value = source[name];
    if (value !== undefined && value !== null) return validateRawPrice12(value as RawPrice12);
  }
  throw new Error(`missing Price12 field: ${names.join("/")}`);
}

function optionalPrice(source: V2PriceInput, names: string[], fallback: bigint): bigint {
  for (const name of names) {
    const value = source[name];
    if (value !== undefined && value !== null) return validateRawPrice12(value as RawPrice12);
  }
  return fallback;
}

function lpNavRequest(input: {
  market: V2StateRecord;
  pool: V2StateRecord;
  prices: V2PriceSet;
  pnlContext: V2PnlContext;
  shareAmount?: bigint;
  poolLongAmount?: bigint;
  poolShortAmount?: bigint;
}): Record<string, bigint> {
  const markContext = input.pnlContext === "traders" || input.pnlContext === "adl";
  const indexMin = markContext ? input.prices.index_price : input.prices.index_price_min;
  const indexMax = markContext ? input.prices.index_price : input.prices.index_price_max;
  const longMin = markContext ? input.prices.long_price : input.prices.long_price_min;
  const longMax = markContext ? input.prices.long_price : input.prices.long_price_max;
  const shortMin = markContext ? input.prices.short_price : input.prices.short_price_min;
  const shortMax = markContext ? input.prices.short_price : input.prices.short_price_max;
  const depositCap = markContext
    ? maxPnlFactorBpsForContext(input.market, input.pnlContext)
    : maxPnlFactorBpsForContext(input.market, "deposits");
  const withdrawCap = markContext
    ? depositCap
    : maxPnlFactorBpsForContext(input.market, "withdrawals");
  const single = isSingleTokenMarket(input.market);
  return {
    version: 2n,
    flags: single ? 1n : 0n,
    pool_long: input.poolLongAmount ?? get(input.pool, "long_pool_amount"),
    pool_short: single ? 0n : input.poolShortAmount ?? get(input.pool, "short_pool_amount"),
    impact_qty: get(input.pool, "position_impact_pool_qty"),
    lent_qty: get(input.pool, "lent_position_impact_pool_qty"),
    long_oi: totalLongOi(input.market),
    short_oi: totalShortOi(input.market),
    long_tokens: totalLongTokens(input.market),
    short_tokens: totalShortOiTokens(input.market),
    index_min: indexMin,
    index_max: indexMax,
    long_min: longMin,
    long_max: longMax,
    short_min: shortMin,
    short_max: shortMax,
    deposit_cap_bps: depositCap,
    withdraw_cap_bps: withdrawCap,
    long_borrowing_factor: get(input.market, "long_borrowing_factor_milli_bps", "longBorrowingFactorMilliBps"),
    short_borrowing_factor: get(input.market, "short_borrowing_factor_milli_bps", "shortBorrowingFactorMilliBps"),
    long_total_borrowing: get(input.market, "long_total_borrowing_snapshot_usd", "longTotalBorrowingSnapshotUsd"),
    short_total_borrowing: get(input.market, "short_total_borrowing_snapshot_usd", "shortTotalBorrowingSnapshotUsd"),
    supply: get(input.pool, "market_share_supply", "share_supply"),
    share_amount: input.shareAmount ?? 0n,
    position_conversion_scale: readV2MarketPositionScales(input.market).position_conversion_scale,
  };
}

function isSingleTokenMarket(market: V2StateRecord): boolean {
  return get(market, "long_asset_id") > 0n && get(market, "long_asset_id") === get(market, "short_asset_id");
}

function singleTokenMarketReasons(market: V2StateRecord): string[] {
  const reasons: string[] = [];
  if (!isSingleTokenMarket(market)) reasons.push("not_single_token_market");
  return reasons;
}

function singleTokenBackingAssetId(market: V2StateRecord, backingAssetId?: BigNumberish): bigint {
  return backingAssetId === undefined ? get(market, "long_asset_id") : n(backingAssetId);
}

function singleTokenPrices(market: V2StateRecord, prices?: V2PriceInput): V2PriceSet {
  const result = priceSet(prices ?? market);
  const longPrice = result.long_price || result.index_price;
  const longMin = result.long_price_min || result.index_price_min || longPrice;
  const longMax = result.long_price_max || result.index_price_max || longPrice;
  return {
    ...result,
    long_price: longMin || longPrice,
    long_price_min: longMin,
    long_price_max: longMax,
    short_price: longMin || longPrice,
    short_price_min: longMin,
    short_price_max: longMax,
  };
}

function asSingleTokenPositionQuote(quote: V2QuoteResult, type: string, market: V2StateRecord, backingAssetId: bigint): V2QuoteResult {
  const reasons = singleTokenMarketReasons(market);
  if (backingAssetId !== get(market, "long_asset_id")) reasons.push("invalid_backing_asset");
  reasons.push(...((quote.failure_reasons as string[] | undefined) ?? []));
  const deduped = [...new Set(reasons)];
  let requiredFlatFee = {
    v2_single_token_open: V2_SINGLE_TOKEN_TRADING_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
    v2_single_token_decrease: V2_SINGLE_TOKEN_DECREASE_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
    v2_single_token_liquidation: V2_SINGLE_TOKEN_LIQUIDATION_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
    v2_single_token_adl: V2_SINGLE_TOKEN_ADL_QUOTE_GROUP_FLAT_FEE_MICRO_ALGO,
  }[type] ?? V2_SINGLE_TOKEN_QUOTE_FLAT_FEE_MICRO_ALGO;
  if (type === "v2_single_token_decrease") {
    requiredFlatFee = n(
      quote.required_flat_fee_microalgos as BigNumberish | undefined
      ?? V2_SINGLE_TOKEN_DECREASE_METHOD_FLAT_FEE_MICRO_ALGO,
    );
  }
  const result: V2QuoteResult = {
    ...quote,
    type,
    backing_asset_id: backingAssetId,
    collateral_asset_id: backingAssetId,
    is_single_token_market: true,
    market_family: "single_token",
    failure_reasons: deduped,
    ok: deduped.length === 0,
    required_flat_fee_microalgos: requiredFlatFee,
  };
  if (type !== "v2_single_token_open") {
    result.primary_output_asset_id = backingAssetId;
    result.pnl_output_asset_id = get(quote, "pnl_output_amount") > 0n ? backingAssetId : 0n;
    result.collateral_output = get(quote, "primary_output_amount");
    result.pnl_output = get(quote, "pnl_output_amount");
  }
  return result;
}

function indexPriceForOpen(side: bigint, prices: V2PriceSet): bigint {
  return side === V2_SIDE_LONG ? prices.index_price_max : prices.index_price_min;
}

function indexPriceForClose(side: bigint, prices: V2PriceSet): bigint {
  return side === V2_SIDE_LONG ? prices.index_price_min : prices.index_price_max;
}

function assetPrice(assetId: bigint, market: V2StateRecord, prices: V2PriceSet): bigint {
  if (assetId === get(market, "short_asset_id")) return prices.short_price;
  if (assetId === get(market, "long_asset_id")) return prices.long_price;
  if (assetId === get(market, "index_asset_id")) return prices.index_price;
  return 0n;
}

function pnlAssetId(side: bigint, market: V2StateRecord): bigint {
  return side === V2_SIDE_LONG ? get(market, "long_asset_id") : get(market, "short_asset_id");
}

function feeFromBps(value: bigint, bps: bigint): bigint {
  return (value * bps) / V2_BPS;
}

function dynamicOiMarginForOpen(
  market: V2StateRecord,
  side: bigint,
  sizeUsdDelta: bigint,
  baselineBps: bigint,
  reasons: string[],
): Record<string, bigint> {
  const decoded = readV2DynamicOiMarginConfig(market);
  const sideOiAfter = side === V2_SIDE_LONG ? totalLongOi(market) + sizeUsdDelta : totalShortOi(market) + sizeUsdDelta;
  let dynamicBps = 0n;
  if (!decoded.ok) {
    reasons.push("dynamic_oi_margin_missing");
  } else if (decoded.values.dynamic_oi_margin_enabled) {
    const factor =
      side === V2_SIDE_LONG
        ? decoded.values.dynamic_oi_margin_long_factor_scaled ?? 0n
        : decoded.values.dynamic_oi_margin_short_factor_scaled ?? 0n;
    dynamicBps = min(V2_BPS, (sideOiAfter * factor) / V2_MATH_FACTOR_SCALE);
  }
  const effectiveBps = max(baselineBps, dynamicBps);
  return {
    baseline_initial_margin_bps: baselineBps,
    dynamic_initial_margin_bps: dynamicBps,
    effective_initial_margin_bps: effectiveBps,
    effective_max_leverage_bps: effectiveBps <= 0n ? 0n : (V2_BPS * V2_BPS) / effectiveBps,
    side_oi_after_usd: sideOiAfter,
  };
}

function requiredMarketRisk(market: V2StateRecord, reasons: string[]): V2MarketRiskValues {
  const decoded = readV2MarketRisk(market);
  if (!decoded.ok) {
    reasons.push("market_risk_missing");
    return zeroMarketRisk(decoded.missing);
  }
  const risk = decoded.values as V2MarketRiskValues;
  const invalidFields: V2MarketRiskField[] = [];
  const positiveFields: V2MarketRiskField[] = [
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
    "max_pnl_factor_for_deposits_bps",
    "max_pnl_factor_for_withdrawals_bps",
    "max_pnl_factor_for_traders_bps",
    "max_pnl_factor_for_adl_bps",
    "min_pnl_factor_after_adl_bps",
    "funding_interval_seconds",
    "optimal_usage_factor_long_bps",
    "optimal_usage_factor_short_bps",
  ];
  const bpsFields: V2MarketRiskField[] = [
    "initial_margin_bps",
    "maintenance_margin_bps",
    "reserve_factor_long_bps",
    "reserve_factor_short_bps",
    "max_pnl_factor_for_deposits_bps",
    "max_pnl_factor_for_withdrawals_bps",
    "max_pnl_factor_for_traders_bps",
    "max_pnl_factor_for_adl_bps",
    "min_pnl_factor_after_adl_bps",
    "open_fee_bps",
    "close_fee_bps",
    "liquidation_fee_bps",
    "max_liquidation_impact_bps",
    "optimal_usage_factor_long_bps",
    "optimal_usage_factor_short_bps",
  ];
  const borrowingMilliBpsFields: V2MarketRiskField[] = [
    "base_borrowing_factor_long_milli_bps",
    "base_borrowing_factor_short_milli_bps",
    "full_usage_borrowing_factor_long_milli_bps",
    "full_usage_borrowing_factor_short_milli_bps",
  ];
  for (const field of positiveFields) {
    if (risk[field] <= 0n) invalidFields.push(field);
  }
  for (const field of bpsFields) {
    if (risk[field] < 0n || risk[field] > V2_BPS) invalidFields.push(field);
  }
  for (const field of borrowingMilliBpsFields) {
    if (risk[field] < 0n || risk[field] > V2_MAX_BORROWING_FACTOR_MILLI_BPS) invalidFields.push(field);
  }
  if (risk.funding_factor_milli_bps < 0n || risk.funding_factor_milli_bps > V2_MAX_FUNDING_FACTOR_MILLI_BPS) {
    invalidFields.push("funding_factor_milli_bps");
  }
  if (
    risk.base_borrowing_factor_long_milli_bps > risk.full_usage_borrowing_factor_long_milli_bps ||
    risk.base_borrowing_factor_short_milli_bps > risk.full_usage_borrowing_factor_short_milli_bps
  ) {
    invalidFields.push("full_usage_borrowing_factor_long_milli_bps");
  }
  if (risk.maintenance_margin_bps > risk.initial_margin_bps) invalidFields.push("maintenance_margin_bps");
  if (!(risk.max_pnl_factor_for_withdrawals_bps <= risk.min_pnl_factor_after_adl_bps
    && risk.min_pnl_factor_after_adl_bps <= risk.max_pnl_factor_for_adl_bps
    && risk.max_pnl_factor_for_adl_bps <= risk.max_pnl_factor_for_deposits_bps
    && risk.max_pnl_factor_for_deposits_bps <= risk.max_pnl_factor_for_traders_bps)) {
    invalidFields.push(
      "max_pnl_factor_for_withdrawals_bps",
      "min_pnl_factor_after_adl_bps",
      "max_pnl_factor_for_adl_bps",
      "max_pnl_factor_for_deposits_bps",
      "max_pnl_factor_for_traders_bps",
    );
  }
  if (invalidFields.length > 0) {
    reasons.push("market_risk_invalid");
    return zeroMarketRisk(invalidFields);
  }
  return risk;
}

function zeroMarketRisk(_fields: V2MarketRiskField[]): V2MarketRiskValues {
  return {
    min_position_size_usd: 0n,
    min_collateral_usd: 0n,
    initial_margin_bps: 0n,
    maintenance_margin_bps: 0n,
    max_open_interest_long: 0n,
    max_open_interest_short: 0n,
    max_pool_amount_long: 0n,
    max_pool_amount_short: 0n,
    max_pool_usd_for_deposit_long: 0n,
    max_pool_usd_for_deposit_short: 0n,
    reserve_factor_long_bps: 0n,
    reserve_factor_short_bps: 0n,
    max_pnl_factor_for_deposits_bps: 0n,
    max_pnl_factor_for_withdrawals_bps: 0n,
    max_pnl_factor_for_traders_bps: 0n,
    max_pnl_factor_for_adl_bps: 0n,
    min_pnl_factor_after_adl_bps: 0n,
    position_impact_factor_bps: 0n,
    max_position_impact_bps: 0n,
    swap_impact_factor_bps: 0n,
    max_swap_impact_bps: 0n,
    open_fee_bps: 0n,
    close_fee_bps: 0n,
    liquidation_fee_bps: 0n,
    max_liquidation_impact_bps: 0n,
    funding_factor_milli_bps: 0n,
    funding_interval_seconds: 0n,
    base_borrowing_factor_long_milli_bps: 0n,
    base_borrowing_factor_short_milli_bps: 0n,
    full_usage_borrowing_factor_long_milli_bps: 0n,
    full_usage_borrowing_factor_short_milli_bps: 0n,
    optimal_usage_factor_long_bps: 0n,
    optimal_usage_factor_short_bps: 0n,
  };
}

function tokenAmountFromUsd(amountUsd: bigint, price: bigint): bigint {
  if (amountUsd <= 0n || price <= 0n) return 0n;
  return (amountUsd * ORACLE_PRICE_SCALE) / price;
}

function positionQtyFromUsd(
  amountUsd: bigint,
  price: bigint,
  positionConversionScale: bigint,
): bigint {
  if (amountUsd <= 0n || price <= 0n) return 0n;
  return (amountUsd * positionConversionScale) / price;
}

function depositImpact(pool: V2StateRecord, market: V2StateRecord, longAmount: bigint, shortAmount: bigint, prices: V2PriceSet): {
  longAdd: bigint;
  shortAdd: bigint;
  swapImpactPoolLongAfter: bigint;
  swapImpactPoolShortAfter: bigint;
  positiveValueUsd: bigint;
  negativeValueUsd: bigint;
} {
  const longValue = (longAmount * prices.long_price) / ORACLE_PRICE_SCALE;
  const shortValue = (shortAmount * prices.short_price) / ORACLE_PRICE_SCALE;
  const depositValue = longValue + shortValue;
  const beforeLong = (get(pool, "long_pool_amount") * prices.long_price) / ORACLE_PRICE_SCALE;
  const beforeShort = (get(pool, "short_pool_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
  const afterLong = beforeLong + longValue;
  const afterShort = beforeShort + shortValue;
  const beforeDiff = abs(beforeLong - beforeShort);
  const afterDiff = abs(afterLong - afterShort);
  const settings = swapImpactSettings(market);
  let positive = 0n;
  let negative = 0n;
  if (afterDiff < beforeDiff) {
    const raw = impactCurveDelta(beforeDiff, afterDiff, settings.positiveExponent);
    positive = min(feeFromBps(raw, settings.positiveFactorBps), feeFromBps(depositValue, settings.maxPositiveImpactBps));
  } else if (afterDiff > beforeDiff) {
    const raw = impactCurveDelta(afterDiff, beforeDiff, settings.negativeExponent);
    negative = min(feeFromBps(raw, settings.negativeFactorBps), feeFromBps(depositValue, settings.maxNegativeImpactBps));
  }
  let longAdd = longAmount;
  let shortAdd = shortAmount;
  let impactPoolLong = get(pool, "swap_impact_pool_long_amount");
  let impactPoolShort = get(pool, "swap_impact_pool_short_amount");
  let positiveValue = 0n;
  let negativeValue = 0n;
  if (depositValue > 0n && positive > 0n) {
    if (longValue > 0n) {
      const share = (positive * longValue) / depositValue;
      const qty = min(tokenAmountFromUsd(share, prices.short_price), impactPoolShort);
      shortAdd += qty;
      impactPoolShort -= qty;
      positiveValue += (qty * prices.short_price) / ORACLE_PRICE_SCALE;
    }
    if (shortValue > 0n) {
      const share = (positive * shortValue) / depositValue;
      const qty = min(tokenAmountFromUsd(share, prices.long_price), impactPoolLong);
      longAdd += qty;
      impactPoolLong -= qty;
      positiveValue += (qty * prices.long_price) / ORACLE_PRICE_SCALE;
    }
  }
  if (depositValue > 0n && negative > 0n) {
    if (longValue > 0n) {
      const share = (negative * longValue) / depositValue;
      const qty = min(tokenAmountFromUsd(share, prices.long_price), longAdd);
      longAdd -= qty;
      impactPoolLong += qty;
      negativeValue += (qty * prices.long_price) / ORACLE_PRICE_SCALE;
    }
    if (shortValue > 0n) {
      const share = (negative * shortValue) / depositValue;
      const qty = min(tokenAmountFromUsd(share, prices.short_price), shortAdd);
      shortAdd -= qty;
      impactPoolShort += qty;
      negativeValue += (qty * prices.short_price) / ORACLE_PRICE_SCALE;
    }
  }
  return {
    longAdd,
    shortAdd,
    swapImpactPoolLongAfter: impactPoolLong,
    swapImpactPoolShortAfter: impactPoolShort,
    positiveValueUsd: positiveValue,
    negativeValueUsd: negativeValue,
  };
}

function positionImpact(
  market: V2StateRecord,
  pool: V2StateRecord,
  side: bigint,
  sizeUsdDelta: bigint,
  increasing: boolean,
  indexPrice: bigint,
): [bigint, bigint] {
  const beforeLong = totalLongOi(market);
  const beforeShort = totalShortOi(market);
  const [positive, negative] = positionImpactForOi(market, beforeLong, beforeShort, side, sizeUsdDelta, increasing);
  const positionConversionScale = readV2MarketPositionScales(market).position_conversion_scale;
  if (positive > 0n || negative === 0n) {
    return [capPositivePositionImpact(pool, positive, indexPrice, positionConversionScale), negative];
  }
  const [virtualLong, virtualShort] = virtualPositionOi(market, beforeLong, beforeShort);
  const [virtualPositive, virtualNegative] = positionImpactForOi(
    market,
    virtualLong,
    virtualShort,
    side,
    sizeUsdDelta,
    increasing,
  );
  if (virtualNegative > negative) {
    return [capPositivePositionImpact(pool, virtualPositive, indexPrice, positionConversionScale), virtualNegative];
  }
  return [capPositivePositionImpact(pool, positive, indexPrice, positionConversionScale), negative];
}

function capPositivePositionImpact(
  pool: V2StateRecord,
  positiveImpactUsd: bigint,
  indexPrice: bigint,
  positionConversionScale: bigint,
): bigint {
  if (positiveImpactUsd <= 0n || indexPrice <= 0n) return 0n;
  const liquidImpactPoolUsd =
    (get(pool, "position_impact_pool_qty") * indexPrice) / positionConversionScale;
  return min(positiveImpactUsd, liquidImpactPoolUsd);
}

function positionImpactForOi(
  market: V2StateRecord,
  beforeLong: bigint,
  beforeShort: bigint,
  side: bigint,
  sizeUsdDelta: bigint,
  increasing: boolean,
): [bigint, bigint] {
  let afterLong = beforeLong;
  let afterShort = beforeShort;
  if (side === V2_SIDE_LONG) afterLong = increasing ? afterLong + sizeUsdDelta : max(0n, afterLong - sizeUsdDelta);
  else afterShort = increasing ? afterShort + sizeUsdDelta : max(0n, afterShort - sizeUsdDelta);
  const beforeDiff = abs(beforeLong - beforeShort);
  const afterDiff = abs(afterLong - afterShort);
  const settings = positionImpactSettings(market);
  if (afterDiff < beforeDiff) {
    const raw = impactCurveDelta(beforeDiff, afterDiff, settings.positiveExponent);
    return [
      min(
        feeFromBps(raw, settings.positiveFactorBps),
        feeFromBps(sizeUsdDelta, settings.maxPositiveImpactBps),
      ),
      0n,
    ];
  }
  if (afterDiff > beforeDiff) {
    const raw = impactCurveDelta(afterDiff, beforeDiff, settings.negativeExponent);
    return [
      0n,
      min(
        feeFromBps(raw, settings.negativeFactorBps),
        feeFromBps(sizeUsdDelta, settings.maxNegativeImpactBps),
      ),
    ];
  }
  return [0n, 0n];
}

function virtualPositionOi(market: V2StateRecord, fallbackLong: bigint, fallbackShort: bigint): [bigint, bigint] {
  const inventory = market.virtual_position_inventory;
  if (inventory && typeof inventory === "object" && !Array.isArray(inventory)) {
    return [
      bigIntOrDefault((inventory as V2StateRecord).long_oi_usd, fallbackLong),
      bigIntOrDefault((inventory as V2StateRecord).short_oi_usd, fallbackShort),
    ];
  }
  const longValue = market.virtual_long_oi_usd ?? market.virtual_position_long_oi_usd;
  const shortValue = market.virtual_short_oi_usd ?? market.virtual_position_short_oi_usd;
  if (longValue === undefined && shortValue === undefined) return [fallbackLong, fallbackShort];
  return [bigIntOrDefault(longValue, 0n), bigIntOrDefault(shortValue, 0n)];
}

function bigIntOrDefault(value: unknown, fallback: bigint): bigint {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  throw new Error(`cannot convert value to bigint: ${String(value)}`);
}

function positionImpactSettings(market: V2StateRecord): {
  positiveFactorBps: bigint;
  negativeFactorBps: bigint;
  positiveExponent: bigint;
  negativeExponent: bigint;
  maxPositiveImpactBps: bigint;
  maxNegativeImpactBps: bigint;
} {
  return impactSettings(market, "position_impact_factor_bps", "max_position_impact_bps");
}

function swapImpactSettings(market: V2StateRecord): {
  positiveFactorBps: bigint;
  negativeFactorBps: bigint;
  positiveExponent: bigint;
  negativeExponent: bigint;
  maxPositiveImpactBps: bigint;
  maxNegativeImpactBps: bigint;
} {
  return impactSettings(market, "swap_impact_factor_bps", "max_swap_impact_bps");
}

function impactSettings(
  market: V2StateRecord,
  factorField: string,
  capField: string,
): {
  positiveFactorBps: bigint;
  negativeFactorBps: bigint;
  positiveExponent: bigint;
  negativeExponent: bigint;
  maxPositiveImpactBps: bigint;
  maxNegativeImpactBps: bigint;
} {
  const factor = get(market, factorField);
  const cap = get(market, capField);
  const settings = {
    positiveFactorBps: factor,
    negativeFactorBps: factor,
    positiveExponent: 1n,
    negativeExponent: 1n,
    maxPositiveImpactBps: cap,
    maxNegativeImpactBps: cap,
  };
  if (factor >= V2_IMPACT_PACK_FLAG) {
    const body = factor - V2_IMPACT_PACK_FLAG;
    settings.positiveFactorBps = body % V2_IMPACT_PACK_COMPONENT_SCALE;
    settings.negativeFactorBps = (body / V2_IMPACT_PACK_COMPONENT_SCALE) % V2_IMPACT_PACK_COMPONENT_SCALE;
    settings.positiveExponent = (body / V2_IMPACT_PACK_POS_EXP_SCALE) % V2_IMPACT_PACK_EXP_MOD;
    settings.negativeExponent = (body / V2_IMPACT_PACK_NEG_EXP_SCALE) % V2_IMPACT_PACK_EXP_MOD;
  }
  if (cap >= V2_IMPACT_PACK_FLAG) {
    const body = cap - V2_IMPACT_PACK_FLAG;
    settings.maxPositiveImpactBps = body % V2_IMPACT_PACK_COMPONENT_SCALE;
    settings.maxNegativeImpactBps = (body / V2_IMPACT_PACK_COMPONENT_SCALE) % V2_IMPACT_PACK_COMPONENT_SCALE;
  }
  return settings;
}

function impactCurveDelta(largerDiff: bigint, smallerDiff: bigint, exponent: bigint): bigint {
  if (exponent === 1n) return largerDiff - smallerDiff;
  if (exponent === 2n) {
    return (largerDiff * largerDiff) / V2_USD_SCALE - (smallerDiff * smallerDiff) / V2_USD_SCALE;
  }
  throw new Error("bad impact exponent");
}

interface V2SettlementResult {
  collateralDecrease: bigint;
  collateralIncrease: bigint;
  unpaidCostUsd: bigint;
  fundingFeeCollateralAmount: bigint;
  borrowingFeeCollateralAmount: bigint;
  collateralFundingNetAmount: bigint;
  claimableLongTokenOutput: bigint;
  claimableShortTokenOutput: bigint;
}

function positionWithDefaults(position: V2StateRecord | null | undefined): V2StateRecord {
  const state: V2StateRecord = { ...(position ?? {}) };
  state.size_usd ??= 0n;
  state.size_tokens ??= 0n;
  state.collateral_amount ??= 0n;
  state.pending_impact_qty_signed ??= V2_SIGNED_QTY_BIAS;
  return state;
}

function emptySettlement(): V2SettlementResult {
  return {
    collateralDecrease: 0n,
    collateralIncrease: 0n,
    unpaidCostUsd: 0n,
    fundingFeeCollateralAmount: 0n,
    borrowingFeeCollateralAmount: 0n,
    collateralFundingNetAmount: 0n,
    claimableLongTokenOutput: 0n,
    claimableShortTokenOutput: 0n,
  };
}

function settledPosition(
  position: V2StateRecord | null | undefined,
  market: V2StateRecord,
  collateralAssetId: bigint,
  collateralPrice: bigint,
  strict: boolean,
): [V2StateRecord, V2SettlementResult] {
  const state: V2StateRecord = positionWithDefaults(position);
  const settlement = emptySettlement();
  if (!position || get(state, "size_usd") === 0n) return [state, settlement];
  const [fundingFee, claimableLong, claimableShort, borrowing] = positionFactors(market, collateralAssetId, get(state, "side"));
  const fundingFactorMilliBps = max(0n, fundingFee - get(state, "funding_fee_per_size_snapshot_milli_bps"));
  const borrowingFactor = max(0n, borrowing - get(state, "borrowing_factor_snapshot_milli_bps"));
  const totalFeeUsd =
    (get(state, "size_usd") * (fundingFactorMilliBps + borrowingFactor)) /
    V2_BORROWING_FACTOR_DENOMINATOR;
  const fundingFeeUsd = (get(state, "size_usd") * fundingFactorMilliBps) / V2_BORROWING_FACTOR_DENOMINATOR;
  const fundingFeeCollateral = tokenAmountFromUsd(fundingFeeUsd, collateralPrice);
  const totalFeeCollateral = tokenAmountFromUsd(totalFeeUsd, collateralPrice);
  const borrowingFeeCollateral = max(0n, totalFeeCollateral - fundingFeeCollateral);
  const costQuote = positionCostQuote(
    state,
    market,
    collateralAssetId,
    collateralPrice,
    get(state, "size_usd"),
  );
  const longClaimableAmount = costQuote.full_long_claim;
  const shortClaimableAmount = costQuote.full_short_claim;
  let sameTokenClaimable = 0n;
  if (isSingleTokenMarket(market) && collateralAssetId === get(market, "long_asset_id")) sameTokenClaimable = longClaimableAmount + shortClaimableAmount;
  else if (collateralAssetId === get(market, "long_asset_id")) sameTokenClaimable = longClaimableAmount;
  else if (collateralAssetId === get(market, "short_asset_id")) sameTokenClaimable = shortClaimableAmount;
  else throw new Error("collateral asset does not match market long/short asset");
  const costCollateral = totalFeeCollateral;
  settlement.fundingFeeCollateralAmount = fundingFeeCollateral;
  settlement.borrowingFeeCollateralAmount = borrowingFeeCollateral;
  if (costCollateral > sameTokenClaimable) {
    const decrease = costCollateral - sameTokenClaimable;
    const paid = min(get(state, "collateral_amount"), decrease);
    state.collateral_amount = get(state, "collateral_amount") - paid;
    settlement.collateralDecrease = paid;
    if (paid < decrease) {
      settlement.unpaidCostUsd = ((decrease - paid) * collateralPrice) / ORACLE_PRICE_SCALE;
      if (strict) state.quote_error = "position_costs_exceed_collateral";
    }
  } else if (sameTokenClaimable > costCollateral) {
    const increase = sameTokenClaimable - costCollateral;
    state.collateral_amount = get(state, "collateral_amount") + increase;
    settlement.collateralIncrease = increase;
  }
  if (!isSingleTokenMarket(market) && collateralAssetId !== get(market, "long_asset_id")) settlement.claimableLongTokenOutput = longClaimableAmount;
  if (!isSingleTokenMarket(market) && collateralAssetId !== get(market, "short_asset_id")) settlement.claimableShortTokenOutput = shortClaimableAmount;
  settlement.collateralFundingNetAmount = settlement.collateralIncrease - settlement.collateralDecrease;
  state.funding_fee_per_size_snapshot_milli_bps = fundingFee;
  state.claimable_long_token_funding_per_size_snapshot = claimableLong;
  state.claimable_short_token_funding_per_size_snapshot = claimableShort;
  state.borrowing_factor_snapshot_milli_bps = borrowing;
  return [state, settlement];
}

function positionCostQuote(
  position: V2StateRecord,
  market: V2StateRecord,
  collateralAssetId: bigint,
  collateralPrice: bigint,
  closeSizeUsd: bigint,
) {
  const [funding, longClaim, shortClaim, borrowing] = positionFactors(
    market,
    collateralAssetId,
    get(position, "side"),
  );
  return quoteV2PositionCostSlice({
    version: V2_POSITION_COST_QUOTE_VERSION,
    market_kind: isSingleTokenMarket(market) ? 1n : 0n,
    position_size_usd: get(position, "size_usd"),
    close_size_usd: closeSizeUsd,
    collateral_amount: get(position, "collateral_amount"),
    collateral_asset_id: collateralAssetId,
    long_asset_id: get(market, "long_asset_id"),
    short_asset_id: get(market, "short_asset_id"),
    collateral_price: collateralPrice,
    current_funding_pay_factor: funding,
    saved_funding_pay_factor: get(
      position,
      "funding_fee_per_size_snapshot_milli_bps",
    ),
    current_borrowing_factor: borrowing,
    saved_borrowing_factor: get(
      position,
      "borrowing_factor_snapshot_milli_bps",
    ),
    current_long_claim_factor: longClaim,
    saved_long_claim_factor: get(
      position,
      "claimable_long_token_funding_per_size_snapshot",
    ),
    current_short_claim_factor: shortClaim,
    saved_short_claim_factor: get(
      position,
      "claimable_short_token_funding_per_size_snapshot",
    ),
    opposing_trader_share_bps: opposingTraderShareBps(market),
  });
}

function opposingTraderShareBps(market: V2StateRecord): bigint {
  let value = market.opposing_trader_share_bps ?? market.opposingTraderShareBps;
  if (value === undefined || value === null) {
    const adaptive = market.adaptive_funding ?? market.adaptiveFunding;
    if (adaptive && typeof adaptive === "object") {
      const record = adaptive as V2StateRecord;
      value = record.opposing_trader_share_bps ?? record.opposingTraderShareBps;
    }
  }
  if (value === undefined || value === null) {
    throw new Error("market opposing trader share is required");
  }
  const share = n(value as BigNumberish);
  if (share < 0n || share > V2_BPS) throw new Error("bad receiver share");
  return share;
}

function positionFactors(market: V2StateRecord, collateralAssetId: bigint, side: bigint): [bigint, bigint, bigint, bigint] {
  if (side === V2_SIDE_SHORT) {
    return [
      get(market, collateralAssetId === get(market, "short_asset_id") ? "short_funding_fee_per_size_with_short_collateral_milli_bps" : "short_funding_fee_per_size_with_long_collateral_milli_bps"),
      get(market, "long_token_claimable_funding_per_size_for_shorts"),
      get(market, "short_token_claimable_funding_per_size_for_shorts"),
      get(market, "short_borrowing_factor_milli_bps"),
    ];
  }
  return [
    get(market, collateralAssetId === get(market, "short_asset_id") ? "long_funding_fee_per_size_with_short_collateral_milli_bps" : "long_funding_fee_per_size_with_long_collateral_milli_bps"),
    get(market, "long_token_claimable_funding_per_size_for_longs"),
    get(market, "short_token_claimable_funding_per_size_for_longs"),
    get(market, "long_borrowing_factor_milli_bps"),
  ];
}

function pnlParts(
  position: V2StateRecord,
  side: bigint,
  sizeTokens: bigint,
  currentPrice: bigint,
  positionConversionScale: bigint,
): [bigint, bigint] {
  const entry = get(position, "entry_price");
  if (currentPrice <= 0n || entry <= 0n) return [0n, 0n];
  if (side === V2_SIDE_LONG) {
    if (currentPrice > entry) {
      return [(sizeTokens * (currentPrice - entry)) / positionConversionScale, 0n];
    }
    return [0n, (sizeTokens * (entry - currentPrice)) / positionConversionScale];
  }
  if (currentPrice < entry) {
    return [(sizeTokens * (entry - currentPrice)) / positionConversionScale, 0n];
  }
  return [0n, (sizeTokens * (currentPrice - entry)) / positionConversionScale];
}

function aggregateSidePositivePnl(market: V2StateRecord, side: bigint, currentPrice: bigint): bigint {
  const positionConversionScale = readV2MarketPositionScales(market).position_conversion_scale;
  if (side === V2_SIDE_LONG) {
    return max(
      0n,
      (totalLongTokens(market) * currentPrice) / positionConversionScale - totalLongOi(market),
    );
  }
  return max(
    0n,
    totalShortOi(market) -
      (totalShortOiTokens(market) * currentPrice) / positionConversionScale,
  );
}

function checkLpMaxPnlFactor(
  market: V2StateRecord,
  poolLongAmount: bigint,
  poolShortAmount: bigint,
  longIndexPrice: bigint,
  shortIndexPrice: bigint,
  longPoolPrice: bigint,
  shortPoolPrice: bigint,
  context: V2PnlContext,
  reasons: string[],
  reasonPrefix?: string,
): void {
  const capBps = maxPnlFactorBpsForContext(market, context);
  const longPoolUsd = (poolLongAmount * longPoolPrice) / ORACLE_PRICE_SCALE;
  const shortPoolUsd = isSingleTokenMarket(market)
    ? longPoolUsd
    : (poolShortAmount * shortPoolPrice) / ORACLE_PRICE_SCALE;
  if (aggregateSidePositivePnl(market, V2_SIDE_LONG, longIndexPrice) > (longPoolUsd * capBps) / V2_BPS) {
    reasons.push(reasonPrefix ? `${reasonPrefix}_long_pnl_cap` : "long_pnl_cap");
  }
  if (aggregateSidePositivePnl(market, V2_SIDE_SHORT, shortIndexPrice) > (shortPoolUsd * capBps) / V2_BPS) {
    reasons.push(reasonPrefix ? `${reasonPrefix}_short_pnl_cap` : "short_pnl_cap");
  }
}

const MARKET_AGGREGATE_FIELDS = [
  "long_oi_usd_with_long_collateral",
  "long_oi_usd_with_short_collateral",
  "short_oi_usd_with_long_collateral",
  "short_oi_usd_with_short_collateral",
  "long_oi_tokens_with_long_collateral",
  "long_oi_tokens_with_short_collateral",
  "short_oi_tokens_with_long_collateral",
  "short_oi_tokens_with_short_collateral",
] as const;

function marketWithPositionAggregates(
  market: V2StateRecord,
  positions: V2StateRecord[],
): V2StateRecord {
  if (MARKET_AGGREGATE_FIELDS.every((field) => field in market)) return market;
  const aggregated: V2StateRecord = { ...market };
  for (const field of MARKET_AGGREGATE_FIELDS) aggregated[field] = 0n;
  const marketId = get(market, "market_id");
  const longAssetId = get(market, "long_asset_id");
  const shortAssetId = get(market, "short_asset_id");
  for (const position of positions) {
    if (marketId > 0n && get(position, "market_id") !== marketId) continue;
    const collateralAssetId = get(position, "collateral_asset_id");
    const suffix = collateralAssetId === longAssetId
      ? "with_long_collateral"
      : collateralAssetId === shortAssetId
        ? "with_short_collateral"
        : "";
    if (!suffix) continue;
    const side = get(position, "side");
    const usdPrefix = side === V2_SIDE_LONG ? "long_oi_usd" : side === V2_SIDE_SHORT ? "short_oi_usd" : "";
    const tokenPrefix = side === V2_SIDE_LONG ? "long_oi_tokens" : side === V2_SIDE_SHORT ? "short_oi_tokens" : "";
    if (!usdPrefix || !tokenPrefix) continue;
    const usdField = `${usdPrefix}_${suffix}`;
    const tokenField = `${tokenPrefix}_${suffix}`;
    aggregated[usdField] = get(aggregated, usdField) + get(position, "size_usd");
    aggregated[tokenField] = get(aggregated, tokenField) + get(position, "size_tokens");
  }
  return aggregated;
}

function executionPriceFromRational(numerator: bigint, denominator: bigint, roundUp: boolean): bigint {
  if (numerator <= 0n || denominator <= 0n) return 0n;
  return roundUp ? (numerator + denominator - 1n) / denominator : numerator / denominator;
}

function openPriceUnacceptable(
  side: bigint,
  sizeUsdDelta: bigint,
  sizeTokenDelta: bigint,
  acceptablePrice: bigint,
  positionConversionScale: bigint,
): boolean {
  if (sizeTokenDelta <= 0n) return true;
  const sizeNumerator = sizeUsdDelta * positionConversionScale;
  const acceptableNumerator = acceptablePrice * sizeTokenDelta;
  return side === V2_SIDE_LONG
    ? sizeNumerator > acceptableNumerator
    : sizeNumerator < acceptableNumerator;
}

function closeExecutionNumerator(
  side: bigint,
  indexPrice: bigint,
  sizeTokenDelta: bigint,
  impactPositiveUsd: bigint,
  impactNegativeUsd: bigint,
  positionConversionScale: bigint,
): bigint {
  const indexNumerator = indexPrice * sizeTokenDelta;
  const positiveNumerator = impactPositiveUsd * positionConversionScale;
  const negativeNumerator = impactNegativeUsd * positionConversionScale;
  return max(0n, side === V2_SIDE_LONG
    ? indexNumerator + positiveNumerator - negativeNumerator
    : indexNumerator - positiveNumerator + negativeNumerator);
}

function closePriceUnacceptable(
  side: bigint,
  executionNumerator: bigint,
  sizeTokenDelta: bigint,
  acceptablePrice: bigint,
): boolean {
  if (sizeTokenDelta <= 0n) return true;
  const acceptableNumerator = acceptablePrice * sizeTokenDelta;
  return side === V2_SIDE_LONG
    ? executionNumerator < acceptableNumerator
    : executionNumerator > acceptableNumerator;
}

function maxPnlFactorBpsForContext(market: V2StateRecord, context: V2PnlContext): bigint {
  if (context === "deposits") return get(market, "max_pnl_factor_for_deposits_bps");
  if (context === "withdrawals") return get(market, "max_pnl_factor_for_withdrawals_bps");
  if (context === "adl") return get(market, "max_pnl_factor_for_adl_bps");
  return get(market, "max_pnl_factor_for_traders_bps");
}

function sidePoolValue(pool: V2StateRecord, side: bigint, prices: V2PriceSet, market?: V2StateRecord): bigint {
  if (side === V2_SIDE_LONG || (market !== undefined && isSingleTokenMarket(market))) return (get(pool, "long_pool_amount") * prices.long_price) / ORACLE_PRICE_SCALE;
  return (get(pool, "short_pool_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
}

function pendingParts(position: V2StateRecord): { pending_impact_positive_qty: bigint; pending_impact_negative_qty: bigint } {
  if ("pending_impact_positive_qty" in position || "pending_impact_negative_qty" in position) {
    return {
      pending_impact_positive_qty: get(position, "pending_impact_positive_qty"),
      pending_impact_negative_qty: get(position, "pending_impact_negative_qty"),
    };
  }
  const decoded = decodeV2PendingImpactQty(get(position, "pending_impact_qty_signed", undefined, undefined, V2_SIGNED_QTY_BIAS));
  return {
    pending_impact_positive_qty: decoded.pending_impact_positive_qty,
    pending_impact_negative_qty: decoded.pending_impact_negative_qty,
  };
}

function pendingEncodedAfter(position: V2StateRecord, delta: { addPositive?: bigint; addNegative?: bigint; removePositive?: bigint; removeNegative?: bigint }): bigint {
  return (
    get(position, "pending_impact_qty_signed", undefined, undefined, V2_SIGNED_QTY_BIAS) +
    (delta.addPositive ?? 0n) -
    (delta.addNegative ?? 0n) -
    (delta.removePositive ?? 0n) +
    (delta.removeNegative ?? 0n)
  );
}

function totalLongOi(market: V2StateRecord): bigint {
  return get(market, "long_oi_usd_with_long_collateral") + get(market, "long_oi_usd_with_short_collateral");
}

function totalShortOi(market: V2StateRecord): bigint {
  return get(market, "short_oi_usd_with_long_collateral") + get(market, "short_oi_usd_with_short_collateral");
}

function marketAfterPositionOiDelta(
  market: V2StateRecord,
  input: {
    collateralAssetId: bigint;
    side: bigint;
    sizeUsdDelta: bigint;
    increasing: boolean;
  },
): V2StateRecord {
  const result: V2StateRecord = { ...market };
  const collateralSuffix = input.collateralAssetId === get(market, "long_asset_id")
    ? "long"
    : "short";
  const sidePrefix = input.side === V2_SIDE_LONG ? "long" : "short";
  const field = `${sidePrefix}_oi_usd_with_${collateralSuffix}_collateral`;
  const before = get(result, field);
  result[field] = input.increasing
    ? before + input.sizeUsdDelta
    : max(0n, before - input.sizeUsdDelta);

  const inventory = result.virtual_position_inventory;
  if (inventory && typeof inventory === "object" && !Array.isArray(inventory)) {
    const nextInventory: V2StateRecord = { ...(inventory as V2StateRecord) };
    const virtualField = input.side === V2_SIDE_LONG ? "long_oi_usd" : "short_oi_usd";
    const virtualBefore = get(nextInventory, virtualField);
    nextInventory[virtualField] = input.increasing
      ? virtualBefore + input.sizeUsdDelta
      : max(0n, virtualBefore - input.sizeUsdDelta);
    result.virtual_position_inventory = nextInventory;
  } else {
    const primary = input.side === V2_SIDE_LONG ? "virtual_long_oi_usd" : "virtual_short_oi_usd";
    const alternate = input.side === V2_SIDE_LONG
      ? "virtual_position_long_oi_usd"
      : "virtual_position_short_oi_usd";
    if (primary in result || alternate in result) {
      const virtualField = primary in result ? primary : alternate;
      const virtualBefore = get(result, virtualField);
      result[virtualField] = input.increasing
        ? virtualBefore + input.sizeUsdDelta
        : max(0n, virtualBefore - input.sizeUsdDelta);
    }
  }
  return result;
}

function postActionHealthFields(health: V2QuoteResult | null, admission = false): V2StateRecord {
  if (!health) {
    return {
      post_action_health: null,
      post_action_liquidatable: false,
      post_action_equity_usd: 0n,
      post_action_required_remaining_usd: 0n,
      post_action_minimum_collateral_amount: 0n,
      post_action_minimum_additional_collateral_amount: 0n,
    };
  }
  const minimum = max(
    n(health.minimum_collateral_amount as BigNumberish),
    admission ? n(health.minimum_collateral_amount_for_initial_margin as BigNumberish) : 0n,
  );
  return {
    post_action_health: health,
    post_action_liquidatable: Boolean(health.liquidatable),
    post_action_equity_usd: n(health.equity_usd as BigNumberish),
    post_action_required_remaining_usd: n(health.required_remaining_usd as BigNumberish),
    post_action_minimum_collateral_amount: minimum,
    post_action_minimum_additional_collateral_amount: max(
      0n, minimum - n(health.collateral_amount_before_cost_resolution as BigNumberish),
    ),
  };
}

function totalLongTokens(market: V2StateRecord): bigint {
  return get(market, "long_oi_tokens_with_long_collateral") + get(market, "long_oi_tokens_with_short_collateral");
}

function totalShortOiTokens(market: V2StateRecord): bigint {
  return get(market, "short_oi_tokens_with_long_collateral") + get(market, "short_oi_tokens_with_short_collateral");
}

function checkOiAfter(market: V2StateRecord, side: bigint, delta: bigint, increasing: boolean, reasons: string[]): void {
  if (side === V2_SIDE_LONG) {
    const longOi = increasing ? totalLongOi(market) + delta : max(0n, totalLongOi(market) - delta);
    if (longOi > get(market, "max_open_interest_long")) reasons.push("long_oi_cap");
  } else {
    const shortOi = increasing ? totalShortOi(market) + delta : max(0n, totalShortOi(market) - delta);
    if (shortOi > get(market, "max_open_interest_short")) reasons.push("short_oi_cap");
  }
}

function checkReservesAfterTrade(market: V2StateRecord, pool: V2StateRecord, side: bigint, sizeUsdDelta: bigint, sizeTokenDelta: bigint, increasing: boolean, prices: V2PriceSet, reasons: string[]): void {
  const preview: V2StateRecord = { ...market };
  if (side === V2_SIDE_LONG) {
    preview.long_oi_tokens_with_short_collateral = increasing ? get(preview, "long_oi_tokens_with_short_collateral") + sizeTokenDelta : max(0n, get(preview, "long_oi_tokens_with_short_collateral") - sizeTokenDelta);
    preview.long_oi_usd_with_short_collateral = increasing ? get(preview, "long_oi_usd_with_short_collateral") + sizeUsdDelta : max(0n, get(preview, "long_oi_usd_with_short_collateral") - sizeUsdDelta);
  } else {
    preview.short_oi_tokens_with_short_collateral = increasing ? get(preview, "short_oi_tokens_with_short_collateral") + sizeTokenDelta : max(0n, get(preview, "short_oi_tokens_with_short_collateral") - sizeTokenDelta);
    preview.short_oi_usd_with_short_collateral = increasing ? get(preview, "short_oi_usd_with_short_collateral") + sizeUsdDelta : max(0n, get(preview, "short_oi_usd_with_short_collateral") - sizeUsdDelta);
  }
  checkReserves(preview, pool, prices, reasons);
}

function checkReserves(market: V2StateRecord, pool: V2StateRecord, prices: V2PriceSet, reasons: string[]): void {
  const positionConversionScale = readV2MarketPositionScales(market).position_conversion_scale;
  const longReserved = feeFromBps(
    (totalLongTokens(market) * prices.index_price) / positionConversionScale,
    get(market, "reserve_factor_long_bps"),
  );
  const shortReserved = feeFromBps(totalShortOi(market), get(market, "reserve_factor_short_bps"));
  const longPoolUsd = (get(pool, "long_pool_amount") * prices.long_price) / ORACLE_PRICE_SCALE;
  const shortPoolUsd = isSingleTokenMarket(market)
    ? longPoolUsd
    : (get(pool, "short_pool_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
  if (longReserved > longPoolUsd) reasons.push("long_reserves_exceeded");
  if (shortReserved > shortPoolUsd) reasons.push("short_reserves_exceeded");
}

function checkOutputSwapReservesNotWorsened(
  market: V2StateRecord,
  beforePool: V2StateRecord,
  afterPool: V2StateRecord,
  closeQuote: V2StateRecord,
  prices: V2PriceSet,
  reasons: string[],
): void {
  const positionConversionScale = readV2MarketPositionScales(market).position_conversion_scale;
  let longTokensAfter = totalLongTokens(market);
  let shortOiAfter = totalShortOi(market);
  if (get(closeQuote, "side") === V2_SIDE_LONG) {
    longTokensAfter = max(0n, longTokensAfter - get(closeQuote, "size_token_delta"));
  } else if (get(closeQuote, "side") === V2_SIDE_SHORT) {
    shortOiAfter = max(0n, shortOiAfter - get(closeQuote, "size_usd_delta"));
  }
  const longReserved = feeFromBps(
    (longTokensAfter * prices.index_price) / positionConversionScale,
    get(market, "reserve_factor_long_bps"),
  );
  const shortReserved = feeFromBps(shortOiAfter, get(market, "reserve_factor_short_bps"));
  const beforeLongPoolUsd = (get(beforePool, "long_pool_amount") * prices.long_price) / ORACLE_PRICE_SCALE;
  const afterLongPoolUsd = (get(afterPool, "long_pool_amount") * prices.long_price) / ORACLE_PRICE_SCALE;
  let beforeShortPoolUsd = (get(beforePool, "short_pool_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
  let afterShortPoolUsd = (get(afterPool, "short_pool_amount") * prices.short_price) / ORACLE_PRICE_SCALE;
  if (isSingleTokenMarket(market)) {
    beforeShortPoolUsd = beforeLongPoolUsd;
    afterShortPoolUsd = afterLongPoolUsd;
  }
  if (longReserved > afterLongPoolUsd && afterLongPoolUsd < beforeLongPoolUsd) reasons.push("output_swap_worsens_long_reserves");
  if (shortReserved > afterShortPoolUsd && afterShortPoolUsd < beforeShortPoolUsd) reasons.push("output_swap_worsens_short_reserves");
}

function checkPoolCaps(market: V2StateRecord, longAmount: bigint, shortAmount: bigint, prices: V2PriceSet, reasons: string[]): void {
  if (longAmount > get(market, "max_pool_amount_long")) reasons.push("long_pool_amount_cap");
  if (!isSingleTokenMarket(market) && shortAmount > get(market, "max_pool_amount_short")) reasons.push("short_pool_amount_cap");
  if ((longAmount * prices.long_price) / ORACLE_PRICE_SCALE > get(market, "max_pool_usd_for_deposit_long")) reasons.push("long_pool_usd_cap");
  if (!isSingleTokenMarket(market) && (shortAmount * prices.short_price) / ORACLE_PRICE_SCALE > get(market, "max_pool_usd_for_deposit_short")) reasons.push("short_pool_usd_cap");
}

function checkTraderPnlCap(market: V2StateRecord, pool: V2StateRecord, assetId: bigint, amount: bigint, prices: V2PriceSet, reasons: string[]): void {
  if (amount <= 0n) return;
  const isLongAsset = assetId === get(market, "long_asset_id");
  const price = isLongAsset ? prices.long_price : prices.short_price;
  const poolAmount = isLongAsset ? get(pool, "long_pool_amount") : get(pool, "short_pool_amount");
  const payoutUsd = (amount * price) / ORACLE_PRICE_SCALE;
  const cap = feeFromBps((poolAmount * price) / ORACLE_PRICE_SCALE, get(market, "max_pnl_factor_for_traders_bps"));
  if (payoutUsd > cap) reasons.push("trader_pnl_cap");
}

function withV2Meta(value: V2QuoteResult): V2QuoteResult {
  value.preview_source = "sdk_v2_contract_path";
  value.metadata = { ...((value.metadata as V2StateRecord | undefined) ?? {}), quote_source: "sdk_v2_contract_path" };
  return value;
}

function liquidationFeeSplitBps(source: V2StateRecord): {
  poolBps: bigint;
  protocolBps: bigint;
  insuranceBps: bigint;
  keeperBps: bigint;
} {
  const central = typeof source.fee_splits === "object" && source.fee_splits !== null
    ? (source.fee_splits as V2StateRecord)
    : {};
  const nested = typeof source.liquidation_fee_splits === "object" && source.liquidation_fee_splits !== null
    ? (source.liquidation_fee_splits as V2StateRecord)
    : {};
  const poolBps = get(source, "liquidation_pool_fee_bps", "pool_bps", undefined, get(central, "liquidation_pool_fee_bps", "liquidation_pool_bps", undefined, get(nested, "pool_bps", undefined, undefined, V2_DEFAULT_LIQUIDATION_POOL_FEE_BPS)));
  const protocolBps = get(source, "liquidation_protocol_fee_bps", "protocol_bps", undefined, get(central, "liquidation_protocol_fee_bps", "liquidation_protocol_bps", undefined, get(nested, "protocol_bps", undefined, undefined, V2_DEFAULT_LIQUIDATION_PROTOCOL_FEE_BPS)));
  const insuranceBps = get(source, "liquidation_insurance_fee_bps", "insurance_bps", undefined, get(central, "liquidation_insurance_fee_bps", "liquidation_insurance_bps", undefined, get(nested, "insurance_bps", undefined, undefined, V2_DEFAULT_LIQUIDATION_INSURANCE_FEE_BPS)));
  const keeperBps = get(source, "liquidation_keeper_fee_bps", "keeper_bps", undefined, get(central, "liquidation_keeper_fee_bps", "liquidation_keeper_bps", undefined, get(nested, "keeper_bps", undefined, undefined, V2_DEFAULT_LIQUIDATION_KEEPER_FEE_BPS)));
  if (
    poolBps <= 0n ||
    keeperBps <= 0n ||
    protocolBps < 0n ||
    insuranceBps < 0n ||
    poolBps + protocolBps + insuranceBps + keeperBps !== V2_BPS
  ) {
    return {
      poolBps: V2_DEFAULT_LIQUIDATION_POOL_FEE_BPS,
      protocolBps: V2_DEFAULT_LIQUIDATION_PROTOCOL_FEE_BPS,
      insuranceBps: V2_DEFAULT_LIQUIDATION_INSURANCE_FEE_BPS,
      keeperBps: V2_DEFAULT_LIQUIDATION_KEEPER_FEE_BPS,
    };
  }
  return { poolBps, protocolBps, insuranceBps, keeperBps };
}

function standardFeeSplitBps(source: V2StateRecord): {
  poolBps: bigint;
  protocolBps: bigint;
  insuranceBps: bigint;
} {
  const central = typeof source.fee_splits === "object" && source.fee_splits !== null
    ? (source.fee_splits as V2StateRecord)
    : {};
  const poolBps = get(source, "standard_pool_fee_bps", "standard_pool_bps", undefined, get(central, "standard_pool_fee_bps", "standard_pool_bps", undefined, V2_DEFAULT_STANDARD_POOL_FEE_BPS));
  const protocolBps = get(source, "standard_protocol_fee_bps", "standard_protocol_bps", undefined, get(central, "standard_protocol_fee_bps", "standard_protocol_bps", undefined, V2_DEFAULT_STANDARD_PROTOCOL_FEE_BPS));
  const insuranceBps = get(source, "standard_insurance_fee_bps", "standard_insurance_bps", undefined, get(central, "standard_insurance_fee_bps", "standard_insurance_bps", undefined, V2_DEFAULT_STANDARD_INSURANCE_FEE_BPS));
  if (
    poolBps <= 0n ||
    protocolBps < 0n ||
    insuranceBps < 0n ||
    poolBps + protocolBps + insuranceBps !== V2_BPS
  ) {
    return {
      poolBps: V2_DEFAULT_STANDARD_POOL_FEE_BPS,
      protocolBps: V2_DEFAULT_STANDARD_PROTOCOL_FEE_BPS,
      insuranceBps: V2_DEFAULT_STANDARD_INSURANCE_FEE_BPS,
    };
  }
  return { poolBps, protocolBps, insuranceBps };
}

function splitV2LiquidationFeeForQuote(feePaid: bigint, source: V2StateRecord, keeperRewardAssetId: bigint): V2QuoteResult {
  const bps = liquidationFeeSplitBps(source);
  const protocolFee = (feePaid * bps.protocolBps) / V2_BPS;
  const insuranceFee = (feePaid * bps.insuranceBps) / V2_BPS;
  const keeperReward = (feePaid * bps.keeperBps) / V2_BPS;
  const poolFee = feePaid - keeperReward - protocolFee - insuranceFee;
  return {
    liquidation_pool_fee_bps: bps.poolBps,
    liquidation_protocol_fee_bps: bps.protocolBps,
    liquidation_insurance_fee_bps: bps.insuranceBps,
    liquidation_keeper_fee_bps: bps.keeperBps,
    liquidation_pool_fee_amount: poolFee,
    liquidation_protocol_fee_amount: protocolFee,
    liquidation_insurance_fee_amount: insuranceFee,
    liquidation_keeper_reward_amount: keeperReward,
    keeper_reward_amount: keeperReward,
    keeper_reward_asset_id: keeperRewardAssetId,
    keeper_reward_source: "liquidation_fee_split",
  };
}

function zeroV2LiquidationFeeForQuote(source: V2StateRecord, keeperRewardAssetId: bigint): V2QuoteResult {
  const bps = liquidationFeeSplitBps(source);
  return {
    liquidation_pool_fee_bps: bps.poolBps,
    liquidation_protocol_fee_bps: bps.protocolBps,
    liquidation_insurance_fee_bps: bps.insuranceBps,
    liquidation_keeper_fee_bps: bps.keeperBps,
    liquidation_pool_fee_amount: 0n,
    liquidation_protocol_fee_amount: 0n,
    liquidation_insurance_fee_amount: 0n,
    liquidation_keeper_reward_amount: 0n,
    keeper_reward_amount: 0n,
    keeper_reward_asset_id: keeperRewardAssetId,
    keeper_reward_source: "none",
  };
}

function get(record: V2StateRecord, name: string, alt?: string, alt2?: string, fallback: BigNumberish = 0n): bigint {
  for (const key of [name, alt, alt2]) {
    if (!key) continue;
    const value = record[key];
    if (value !== undefined && value !== null) return n(value as BigNumberish);
  }
  return n(fallback);
}

function byMarketId(pools: Record<string, V2StateRecord> | V2StateRecord[]): Map<string, V2StateRecord> {
  const result = new Map<string, V2StateRecord>();
  if (Array.isArray(pools)) {
    for (const pool of pools) result.set(get(pool, "market_id").toString(), pool);
    return result;
  }
  for (const [key, value] of Object.entries(pools)) {
    const marketId = get(value, "market_id", undefined, undefined, key);
    result.set(marketId.toString(), value);
  }
  return result;
}

function allocationForRoute(allocations: V2StateRecord[], marketId: bigint): V2StateRecord {
  return allocations.find((allocation) => get(allocation, "market_id") === marketId) ?? {};
}

function n(value: BigNumberish): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return BigInt(value as unknown as number);
}

function max(a: bigint, b: bigint): bigint {
  return a >= b ? a : b;
}

function min(a: bigint, b: bigint): bigint {
  return a <= b ? a : b;
}

function abs(value: bigint): bigint {
  return value >= 0n ? value : -value;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error("ceilDiv requires non-negative numerator and positive denominator");
  return (numerator + denominator - 1n) / denominator;
}
