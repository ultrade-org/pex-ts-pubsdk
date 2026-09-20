import {
  TIME_IN_FORCE,
  V2_OPEN_ORDER_EXECUTION_STORAGE_ESCROW_MICRO_ALGO,
  V2_ORDER_BOX_MBR_MICRO_ALGO,
  V2_ORDER_KIND,
  V2_ORDER_OPS_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_OPS_DECREASE_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_TARGET,
  V2_OUTPUT_SWAP,
  type BigNumberish,
} from "./constants.js";
import {
  analyzeV2NewOrderIntent,
  analyzeV2OrderLifecycle,
  type V2OrderLifecycleState,
  type V2StateOrder,
  type V2StatePosition,
} from "./orderLifecycle.js";
import {
  MAX_POSITION_BUILDER_FEE_BPS,
  normalizeBuilderFee,
  v2OrderPriceCoherenceFailure,
  type BuilderFeeInput,
} from "./transactions.js";
import { validateRawPrice12, type RawPrice12 } from "./oracle.js";
import {
  quoteV2DecreasePosition,
  quoteV2DecreaseWithOutputSwap,
  quoteV2OpenPosition,
  quoteV2SingleTokenDecrease,
  quoteV2SingleTokenOpen,
  type V2PriceInput,
  type V2QuoteResult,
  type V2StateRecord,
} from "./v2Quotes.js";

type TimeInForceInput = "GTC" | "GTD" | "IOC" | BigNumberish;

export interface V2OpenLimitOrderQuoteInput {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  orders?: V2StateRecord[];
  owner: string;
  ownerOrderId?: BigNumberish;
  marketId?: BigNumberish;
  targetKind?: BigNumberish;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta: BigNumberish;
  collateralAmount: BigNumberish;
  triggerPrice: BigNumberish;
  acceptablePrice?: BigNumberish;
  keeperFeeAssetId?: BigNumberish;
  keeperFeeAmount: BigNumberish;
  timeInForce?: TimeInForceInput;
  expiryTime?: BigNumberish;
  currentTime?: BigNumberish;
  prices?: V2PriceInput;
  builderFee?: BuilderFeeInput;
}

export interface V2DecreaseOrderQuoteInput {
  market: V2StateRecord;
  pool: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  orders?: V2StateRecord[];
  owner: string;
  ownerOrderId?: BigNumberish;
  marketId?: BigNumberish;
  targetKind?: BigNumberish;
  orderKind: typeof V2_ORDER_KIND.DECREASE_TAKE_PROFIT | typeof V2_ORDER_KIND.DECREASE_STOP_LOSS;
  collateralAssetId: BigNumberish;
  side: BigNumberish;
  sizeUsdDelta: BigNumberish;
  triggerPrice: BigNumberish;
  acceptablePrice?: BigNumberish;
  keeperFeeAssetId?: BigNumberish;
  keeperFeeAmount: BigNumberish;
  outputSwapMode?: BigNumberish;
  minPrimaryOutputAmount?: BigNumberish;
  minSecondaryOutputAmount?: BigNumberish;
  timeInForce?: TimeInForceInput;
  expiryTime?: BigNumberish;
  currentTime?: BigNumberish;
  prices?: V2PriceInput;
  builderFee?: BuilderFeeInput;
}

export interface V2ExecuteOrderQuoteInput {
  market: V2StateRecord;
  pool: V2StateRecord;
  order: V2StateRecord;
  position?: V2StateRecord | null;
  positions?: V2StateRecord[];
  orders?: V2StateRecord[];
  currentTime?: BigNumberish;
  prices?: V2PriceInput;
}

