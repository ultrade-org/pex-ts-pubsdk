import {
  buildV2AddPositionMarginCall,
  buildV2CancelExpiredOrderCall,
  buildV2CancelOrderCall,
  buildV2DecreaseOrCloseCall,
  buildV2DecreaseOrCloseWithSwapCall,
  buildV2ExecuteOrderCall,
  buildV2CvaDepositCall,
  buildV2CvaWithdrawCall,
  buildV2CvaWithdrawFromMarketCall,
  buildV2LiquidateCall,
  buildV2OpenOrIncreaseCall,
  buildV2SingleTokenAddPositionMarginCall,
  buildV2SingleTokenDecreaseOrCloseCall,
  buildV2SingleTokenDepositLiquidityCall,
  buildV2SingleTokenLiquidateCall,
  buildV2SingleTokenOpenOrIncreaseCall,
  buildV2SingleTokenWithdrawLiquidityCall,
  buildV2SubmitOrderCall,
  buildV2SubmitLinkedOrderCall,
  buildV2SwapExactInCall,
  buildV2SwapRouteExactInCall,
  buildV2WithdrawPositionMarginCall,
  buildV2SingleTokenWithdrawPositionMarginCall,
  buildV2WithdrawLiquidityCall,
  buildV2WithdrawLiquidityWithSwapCall,
  type AppCallDescriptor,
  type BigNumberish,
  type V2CvaActiveMarkOraclePayload,
} from "./transactions.js";
import { quoteV2CvaWithdrawRoute, type V2QuoteResult, type V2StateRecord } from "./v2Quotes.js";
import { validateRawPrice12, type RawPrice12 } from "./oracle.js";

export type PlannerBuilder = (input: any) => AppCallDescriptor;

export const v2PlannerBuilders: Record<string, PlannerBuilder> = {
  v2_open_or_increase: buildV2OpenOrIncreaseCall,
  v2_add_position_margin: buildV2AddPositionMarginCall,
  v2_decrease_or_close: buildV2DecreaseOrCloseCall,
  v2_withdraw_position_margin: buildV2WithdrawPositionMarginCall,
  v2_decrease_or_close_with_swap: buildV2DecreaseOrCloseWithSwapCall,
  v2_liquidate: buildV2LiquidateCall,
  v2_withdraw_liquidity: buildV2WithdrawLiquidityCall,
  v2_withdraw_liquidity_with_swap: buildV2WithdrawLiquidityWithSwapCall,
  v2_swap_exact_in: buildV2SwapExactInCall,
  v2_swap_route_exact_in: buildV2SwapRouteExactInCall,
  v2_submit_order: buildV2SubmitOrderCall,
  v2_submit_linked_order: buildV2SubmitLinkedOrderCall,
  v2_execute_order: buildV2ExecuteOrderCall,
  v2_cancel_order: buildV2CancelOrderCall,
  v2_cancel_expired_order: buildV2CancelExpiredOrderCall,
  v2_single_token_open_or_increase: buildV2SingleTokenOpenOrIncreaseCall,
  v2_single_token_add_position_margin: buildV2SingleTokenAddPositionMarginCall,
  v2_single_token_decrease_or_close: buildV2SingleTokenDecreaseOrCloseCall,
  v2_single_token_withdraw_position_margin: buildV2SingleTokenWithdrawPositionMarginCall,
  v2_single_token_liquidate: buildV2SingleTokenLiquidateCall,
  v2_single_token_deposit_liquidity: buildV2SingleTokenDepositLiquidityCall,
  v2_single_token_withdraw_liquidity: buildV2SingleTokenWithdrawLiquidityCall,
  v2_cva_deposit: buildV2CvaDepositCall,
};

