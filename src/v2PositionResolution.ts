import {
  ABIType,
  SignedTransaction,
  modelsv2,
  type SuggestedParams,
} from "algosdk";

import {
  parseV2BoxState,
  parseV2MarketAdaptiveFundingState,
  parseV2MarketFundingBorrowingState,
  parseV2PositionState,
  v2MarketAdaptiveFundingBoxKey,
  v2MarketCoreBoxKey,
  v2MarketFundingBorrowingBoxKey,
  v2PositionBoxKey,
  type AddressLike,
  type Uint64Like,
} from "./boxes.js";
import { appMethod, loadManifest, type ProtocolManifest } from "./manifest.js";
import {
  ORACLE_PRICE_SCALE,
  decodeV2OracleSnapshotMessage,
  type OracleMessageV3,
} from "./oracle.js";
import {
  buildAppCall,
  toApplicationNoOpTxn,
  type AppCallDescriptor,
} from "./transactions.js";


export const V2_POSITION_COST_QUOTE_VERSION = 3n;
export const V2_POSITION_COST_MARKET_PAIR = 0n;
export const V2_POSITION_COST_MARKET_SINGLE = 1n;
export const V2_BORROWING_TRANSITION_SETTLED_CURRENT = 1n;
export const V2_BORROWING_TRANSITION_UNSETTLED_SLICE = 2n;
export const V2_BORROWING_TRANSITION_FULL_DELETE = 3n;
export const V2_POSITION_COST_PAY_DENOMINATOR = 10_000_000n;
export const V2_POSITION_COST_CLAIM_SCALE = 1_000_000_000_000n;
const UINT64_MAX = (1n << 64n) - 1n;
const ARC4_RETURN_PREFIX = new Uint8Array([0x15, 0x1f, 0x7c, 0x75]);
const BPS = 10_000n;
const IMPACT_PACK_FLAG = 1_000_000_000_000_000_000n;
const IMPACT_PACK_COMPONENT_SCALE = 1_000_000n;
const IMPACT_PACK_POS_EXP_SCALE = 1_000_000_000_000n;
const IMPACT_PACK_NEG_EXP_SCALE = 1_000_000_000_000_000n;
const IMPACT_PACK_EXP_MOD = 1_000n;
const IMPACT_SETTING_FIELDS = [
  "position_impact_factor_bps",
  "max_position_impact_bps",
  "swap_impact_factor_bps",
  "max_swap_impact_bps",
] as const;

export const V2_POSITION_COST_REQUEST_FIELDS = [
  "version",
  "market_kind",
  "position_size_usd",
  "close_size_usd",
  "collateral_amount",
  "collateral_asset_id",
  "long_asset_id",
  "short_asset_id",
  "collateral_price",
  "current_funding_pay_factor",
  "saved_funding_pay_factor",
  "current_borrowing_factor",
  "saved_borrowing_factor",
  "current_long_claim_factor",
  "saved_long_claim_factor",
  "current_short_claim_factor",
  "saved_short_claim_factor",
  "opposing_trader_share_bps",
] as const;

export const V2_POSITION_COST_RESULT_FIELDS = [
  "version",
  "market_kind",
  "position_size_usd",
  "close_size_usd",
  "remaining_size_usd",
  "collateral_amount",
  "collateral_asset_id",
  "long_asset_id",
  "short_asset_id",
  "full_net_collateral_cost",
  "full_same_token_credit",
  "remaining_net_collateral_cost",
  "remaining_same_token_credit",
  "slice_net_collateral_cost",
  "slice_same_token_credit",
  "full_long_claim",
  "full_short_claim",
  "slice_long_claim",
  "slice_short_claim",
  "minimum_top_up",
  "borrowing_transition_mode",
] as const;

export type V2PositionCostRequest = {
  [Field in typeof V2_POSITION_COST_REQUEST_FIELDS[number]]: bigint;
};

export type V2PositionCostRawResult = {
  [Field in typeof V2_POSITION_COST_RESULT_FIELDS[number]]: bigint;
};

export interface V2PositionCostResolution extends V2PositionCostRawResult {
  normal_settlement_available: boolean;
  cost_deficit: boolean;
  requested_close_resolves: boolean;
  minimum_resolving_close_size: bigint | null;
  remaining_snapshot_mode: "FULL_DELETE" | "UNSETTLED_SLICE" | "SETTLED_CURRENT";
  expected_collateral_debit: bigint;
  expected_collateral_credit: bigint;
  expected_long_claim_output: bigint;
  expected_short_claim_output: bigint;
  other_claim_asset_id: bigint;
  full_other_token_claim: bigint;
  slice_other_token_claim: bigint;
  expected_voluntary_unpaid_amount: bigint;
  blocked_reason: "" | "top_up_required" | "close_size_insufficient";
}

export interface V2PositionCostAlgod {
  getTransactionParams(): { do(): Promise<SuggestedParams> } | Promise<SuggestedParams>;
  getApplicationBoxByName(
    appId: number,
    name: Uint8Array,
  ): { do(): Promise<unknown> } | Promise<unknown>;
  simulateTransactions(
    request: modelsv2.SimulateRequest,
  ): { do(): Promise<unknown> } | Promise<unknown>;
}