export function quoteV2OpenLimitOrder(input: V2OpenLimitOrderQuoteInput): V2QuoteResult {
  const order = buildOpenLimitOrder(input);
  const positions = quotePositions(input.position, input.positions);
  const orders = input.orders ?? [];
  const lifecycle = analyzeV2NewOrderIntent({ order, positions, orders });
  const commonFailures = submitFailures(order, lifecycle);
  const crossed = Boolean(lifecycle.crossed);
  let executionQuote: V2QuoteResult | null = null;
  const targetKind = numberValue(order.target_kind);

  if (crossed && lifecycle.executable && commonFailures.length === 0) {
    if (targetKind === V2_ORDER_TARGET.SINGLE_TOKEN) {
      executionQuote = quoteV2SingleTokenOpen({
        market: input.market,
        pool: input.pool,
        position: lifecycle.position ?? input.position ?? null,
        owner: String(order.owner),
        marketId: order.market_id as BigNumberish,
        backingAssetId: order.collateral_asset_id as BigNumberish,
        side: order.side as BigNumberish,
        collateralAmount: order.collateral_amount as BigNumberish,
        sizeUsdDelta: order.size_usd_delta as BigNumberish,
        acceptablePrice: valueOr(order.acceptable_price, order.trigger_price),
        prices: order as V2PriceInput,
      });
    } else {
      executionQuote = quoteV2OpenPosition({
        market: input.market,
        pool: input.pool,
        position: lifecycle.position ?? input.position ?? null,
        owner: String(order.owner),
        marketId: order.market_id as BigNumberish,
        collateralAssetId: order.collateral_asset_id as BigNumberish,
        side: order.side as BigNumberish,
        collateralAmount: order.collateral_amount as BigNumberish,
        sizeUsdDelta: order.size_usd_delta as BigNumberish,
        acceptablePrice: valueOr(order.acceptable_price, order.trigger_price),
        prices: order as V2PriceInput,
        builderFee: orderBuilderFee(order),
      });
    }
  }

  return finalizeOrderQuote({
    type: "v2_open_limit_order_quote",
    order,
    lifecycle,
    executionQuote,
    commonFailures,
    orderKind: V2_ORDER_KIND.OPEN_LIMIT,
    targetKind,
  });
}

export function quoteV2DecreaseOrder(input: V2DecreaseOrderQuoteInput): V2QuoteResult {
  const order = buildDecreaseOrder(input);
  const positions = quotePositions(input.position, input.positions);
  const orders = input.orders ?? [];
  const lifecycle = analyzeV2NewOrderIntent({ order, positions, orders });
  const commonFailures = submitFailures(order, lifecycle);
  const outputSwapMode = big(order.output_swap_mode);
  let executionQuote: V2QuoteResult | null = null;
  const targetKind = numberValue(order.target_kind);

  if (lifecycle.crossed && lifecycle.executable && commonFailures.length === 0) {
    const executedSizeUsdDelta = executedOrderSize(order, lifecycle.position ?? input.position ?? null);
    if (targetKind === V2_ORDER_TARGET.SINGLE_TOKEN) {
      if (outputSwapMode !== 0n) {
        commonFailures.push("unsupported_output_swap_mode");
      } else {
        executionQuote = quoteV2SingleTokenDecrease({
          market: input.market,
          pool: input.pool,
          position: lifecycle.position ?? input.position ?? null,
          positions,
          owner: String(order.owner),
          marketId: order.market_id as BigNumberish,
          backingAssetId: order.collateral_asset_id as BigNumberish,
          side: order.side as BigNumberish,
          sizeUsdDelta: executedSizeUsdDelta,
          acceptablePrice: order.acceptable_price as BigNumberish,
          minPrimaryOutput: order.min_primary_output_amount as BigNumberish,
          prices: order as V2PriceInput,
        });
      }
    } else if (outputSwapMode !== 0n) {
      executionQuote = quoteV2DecreaseWithOutputSwap({
        market: input.market,
        pool: input.pool,
        position: lifecycle.position ?? input.position ?? null,
        owner: String(order.owner),
        marketId: order.market_id as BigNumberish,
        collateralAssetId: order.collateral_asset_id as BigNumberish,
        side: order.side as BigNumberish,
        sizeUsdDelta: executedSizeUsdDelta,
        acceptablePrice: order.acceptable_price as BigNumberish,
        outputSwapMode,
        minPrimaryOutputAmount: order.min_primary_output_amount as BigNumberish,
        minSecondaryOutputAmount: order.min_secondary_output_amount as BigNumberish,
        prices: order as V2PriceInput,
        builderFee: orderBuilderFee(order),
      });
    } else {
      executionQuote = quoteV2DecreasePosition({
        market: input.market,
        pool: input.pool,
        position: lifecycle.position ?? input.position ?? null,
        owner: String(order.owner),
        marketId: order.market_id as BigNumberish,
        collateralAssetId: order.collateral_asset_id as BigNumberish,
        side: order.side as BigNumberish,
        sizeUsdDelta: executedSizeUsdDelta,
        acceptablePrice: order.acceptable_price as BigNumberish,
        minPrimaryOutput: order.min_primary_output_amount as BigNumberish,
        prices: order as V2PriceInput,
        builderFee: orderBuilderFee(order),
      });
    }
  }

  return finalizeOrderQuote({
    type: "v2_decrease_order_quote",
    order,
    lifecycle,
    executionQuote,
    commonFailures,
    orderKind: numberValue(order.order_kind),
    targetKind,
  });
}