export interface PlannerFailure {
  ok: false;
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export interface PlannerSuccess {
  ok: true;
  flow: string;
  descriptor: AppCallDescriptor;
  transactionCount: number;
  resourceManifest: Record<string, unknown>;
  route?: Record<string, unknown>;
  warnings: string[];
}

export type PlannerResult = PlannerFailure | PlannerSuccess;

export function plannerFailure(code: string, message = code, details: Record<string, unknown> = {}): PlannerFailure {
  return { ok: false, code, message, details };
}

export function plannerOk(
  flow: string,
  descriptor: AppCallDescriptor,
  route?: Record<string, unknown>,
  warnings: string[] = [],
): PlannerSuccess {
  return {
    ok: true,
    flow,
    descriptor,
    transactionCount: descriptorTransactions(descriptor).length,
    resourceManifest: resourceManifest(descriptor),
    route,
    warnings,
  };
}

export function validatePlannedDescriptor(descriptor: AppCallDescriptor): PlannerFailure | { ok: true } {
  const count = descriptorTransactions(descriptor).length;
  if (count > 16) return plannerFailure("group_too_large", "group_too_large", { transaction_count: count });
  return { ok: true };
}

export function planV2Flow(flow: string, input: Record<string, unknown>): PlannerResult {
  const builder = v2PlannerBuilders[flow];
  if (!builder) return plannerFailure("unsupported_flow", "unsupported_flow", { flow });
  try {
    const descriptor = builder(input);
    const validation = validatePlannedDescriptor(descriptor);
    return validation.ok ? plannerOk(flow, descriptor) : validation;
  } catch (error) {
    return plannerFailure("invalid_argument", error instanceof Error ? error.message : "invalid_argument", { flow });
  }
}

export function planV2CvaWithdraw(input: {
  sender: string;
  vaultId: BigNumberish;
  shareAmount: BigNumberish;
  stateSnapshot: Record<string, unknown>;
  resources: Record<string, unknown>;
  oraclePayload: Record<string, unknown>;
  preferredMarketId?: BigNumberish;
  minLongAmount?: BigNumberish;
  minShortAmount?: BigNumberish;
  yieldRecallMode?: BigNumberish;
  maxLongReceiptAmount?: BigNumberish;
  maxShortReceiptAmount?: BigNumberish;
  marketYieldRecallCount?: BigNumberish;
}): PlannerResult {
  if (!input.stateSnapshot) return plannerFailure("missing_state");
  if (!input.resources) return plannerFailure("missing_resource");
  if (!input.oraclePayload) return plannerFailure("missing_oracle");
  const vaultId = n(input.vaultId);
  const vault = findById(nested(input.stateSnapshot, "cva", "vaults"), "vault_id", vaultId);
  if (!vault) return plannerFailure("missing_state", "missing_state", { missing: "cva_vault", vault_id: vaultId });
  const allocations = asRecords(nested(input.stateSnapshot, "cva", "allocations")).filter(
    (item) => n(item.vault_id ?? vaultId) === vaultId,
  );
  const pools = Object.fromEntries(asRecords(input.stateSnapshot.pools).map((item) => [String(n(item.market_id)), item]));
  const markets = Object.fromEntries(asRecords(input.stateSnapshot.markets).map((item) => [String(n(item.market_id)), item]));
  const activeMarkOracles = (input.oraclePayload.activeMarketOracles
    ?? input.oraclePayload.active_market_oracles
    ?? input.oraclePayload.marketOracles
    ?? input.oraclePayload.market_oracles) as Record<string, V2CvaActiveMarkOraclePayload> | V2CvaActiveMarkOraclePayload[] | undefined;
  const pricesByMarket = activeMarkOracles && !Array.isArray(activeMarkOracles)
    ? Object.fromEntries(
        Object.entries(activeMarkOracles).map(([marketId, payload]) => [
          marketId,
          oraclePrices({
            ...input.oraclePayload,
            ...(payload as unknown as Record<string, unknown>),
          }),
        ]),
      )
    : {};
  const quote = quoteV2CvaWithdrawRoute({
    vault,
    allocations,
    pools,
    shareAmount: input.shareAmount,
    minLongAmount: input.minLongAmount ?? 0,
    minShortAmount: input.minShortAmount ?? 0,
    prices: oraclePrices(input.oraclePayload),
    pricesByMarket,
    markets,
    allowMarkRefresh: activeMarkOracles !== undefined,
  });
  const selected = selectCvaRoute(quote, input.preferredMarketId === undefined ? undefined : n(input.preferredMarketId));
  if (!selected.ok) return selected;
  const appIds = resourceAppIds(input.resources);
  const routeType = String((selected.route.route_type as string | undefined) ?? quote.route_type ?? "");
  const activeMarketIds = cvaMarkRequiredMarketIds(vault, allocations);
  const common = {
    sender: input.sender,
    shareAmount: input.shareAmount,
    minLongAmount: input.minLongAmount ?? 0,
    minShortAmount: input.minShortAmount ?? 0,
    oracleMessage: bytesFromPayload(input.oraclePayload, "message", "message_hex"),
    oracleSignature: bytesFromPayload(input.oraclePayload, "signature", "signature_hex"),
    longAssetId: n(vault.long_asset_id ?? findAsset(input.resources, "long")),
    shortAssetId: n(vault.short_asset_id ?? findAsset(input.resources, "short")),
    v2AdminControlAppId: n(appIds.PDexV2AdminControl ?? appIds.PDexV2Admin ?? 0),
    activeMarketIds,
    activeMarketOracles: activeMarkOracles,
  };
  let descriptor: AppCallDescriptor;
  if (routeType === "idle") {
    descriptor = buildV2CvaWithdrawCall({
      v2CvaVaultAppId: vaultId,
      v2MarketsAppId: n(appIds.PDexV2Markets),
      indexAssetId: n(input.oraclePayload.index_asset_id ?? input.oraclePayload.indexAssetId ?? vault.index_asset_id ?? 0),
      ...common,
    });
  } else if (routeType === "single_market") {
    const marketId = n(selected.route.market_id ?? input.preferredMarketId ?? 0);
    if (marketId <= 0) return plannerFailure("no_eligible_cva_withdraw_source");
    const market = markets[String(marketId)] ?? {};
    descriptor = buildV2CvaWithdrawFromMarketCall({
      v2CvaVaultAppId: vaultId,
      v2AdminControlAppId: common.v2AdminControlAppId,
      v2MarketsAppId: n(appIds.PDexV2Markets),
      v2MathAppId: n(appIds.PDexV2Math),
      marketId,
      sender: common.sender,
      shareAmount: common.shareAmount,
      minLongAmount: common.minLongAmount,
      minShortAmount: common.minShortAmount,
      oracleMessage: common.oracleMessage,
      oracleSignature: common.oracleSignature,
      longAssetId: n(market.long_asset_id ?? common.longAssetId),
      shortAssetId: n(market.short_asset_id ?? common.shortAssetId),
      activeMarketIds: common.activeMarketIds,
      activeMarketOracles: common.activeMarketOracles,
      yieldRecallMode: input.yieldRecallMode ?? 0,
      maxLongReceiptAmount: input.maxLongReceiptAmount ?? 0,
      maxShortReceiptAmount: input.maxShortReceiptAmount ?? 0,
      marketYieldRecallCount: input.marketYieldRecallCount ?? 0,
      marketYieldRegistry: input.resources.market_yield_resource_registry as Record<string, unknown> | undefined,
    });
  } else {
    return plannerFailure("no_eligible_cva_withdraw_source", "no_eligible_cva_withdraw_source", { route_type: routeType, quote });
  }
  const validation = validatePlannedDescriptor(descriptor);
  return validation.ok ? plannerOk("v2_cva_withdraw", descriptor, { quote, selected: selected.route }) : validation;
}

function selectCvaRoute(quote: V2QuoteResult, preferredMarketId?: number): PlannerFailure | { ok: true; route: V2QuoteResult } {
  if (!quote.ok) {
    return plannerFailure(
      quote.route_type === "unavailable" ? "split_cva_withdrawal_required" : "no_eligible_cva_withdraw_source",
      undefined,
      { quote },
    );
  }
  const routes = [quote.recommended_route, ...(((quote.alternative_routes as V2QuoteResult[] | undefined) ?? []))]
    .filter((item): item is V2QuoteResult => !!item && typeof item === "object");
  if (preferredMarketId !== undefined) {
    const preferred = routes.find((route) => n(route.market_id ?? 0) === preferredMarketId);
    if (preferred) return { ok: true, route: preferred };
    return plannerFailure("preferred_cva_source_not_eligible", undefined, { preferred_market_id: preferredMarketId, quote });
  }
  const recommended = quote.recommended_route as V2QuoteResult | null | undefined;
  if (recommended) return { ok: true, route: recommended };
  return plannerFailure("no_eligible_cva_withdraw_source", undefined, { quote });
}

function cvaMarkRequiredMarketIds(vault: V2StateRecord, allocations: V2StateRecord[]): number[] {
  const activeIds = (Array.isArray(vault.active_market_ids)
    ? vault.active_market_ids
    : [vault.active_market_0, vault.active_market_1, vault.active_market_2, vault.active_market_3])
    .map((value) => n(value ?? 0))
    .filter((value) => value > 0);
  const nonzeroLp = new Set(
    allocations
      .filter((allocation) => n(allocation.lp_share_amount ?? allocation.lpShareAmount ?? 0) > 0)
      .map((allocation) => n(allocation.market_id ?? allocation.marketId ?? 0))
      .filter((value) => value > 0),
  );
  if (allocations.length) return [...new Set(activeIds.filter((marketId) => nonzeroLp.has(marketId)))];
  return [...new Set(activeIds)];
}

function descriptorTransactions(descriptor: AppCallDescriptor): AppCallDescriptor[] {
  return [
    ...((descriptor.prerequisiteCalls ?? []) as AppCallDescriptor[]),
    ...((descriptor.activeMarkCalls ?? []) as AppCallDescriptor[]),
    descriptor,
    descriptor.resourceCarrier,
    ...((descriptor.resourceCarriers ?? []) as AppCallDescriptor[]),
  ].filter(
    (item): item is AppCallDescriptor => !!item,
  );
}

function resourceManifest(descriptor: AppCallDescriptor): Record<string, unknown> {
  const transactions = descriptorTransactions(descriptor);
  return {
    foreignApps: uniqueManifestValues(transactions, "foreignApps"),
    foreignAssets: uniqueManifestValues(transactions, "foreignAssets"),
    accounts: uniqueManifestValues(transactions, "accounts"),
    boxesB64: uniqueManifestValues(transactions, "boxesB64"),
    flatFeeMicroAlgo: descriptor.flatFeeMicroAlgo,
    abiTransactionArgs: descriptor.abiTransactionArgs,
  };
}

function uniqueManifestValues<T extends keyof AppCallDescriptor>(
  transactions: AppCallDescriptor[],
  key: T,
): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const transaction of transactions) {
    const value = transaction[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      const marker = JSON.stringify(item);
      if (seen.has(marker)) continue;
      seen.add(marker);
      out.push(item);
    }
  }
  return out;
}