export function quoteV2PositionCostSlice(
  request: Record<string, Uint64Like>,
): V2PositionCostResolution & Record<string, unknown> {
  const values = normalizeRequest(request);
  const remainingSize = values.position_size_usd - values.close_size_usd;
  const fundingDelta = factorDelta(
    "funding",
    values.current_funding_pay_factor,
    values.saved_funding_pay_factor,
  );
  const borrowingDelta = factorDelta(
    "borrowing",
    values.current_borrowing_factor,
    values.saved_borrowing_factor,
  );
  const combinedPayDelta = checked(fundingDelta + borrowingDelta);
  const longClaimDelta = factorDelta(
    "long claim",
    values.current_long_claim_factor,
    values.saved_long_claim_factor,
  );
  const shortClaimDelta = factorDelta(
    "short claim",
    values.current_short_claim_factor,
    values.saved_short_claim_factor,
  );
  const fullPayUsd = mulDiv(
    values.position_size_usd,
    combinedPayDelta,
    V2_POSITION_COST_PAY_DENOMINATOR,
  );
  const remainingPayUsd = mulDiv(
    remainingSize,
    combinedPayDelta,
    V2_POSITION_COST_PAY_DENOMINATOR,
  );
  const fullPayCollateral = mulDiv(
    fullPayUsd,
    ORACLE_PRICE_SCALE,
    values.collateral_price,
  );
  const remainingPayCollateral = mulDiv(
    remainingPayUsd,
    ORACLE_PRICE_SCALE,
    values.collateral_price,
  );
  const rawFullLongClaim = mulDiv(
    values.position_size_usd,
    longClaimDelta,
    V2_POSITION_COST_CLAIM_SCALE,
  );
  const rawRemainingLongClaim = mulDiv(
    remainingSize,
    longClaimDelta,
    V2_POSITION_COST_CLAIM_SCALE,
  );
  const rawFullShortClaim = mulDiv(
    values.position_size_usd,
    shortClaimDelta,
    V2_POSITION_COST_CLAIM_SCALE,
  );
  const rawRemainingShortClaim = mulDiv(
    remainingSize,
    shortClaimDelta,
    V2_POSITION_COST_CLAIM_SCALE,
  );
  const share = values.opposing_trader_share_bps;
  const fullLongClaim = mulDiv(rawFullLongClaim, share, BPS);
  const remainingLongClaim = mulDiv(rawRemainingLongClaim, share, BPS);
  const fullShortClaim = mulDiv(rawFullShortClaim, share, BPS);
  const remainingShortClaim = mulDiv(rawRemainingShortClaim, share, BPS);
  const [fullSameClaim, remainingSameClaim] = sameTokenClaims(
    values,
    fullLongClaim,
    remainingLongClaim,
    fullShortClaim,
    remainingShortClaim,
  );
  const slicePayCollateral = fullPayCollateral - remainingPayCollateral;
  const sliceLongClaim = fullLongClaim - remainingLongClaim;
  const sliceShortClaim = fullShortClaim - remainingShortClaim;
  const sliceSameClaim = fullSameClaim - remainingSameClaim;
  const [fullNetCost, fullSameCredit] = netCostAndCredit(fullPayCollateral, fullSameClaim);
  const [remainingNetCost, remainingSameCredit] = netCostAndCredit(
    remainingPayCollateral,
    remainingSameClaim,
  );
  const [sliceNetCost, sliceSameCredit] = netCostAndCredit(
    slicePayCollateral,
    sliceSameClaim,
  );
  const raw = {
    version: V2_POSITION_COST_QUOTE_VERSION,
    market_kind: values.market_kind,
    position_size_usd: values.position_size_usd,
    close_size_usd: values.close_size_usd,
    remaining_size_usd: remainingSize,
    collateral_amount: values.collateral_amount,
    collateral_asset_id: values.collateral_asset_id,
    long_asset_id: values.long_asset_id,
    short_asset_id: values.short_asset_id,
    full_net_collateral_cost: fullNetCost,
    full_same_token_credit: fullSameCredit,
    remaining_net_collateral_cost: remainingNetCost,
    remaining_same_token_credit: remainingSameCredit,
    slice_net_collateral_cost: sliceNetCost,
    slice_same_token_credit: sliceSameCredit,
    full_long_claim: fullLongClaim,
    full_short_claim: fullShortClaim,
    slice_long_claim: sliceLongClaim,
    slice_short_claim: sliceShortClaim,
    minimum_top_up: fullNetCost > values.collateral_amount
      ? fullNetCost - values.collateral_amount
      : 0n,
    borrowing_transition_mode: remainingSize === 0n
      ? V2_BORROWING_TRANSITION_FULL_DELETE
      : V2_BORROWING_TRANSITION_UNSETTLED_SLICE,
  };
  const [otherTokenId, fullOtherClaim, remainingOtherClaim] = otherTokenClaims(
    values,
    fullLongClaim,
    remainingLongClaim,
    fullShortClaim,
    remainingShortClaim,
  );
  return {
    ...enrichV2PositionCostQuote(raw),
    factor_deltas: {
      funding_pay: fundingDelta,
      borrowing: borrowingDelta,
      combined_pay: combinedPayDelta,
      long_claim: longClaimDelta,
      short_claim: shortClaimDelta,
    },
    opposing_trader_share_bps: share,
    full_floors: {
      pay_usd: fullPayUsd,
      pay_collateral: fullPayCollateral,
      long_claim: fullLongClaim,
      short_claim: fullShortClaim,
      same_token_claim: fullSameClaim,
      other_token_claim: fullOtherClaim,
      raw_long_claim: rawFullLongClaim,
      raw_short_claim: rawFullShortClaim,
    },
    remaining_floors: {
      pay_usd: remainingPayUsd,
      pay_collateral: remainingPayCollateral,
      long_claim: remainingLongClaim,
      short_claim: remainingShortClaim,
      same_token_claim: remainingSameClaim,
      other_token_claim: remainingOtherClaim,
      raw_long_claim: rawRemainingLongClaim,
      raw_short_claim: rawRemainingShortClaim,
    },
    slice_differences: {
      pay_usd: fullPayUsd - remainingPayUsd,
      pay_collateral: slicePayCollateral,
      long_claim: sliceLongClaim,
      short_claim: sliceShortClaim,
      same_token_claim: sliceSameClaim,
      other_token_claim: fullOtherClaim - remainingOtherClaim,
      raw_long_claim: rawFullLongClaim - rawRemainingLongClaim,
      raw_short_claim: rawFullShortClaim - rawRemainingShortClaim,
    },
    other_token_id: otherTokenId,
  };
}

export function quoteV2PositionCostSpec(
  request: Record<string, Uint64Like>,
): V2PositionCostResolution & Record<string, unknown> {
  const expected = new Set([
    "version",
    "market_kind",
    "side",
    "size_usd",
    "close_size_usd",
    "collateral_amount",
    "collateral_asset_id",
    "long_asset_id",
    "short_asset_id",
    "collateral_price",
    "current_funding_pay_factor",
    "saved_funding_pay_factor",
    "current_borrowing_factor",
    "saved_borrowing_factor",
    "current_long_claim_factor",
    "saved_long_claim_factor",
    "current_short_claim_factor",
    "saved_short_claim_factor",
    "opposing_trader_share_bps",
    "borrowing_aggregate_before",
  ]);
  if (
    Object.keys(request).length !== expected.size
    || Object.keys(request).some((field) => !expected.has(field))
  ) {
    throw new Error("position cost spec request fields mismatch");
  }
  const side = uint64("side", request.side);
  if (side !== 0n && side !== 1n) throw new Error("bad side");
  const publicQuote = quoteV2PositionCostSlice(Object.fromEntries(
    V2_POSITION_COST_REQUEST_FIELDS.map((field) => [
      field,
      field === "position_size_usd" ? request.size_usd : request[field],
    ]),
  ));
  const size = uint64("size", request.size_usd);
  const savedBorrowing = uint64(
    "saved borrowing factor",
    request.saved_borrowing_factor,
  );
  const aggregateBefore = uint64(
    "borrowing aggregate before",
    request.borrowing_aggregate_before,
  );
  const previousContribution = mulDiv(
    size,
    savedBorrowing,
    V2_POSITION_COST_PAY_DENOMINATOR,
  );
  const nextContribution = mulDiv(
    publicQuote.remaining_size_usd,
    savedBorrowing,
    V2_POSITION_COST_PAY_DENOMINATOR,
  );
  if (aggregateBefore < previousContribution) {
    throw new Error("borrowing aggregate underflow");
  }
  return {
    ...publicQuote,
    previous_borrowing_contribution: previousContribution,
    next_borrowing_contribution: nextContribution,
    borrowing_aggregate_before: aggregateBefore,
    borrowing_aggregate_after: checked(
      aggregateBefore - previousContribution + nextContribution,
    ),
  };
}