export function quoteV2ExecuteOrder(input: V2ExecuteOrderQuoteInput): V2QuoteResult {
  const order = withPriceFields({
    ...input.order,
    current_time: input.currentTime ?? (input.order as V2StateRecord).current_time,
  }, input.market, input.prices);
  order.trigger_price = validateRawPrice12(order.trigger_price as RawPrice12);
  order.acceptable_price = validateRawPrice12(order.acceptable_price as RawPrice12, { allowZero: true });
  const positions = quotePositions(input.position, input.positions);
  const orders = input.orders ?? [];
  const lifecycle = analyzeV2OrderLifecycle(order as V2StateOrder, positions, orders);
  const orderKind = numberValue(order.order_kind);
  const commonFailures = executionFailures(lifecycle);
  let executionQuote: V2QuoteResult | null = null;
  const targetKind = numberValue(order.target_kind) || defaultTargetKind(input.market);
  const outputSwapMode = big(order.output_swap_mode);

  if (lifecycle.executable && commonFailures.length === 0) {
    const executedSizeUsdDelta = executedOrderSize(order, lifecycle.position ?? input.position ?? null);
    if (orderKind === V2_ORDER_KIND.OPEN_LIMIT) {
      if (targetKind === V2_ORDER_TARGET.SINGLE_TOKEN) {
        executionQuote = quoteV2SingleTokenOpen({
          market: input.market,
          pool: input.pool,
          position: lifecycle.position ?? input.position ?? null,
          owner: String(order.owner),
          marketId: order.market_id as BigNumberish,
          backingAssetId: order.collateral_asset_id as BigNumberish,
          side: order.side as BigNumberish,
          collateralAmount: order.collateral_amount as BigNumberish,
          sizeUsdDelta: executedSizeUsdDelta,
          acceptablePrice: valueOr(order.acceptable_price, order.trigger_price),
          prices: order as V2PriceInput,
        });
      } else {
        executionQuote = quoteV2OpenPosition({
          market: input.market,
          pool: input.pool,
          position: lifecycle.position ?? input.position ?? null,
          owner: String(order.owner),
          marketId: order.market_id as BigNumberish,
          collateralAssetId: order.collateral_asset_id as BigNumberish,
          side: order.side as BigNumberish,
          collateralAmount: order.collateral_amount as BigNumberish,
          sizeUsdDelta: executedSizeUsdDelta,
          acceptablePrice: valueOr(order.acceptable_price, order.trigger_price),
          prices: order as V2PriceInput,
          builderFee: orderBuilderFee(order),
        });
      }
    } else if (targetKind === V2_ORDER_TARGET.SINGLE_TOKEN) {
      if (outputSwapMode !== 0n) {
        commonFailures.push("unsupported_output_swap_mode");
      } else {
        executionQuote = quoteV2SingleTokenDecrease({
          market: input.market,
          pool: input.pool,
          position: lifecycle.position ?? input.position ?? null,
          positions,
          owner: String(order.owner),
          marketId: order.market_id as BigNumberish,
          backingAssetId: order.collateral_asset_id as BigNumberish,
          side: order.side as BigNumberish,
          sizeUsdDelta: executedSizeUsdDelta,
          acceptablePrice: order.acceptable_price as BigNumberish,
          minPrimaryOutput: order.min_primary_output_amount as BigNumberish,
          prices: order as V2PriceInput,
        });
      }
    } else if (outputSwapMode !== 0n) {
      executionQuote = quoteV2DecreaseWithOutputSwap({
        market: input.market,
        pool: input.pool,
        position: lifecycle.position ?? input.position ?? null,
        owner: String(order.owner),
        marketId: order.market_id as BigNumberish,
        collateralAssetId: order.collateral_asset_id as BigNumberish,
        side: order.side as BigNumberish,
        sizeUsdDelta: executedSizeUsdDelta,
        acceptablePrice: order.acceptable_price as BigNumberish,
        outputSwapMode,
        minPrimaryOutputAmount: order.min_primary_output_amount as BigNumberish,
        minSecondaryOutputAmount: order.min_secondary_output_amount as BigNumberish,
        prices: order as V2PriceInput,
        builderFee: orderBuilderFee(order),
      });
    } else {
      executionQuote = quoteV2DecreasePosition({
        market: input.market,
        pool: input.pool,
        position: lifecycle.position ?? input.position ?? null,
        owner: String(order.owner),
        marketId: order.market_id as BigNumberish,
        collateralAssetId: order.collateral_asset_id as BigNumberish,
        side: order.side as BigNumberish,
        sizeUsdDelta: executedSizeUsdDelta,
        acceptablePrice: order.acceptable_price as BigNumberish,
        minPrimaryOutput: order.min_primary_output_amount as BigNumberish,
        prices: order as V2PriceInput,
        builderFee: orderBuilderFee(order),
      });
    }
  }

  return finalizeOrderQuote({
    type: "v2_order_execution_quote",
    order: { ...order, target_kind: targetKind },
    lifecycle,
    executionQuote,
    commonFailures,
    orderKind,
    targetKind,
    executionPreview: true,
  });
}

