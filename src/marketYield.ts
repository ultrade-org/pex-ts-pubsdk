import { getApplicationAddress } from "algosdk";
import type { PdexApiClient } from "./api.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  v2MarketCoreBoxKey,
  v2MarketFundingBorrowingBoxKey,
  v2MarketOpenInterestBoxKey,
  v2MarketPoolBoxKey,
  v2MarketRiskBoxKey,
  v2MarketYieldBoxKey,
  v2MarketYieldStrategyConfigBoxKey,
  v2MarketYieldStrategyRuntimeBoxKey,
  v2MarketXalgoStrategyConfigBoxKey,
  v2MarketXalgoStrategyRuntimeBoxKey,
  v2VirtualPositionInventoryBoxKey,
  type Uint64Like,
} from "./boxes.js";
import { decodeReceiptWithOptions, type Receipt } from "./receipts.js";
import { loadManifestVersion } from "./manifest.js";
import {
  NATIVE_ALGO_ASSET_ID,
  V2_YIELD_PDEX_BASE_FLAT_FEE_MICRO_ALGO,
} from "./transactions.js";
import {
  V2_YIELD_STRATEGY_KIND_FOLKS_LENDING,
  V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS,
  XALGO_PROPOSER_BOX_NAME,
} from "./externalYield.js";

export const MARKET_YIELD_RESOURCE_REGISTRY_SCHEMA_VERSION = 1;
export const MARKET_YIELD_RECALL_MODE_AUTO = "auto";
export const MARKET_YIELD_RECALL_MODE_FORCE_RECALL = "force_recall";
export const MARKET_YIELD_RECALL_MODE_RESOURCES_ONLY = "resources_only";
export const MARKET_YIELD_RECALL_MODE_DISABLED = "disabled";

export type MarketYieldActionRecallClient = Pick<PdexApiClient,
  "v2MarketYieldActionRecallPlan" | "v2MarketYieldResourceRegistry"> & { network?: string };

export interface PrepareV2ActionRecallInput {
  marketId: Uint64Like;
  expectedNetwork?: string;
  expectedMarketsAppId: Uint64Like;
  indexAssetId?: Uint64Like;
  /** Include every asset the action can pay, even if its preview output is zero. */
  assetIds: Uint64Like[];
  outputs?: Array<{ assetId: Uint64Like; requiredHotAmount: Uint64Like }>;
  actionFamily?: string;
  methodName?: string;
  marketYieldRegistry?: Record<string, unknown>;
}

export interface PreparedV2ActionRecall {
  yieldRecallMode: number;
  marketYieldRegistry: Record<string, unknown>;
  capsByAsset: Record<string, bigint>;
  capForAsset: (assetId: Uint64Like) => bigint;
}

export class YieldRecallUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "YieldRecallUnavailableError"; }
}

/** Plan bounded, atomic recall even when the preview is fully funded by idle cash.
 * Missing or inconsistent metadata is an error, never evidence that yield is off.
 */