export function quoteV2PositionResolution(
  costRequest: Record<string, Uint64Like>,
  actionRequest: Record<string, unknown>,
): Record<string, unknown> {
  const quote = quoteV2PositionCostSpec(costRequest);
  const action = String(actionRequest.action ?? "");
  if (!["top_up", "increase", "voluntary_close", "liquidation", "adl"].includes(action)) {
    throw new Error("bad resolution action");
  }
  const incoming = uint64(
    "incoming collateral",
    actionRequest.incoming_collateral as Uint64Like ?? 0,
  );
  const requestedSizeWasZero = Boolean(actionRequest.requested_size_was_zero ?? false);
  const requestedSize = uint64(
    "requested size",
    actionRequest.requested_size_usd as Uint64Like ?? costRequest.close_size_usd,
  );
  if (
    requestedSize !== 0n
    && requestedSize !== uint64("close size", costRequest.close_size_usd)
  ) {
    throw new Error("requested size does not bind cost quote");
  }
  const base: Record<string, unknown> = {
    action,
    normal_settlement_available: !quote.cost_deficit,
    cost_deficit: quote.cost_deficit,
    minimum_top_up: quote.minimum_top_up,
    effective_close_size_usd: requestedSizeWasZero
      ? uint64("size", costRequest.size_usd)
      : uint64("close size", costRequest.close_size_usd),
    requested_size_was_zero: requestedSizeWasZero,
    requested_close_resolves: false,
    minimum_resolving_close_size: null,
    blocked_reason: "",
    unpaid_cost_usd: 0n,
    expected_voluntary_unpaid_amount: 0n,
    expected_collateral_debit: 0n,
    expected_collateral_credit: 0n,
    expected_long_claim_output: 0n,
    expected_short_claim_output: 0n,
    remaining_snapshot_mode: quote.remaining_snapshot_mode,
    cost_quote: quote,
  };
  if (action === "top_up") {
    const collateralAfterCredit = checked(
      uint64("collateral", costRequest.collateral_amount) + incoming,
    );
    const resolves = collateralAfterCredit >= quote.full_net_collateral_cost;
    return {
      ...base,
      requested_close_resolves: resolves,
      blocked_reason: resolves ? "" : "top_up_required",
      collateral_after_credit: collateralAfterCredit,
      collateral_after_settlement: resolves
        ? collateralAfterCredit
          - quote.full_net_collateral_cost
          + quote.full_same_token_credit
        : uint64("collateral", costRequest.collateral_amount),
      remaining_snapshot_mode: resolves
        ? "SETTLED_CURRENT"
        : quote.remaining_snapshot_mode,
      expected_collateral_debit: resolves ? quote.full_net_collateral_cost : 0n,
      expected_collateral_credit: resolves ? quote.full_same_token_credit : 0n,
      expected_long_claim_output: resolves
        && quote.other_token_id === uint64("long asset", costRequest.long_asset_id)
        ? (quote.full_floors as Record<string, bigint>).other_token_claim
        : 0n,
      expected_short_claim_output: resolves
        && quote.other_token_id === uint64("short asset", costRequest.short_asset_id)
        ? (quote.full_floors as Record<string, bigint>).other_token_claim
        : 0n,
    };
  }
  if (action === "increase") {
    const resolves = !quote.cost_deficit;
    return {
      ...base,
      requested_close_resolves: resolves,
      blocked_reason: quote.cost_deficit ? "top_up_required" : "",
      expected_collateral_debit: resolves ? quote.full_net_collateral_cost : 0n,
      expected_collateral_credit: resolves ? quote.full_same_token_credit : 0n,
      expected_long_claim_output: resolves
        && quote.other_token_id === uint64("long asset", costRequest.long_asset_id)
        ? (quote.full_floors as Record<string, bigint>).other_token_claim
        : 0n,
      expected_short_claim_output: resolves
        && quote.other_token_id === uint64("short asset", costRequest.short_asset_id)
        ? (quote.full_floors as Record<string, bigint>).other_token_claim
        : 0n,
    };
  }

  const realizedPnl = signedInteger(
    "realized pnl",
    actionRequest.realized_pnl_usd as bigint | number | string ?? 0,
  );
  const impact = signedInteger(
    "impact",
    actionRequest.impact_usd as bigint | number | string ?? 0,
  );
  const closeFee = uint64(
    "close fee",
    actionRequest.close_fee_usd as Uint64Like ?? 0,
  );
  const size = uint64("size", costRequest.size_usd);
  const closeSize = uint64("close size", costRequest.close_size_usd);
  const collateral = uint64("collateral", costRequest.collateral_amount);
  const collateralRelease = closeSize === size
    ? collateral
    : mulDiv(collateral, closeSize, size);
  const collateralPrice = uint64("collateral price", costRequest.collateral_price);
  const collateralReleaseUsd = mulDiv(
    collateralRelease,
    collateralPrice,
    ORACLE_PRICE_SCALE,
  );
  const accruedCostUsd = mulDiv(
    quote.slice_net_collateral_cost,
    collateralPrice,
    ORACLE_PRICE_SCALE,
  );
  const sameCreditUsd = mulDiv(
    quote.slice_same_token_credit,
    collateralPrice,
    ORACLE_PRICE_SCALE,
  );
  const grossCredits = checked(
    collateralReleaseUsd
      + sameCreditUsd
      + (realizedPnl > 0n ? realizedPnl : 0n)
      + (impact > 0n ? impact : 0n),
  );
  const grossCosts = checked(
    accruedCostUsd
      + closeFee
      + (realizedPnl < 0n ? -realizedPnl : 0n)
      + (impact < 0n ? -impact : 0n),
  );
  const resolves = grossCredits >= grossCosts;
  const forced = action === "liquidation" || action === "adl";
  const committed = resolves || forced;
  const unpaid = forced && grossCosts > grossCredits
    ? grossCosts - grossCredits
    : 0n;
  const slice = quote.slice_differences as Record<string, bigint>;
  const otherClaim = committed ? slice.other_token_claim : 0n;
  const aggregateAfter = quote.borrowing_aggregate_after as bigint;
  const aggregateBefore = quote.borrowing_aggregate_before as bigint;
  return {
    ...base,
    requested_close_resolves: committed,
    blocked_reason: committed ? "" : "close_size_insufficient",
    unpaid_cost_usd: unpaid,
    realized_close_components: {
      collateral_release: collateralRelease,
      collateral_release_usd: collateralReleaseUsd,
      same_token_credit_usd: sameCreditUsd,
      accrued_cost_usd: accruedCostUsd,
      realized_pnl_usd: realizedPnl,
      impact_usd: impact,
      close_fee_usd: closeFee,
      gross_credits_usd: grossCredits,
      gross_costs_usd: grossCosts,
    },
    pool_movement: {
      net_usd: committed ? grossCosts - unpaid - grossCredits : 0n,
      other_token_claim_out: otherClaim,
    },
    trader_movement: {
      payout_usd: committed && grossCredits > grossCosts
        ? grossCredits - grossCosts
        : 0n,
      other_token_claim: otherClaim,
    },
    claim_movement: {
      same_token_net_cost: committed ? quote.slice_net_collateral_cost : 0n,
      same_token_credit: committed ? quote.slice_same_token_credit : 0n,
      other_token_id: quote.other_token_id,
      other_token_claim: otherClaim,
    },
    post_state: {
      size_usd: committed ? size - closeSize : size,
      collateral_amount: committed ? collateral - collateralRelease : collateral,
      borrowing_aggregate: committed ? aggregateAfter : aggregateBefore,
      snapshot_mode: committed
        ? quote.remaining_snapshot_mode
        : "UNSETTLED_SLICE",
    },
    expected_collateral_debit: committed ? quote.slice_net_collateral_cost : 0n,
    expected_collateral_credit: committed ? quote.slice_same_token_credit : 0n,
    expected_long_claim_output: committed
      && quote.other_token_id === uint64("long asset", costRequest.long_asset_id)
      ? otherClaim
      : 0n,
    expected_short_claim_output: committed
      && quote.other_token_id === uint64("short asset", costRequest.short_asset_id)
      ? otherClaim
      : 0n,
  };
}

