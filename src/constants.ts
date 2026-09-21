export type BigNumberish = number | bigint | string;
export type BytesLike = Uint8Array | number[] | string;

/** Explicitly opt out of lifetime checking on a direct close or margin withdrawal. */
export const UNCHECKED_CLOSE_POSITION_ID = (1n << 64n) - 1n;

export const SIDE = {
  LONG: 1,
  SHORT: 2,
} as const;

export const TIME_IN_FORCE = {
  GTC: 1,
  GTD: 2,
  IOC: 3,
} as const;

export const V2_ORDER_KIND = {
  OPEN_LIMIT: 1,
  DECREASE_TAKE_PROFIT: 2,
  DECREASE_STOP_LOSS: 3,
} as const;
export const V2_ORDER_BAD_PRICE_REASON = "bad_order_price";

export const V2_ORDER_TARGET = {
  PAIR: 1,
  SINGLE_TOKEN: 2,
} as const;

export const V2_ORDER_LINK_MODE_FACTOR = 1n << 61n;
export const V2_ORDER_LINK_ID_MASK = V2_ORDER_LINK_MODE_FACTOR - 1n;

export const V2_ORDER_LINK_MODE = {
  STANDALONE: 0,
  BRACKET_PARENT: 1,
  CHILD_WAIT_PARENT: 2,
  CHILD_ACTIVE: 3,
} as const;

export const V2_OUTPUT_SWAP = {
  NONE: 0,
  PNL_TO_COLLATERAL: 1,
  COLLATERAL_TO_PNL: 2,
} as const;

export const HEAVY_METHOD_EXTRA_FEE_MICRO_ALGO = 49_000;
export const HEAVY_METHOD_FLAT_FEE_MICRO_ALGO = 1_000 + HEAVY_METHOD_EXTRA_FEE_MICRO_ALGO;
export const V2_FUNDING_BORROWING_METHOD_FLAT_FEE_MICRO_ALGO = 14_000;
export const V2_ADMIN_OPS_METHOD_FLAT_FEE_MICRO_ALGO = 10_000;
export const V2_WITHDRAW_LIQUIDITY_METHOD_FLAT_FEE_MICRO_ALGO = HEAVY_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_ROUTE_SWAP_METHOD_FLAT_FEE_MICRO_ALGO = 30_000;
// Includes the additional pooled fee used by yield-recall swap execution.
export const V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO = 17_000;
// Covers cost settlement and the position delta for existing-position increases.
export const V2_TRADING_METHOD_FLAT_FEE_MICRO_ALGO = 29_000;
export const V2_DECREASE_OR_CLOSE_METHOD_FLAT_FEE_MICRO_ALGO = 37_000;
export const V2_SINGLE_TOKEN_DECREASE_METHOD_FLAT_FEE_MICRO_ALGO = V2_DECREASE_OR_CLOSE_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_WITHDRAW_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO = 21_000;
export const V2_DECREASE_WITH_SWAP_METHOD_FLAT_FEE_MICRO_ALGO = V2_DECREASE_OR_CLOSE_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_MARKETS_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO = 3_000;
export const V2_MATH_RESOURCE_CARRIER_FLAT_FEE_MICRO_ALGO = 1_000;
export const V2_LIQUIDATION_METHOD_FLAT_FEE_MICRO_ALGO = 28_000;
export const V2_ADL_METHOD_FLAT_FEE_MICRO_ALGO = 32_000;
export const V2_LP_BOX_MBR_MICRO_ALGO = 26_500;
export const V2_TRADER_BOX_MBR_MICRO_ALGO = 29_300;
export const V2_POSITION_BOX_MBR_MICRO_ALGO = 70_900;
export const V2_CVA_USER_BOX_MBR_MICRO_ALGO = 32_900;
export const V2_CVA_MARKET_BOX_MBR_MICRO_ALGO = 42_500;
export const V2_LEGACY_ORDER_BOX_MBR_MICRO_ALGO = 96_500;
export const V2_ORDER_BOX_MBR_MICRO_ALGO = 99_700;
export const V2_MARKET_BASE_BOX_MBR_MICRO_ALGO = 347_400;
export const V2_DYNAMIC_OI_MARGIN_BOX_MBR_MICRO_ALGO = 20_100;
export const V2_OPEN_ORDER_EXECUTION_STORAGE_ESCROW_MICRO_ALGO = 100_200;
export const V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO = 14_000;
export const V2_ORDER_OPS_INLINE_EXECUTION_METHOD_FLAT_FEE_MICRO_ALGO =
  V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO + V2_TRADING_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_ORDER_OPS_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO =
  V2_ORDER_OPS_INLINE_EXECUTION_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_ORDER_OPS_DECREASE_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO =
  V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO + V2_DECREASE_OR_CLOSE_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_CVA_METHOD_FLAT_FEE_MICRO_ALGO = 23_000;
export const V2_CVA_MARKET_WITHDRAW_METHOD_FLAT_FEE_MICRO_ALGO = HEAVY_METHOD_FLAT_FEE_MICRO_ALGO;
export const V2_YIELD_PDEX_BASE_FLAT_FEE_MICRO_ALGO = 13_000;
export const V2_YIELD_MAX_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO = 10_000;
export const V2_YIELD_MAX_POOL_CALL_FEE_MICRO_ALGO = V2_YIELD_MAX_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO;
export const PDEX_FOLKS_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO = 0;
// Covers routed recall, state reload, and final payout.
export const MARKET_YIELD_ACTION_RECALL_PDEX_BASE_FLAT_FEE_MICRO_ALGO = 12_000;
export const MARKET_YIELD_ACTION_RECALL_FLAT_FEE_MICRO_ALGO =
  MARKET_YIELD_ACTION_RECALL_PDEX_BASE_FLAT_FEE_MICRO_ALGO + PDEX_FOLKS_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO;
// Covers the routed provider leg and post-mark state reload.
export const MARKET_YIELD_ACTION_REFRESH_ROUTER_FLAT_FEE_MICRO_ALGO = 1_000;
export const MARKET_YIELD_ACTION_HOT_CHECK_FLAT_FEE_MICRO_ALGO = 1_000;
export const MARKET_YIELD_ACTION_MARK_FLAT_FEE_MICRO_ALGO = 5_000;
// Covers the post-recall state reload and final apply or transfer.
export const MARKET_YIELD_ACTION_FINALIZATION_FLAT_FEE_MICRO_ALGO = 2_000;
// Covers the action call and maximum single-token path; resource carriers fund
// their own top-level fees.
export const V2_SINGLE_TOKEN_INLINE_RECALL_METHOD_FLAT_FEE_MICRO_ALGO = 38_000;
export const XALGO_RESOURCE_ACCOUNT_LIMIT = 4;
export const NATIVE_ALGO_ASSET_ID = 0;

export const V2_SIGNED_QTY_BIAS = 1000000000000000000n;

export function decodeV2PendingImpactQty(encoded: bigint): Record<string, bigint> {
  if (encoded >= V2_SIGNED_QTY_BIAS) {
    return {
      pending_impact_positive_qty: encoded - V2_SIGNED_QTY_BIAS,
      pending_impact_negative_qty: 0n,
    };
  }
  return {
    pending_impact_positive_qty: 0n,
    pending_impact_negative_qty: V2_SIGNED_QTY_BIAS - encoded,
  };
}