function buildOpenLimitOrder(input: V2OpenLimitOrderQuoteInput): V2StateRecord {
  const marketId = input.marketId ?? field(input.market, "market_id", "marketId");
  const collateralAssetId = input.collateralAssetId;
  const targetKind = numberValue(input.targetKind ?? defaultTargetKind(input.market));
  const [builderAddress, builderFeeBps] = normalizeBuilderFee(
    input.builderFee,
    targetKind === V2_ORDER_TARGET.PAIR ? MAX_POSITION_BUILDER_FEE_BPS : 0n,
  );
  return withPriceFields({
    schema_version: 4,
    owner: input.owner,
    owner_order_id: input.ownerOrderId ?? 0,
    order_id: input.ownerOrderId ?? 0,
    order_kind: V2_ORDER_KIND.OPEN_LIMIT,
    target_kind: targetKind,
    market_id: marketId,
    side: input.side,
    collateral_asset_id: collateralAssetId,
    size_usd_delta: input.sizeUsdDelta,
    collateral_amount: input.collateralAmount,
    trigger_price: validateRawPrice12(input.triggerPrice as RawPrice12),
    acceptable_price: validateRawPrice12((input.acceptablePrice ?? input.triggerPrice) as RawPrice12),
    keeper_fee_asset_id: input.keeperFeeAssetId ?? collateralAssetId,
    keeper_fee_amount: input.keeperFeeAmount,
    output_swap_mode: V2_OUTPUT_SWAP.NONE,
    min_primary_output_amount: 0,
    min_secondary_output_amount: 0,
    time_in_force: normalizeTimeInForce(input.timeInForce),
    expiry_time: input.expiryTime ?? 0,
    builder_address: builderAddress,
    builder_fee_bps: builderFeeBps,
    current_time: input.currentTime,
  }, input.market, input.prices);
}

function buildDecreaseOrder(input: V2DecreaseOrderQuoteInput): V2StateRecord {
  const marketId = input.marketId ?? field(input.market, "market_id", "marketId");
  const collateralAssetId = input.collateralAssetId;
  const targetKind = numberValue(input.targetKind ?? defaultTargetKind(input.market));
  const [builderAddress, builderFeeBps] = normalizeBuilderFee(
    input.builderFee,
    targetKind === V2_ORDER_TARGET.PAIR ? MAX_POSITION_BUILDER_FEE_BPS : 0n,
  );
  return withPriceFields({
    schema_version: 4,
    owner: input.owner,
    owner_order_id: input.ownerOrderId ?? 0,
    order_id: input.ownerOrderId ?? 0,
    order_kind: input.orderKind,
    target_kind: targetKind,
    market_id: marketId,
    side: input.side,
    collateral_asset_id: collateralAssetId,
    size_usd_delta: input.sizeUsdDelta,
    collateral_amount: 0,
    trigger_price: validateRawPrice12(input.triggerPrice as RawPrice12),
    acceptable_price: input.acceptablePrice === undefined
      ? 0n
      : validateRawPrice12(input.acceptablePrice as RawPrice12),
    keeper_fee_asset_id: input.keeperFeeAssetId ?? collateralAssetId,
    keeper_fee_amount: input.keeperFeeAmount,
    output_swap_mode: input.outputSwapMode ?? V2_OUTPUT_SWAP.NONE,
    min_primary_output_amount: input.minPrimaryOutputAmount ?? 0,
    min_secondary_output_amount: input.minSecondaryOutputAmount ?? 0,
    time_in_force: normalizeTimeInForce(input.timeInForce),
    expiry_time: input.expiryTime ?? 0,
    builder_address: builderAddress,
    builder_fee_bps: builderFeeBps,
    current_time: input.currentTime,
  }, input.market, input.prices);
}