export function decodeV2ImpactSetting(
  input: Uint64Like,
): Record<string, bigint | boolean> {
  const value = uint64("impact setting", input);
  if (value < IMPACT_PACK_FLAG) {
    return {
      packed: false,
      positive_component_bps: value,
      negative_component_bps: value,
      positive_exponent: 1n,
      negative_exponent: 1n,
    };
  }
  const body = value - IMPACT_PACK_FLAG;
  return {
    packed: true,
    positive_component_bps: body % IMPACT_PACK_COMPONENT_SCALE,
    negative_component_bps:
      (body / IMPACT_PACK_COMPONENT_SCALE) % IMPACT_PACK_COMPONENT_SCALE,
    positive_exponent:
      (body / IMPACT_PACK_POS_EXP_SCALE) % IMPACT_PACK_EXP_MOD,
    negative_exponent:
      (body / IMPACT_PACK_NEG_EXP_SCALE) % IMPACT_PACK_EXP_MOD,
  };
}

export function quoteV2ImpactPolicy(
  request: Record<string, Uint64Like>,
): Record<string, unknown> {
  const expected = new Set([
    ...IMPACT_SETTING_FIELDS,
    "maintenance_margin_bps",
    "max_liquidation_impact_bps",
  ]);
  if (
    Object.keys(request).length !== expected.size
    || Object.keys(request).some((field) => !expected.has(field as any))
  ) {
    throw new Error("impact policy fields mismatch");
  }
  const decoded = Object.fromEntries(
    IMPACT_SETTING_FIELDS.map((field) => [
      field,
      decodeV2ImpactSetting(request[field]),
    ]),
  ) as Record<string, Record<string, bigint | boolean>>;
  const reasons: string[] = [];
  const domains: Record<string, boolean> = {};
  for (const field of IMPACT_SETTING_FIELDS) {
    const setting = decoded[field];
    const componentLimit = field === "max_swap_impact_bps" ? BPS - 1n : BPS;
    const componentsValid =
      (setting.positive_component_bps as bigint) <= componentLimit
      && (setting.negative_component_bps as bigint) <= componentLimit;
    const exponentsValid =
      [1n, 2n].includes(setting.positive_exponent as bigint)
      && [1n, 2n].includes(setting.negative_exponent as bigint);
    const orderingValid =
      (setting.positive_component_bps as bigint)
      <= (setting.negative_component_bps as bigint);
    domains[field] = componentsValid && exponentsValid && orderingValid;
    if (!componentsValid) reasons.push(`${field}:component_domain`);
    if (!exponentsValid) reasons.push(`${field}:exponent_domain`);
    if (!orderingValid) reasons.push(`${field}:positive_exceeds_negative`);
  }
  const maintenance = uint64("maintenance margin", request.maintenance_margin_bps);
  const maxLiquidation = uint64(
    "maximum liquidation impact",
    request.max_liquidation_impact_bps,
  );
  if (maintenance > BPS || maxLiquidation > BPS) {
    reasons.push("position_cap:base_domain");
  }
  const maxPositionNegative =
    decoded.max_position_impact_bps.negative_component_bps as bigint;
  const positionGap = maxPositionNegative > maxLiquidation
    ? maxPositionNegative - maxLiquidation
    : 0n;
  const ordering =
    maxPositionNegative <= maxLiquidation || positionGap < maintenance;
  if (!ordering) {
    reasons.push("max_position_impact_bps:liquidation_margin_ordering");
  }
  return {
    decoded,
    domains,
    position_cap_gap_bps: positionGap,
    position_cap_ordering: ordering,
    valid: Object.values(domains).every(Boolean) && ordering && !reasons.length,
    reasons,
  };
}

export function quoteV2AdlBounds(input: {
  pre_factor_bps: Uint64Like;
  post_factor_bps: Uint64Like;
  max_factor_bps: Uint64Like;
  min_factor_after_bps: Uint64Like;
  target_profitable?: boolean;
}): Record<string, unknown> {
  const pre = uint64("pre factor", input.pre_factor_bps);
  const post = uint64("post factor", input.post_factor_bps);
  const maximum = uint64("maximum factor", input.max_factor_bps);
  const floor = uint64("post factor floor", input.min_factor_after_bps);
  const profitable = input.target_profitable ?? true;
  const reasons: string[] = [];
  if (pre <= maximum) reasons.push("adl_threshold_not_breached");
  if (!profitable) reasons.push("adl_target_not_profitable");
  if (post >= pre) reasons.push("adl_not_improved");
  if (post < floor) reasons.push("adl_post_floor");
  return {
    pre_factor_bps: pre,
    post_factor_bps: post,
    max_factor_bps: maximum,
    min_factor_after_bps: floor,
    target_profitable: profitable,
    valid: !reasons.length,
    reasons,
  };
}

export function remainingV2SwapInput(
  amountInAfterFees: Uint64Like,
  maxNegativeBps: Uint64Like,
): bigint {
  const amount = uint64("amount in after fees", amountInAfterFees);
  const maximum = uint64("maximum negative swap impact", maxNegativeBps);
  if (maximum >= BPS) {
    throw new Error("maximum negative swap impact must be below BPS");
  }
  return amount - mulDiv(amount, maximum, BPS);
}