function asRecords(value: unknown): V2StateRecord[] {
  return Array.isArray(value) ? value.filter((item): item is V2StateRecord => !!item && typeof item === "object") : [];
}

function nested(source: Record<string, unknown>, ...keys: string[]): unknown {
  let current: unknown = source;
  for (const key of keys) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function findById(value: unknown, key: string, id: number): V2StateRecord | undefined {
  return asRecords(value).find((item) => n(item[key]) === id);
}

function resourceAppIds(resources: Record<string, unknown>): Record<string, unknown> {
  return resources.app_ids && typeof resources.app_ids === "object" ? resources.app_ids as Record<string, unknown> : {};
}

function oraclePrices(payload: Record<string, unknown>): Record<string, BigNumberish> {
    return {
    index_price: plannerPrice12(payload.index_price ?? payload.indexPrice),
    index_price_min: plannerPrice12(payload.index_price_min ?? payload.indexPriceMin),
    index_price_max: plannerPrice12(payload.index_price_max ?? payload.indexPriceMax),
    long_price: plannerPrice12(payload.long_price ?? payload.longPrice),
    long_price_min: plannerPrice12(payload.long_price_min ?? payload.longPriceMin),
    long_price_max: plannerPrice12(payload.long_price_max ?? payload.longPriceMax),
    short_price: plannerPrice12(payload.short_price ?? payload.shortPrice),
    short_price_min: plannerPrice12(payload.short_price_min ?? payload.shortPriceMin),
    short_price_max: plannerPrice12(payload.short_price_max ?? payload.shortPriceMax),
  };
}

function plannerPrice12(value: unknown): bigint {
  return validateRawPrice12(value as RawPrice12);
}

function bytesFromPayload(payload: Record<string, unknown>, bytesKey: string, hexKey: string): Uint8Array {
  const value = payload[bytesKey];
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (typeof value === "string") return hexToBytes(value);
  const hexValue = payload[hexKey];
  return typeof hexValue === "string" ? hexToBytes(hexValue) : new Uint8Array();
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.length % 2 === 0 ? hex : `0${hex}`;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function findAsset(resources: Record<string, unknown>, name: string): number {
  const assets = resources.assets;
  if (!assets || typeof assets !== "object") return 0;
  return n((assets as Record<string, unknown>)[name]);
}

function n(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value) return Number(value);
  return 0;
}