export async function prepareV2ActionRecall(
  client: MarketYieldActionRecallClient,
  input: PrepareV2ActionRecallInput,
): Promise<PreparedV2ActionRecall> {
  const integer = (value: unknown, label: string): bigint => {
    if ((typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint")
      || (typeof value === "number" && !Number.isSafeInteger(value))
      || (typeof value === "string" && !/^\d+$/.test(value))) {
      throw new Error(`Invalid yield recall ${label}`);
    }
    const result = BigInt(value);
    if (result < 0n || result > 0xffffffffffffffffn) throw new Error(`Invalid yield recall ${label}`);
    return result;
  };
  const record = (value: unknown, label: string): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Missing yield recall ${label}`);
    return value as Record<string, unknown>;
  };
  const marketId = integer(input.marketId, "market ID");
  if (marketId === 0n || !input.assetIds.length) throw new Error("Yield recall requires a market and output assets");
  const amounts = new Map(input.assetIds.map(id => [integer(id, "asset ID").toString(), 0n]));
  for (const output of input.outputs ?? []) {
    const id = integer(output.assetId, "asset ID").toString();
    if (!amounts.has(id)) throw new Error(`Yield recall output asset ${id} is not declared`);
    amounts.set(id, integer(amounts.get(id)! + integer(output.requiredHotAmount, "output amount"), "output amount"));
  }
  const plan = record(await client.v2MarketYieldActionRecallPlan({
    market_id: marketId.toString(),
    ...(input.indexAssetId !== undefined ? { index_asset_id: integer(input.indexAssetId, "index asset ID").toString() } : {}),
    action_family: input.actionFamily,
    method_name: input.methodName,
    outputs: [...amounts].map(([asset_id, amount]) => ({ asset_id, required_hot_amount: amount.toString() })),
  }), "plan");
  if (plan.preparation_version !== 1) throw new Error("Unsupported or missing yield recall preparation version");
  if (typeof plan.network !== "string" || !["mainnet", "testnet", "localnet"].includes(plan.network)) {
    throw new Error("Missing yield recall network identity");
  }
  const expectedNetwork = input.expectedNetwork ?? client.network;
  if (!expectedNetwork) throw new Error("Expected yield recall network is required");
  if (plan.network !== expectedNetwork) throw new Error("Yield recall network mismatch");
  const marketsAppId = integer(plan.markets_app_id, "Markets app ID");
  if (marketsAppId === 0n || marketsAppId !== integer(input.expectedMarketsAppId, "expected Markets app ID")) throw new Error("Yield recall Markets app mismatch");
  if (integer(plan.observed_round, "observed round") === 0n) throw new Error("Yield recall requires an observed round");
  if (integer(plan.market_id, "plan market ID") !== marketId) throw new Error("Yield recall plan market mismatch");
  if (!Array.isArray(plan.plans) || !Array.isArray(plan.blockers)) throw new Error("Incomplete yield recall plan");
  if (plan.atomic_action_ready !== true || plan.blockers.length) {
    const detail = plan.blockers.map(value => {
      const blocker = record(value, "blocker");
      return String(blocker.message ?? blocker.code ?? "unavailable");
    }).join(" ");
    const providerLimited = plan.blockers.some(value => record(value, "blocker").code === "provider_liquidity_insufficient");
    throw new YieldRecallUnavailableError(`${providerLimited ? "This payout is temporarily unavailable from the yield provider." : "Atomic yield recall is unavailable."} ${detail}`.trim());
  }
  const version = plan.registry_version;
  const hash = plan.registry_hash;
  if (typeof version !== "string" || !version || typeof hash !== "string" || !hash) {
    throw new Error("Yield recall plan is missing registry identity");
  }
  let registry = plan.market_yield_registry !== undefined
    ? record(plan.market_yield_registry, "embedded resource registry")
    : input.marketYieldRegistry;
  const matches = (value: Record<string, unknown> | undefined) => value?.registry_version === version && value?.registry_hash === hash
    && Array.isArray(value?.strategies) && Array.isArray(value?.markets);
  if (plan.market_yield_registry === undefined && !matches(registry)) {
    registry = record(await client.v2MarketYieldResourceRegistry(), "resource registry");
  }
  if (!matches(registry)) throw new Error("Yield recall registry remained stale or incomplete after refresh");
  const currentRegistry = registry!;
  // Mode 0 still requires authentic, complete resource metadata.
  normalizeMarketYieldRegistry(currentRegistry);
  if (integer(currentRegistry.markets_app_id, "registry Markets app ID") !== marketsAppId) {
    throw new Error("Yield recall registry Markets app mismatch");
  }
  const matchingMarkets = (currentRegistry.markets as unknown[]).map(value => record(value, "market"))
    .filter(value => integer(value.market_id, "registry market ID") === marketId);
  if (matchingMarkets.length !== 1) {
    throw new Error("Yield recall registry does not contain the requested market");
  }
  const backingAssets = new Set([matchingMarkets[0].long_asset_id, matchingMarkets[0].short_asset_id]
    .map(value => integer(value, "backing asset ID").toString()));
  if ([...amounts.keys()].some(id => !backingAssets.has(id))) throw new Error("Yield recall asset is not owned by market");
  const configured = new Set((currentRegistry.strategies as unknown[]).map(value => record(value, "strategy"))
    .filter(value => integer(value.market_id, "strategy market ID") === marketId)
    .map(value => integer(value.asset_id, "strategy asset ID").toString()));
  const rawCaps = record(plan.caps_by_asset, "receipt caps");
  const capsByAsset: Record<string, bigint> = {};
  for (const value of plan.plans) {
    const item = record(value, "asset plan");
    const id = integer(item.asset_id, "plan asset ID").toString();
    if (!amounts.has(id) || Object.hasOwn(capsByAsset, id)) throw new Error("Unexpected or duplicate yield recall asset plan");
    if (integer(item.market_id, "asset plan market ID") !== marketId
      || integer(item.required_hot_amount, "planned output amount") !== amounts.get(id)) throw new Error("Yield recall output mismatch");
    const accounting = record(item.liquidity_accounting, "liquidity accounting");
    if (accounting.status !== "valid") throw new YieldRecallUnavailableError("Market liquidity accounting is unavailable or deficient");
    const pool = integer(accounting.pool_amount, "pool amount");
    const valueInYield = integer(accounting.economic_underlying, "yield value");
    if (pool < valueInYield || accounting.signed_hot_amount !== (pool - valueInYield).toString()
      || accounting.deficit_amount !== "0") throw new Error("Inconsistent market liquidity accounting");
    if (typeof item.yield_configured !== "boolean" || item.yield_configured !== configured.has(id)) {
      throw new Error(`Yield recall strategy metadata mismatch for asset ${id}`);
    }
    if (item.cap_sufficient === false) throw new YieldRecallUnavailableError(`Atomic yield recall exceeds the configured per-action cap for asset ${id}.`);
    if (item.atomic_action_ready !== true || item.requires_pre_recall === true
      || !Array.isArray(item.blockers) || item.blockers.length) {
      throw new YieldRecallUnavailableError(`Atomic yield recall unavailable for asset ${id}`);
    }
    const cap = integer(rawCaps[id], "receipt cap");
    if (item.yield_configured) {
      if (cap !== integer(item.max_receipt_amount, "asset receipt cap")
        || cap > integer(item.available_receipt_amount, "available receipts")
        || (cap > 0n && item.action_recall_capacity_available !== true)) throw new Error("Inconsistent yield recall receipt cap");
    } else if (cap !== 0n) throw new Error("Unconfigured yield strategy has a receipt cap");
    capsByAsset[id] = cap;
  }
  if (Object.keys(capsByAsset).length !== amounts.size || Object.keys(rawCaps).length !== amounts.size) {
    throw new Error("Yield recall plan omitted an output asset");
  }
  const yieldRecallMode = Object.values(capsByAsset).some(cap => cap > 0n) ? 1 : 0;
  if (integer(plan.yield_recall_mode, "mode") !== BigInt(yieldRecallMode)) throw new Error("Yield recall mode does not match receipt caps");
  return {
    yieldRecallMode,
    marketYieldRegistry: currentRegistry,
    capsByAsset,
    capForAsset: assetId => {
      const id = integer(assetId, "asset ID").toString();
      if (!Object.hasOwn(capsByAsset, id)) throw new Error(`Yield recall was not prepared for asset ${id}`);
      return capsByAsset[id];
    },
  };
}
export const V2_YIELD_EXCHANGE_RATE_SCALE = 1_000_000n;
export const V2_YIELD_MAX_POOL_CALL_FEE_MICRO_ALGO = 10_000;
export const PDEX_FOLKS_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO = 0;
export const MARKET_YIELD_FOLKS_RECALL_FLAT_FEE_MICRO_ALGO =
  V2_YIELD_PDEX_BASE_FLAT_FEE_MICRO_ALGO + PDEX_FOLKS_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO;
export const MARKET_XALGO_YIELD_RECALL_FLAT_FEE_MICRO_ALGO =
  V2_YIELD_PDEX_BASE_FLAT_FEE_MICRO_ALGO + PDEX_FOLKS_EXTERNAL_PROTOCOL_FEE_MICRO_ALGO;

export const MARKET_YIELD_RETURN_EVENT_TYPES = new Set([
  "v2_market_yield_committed",
  "v2_market_yield_asset_sent_to_vault",
  "v2_market_yield_vault_pause_updated",
  "v2_market_yield_vault_asset_opted_in",
  "v2_market_yield_strategy_configured",
  "v2_market_xalgo_strategy_configured",
  "v2_market_yield_pool_manager_updated",
  "v2_market_yield_allocated",
  "v2_market_yield_marked",
  "v2_market_yield_recalled",
  "v2_market_yield_emergency_recalled",
  "v2_market_xalgo_allocated",
  "v2_market_xalgo_marked",
  "v2_market_xalgo_recalled",
  "v2_market_xalgo_emergency_recalled",
]);

export interface MarketYieldStrategyResourceConfig {
  market_id: number;
  asset_id: number;
  strategy_kind: number;
  folks_pool_app_id: number;
  folks_pool_manager_app_id: number;
  underlying_asset_id: number;
  receipt_asset_id: number;
  xalgo_consensus_app_id: number;
  xalgo_asset_id: number;
  xalgo_proposer_addresses: string[];
  xalgo_provider_fee_credit_per_call_microalgos: number;
}

export interface MarketYieldMarketResourceConfig {
  market_id: number;
  index_asset_id: number | null;
  pool_type: number | null;
  long_asset_id: number | null;
  short_asset_id: number | null;
}

export interface MarketYieldProtocolResourceRegistry {
  schema_version: number;
  registry_version: string;
  last_indexed_round: number;
  markets_app_id: number;
  market_yield_vault_app_id: number;
  strategies: MarketYieldStrategyResourceConfig[];
  markets: MarketYieldMarketResourceConfig[];
  markets_app_address: string;
  market_yield_vault_app_address: string;
  market_folks_yield_vault_app_id: number;
  market_folks_yield_vault_app_address: string;
  market_xalgo_yield_vault_app_id: number;
  market_xalgo_yield_vault_app_address: string;
  xalgo_consensus_app_id: number;
  xalgo_asset_id: number;
  xalgo_proposer_addresses: string[];
  action_recall_uses_router: boolean;
  base_heavy_call_flat_fee_micro_algos: number;
  market_yield_recall_flat_fee_micro_algos: number;
  registry_hash?: string;
}

export interface MarketYieldDynamicObservation {
  provider_available_underlying: number;
  observed_lending_utilization_bps: number;
  observed_pdex_share_bps: number;
  observed_receipt_exchange_rate: number;
  observed_timestamp: number;
  hot_balance?: number;
  required_hot_amount?: number;
}

export interface MarketYieldHotShortfall {
  required_hot_amount: number;
  hot_balance: number;
  shortfall: number;
}

export interface MarketYieldWithdrawalQuote {
  ownership_maximum: bigint;
  hot_funded: bigint;
  needed_recall: bigint;
  provider_recallable: bigint;
  protocol_recallable: bigint;
  maximum_fundable: bigint;
}

export interface MarketYieldResourceClosure {
  foreignApps: number[];
  foreignAssets: number[];
  accounts: string[];
  boxes: Array<[number, Uint8Array]>;
  boxesB64: string[];
  flatFeeMicroAlgo: bigint;
}

export class MarketYieldResourceRegistryCache {
  private snapshot?: MarketYieldProtocolResourceRegistry;

  constructor(
    private readonly loader: () => MarketYieldProtocolResourceRegistry | Record<string, unknown>,
    private readonly maxAgeRounds?: number,
  ) {}

  get(options: { currentRound?: number; forceRefresh?: boolean; expectedRegistryHash?: string } = {}): MarketYieldProtocolResourceRegistry {
    let forceRefresh = Boolean(options.forceRefresh);
    if (this.snapshot && options.expectedRegistryHash && options.expectedRegistryHash !== computeMarketYieldRegistryHash(this.snapshot)) {
      forceRefresh = true;
    }
    if (
      this.snapshot &&
      options.currentRound !== undefined &&
      this.maxAgeRounds !== undefined &&
      options.currentRound - this.snapshot.last_indexed_round > this.maxAgeRounds
    ) {
      forceRefresh = true;
    }
    if (!this.snapshot || forceRefresh) {
      this.snapshot = normalizeMarketYieldRegistry(this.loader());
      if (options.expectedRegistryHash && options.expectedRegistryHash !== computeMarketYieldRegistryHash(this.snapshot)) {
        throw new Error("loaded registry hash mismatch");
      }
    }
    return this.snapshot;
  }

  refresh(): MarketYieldProtocolResourceRegistry {
    return this.get({ forceRefresh: true });
  }
}

export function normalizeMarketYieldRegistry(input: MarketYieldProtocolResourceRegistry | Record<string, unknown>): MarketYieldProtocolResourceRegistry {
  const registry = input as Record<string, any>;
  const normalized: MarketYieldProtocolResourceRegistry = {
    schema_version: numberField(registry.schema_version),
    registry_version: String(registry.registry_version ?? ""),
    last_indexed_round: numberField(registry.last_indexed_round),
    markets_app_id: numberField(registry.markets_app_id),
    market_yield_vault_app_id: numberField(registry.market_yield_vault_app_id),
    markets_app_address: String(registry.markets_app_address ?? ""),
    market_yield_vault_app_address: String(registry.market_yield_vault_app_address ?? ""),
    market_folks_yield_vault_app_id: numberField(registry.market_folks_yield_vault_app_id ?? 0),
    market_folks_yield_vault_app_address: String(registry.market_folks_yield_vault_app_address ?? ""),
    market_xalgo_yield_vault_app_id: numberField(registry.market_xalgo_yield_vault_app_id ?? 0),
    market_xalgo_yield_vault_app_address: String(registry.market_xalgo_yield_vault_app_address ?? ""),
    xalgo_consensus_app_id: numberField(registry.xalgo_consensus_app_id ?? 0),
    xalgo_asset_id: numberField(registry.xalgo_asset_id ?? 0),
    xalgo_proposer_addresses: arrayField(registry.xalgo_proposer_addresses ?? registry.proposer_addresses ?? []).map(String),
    action_recall_uses_router: Boolean(registry.action_recall_uses_router ?? false),
    base_heavy_call_flat_fee_micro_algos: numberField(
      registry.base_heavy_call_flat_fee_micro_algos ?? V2_YIELD_PDEX_BASE_FLAT_FEE_MICRO_ALGO,
    ),
    market_yield_recall_flat_fee_micro_algos: numberField(
      registry.market_yield_recall_flat_fee_micro_algos ?? MARKET_YIELD_FOLKS_RECALL_FLAT_FEE_MICRO_ALGO,
    ),
    markets: (registry.markets ?? []).map((item: Record<string, unknown>) => normalizeMarketYieldMarket(item)),
    strategies: (registry.strategies ?? []).map((item: Record<string, unknown>) => normalizeMarketYieldStrategy(item)),
    registry_hash: registry.registry_hash === undefined || registry.registry_hash === null ? undefined : String(registry.registry_hash),
  };
  validateMarketYieldRegistry(normalized);
  if (normalized.registry_hash && normalized.registry_hash !== computeMarketYieldRegistryHash(normalized)) {
    throw new Error("resource registry hash mismatch");
  }
  return normalized;
}

export function normalizeMarketYieldStrategy(input: Partial<MarketYieldStrategyResourceConfig> | Record<string, unknown>): MarketYieldStrategyResourceConfig {
  const item = input as Record<string, unknown>;
  const normalized: MarketYieldStrategyResourceConfig = {
    market_id: numberField(item.market_id),
    asset_id: numberField(item.asset_id),
    strategy_kind: numberField(item.strategy_kind),
    folks_pool_app_id: numberField(item.folks_pool_app_id ?? 0),
    folks_pool_manager_app_id: numberField(item.folks_pool_manager_app_id ?? 0),
    underlying_asset_id: numberField(item.underlying_asset_id),
    receipt_asset_id: numberField(item.receipt_asset_id),
    xalgo_consensus_app_id: numberField(item.xalgo_consensus_app_id ?? 0),
    xalgo_asset_id: numberField(item.xalgo_asset_id ?? 0),
    xalgo_proposer_addresses: arrayField(item.xalgo_proposer_addresses ?? item.proposer_addresses ?? []).map(String),
    xalgo_provider_fee_credit_per_call_microalgos: numberField(
      item.xalgo_provider_fee_credit_per_call_microalgos
        ?? item.max_xalgo_call_fee_microalgos
        ?? 0,
    ),
  };
  validateMarketYieldStrategy(normalized);
  return normalized;
}

export function normalizeMarketYieldMarket(input: Partial<MarketYieldMarketResourceConfig> | Record<string, unknown>): MarketYieldMarketResourceConfig {
  const item = input as Record<string, unknown>;
  const normalized = {
    market_id: numberField(item.market_id),
    index_asset_id: optionalNumber(item.index_asset_id),
    pool_type: optionalNumber(item.pool_type),
    long_asset_id: optionalNumber(item.long_asset_id),
    short_asset_id: optionalNumber(item.short_asset_id),
  };
  validateUint64("market_id", normalized.market_id, true);
  for (const key of ["index_asset_id", "pool_type", "long_asset_id", "short_asset_id"] as const) {
    if (normalized[key] !== null) validateUint64(key, normalized[key]!);
  }
  return normalized;
}

export function marketYieldRegistryToJson(registryInput: MarketYieldProtocolResourceRegistry | Record<string, unknown>, includeHash = true): Record<string, unknown> {
  const registry = normalizeMarketYieldRegistry(registryInput);
  const value: Record<string, unknown> = {
    schema_version: registry.schema_version,
    registry_version: registry.registry_version,
    last_indexed_round: registry.last_indexed_round,
    markets_app_id: registry.markets_app_id,
    market_yield_vault_app_id: registry.market_yield_vault_app_id,
    markets_app_address: registry.markets_app_address,
    market_yield_vault_app_address: registry.market_yield_vault_app_address,
    market_folks_yield_vault_app_id: registry.market_folks_yield_vault_app_id,
    market_folks_yield_vault_app_address: registry.market_folks_yield_vault_app_address,
    market_xalgo_yield_vault_app_id: registry.market_xalgo_yield_vault_app_id,
    market_xalgo_yield_vault_app_address: registry.market_xalgo_yield_vault_app_address,
    xalgo_consensus_app_id: registry.xalgo_consensus_app_id,
    xalgo_asset_id: registry.xalgo_asset_id,
    xalgo_proposer_addresses: [...registry.xalgo_proposer_addresses],
    action_recall_uses_router: registry.action_recall_uses_router,
    base_heavy_call_flat_fee_micro_algos: registry.base_heavy_call_flat_fee_micro_algos,
    market_yield_recall_flat_fee_micro_algos: registry.market_yield_recall_flat_fee_micro_algos,
    markets: registry.markets.map((item) => ({ ...item })),
    strategies: registry.strategies.map((item) => ({ ...item })),
  };
  if (includeHash) value.registry_hash = registry.registry_hash ?? computeMarketYieldRegistryHash(registry);
  return value;
}

export function computeMarketYieldRegistryHash(registryInput: MarketYieldProtocolResourceRegistry | Record<string, unknown>): string {
  const json = marketYieldRegistryToJsonNoValidate(registryInput, false);
  return bytesToHex(sha256(new TextEncoder().encode(stableStringify(json))));
}

export function estimateMarketYieldHotShortfall(input: {
  requiredHotAmount: Uint64Like;
  hotBalance: Uint64Like;
}): MarketYieldHotShortfall {
  const required = numberField(input.requiredHotAmount);
  const hot = numberField(input.hotBalance);
  return {
    required_hot_amount: required,
    hot_balance: hot,
    shortfall: Math.max(0, required - hot),
  };
}

export function quoteMarketYieldWithdrawal(input: {
  ownershipMaximum: Uint64Like;
  hotAmount: Uint64Like;
  providerWithdrawable: Uint64Like;
  protocolRecallCapacityUnderlying: Uint64Like;
}): MarketYieldWithdrawalQuote {
  const ownershipMaximum = BigInt(input.ownershipMaximum);
  const hotAmount = BigInt(input.hotAmount);
  const providerWithdrawable = BigInt(input.providerWithdrawable);
  const protocolCapacity = BigInt(input.protocolRecallCapacityUnderlying);
  if ([ownershipMaximum, hotAmount, providerWithdrawable, protocolCapacity].some((value) => value < 0n)) {
    throw new Error("market-yield withdrawal inputs must be non-negative");
  }
  const hotFunded = ownershipMaximum < hotAmount ? ownershipMaximum : hotAmount;
  const neededRecall = ownershipMaximum - hotFunded;
  const providerRecallable = neededRecall < providerWithdrawable ? neededRecall : providerWithdrawable;
  const protocolRecallable = providerRecallable < protocolCapacity ? providerRecallable : protocolCapacity;
  return {
    ownership_maximum: ownershipMaximum,
    hot_funded: hotFunded,
    needed_recall: neededRecall,
    provider_recallable: providerRecallable,
    protocol_recallable: protocolRecallable,
    maximum_fundable: hotFunded + protocolRecallable,
  };
}

export function marketYieldReceiptAmountForUnderlying(input: {
  underlyingAmount: Uint64Like;
  observedReceiptExchangeRate: Uint64Like;
}): bigint {
  const amount = BigInt(input.underlyingAmount);
  const rate = BigInt(input.observedReceiptExchangeRate);
  if (amount < 0n || rate <= 0n) throw new Error("amount and rate must be valid uint64 values");
  if (amount === 0n) return 0n;
  return (amount * V2_YIELD_EXCHANGE_RATE_SCALE + rate - 1n) / rate;
}

export function marketYieldFreshObservationFromObject(input: Record<string, unknown>): MarketYieldDynamicObservation {
  return {
    provider_available_underlying: numberField(input.provider_available_underlying),
    observed_lending_utilization_bps: numberField(input.observed_lending_utilization_bps),
    observed_pdex_share_bps: numberField(input.observed_pdex_share_bps),
    observed_receipt_exchange_rate: numberField(input.observed_receipt_exchange_rate),
    observed_timestamp: numberField(input.observed_timestamp),
    hot_balance: input.hot_balance === undefined ? undefined : numberField(input.hot_balance),
    required_hot_amount: input.required_hot_amount === undefined ? undefined : numberField(input.required_hot_amount),
  };
}

export function buildMarketYieldResourceClosure(input: {
  registry: MarketYieldProtocolResourceRegistry | MarketYieldResourceRegistryCache | Record<string, unknown>;
  marketId: Uint64Like;
  assetId: Uint64Like;
  indexAssetId?: Uint64Like;
  includeVirtualInventory?: boolean;
  accounts?: string[];
  includeAppAddresses?: boolean;
}): MarketYieldResourceClosure {
  const registry =
    input.registry instanceof MarketYieldResourceRegistryCache
      ? input.registry.get()
      : normalizeMarketYieldRegistry(input.registry);
  const marketId = numberField(input.marketId);
  const assetId = numberField(input.assetId);
  const strategy = registry.strategies.find((item) => item.market_id === marketId && item.asset_id === assetId);
  if (!strategy) throw new Error("market-yield strategy not found");
  const market = registry.markets.find((item) => item.market_id === marketId);
  const virtualInventoryAssetId = input.includeVirtualInventory
    ? numberField(input.indexAssetId ?? market?.index_asset_id ?? assetId)
    : undefined;
  const accounts = [...(input.accounts ?? [])];
  if (input.includeAppAddresses) {
    for (const address of [
      String(registry.markets_app_address || getApplicationAddress(registry.markets_app_id)),
      ...(strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_FOLKS_LENDING
        ? [
            String(registry.market_folks_yield_vault_app_address || getApplicationAddress(folksVaultAppId(registry))),
            String(getApplicationAddress(strategy.folks_pool_app_id)),
            String(getApplicationAddress(strategy.folks_pool_manager_app_id)),
          ]
        : strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS
          ? [
              String(registry.market_xalgo_yield_vault_app_address || getApplicationAddress(xalgoVaultAppId(registry))),
              String(getApplicationAddress(strategy.xalgo_consensus_app_id || resolvedXalgoConsensusAppId(registry))),
            ]
          : []),
    ]) {
      if (!accounts.includes(address)) accounts.push(address);
    }
  }
  const boxes: Array<[number, Uint8Array]> = [
    [registry.markets_app_id, v2MarketCoreBoxKey(marketId)],
    [registry.markets_app_id, v2MarketRiskBoxKey(marketId)],
    [registry.markets_app_id, v2MarketPoolBoxKey(marketId)],
    [registry.markets_app_id, v2MarketOpenInterestBoxKey(marketId)],
    [registry.markets_app_id, v2MarketFundingBorrowingBoxKey(marketId)],
    [registry.markets_app_id, v2MarketYieldBoxKey(marketId, assetId)],
  ];
  if (virtualInventoryAssetId !== undefined) {
    boxes.push([registry.markets_app_id, v2VirtualPositionInventoryBoxKey(virtualInventoryAssetId)]);
  }
  if (strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS) {
    const vaultAppId = xalgoVaultAppId(registry);
    const xalgoConsensusAppId = strategy.xalgo_consensus_app_id || resolvedXalgoConsensusAppId(registry);
    const xalgoAssetId = strategy.xalgo_asset_id || resolvedXalgoAssetId(registry);
    boxes.push(
      [vaultAppId, v2MarketXalgoStrategyConfigBoxKey(marketId)],
      [vaultAppId, v2MarketXalgoStrategyRuntimeBoxKey(marketId)],
      [xalgoConsensusAppId, XALGO_PROPOSER_BOX_NAME],
    );
    for (const account of strategy.xalgo_proposer_addresses.length
      ? strategy.xalgo_proposer_addresses
      : registry.xalgo_proposer_addresses) {
      if (!accounts.includes(account)) accounts.push(account);
    }
    const unique = uniqueBoxes(boxes);
    return {
      foreignApps: uniqueNumbers([registry.markets_app_id, vaultAppId, xalgoConsensusAppId]),
      foreignAssets: uniqueNumbers([xalgoAssetId]),
      accounts: [...new Set(accounts)],
      boxes: unique,
      boxesB64: unique.map(([appId, name]) => `${appId}:${bytesToBase64(name)}`),
      flatFeeMicroAlgo: BigInt(MARKET_XALGO_YIELD_RECALL_FLAT_FEE_MICRO_ALGO),
    };
  }

  const folksVault = folksVaultAppId(registry);
  boxes.push(
    [folksVault, v2MarketYieldStrategyConfigBoxKey(marketId, assetId)],
    [folksVault, v2MarketYieldStrategyRuntimeBoxKey(marketId, assetId)],
  );
  const foreignAssets = [strategy.underlying_asset_id, strategy.receipt_asset_id];
  const actionRouterAppId = registry.action_recall_uses_router ? xalgoVaultAppId(registry) : 0;
  const unique = uniqueBoxes(boxes);
  return {
    foreignApps: uniqueNumbers([
      registry.markets_app_id,
      // Keep the external provider apps first so resource-carrier packing
      // co-locates the Folks pool with the vault account it reads locally.
      strategy.folks_pool_app_id,
      strategy.folks_pool_manager_app_id,
      actionRouterAppId,
      folksVault,
    ]),
    foreignAssets: uniqueNumbers(foreignAssets),
    accounts: [...new Set(accounts)],
    boxes: unique,
    boxesB64: unique.map(([appId, name]) => `${appId}:${bytesToBase64(name)}`),
    flatFeeMicroAlgo: BigInt(registry.market_yield_recall_flat_fee_micro_algos),
  };
}

export function decodeMarketYieldReturn(
  data: Uint8Array | string,
  options: { appName?: string } = {},
): Receipt {
  const raw = typeof data === "string" ? base64ToBytes(data) : data;
  const receipt = decodeReceiptWithOptions(raw, {
    manifest: loadManifestVersion(2),
    appName: options.appName,
  });
  if (!MARKET_YIELD_RETURN_EVENT_TYPES.has(receipt.eventType)) {
    throw new Error("not a market-yield receipt");
  }
  return receipt;
}

function validateMarketYieldRegistry(registry: MarketYieldProtocolResourceRegistry): void {
  if (registry.schema_version !== MARKET_YIELD_RESOURCE_REGISTRY_SCHEMA_VERSION) throw new Error("unsupported market-yield resource registry schema");
  if (!registry.registry_version) throw new Error("registry_version is required");
  validateUint64("last_indexed_round", registry.last_indexed_round);
  validateUint64("markets_app_id", registry.markets_app_id, true);
  validateUint64("market_yield_vault_app_id", registry.market_yield_vault_app_id, true);
  const strategyKinds = new Set(registry.strategies.map((item) => item.strategy_kind));
  if (strategyKinds.has(V2_YIELD_STRATEGY_KIND_FOLKS_LENDING)) {
    validateUint64("market_folks_yield_vault_app_id", folksVaultAppId(registry), true);
  }
  if (strategyKinds.has(V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS)) {
    validateUint64("market_xalgo_yield_vault_app_id", xalgoVaultAppId(registry), true);
    validateUint64("xalgo_consensus_app_id", resolvedXalgoConsensusAppId(registry), true);
    validateUint64("xalgo_asset_id", resolvedXalgoAssetId(registry), true);
  }
  const seen = new Set<string>();
  for (const strategy of registry.strategies) {
    const key = `${strategy.market_id}:${strategy.asset_id}`;
    if (seen.has(key)) throw new Error("duplicate market-yield strategy");
    seen.add(key);
  }
  const marketIds = new Set<number>();
  for (const market of registry.markets) {
    if (marketIds.has(market.market_id)) throw new Error("duplicate market-yield market");
    marketIds.add(market.market_id);
  }
}

function validateMarketYieldStrategy(strategy: MarketYieldStrategyResourceConfig): void {
  validateUint64("market_id", strategy.market_id, true);
  validateUint64("asset_id", strategy.asset_id);
  if (![V2_YIELD_STRATEGY_KIND_FOLKS_LENDING, V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS].includes(strategy.strategy_kind)) {
    throw new Error("unsupported market-yield strategy kind");
  }
  validateUint64("underlying_asset_id", strategy.underlying_asset_id);
  if (strategy.underlying_asset_id !== strategy.asset_id) throw new Error("underlying_asset_id must match asset_id");
  validateUint64("receipt_asset_id", strategy.receipt_asset_id, true);
  if (strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_FOLKS_LENDING) {
    validateUint64("folks_pool_app_id", strategy.folks_pool_app_id, true);
    validateUint64("folks_pool_manager_app_id", strategy.folks_pool_manager_app_id, true);
    if (strategy.receipt_asset_id === strategy.asset_id) throw new Error("receipt_asset_id must differ from asset_id");
  }
  if (strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS) {
    if (strategy.asset_id !== NATIVE_ALGO_ASSET_ID) throw new Error("xALGO strategies require ALGO asset_id 0");
    validateUint64("xalgo_consensus_app_id", strategy.xalgo_consensus_app_id, true);
    validateUint64("xalgo_asset_id", strategy.xalgo_asset_id, true);
    if (strategy.receipt_asset_id !== strategy.xalgo_asset_id) throw new Error("xALGO receipt_asset_id must match xalgo_asset_id");
  }
  validateUint64(
    "xalgo_provider_fee_credit_per_call_microalgos",
    strategy.xalgo_provider_fee_credit_per_call_microalgos,
    strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS,
  );
}

function marketYieldRegistryToJsonNoValidate(registryInput: MarketYieldProtocolResourceRegistry | Record<string, unknown>, includeHash: boolean): Record<string, unknown> {
  const registry = registryInput as any;
  const strategies = (registry.strategies ?? []).map((item: any) => ({
    market_id: numberField(item.market_id),
    asset_id: numberField(item.asset_id),
    strategy_kind: numberField(item.strategy_kind),
    folks_pool_app_id: numberField(item.folks_pool_app_id ?? 0),
    folks_pool_manager_app_id: numberField(item.folks_pool_manager_app_id ?? 0),
    underlying_asset_id: numberField(item.underlying_asset_id),
    receipt_asset_id: numberField(item.receipt_asset_id),
    xalgo_consensus_app_id: numberField(item.xalgo_consensus_app_id ?? 0),
    xalgo_asset_id: numberField(item.xalgo_asset_id ?? 0),
    xalgo_proposer_addresses: arrayField(item.xalgo_proposer_addresses ?? item.proposer_addresses ?? []).map(String),
    xalgo_provider_fee_credit_per_call_microalgos: numberField(
      item.xalgo_provider_fee_credit_per_call_microalgos
        ?? item.max_xalgo_call_fee_microalgos
        ?? 0,
    ),
  }));
  const markets = (registry.markets ?? []).map((item: any) => ({
    market_id: numberField(item.market_id),
    index_asset_id: optionalNumber(item.index_asset_id),
    pool_type: optionalNumber(item.pool_type),
    long_asset_id: optionalNumber(item.long_asset_id),
    short_asset_id: optionalNumber(item.short_asset_id),
  }));
  const value: Record<string, unknown> = {
    schema_version: numberField(registry.schema_version),
    registry_version: String(registry.registry_version ?? ""),
    last_indexed_round: numberField(registry.last_indexed_round),
    markets_app_id: numberField(registry.markets_app_id),
    market_yield_vault_app_id: numberField(registry.market_yield_vault_app_id),
    markets_app_address: String(registry.markets_app_address ?? ""),
    market_yield_vault_app_address: String(registry.market_yield_vault_app_address ?? ""),
    market_folks_yield_vault_app_id: numberField(registry.market_folks_yield_vault_app_id ?? 0),
    market_folks_yield_vault_app_address: String(registry.market_folks_yield_vault_app_address ?? ""),
    market_xalgo_yield_vault_app_id: numberField(registry.market_xalgo_yield_vault_app_id ?? 0),
    market_xalgo_yield_vault_app_address: String(registry.market_xalgo_yield_vault_app_address ?? ""),
    xalgo_consensus_app_id: numberField(registry.xalgo_consensus_app_id ?? 0),
    xalgo_asset_id: numberField(registry.xalgo_asset_id ?? 0),
    xalgo_proposer_addresses: arrayField(registry.xalgo_proposer_addresses ?? registry.proposer_addresses ?? []).map(String),
    action_recall_uses_router: Boolean(registry.action_recall_uses_router ?? false),
    base_heavy_call_flat_fee_micro_algos: numberField(registry.base_heavy_call_flat_fee_micro_algos ?? V2_YIELD_PDEX_BASE_FLAT_FEE_MICRO_ALGO),
    market_yield_recall_flat_fee_micro_algos: numberField(registry.market_yield_recall_flat_fee_micro_algos ?? MARKET_YIELD_FOLKS_RECALL_FLAT_FEE_MICRO_ALGO),
    markets,
    strategies,
  };
  if (includeHash) value.registry_hash = registry.registry_hash ?? computeMarketYieldRegistryHash(registryInput);
  return value;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(",")}}`;
}

function validateUint64(name: string, value: number, positive = false): void {
  if (!Number.isInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${name} out of uint64 safe integer range`);
  }
  if (positive && value === 0) throw new Error(`${name} must be positive`);
}

function numberField(value: unknown): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) throw new Error("invalid numeric field");
  return numberValue;
}

function optionalNumber(value: unknown): number | null {
  return value === undefined || value === null ? null : numberField(value);
}

function arrayField(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.map(Number).filter((value) => value > 0))];
}

function folksVaultAppId(registry: MarketYieldProtocolResourceRegistry): number {
  return Number(registry.market_folks_yield_vault_app_id || registry.market_yield_vault_app_id);
}

function xalgoVaultAppId(registry: MarketYieldProtocolResourceRegistry): number {
  return Number(registry.market_xalgo_yield_vault_app_id || registry.market_yield_vault_app_id);
}

function resolvedXalgoConsensusAppId(registry: MarketYieldProtocolResourceRegistry): number {
  if (registry.xalgo_consensus_app_id) return Number(registry.xalgo_consensus_app_id);
  return Number(
    registry.strategies.find((strategy) => strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS)
      ?.xalgo_consensus_app_id ?? 0,
  );
}

function resolvedXalgoAssetId(registry: MarketYieldProtocolResourceRegistry): number {
  if (registry.xalgo_asset_id) return Number(registry.xalgo_asset_id);
  return Number(
    registry.strategies.find((strategy) => strategy.strategy_kind === V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS)
      ?.xalgo_asset_id ?? 0,
  );
}

function uniqueBoxes(values: Array<[number, Uint8Array]>): Array<[number, Uint8Array]> {
  const seen = new Set<string>();
  const out: Array<[number, Uint8Array]> = [];
  for (const [appId, name] of values) {
    const key = `${appId}:${bytesToBase64(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([appId, name]);
  }
  return out;
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(value: Uint8Array): string {
  const maybeBuffer = (globalThis as any).Buffer;
  if (maybeBuffer) return maybeBuffer.from(value).toString("base64");
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const maybeBuffer = (globalThis as any).Buffer;
  if (maybeBuffer) return new Uint8Array(maybeBuffer.from(value, "base64"));
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}