export function quoteV2ExecutionGuards(
  request: Record<string, unknown>,
): Record<string, unknown> {
  const required = new Set([
    "position_size_usd",
    "requested_size_usd",
    "requested_size_was_zero",
    "minimum_residual_size_usd",
    "output_swap_mode",
    "output_amount",
    "minimum_output_amount",
    "yield_mode",
    "liquid_pool_amount",
    "required_output_amount",
    "oracle_fresh",
    "factors_fresh",
    "quote_identity_matches",
    "payload_version",
    "payload_well_formed",
  ]);
  if (
    Object.keys(request).length !== required.size
    || Object.keys(request).some((field) => !required.has(field))
  ) {
    throw new Error("execution guard fields mismatch");
  }
  const positionSize = uint64(
    "position size",
    request.position_size_usd as Uint64Like,
  );
  const requestedSize = uint64(
    "requested size",
    request.requested_size_usd as Uint64Like,
  );
  const minimumResidual = uint64(
    "minimum residual size",
    request.minimum_residual_size_usd as Uint64Like,
  );
  if (positionSize === 0n) throw new Error("zero position size");
  const zeroSentinel = Boolean(request.requested_size_was_zero);
  let effectiveSize: bigint;
  if (zeroSentinel) {
    if (requestedSize !== 0n) {
      throw new Error("zero-size sentinel binds requested size");
    }
    effectiveSize = positionSize;
  } else {
    if (requestedSize === 0n || requestedSize > positionSize) {
      throw new Error("bad requested size");
    }
    effectiveSize = requestedSize;
  }
  const residual = positionSize - effectiveSize;
  const outputMode = uint64("output swap mode", request.output_swap_mode as Uint64Like);
  const yieldMode = uint64("yield mode", request.yield_mode as Uint64Like);
  const reasons: string[] = [];
  if (![0n, 1n, 2n].includes(outputMode)) reasons.push("bad_output_swap_mode");
  if (
    uint64("output amount", request.output_amount as Uint64Like)
    < uint64("minimum output", request.minimum_output_amount as Uint64Like)
  ) {
    reasons.push("minimum_output");
  }
  if (residual !== 0n && residual < minimumResidual) {
    reasons.push("partial_close_below_minimum");
  }
  if (!request.oracle_fresh) reasons.push("stale_oracle");
  if (!request.factors_fresh) reasons.push("stale_factors");
  if (!request.quote_identity_matches) reasons.push("quote_identity_mismatch");
  if (
    uint64("payload version", request.payload_version as Uint64Like)
    !== V2_POSITION_COST_QUOTE_VERSION
  ) {
    reasons.push("payload_version");
  }
  if (!request.payload_well_formed) reasons.push("malformed_payload");
  if (![0n, 1n, 2n].includes(yieldMode)) reasons.push("bad_yield_mode");
  const liquid = uint64("liquid pool amount", request.liquid_pool_amount as Uint64Like);
  const requiredOutput = uint64(
    "required output amount",
    request.required_output_amount as Uint64Like,
  );
  const recallRequired = yieldMode === 2n && requiredOutput > liquid;
  if (yieldMode === 1n && requiredOutput > liquid) {
    reasons.push("insufficient_liquid_yield_output");
  }
  return {
    valid: !reasons.length,
    reasons,
    effective_close_size_usd: effectiveSize,
    residual_size_usd: residual,
    partial_request_preserved: !zeroSentinel && effectiveSize === requestedSize,
    zero_sentinel_full_close: zeroSentinel && effectiveSize === positionSize,
    output_swap_mode: outputMode,
    yield_recall_required: recallRequired,
  };
}

export function enrichV2PositionCostQuote(
  input: Record<string, Uint64Like>,
): V2PositionCostResolution {
  const values = Object.fromEntries(
    V2_POSITION_COST_RESULT_FIELDS.map((field) => [field, uint64(field, input[field])]),
  ) as V2PositionCostRawResult;
  if (values.version !== V2_POSITION_COST_QUOTE_VERSION) {
    throw new Error(
      `bad position cost result version: expected ${V2_POSITION_COST_QUOTE_VERSION} got ${values.version}`,
    );
  }
  const costDeficit = values.full_net_collateral_cost > values.collateral_amount;
  let otherClaimAssetId = 0n;
  let fullOtherClaim = 0n;
  let sliceOtherClaim = 0n;
  if (values.market_kind === V2_POSITION_COST_MARKET_PAIR) {
    if (values.collateral_asset_id === values.long_asset_id) {
      otherClaimAssetId = values.short_asset_id;
      fullOtherClaim = values.full_short_claim;
      sliceOtherClaim = values.slice_short_claim;
    } else {
      otherClaimAssetId = values.long_asset_id;
      fullOtherClaim = values.full_long_claim;
      sliceOtherClaim = values.slice_long_claim;
    }
  }
  return {
    ...values,
    normal_settlement_available: !costDeficit,
    cost_deficit: costDeficit,
    requested_close_resolves: !costDeficit,
    minimum_resolving_close_size: null,
    remaining_snapshot_mode: values.borrowing_transition_mode === V2_BORROWING_TRANSITION_FULL_DELETE
      ? "FULL_DELETE"
      : costDeficit
        ? "UNSETTLED_SLICE"
        : "SETTLED_CURRENT",
    expected_collateral_debit: values.slice_net_collateral_cost,
    expected_collateral_credit: values.slice_same_token_credit,
    expected_long_claim_output: otherClaimAssetId === values.long_asset_id
      ? sliceOtherClaim
      : 0n,
    expected_short_claim_output: otherClaimAssetId === values.short_asset_id
      ? sliceOtherClaim
      : 0n,
    other_claim_asset_id: otherClaimAssetId,
    full_other_token_claim: fullOtherClaim,
    slice_other_token_claim: sliceOtherClaim,
    expected_voluntary_unpaid_amount: 0n,
    blocked_reason: costDeficit ? "top_up_required" : "",
  };
}