function finalizeOrderQuote(input: {
  type: string;
  order: V2StateRecord;
  lifecycle: V2OrderLifecycleState;
  executionQuote: V2QuoteResult | null;
  commonFailures: string[];
  orderKind: number;
  targetKind: number;
  executionPreview?: boolean;
}): V2QuoteResult {
  const failureReasons = dedupe([
    ...input.commonFailures,
    ...((input.executionQuote?.failure_reasons as string[] | undefined) ?? []),
  ]);
  const submissionResult = input.executionPreview
    ? input.lifecycle.executable && failureReasons.length === 0 ? "execute_immediately" : "not_executable"
    : submissionResultFor(input.order, input.lifecycle, failureReasons);
  const executionFlatFee = input.orderKind === Number(V2_ORDER_KIND.OPEN_LIMIT)
    ? V2_ORDER_OPS_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO
    : V2_ORDER_OPS_DECREASE_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO;
  const requiredFlatFee = submissionResult === "execute_immediately"
    ? executionFlatFee
    : V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO;
  const builderFeePaid = big(input.executionQuote?.builder_fee_paid);
  const requiredStorage = requiredStoragePayment(input.orderKind);
  const escrowAmount = escrowAmountFor(input.order, input.orderKind);
  return {
    type: input.type,
    ok: failureReasons.length === 0,
    failure_reasons: failureReasons,
    order_kind: BigInt(input.orderKind),
    target_kind: BigInt(input.targetKind),
    market_id: big(input.order.market_id),
    owner: String(input.order.owner ?? ""),
    owner_order_id: big(input.order.owner_order_id),
    side: big(input.order.side),
    collateral_asset_id: big(input.order.collateral_asset_id),
    size_usd_delta: big(input.order.size_usd_delta),
    collateral_amount: big(input.order.collateral_amount),
    trigger_price: big(input.order.trigger_price),
    acceptable_price: big(input.order.acceptable_price),
    keeper_fee_asset_id: big(input.order.keeper_fee_asset_id),
    keeper_fee_amount: big(input.order.keeper_fee_amount),
    time_in_force: big(input.order.time_in_force),
    expiry_time: big(input.order.expiry_time),
    builder_address: String(input.order.builder_address ?? ""),
    builder_fee_bps: big(input.order.builder_fee_bps),
    current_time: big(input.order.current_time),
    crossed: input.lifecycle.crossed,
    expired: input.lifecycle.expired,
    submission_result: submissionResult,
    order: input.lifecycle,
    lifecycle: input.lifecycle,
    warnings: input.lifecycle.warnings,
    blocking_reasons: input.lifecycle.executionBlockers,
    order_box_mbr_microalgo: BigInt(V2_ORDER_BOX_MBR_MICRO_ALGO),
    required_storage_payment_microalgo: requiredStorage,
    escrow_amount: escrowAmount,
    required_flat_fee_microalgos: BigInt(requiredFlatFee) + (builderFeePaid > 0n ? 1_000n : 0n),
    execution_quote: input.executionQuote,
    preview_source: "sdk_v2_order_quote",
    metadata: { quote_source: "sdk_v2_order_quote" },
  };
}

function submitFailures(order: V2StateRecord, lifecycle: V2OrderLifecycleState): string[] {
  const failures = parameterFailures(order);
  if (lifecycle.expired) failures.push("order_expired");
  for (const blocker of lifecycle.executionBlockers) {
    if (blocker === "not_crossed") continue;
    failures.push(blocker);
  }
  return dedupe(failures);
}

function executionFailures(lifecycle: V2OrderLifecycleState): string[] {
  return dedupe(lifecycle.executable ? [] : lifecycle.executionBlockers);
}