export function quoteV2PositionActionResolution(
  costQuote: Record<string, Uint64Like>,
  input: {
    action: "top_up" | "increase" | "voluntary_close" | "liquidation" | "adl";
    incomingCollateral?: Uint64Like;
    realizedPnlUsd?: bigint | number | string;
    impactUsd?: bigint | number | string;
    closeFeeUsd?: Uint64Like;
    collateralPrice: Uint64Like;
    minimumResolvingCloseSize?: Uint64Like | null;
  },
): V2PositionCostResolution & Record<string, unknown> {
  const quote = enrichV2PositionCostQuote(costQuote);
  if (input.action === "top_up") {
    const afterCredit = checked(
      quote.collateral_amount + uint64("incoming collateral", input.incomingCollateral ?? 0),
    );
    const resolves = afterCredit >= quote.full_net_collateral_cost;
    return {
      ...quote,
      action: input.action,
      requested_close_resolves: resolves,
      blocked_reason: resolves ? "" : "top_up_required",
      expected_collateral_debit: resolves ? quote.full_net_collateral_cost : 0n,
      expected_collateral_credit: resolves ? quote.full_same_token_credit : 0n,
      expected_long_claim_output: resolves
        && quote.other_claim_asset_id === quote.long_asset_id
        ? quote.full_other_token_claim
        : 0n,
      expected_short_claim_output: resolves
        && quote.other_claim_asset_id === quote.short_asset_id
        ? quote.full_other_token_claim
        : 0n,
      minimum_resolving_close_size: null,
      remaining_snapshot_mode: resolves ? "SETTLED_CURRENT" : "UNSETTLED_SLICE",
    };
  }
  if (input.action === "increase") {
    const resolves = !quote.cost_deficit;
    return {
      ...quote,
      action: input.action,
      requested_close_resolves: resolves,
      blocked_reason: quote.cost_deficit ? "top_up_required" : "",
      expected_collateral_debit: resolves ? quote.full_net_collateral_cost : 0n,
      expected_collateral_credit: resolves ? quote.full_same_token_credit : 0n,
      expected_long_claim_output: resolves
        && quote.other_claim_asset_id === quote.long_asset_id
        ? quote.full_other_token_claim
        : 0n,
      expected_short_claim_output: resolves
        && quote.other_claim_asset_id === quote.short_asset_id
        ? quote.full_other_token_claim
        : 0n,
      minimum_resolving_close_size: null,
      remaining_snapshot_mode: resolves ? "SETTLED_CURRENT" : "UNSETTLED_SLICE",
    };
  }
  const collateralPrice = uint64("collateral price", input.collateralPrice);
  if (collateralPrice === 0n) throw new Error("zero collateral price");
  const collateralRelease = quote.close_size_usd === quote.position_size_usd
    ? quote.collateral_amount
    : mulDiv(quote.collateral_amount, quote.close_size_usd, quote.position_size_usd);
  const collateralReleaseUsd = mulDiv(collateralRelease, collateralPrice, ORACLE_PRICE_SCALE);
  const accruedCostUsd = mulDiv(
    quote.slice_net_collateral_cost,
    collateralPrice,
    ORACLE_PRICE_SCALE,
  );
  const sameCreditUsd = mulDiv(
    quote.slice_same_token_credit,
    collateralPrice,
    ORACLE_PRICE_SCALE,
  );
  const realizedPnl = signedInteger("realized pnl", input.realizedPnlUsd ?? 0);
  const impact = signedInteger("impact", input.impactUsd ?? 0);
  const closeFee = uint64("close fee", input.closeFeeUsd ?? 0);
  const grossCredits = checked(
    collateralReleaseUsd
      + sameCreditUsd
      + (realizedPnl > 0n ? realizedPnl : 0n)
      + (impact > 0n ? impact : 0n),
  );
  const grossCosts = checked(
    accruedCostUsd
      + closeFee
      + (realizedPnl < 0n ? -realizedPnl : 0n)
      + (impact < 0n ? -impact : 0n),
  );
  const forced = input.action === "liquidation" || input.action === "adl";
  const resolves = grossCredits >= grossCosts;
  const committed = resolves || forced;
  return {
    ...quote,
    action: input.action,
    requested_close_resolves: committed,
    minimum_resolving_close_size: input.minimumResolvingCloseSize == null
      ? null
      : uint64("minimum resolving close size", input.minimumResolvingCloseSize),
    blocked_reason: committed ? "" : "close_size_insufficient",
    remaining_snapshot_mode: committed
      ? quote.remaining_snapshot_mode
      : "UNSETTLED_SLICE",
    expected_collateral_debit: committed ? quote.slice_net_collateral_cost : 0n,
    expected_collateral_credit: committed ? quote.slice_same_token_credit : 0n,
    expected_long_claim_output: committed ? quote.expected_long_claim_output : 0n,
    expected_short_claim_output: committed ? quote.expected_short_claim_output : 0n,
    expected_voluntary_unpaid_amount: 0n,
    forced_unpaid_cost_usd: forced && grossCosts > grossCredits
      ? grossCosts - grossCredits
      : 0n,
    gross_credits_usd: grossCredits,
    gross_costs_usd: grossCosts,
  };
}

export function minimumV2ResolvingCloseSize(
  positionSizeUsd: Uint64Like,
  resolvesAtSize: (sizeUsd: bigint) => boolean,
): bigint | null {
  let high = uint64("position size", positionSizeUsd);
  if (high === 0n || !resolvesAtSize(high)) return null;
  let low = 1n;
  while (low < high) {
    const midpoint = (low + high) / 2n;
    if (resolvesAtSize(midpoint)) high = midpoint;
    else low = midpoint + 1n;
  }
  return low;
}

export function buildV2PositionCostResolutionCall(input: {
  sender: AddressLike;
  v2TradingRiskOpsAppId: number;
  request: Record<string, Uint64Like>;
  manifest?: ProtocolManifest;
}): AppCallDescriptor {
  const request = normalizeRequest(input.request);
  return buildAppCall({
    appId: input.v2TradingRiskOpsAppId,
    appName: "PDexV2TradingRiskOps",
    methodName: "quote_position_cost_resolution",
    sender: input.sender,
    args: [V2_POSITION_COST_REQUEST_FIELDS.map((field) => request[field])],
    manifest: input.manifest ?? loadManifest(undefined, 2),
  });
}

export async function readV2PositionCostResolutionRequest(
  algod: V2PositionCostAlgod,
  input: {
    positionAppId: number;
    marketsAppId: number;
    owner: AddressLike;
    marketId: Uint64Like;
    collateralAssetId: Uint64Like;
    side: Uint64Like;
    closeSizeUsd: Uint64Like;
    oracleMessage: Uint8Array;
    manifest?: ProtocolManifest;
  },
): Promise<V2PositionCostRequest> {
  const manifest = input.manifest ?? loadManifest(undefined, 2);
  const marketId = uint64("market id", input.marketId);
  const collateralAssetId = uint64("collateral asset id", input.collateralAssetId);
  const side = uint64("side", input.side);
  const [positionRaw, coreRaw, fundingRaw, adaptiveRaw] = await Promise.all([
    readBox(
      algod,
      input.positionAppId,
      v2PositionBoxKey(input.owner, marketId, collateralAssetId, side),
    ),
    readBox(algod, input.marketsAppId, v2MarketCoreBoxKey(marketId)),
    readBox(algod, input.marketsAppId, v2MarketFundingBorrowingBoxKey(marketId)),
    readBox(algod, input.marketsAppId, v2MarketAdaptiveFundingBoxKey(marketId)),
  ]);
  const position = parseV2PositionState(positionRaw, manifest);
  const core = parseV2BoxState("market_core", coreRaw, manifest);
  const funding = parseV2MarketFundingBorrowingState(fundingRaw, manifest);
  const adaptive = parseV2MarketAdaptiveFundingState(adaptiveRaw, manifest);
  const oracle = decodeV2OracleSnapshotMessage(input.oracleMessage);
  assertChainIdentity({
    position,
    core,
    oracle,
    marketId,
    collateralAssetId,
    side,
  });
  const [currentFunding, currentLongClaim, currentShortClaim, currentBorrowing] =
    positionFactors(funding, {
      collateralAssetId,
      longAssetId: core.long_asset_id,
      shortAssetId: core.short_asset_id,
      side,
    });
  const collateralPrice = BigInt(
    collateralAssetId === core.long_asset_id
      ? oracle.longMinPrice
      : oracle.shortMinPrice,
  );
  return normalizeRequest({
    version: V2_POSITION_COST_QUOTE_VERSION,
    market_kind: core.long_asset_id === core.short_asset_id
      ? V2_POSITION_COST_MARKET_SINGLE
      : V2_POSITION_COST_MARKET_PAIR,
    position_size_usd: position.size_usd,
    close_size_usd: input.closeSizeUsd,
    collateral_amount: position.collateral_amount,
    collateral_asset_id: collateralAssetId,
    long_asset_id: core.long_asset_id,
    short_asset_id: core.short_asset_id,
    collateral_price: collateralPrice,
    current_funding_pay_factor: currentFunding,
    saved_funding_pay_factor: position.funding_fee_per_size_snapshot_milli_bps,
    current_borrowing_factor: currentBorrowing,
    saved_borrowing_factor: position.borrowing_factor_snapshot_milli_bps,
    current_long_claim_factor: currentLongClaim,
    saved_long_claim_factor: position.claimable_long_token_funding_per_size_snapshot,
    current_short_claim_factor: currentShortClaim,
    saved_short_claim_factor: position.claimable_short_token_funding_per_size_snapshot,
    opposing_trader_share_bps: adaptive.opposing_trader_share_bps,
  });
}

export async function simulateV2PositionCostResolution(
  algod: V2PositionCostAlgod,
  input: {
    sender: AddressLike;
    v2TradingRiskOpsAppId: number;
    request: Record<string, Uint64Like>;
    manifest?: ProtocolManifest;
  },
): Promise<V2PositionCostResolution & {
  simulation_round: bigint;
  preview_is_authorization: false;
  preview_may_expire: true;
}> {
  const manifest = input.manifest ?? loadManifest(undefined, 2);
  const descriptor = buildV2PositionCostResolutionCall({ ...input, manifest });
  const suggestedParams = await requestDo(algod.getTransactionParams());
  const transaction = toApplicationNoOpTxn(descriptor, suggestedParams);
  const group = new modelsv2.SimulateRequestTransactionGroup({
    txns: [new SignedTransaction({ txn: transaction })],
  });
  const request = new modelsv2.SimulateRequest({
    txnGroups: [group],
    allowEmptySignatures: true,
    // This unsigned quote must also work when sender has a different auth-addr.
    // Algod resolves that signer for simulation; the transaction keeps its owner.
    fixSigners: true,
  });
  const simulation = await requestDo(algod.simulateTransactions(request)) as any;
  const decoded = decodeV2PositionCostSimulation(simulation, manifest);
  const projected = quoteV2PositionCostSlice(input.request);
  for (const field of V2_POSITION_COST_RESULT_FIELDS) {
    if (decoded[field] !== projected[field]) {
      throw new Error(`position cost simulation disagrees on ${field}`);
    }
  }
  return {
    ...projected,
    simulation_round: BigInt(simulation.lastRound ?? simulation["last-round"] ?? 0),
    preview_is_authorization: false,
    preview_may_expire: true,
  };
}

export async function readAndSimulateV2PositionCostResolution(
  algod: V2PositionCostAlgod,
  input: {
    sender: AddressLike;
    v2TradingRiskOpsAppId: number;
    positionAppId: number;
    marketsAppId: number;
    owner: AddressLike;
    marketId: Uint64Like;
    collateralAssetId: Uint64Like;
    side: Uint64Like;
    closeSizeUsd: Uint64Like;
    oracleMessage: Uint8Array;
    manifest?: ProtocolManifest;
  },
): Promise<V2PositionCostResolution & {
  simulation_round: bigint;
  preview_is_authorization: false;
  preview_may_expire: true;
}> {
  const request = await readV2PositionCostResolutionRequest(algod, input);
  return simulateV2PositionCostResolution(algod, {
    sender: input.sender,
    v2TradingRiskOpsAppId: input.v2TradingRiskOpsAppId,
    request,
    manifest: input.manifest,
  });
}

export function decodeV2PositionCostSimulation(
  simulation: any,
  manifest: ProtocolManifest = loadManifest(undefined, 2),
): V2PositionCostRawResult {
  const groups = simulation.txnGroups ?? simulation["txn-groups"] ?? [];
  if (groups.length !== 1) throw new Error("position cost simulation must contain one group");
  const failure = groups[0].failureMessage ?? groups[0]["failure-message"] ?? "";
  if (failure) throw new Error(`position cost simulation failed: ${failure}`);
  const results = groups[0].txnResults ?? groups[0]["txn-results"] ?? [];
  if (results.length !== 1) {
    throw new Error("position cost simulation must contain one transaction");
  }
  const txnResult = results[0].txnResult ?? results[0]["txn-result"] ?? results[0];
  const logs = txnResult.logs ?? [];
  if (!logs.length) throw new Error("position cost simulation returned no ABI log");
  const raw = bytes(logs.at(-1));
  if (!startsWith(raw, ARC4_RETURN_PREFIX)) {
    throw new Error("position cost simulation returned a non-ARC4 log");
  }
  const method = appMethod(
    "PDexV2TradingRiskOps",
    "quote_position_cost_resolution",
    manifest,
  );
  const decoded = ABIType.from(method.returns.type).decode(
    raw.slice(ARC4_RETURN_PREFIX.byteLength),
  ) as bigint[];
  if (decoded.length !== V2_POSITION_COST_RESULT_FIELDS.length) {
    throw new Error("position cost result field count mismatch");
  }
  return Object.fromEntries(
    V2_POSITION_COST_RESULT_FIELDS.map((field, index) => [
      field,
      uint64(field, decoded[index]),
    ]),
  ) as V2PositionCostRawResult;
}