function parameterFailures(order: V2StateRecord): string[] {
  const failures: string[] = [];
  const tif = numberValue(order.time_in_force);
  const kind = numberValue(order.order_kind);
  if (!([TIME_IN_FORCE.GTC, TIME_IN_FORCE.GTD, TIME_IN_FORCE.IOC] as number[]).includes(tif)) failures.push("bad_time_in_force");
  if (kind !== V2_ORDER_KIND.OPEN_LIMIT && kind !== V2_ORDER_KIND.DECREASE_TAKE_PROFIT && kind !== V2_ORDER_KIND.DECREASE_STOP_LOSS) failures.push("bad_order_kind");
  if (big(order.trigger_price) <= 0n) failures.push("trigger_price_required");
  const priceFailure = v2OrderPriceCoherenceFailure({
    orderKind: kind,
    side: big(order.side),
    triggerPrice: order.trigger_price as BigNumberish,
    acceptablePrice: order.acceptable_price as BigNumberish,
  });
  if (priceFailure) failures.push(priceFailure);
  if (kind === V2_ORDER_KIND.OPEN_LIMIT && big(order.size_usd_delta) <= 0n) failures.push("zero_size");
  if (kind === V2_ORDER_KIND.OPEN_LIMIT && big(order.collateral_amount) <= 0n) failures.push("zero_collateral");
  return failures;
}

function submissionResultFor(order: V2StateRecord, lifecycle: V2OrderLifecycleState, failures: string[]): string {
  if (failures.length > 0) return "blocked";
  if (lifecycle.crossed) return "execute_immediately";
  if (numberValue(order.time_in_force) === TIME_IN_FORCE.IOC) return "ioc_refund";
  return "store";
}

function requiredStoragePayment(orderKind: number): bigint {
  return orderKind === V2_ORDER_KIND.OPEN_LIMIT
    ? BigInt(V2_OPEN_ORDER_EXECUTION_STORAGE_ESCROW_MICRO_ALGO)
    : BigInt(V2_ORDER_BOX_MBR_MICRO_ALGO);
}

function escrowAmountFor(order: V2StateRecord, orderKind: number): bigint {
  return orderKind === V2_ORDER_KIND.OPEN_LIMIT
    ? big(order.collateral_amount) + big(order.keeper_fee_amount)
    : big(order.keeper_fee_amount);
}

function withPriceFields(order: V2StateRecord, market: V2StateRecord, prices?: V2PriceInput): V2StateRecord {
  const source = { ...market, ...(prices ?? {}) };
  const result = { ...market, ...order };
  for (const key of [
    "index_asset_id",
    "long_asset_id",
    "short_asset_id",
    "index_price",
    "index_price_min",
    "index_price_max",
    "long_price",
    "long_price_min",
    "long_price_max",
    "short_price",
    "short_price_min",
    "short_price_max",
    "oracle_timestamp",
  ]) {
    const value = (source as V2StateRecord)[key] ?? (source as V2StateRecord)[camel(key)];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

function quotePositions(position: V2StateRecord | null | undefined, positions: V2StateRecord[] | undefined): V2StatePosition[] {
  if (positions) return positions;
  return position ? [position] : [];
}

function orderBuilderFee(order: V2StateRecord): BuilderFeeInput | undefined {
  const builderFeeBps = big(order.builder_fee_bps);
  const builderAddress = String(order.builder_address ?? "");
  if (builderFeeBps === 0n && builderAddress === "") return undefined;
  return {
    builderAddress,
    builderFeeBps,
  };
}

function executedOrderSize(order: V2StateRecord, position: V2StateRecord | null): bigint {
  const requested = big(order.size_usd_delta);
  if (requested > 0n || numberValue(order.order_kind) === V2_ORDER_KIND.OPEN_LIMIT) return requested;
  return big(position?.size_usd);
}

function defaultTargetKind(market: V2StateRecord): number {
  return big(field(market, "long_asset_id")) > 0n && big(field(market, "long_asset_id")) === big(field(market, "short_asset_id"))
    ? V2_ORDER_TARGET.SINGLE_TOKEN
    : V2_ORDER_TARGET.PAIR;
}

function normalizeTimeInForce(value: TimeInForceInput | undefined): number {
  if (value === undefined) return TIME_IN_FORCE.GTC;
  if (value === "GTC") return TIME_IN_FORCE.GTC;
  if (value === "GTD") return TIME_IN_FORCE.GTD;
  if (value === "IOC") return TIME_IN_FORCE.IOC;
  return numberValue(value);
}

function field(record: V2StateRecord, snake: string, camelName?: string): unknown {
  return record[snake] ?? (camelName ? record[camelName] : undefined);
}

function valueOr(value: unknown, fallback: unknown): BigNumberish {
  return big(value) > 0n ? (value as BigNumberish) : (fallback as BigNumberish);
}

function big(value: unknown): bigint {
  if (value === undefined || value === null || value === "") return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  return BigInt(value as number);
}

function numberValue(value: unknown): number {
  return Number(big(value));
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function camel(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