function normalizeRequest(
  input: Record<string, Uint64Like>,
): V2PositionCostRequest {
  const fields = new Set(V2_POSITION_COST_REQUEST_FIELDS);
  const missing = V2_POSITION_COST_REQUEST_FIELDS.filter((field) => !(field in input));
  const extra = Object.keys(input).filter((field) => !fields.has(field as any));
  if (missing.length || extra.length) {
    throw new Error(`position cost request fields mismatch: missing=${missing.join(",")} extra=${extra.join(",")}`);
  }
  const values = Object.fromEntries(
    V2_POSITION_COST_REQUEST_FIELDS.map((field) => [field, uint64(field, input[field])]),
  ) as V2PositionCostRequest;
  if (values.version !== V2_POSITION_COST_QUOTE_VERSION) {
    throw new Error(
      `bad position cost request version: expected ${V2_POSITION_COST_QUOTE_VERSION} got ${values.version}`,
    );
  }
  if (
    values.market_kind !== V2_POSITION_COST_MARKET_PAIR
    && values.market_kind !== V2_POSITION_COST_MARKET_SINGLE
  ) {
    throw new Error("bad position cost market");
  }
  if (values.position_size_usd === 0n) throw new Error("zero position size");
  if (
    values.close_size_usd === 0n
    || values.close_size_usd > values.position_size_usd
  ) {
    throw new Error("bad close size");
  }
  if (values.collateral_price === 0n) throw new Error("bad cost quote price");
  if (values.market_kind === V2_POSITION_COST_MARKET_PAIR) {
    if (values.long_asset_id === values.short_asset_id) throw new Error("bad cost quote pair");
    if (
      values.collateral_asset_id !== values.long_asset_id
      && values.collateral_asset_id !== values.short_asset_id
    ) {
      throw new Error("bad cost quote collateral");
    }
  } else if (
    values.collateral_asset_id !== values.long_asset_id
    || values.collateral_asset_id !== values.short_asset_id
  ) {
    throw new Error("bad cost quote single");
  }
  factorDelta("funding", values.current_funding_pay_factor, values.saved_funding_pay_factor);
  factorDelta("borrowing", values.current_borrowing_factor, values.saved_borrowing_factor);
  factorDelta("long claim", values.current_long_claim_factor, values.saved_long_claim_factor);
  factorDelta("short claim", values.current_short_claim_factor, values.saved_short_claim_factor);
  if (values.opposing_trader_share_bps > BPS) throw new Error("bad receiver share");
  return values;
}

function sameTokenClaims(
  values: V2PositionCostRequest,
  fullLong: bigint,
  remainingLong: bigint,
  fullShort: bigint,
  remainingShort: bigint,
): [bigint, bigint] {
  if (values.market_kind === V2_POSITION_COST_MARKET_SINGLE) {
    return [checked(fullLong + fullShort), checked(remainingLong + remainingShort)];
  }
  if (values.collateral_asset_id === values.short_asset_id) {
    return [fullShort, remainingShort];
  }
  return [fullLong, remainingLong];
}

function otherTokenClaims(
  values: V2PositionCostRequest,
  fullLong: bigint,
  remainingLong: bigint,
  fullShort: bigint,
  remainingShort: bigint,
): [bigint, bigint, bigint] {
  if (values.market_kind === V2_POSITION_COST_MARKET_SINGLE) return [0n, 0n, 0n];
  if (values.collateral_asset_id === values.long_asset_id) {
    return [values.short_asset_id, fullShort, remainingShort];
  }
  return [values.long_asset_id, fullLong, remainingLong];
}

function positionFactors(
  funding: Record<string, bigint>,
  input: {
    collateralAssetId: bigint;
    longAssetId: bigint;
    shortAssetId: bigint;
    side: bigint;
  },
): [bigint, bigint, bigint, bigint] {
  const shortSide = input.side === 2n;
  const shortCollateral = input.collateralAssetId !== input.longAssetId;
  const prefix = shortSide ? "short" : "long";
  const collateral = shortCollateral ? "short" : "long";
  const participant = shortSide ? "shorts" : "longs";
  const shortClaim = input.longAssetId === input.shortAssetId
    ? 0n
    : funding[`short_token_claimable_funding_per_size_for_${participant}`];
  return [
    funding[`${prefix}_funding_fee_per_size_with_${collateral}_collateral_milli_bps`],
    funding[`long_token_claimable_funding_per_size_for_${participant}`],
    shortClaim,
    funding[`${prefix}_borrowing_factor_milli_bps`],
  ];
}

function assertChainIdentity(input: {
  position: Record<string, bigint>;
  core: Record<string, bigint>;
  oracle: OracleMessageV3;
  marketId: bigint;
  collateralAssetId: bigint;
  side: bigint;
}): void {
  for (const [field, expected] of Object.entries({
    market_id: input.marketId,
    collateral_asset_id: input.collateralAssetId,
    side: input.side,
  })) {
    if (input.position[field] !== expected) throw new Error(`position ${field} mismatch`);
  }
  if (input.oracle.marketId !== input.marketId) throw new Error("oracle marketId mismatch");
  if (input.oracle.longAssetId !== input.core.long_asset_id) {
    throw new Error("oracle longAssetId mismatch");
  }
  if (input.oracle.shortAssetId !== input.core.short_asset_id) {
    throw new Error("oracle shortAssetId mismatch");
  }
}

async function readBox(
  algod: V2PositionCostAlgod,
  appId: number,
  name: Uint8Array,
): Promise<Uint8Array> {
  const response = await requestDo(algod.getApplicationBoxByName(appId, name)) as any;
  return bytes(response.value);
}

async function requestDo<T>(
  request: { do(): Promise<T> } | Promise<T>,
): Promise<T> {
  if ("do" in (request as any) && typeof (request as any).do === "function") {
    return (request as any).do();
  }
  return request as Promise<T>;
}

function netCostAndCredit(pay: bigint, claim: bigint): [bigint, bigint] {
  return pay >= claim ? [pay - claim, 0n] : [0n, claim - pay];
}

function factorDelta(label: string, current: bigint, saved: bigint): bigint {
  if (current < saved) throw new Error(`${label} factor regression`);
  return current - saved;
}

function mulDiv(left: bigint, right: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("zero denominator");
  return checked((left * right) / denominator);
}

function uint64(label: string, value: Uint64Like | undefined): bigint {
  let normalized: bigint;
  try {
    normalized = BigInt(value ?? 0);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
  if (normalized < 0n || normalized > UINT64_MAX) throw new Error(`${label} outside uint64`);
  return normalized;
}

function signedInteger(label: string, value: bigint | number | string): bigint {
  try {
    return BigInt(value);
  } catch {
    throw new Error(`${label} must be an integer`);
  }
}

function checked(value: bigint): bigint {
  return uint64("uint64 result", value);
}

function bytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (typeof value === "string") {
    const maybeBuffer = (globalThis as any).Buffer;
    if (maybeBuffer) return new Uint8Array(maybeBuffer.from(value, "base64"));
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }
  throw new Error("expected bytes or base64 value");
}

function startsWith(value: Uint8Array, prefix: Uint8Array): boolean {
  return prefix.every((byte, index) => value[index] === byte);
}
