export type PdexJsonInteger = number | bigint | string;
export type PdexStateRecord = Record<string, unknown>;

export interface V2MarketState extends PdexStateRecord {
  market_id?: PdexJsonInteger;
  symbol?: string;
  market_family?: string;
  builder_family?: string;
  is_single_token_market?: boolean | PdexJsonInteger;
  index_asset_id?: PdexJsonInteger;
  long_asset_id?: PdexJsonInteger;
  short_asset_id?: PdexJsonInteger;
  backing_asset_id?: PdexJsonInteger;
  collateral_asset_ids?: PdexJsonInteger[];
  position_token_scale?: PdexJsonInteger;
  position_conversion_scale?: PdexJsonInteger;
  index_price?: PdexJsonInteger;
  index_price_min?: PdexJsonInteger;
  index_price_max?: PdexJsonInteger;
  long_price?: PdexJsonInteger;
  long_price_min?: PdexJsonInteger;
  long_price_max?: PdexJsonInteger;
  short_price?: PdexJsonInteger;
  short_price_min?: PdexJsonInteger;
  short_price_max?: PdexJsonInteger;
  oracle_timestamp?: PdexJsonInteger;
  virtual_long_oi_usd?: PdexJsonInteger;
  virtual_short_oi_usd?: PdexJsonInteger;
}

export interface V2PoolState extends PdexStateRecord {
  pool_id?: PdexJsonInteger;
  market_id?: PdexJsonInteger;
  pool_asset_id?: PdexJsonInteger;
  long_asset_id?: PdexJsonInteger;
  short_asset_id?: PdexJsonInteger;
  long_pool_amount?: PdexJsonInteger;
  short_pool_amount?: PdexJsonInteger;
  swap_impact_pool_long_amount?: PdexJsonInteger;
  swap_impact_pool_short_amount?: PdexJsonInteger;
  lp_supply?: PdexJsonInteger;
  pool_value_usd?: PdexJsonInteger;
  raw_pool_value_usd?: PdexJsonInteger;
  marked_pool_value_usd?: PdexJsonInteger;
  pending_borrowing_total_usd?: PdexJsonInteger;
}

export interface V2TraderState extends PdexStateRecord {
  owner?: string;
  trading_app_name?: string;
  storage_available_microalgo?: PdexJsonInteger;
  storage_locked_microalgo?: PdexJsonInteger;
  two_token_storage_available_microalgo?: PdexJsonInteger;
  two_token_storage_locked_microalgo?: PdexJsonInteger;
  next_order_id?: PdexJsonInteger;
}

export interface V2PositionState extends PdexStateRecord {
  position_id?: PdexJsonInteger;
  owner?: string;
  market_id?: PdexJsonInteger;
  pool_id?: PdexJsonInteger;
  side?: PdexJsonInteger;
  size_usd?: PdexJsonInteger;
  size_usdc?: PdexJsonInteger;
  collateral_amount?: PdexJsonInteger;
  collateral_usd?: PdexJsonInteger;
  collateral_asset_id?: PdexJsonInteger;
  collateral_asset_ids?: PdexJsonInteger[];
  backing_asset_id?: PdexJsonInteger;
  builder_family?: string;
  market_family?: string;
  is_single_token_market?: boolean | PdexJsonInteger;
  swap_available?: boolean | PdexJsonInteger;
}

export interface V2OrderState extends PdexStateRecord {
  schema_version?: PdexJsonInteger;
  position_id?: PdexJsonInteger;
  owner?: string;
  owner_order_id?: PdexJsonInteger;
  order_id?: PdexJsonInteger;
  market_id?: PdexJsonInteger;
  pool_id?: PdexJsonInteger;
  side?: PdexJsonInteger;
  order_type?: PdexJsonInteger;
  size_usd_delta?: PdexJsonInteger;
  size_usd?: PdexJsonInteger;
  collateral_amount?: PdexJsonInteger;
  collateral_asset_id?: PdexJsonInteger;
  keeper_fee_asset_id?: PdexJsonInteger;
  keeper_fee_amount?: PdexJsonInteger;
  trigger_price?: PdexJsonInteger;
  acceptable_price?: PdexJsonInteger;
  min_output_amount?: PdexJsonInteger;
  time_in_force?: PdexJsonInteger;
  expiry_time?: PdexJsonInteger;
  status?: string | PdexJsonInteger;
}

export interface V2LpState extends PdexStateRecord {
  owner?: string;
  market_id?: PdexJsonInteger;
  pool_id?: PdexJsonInteger;
  share_amount?: PdexJsonInteger;
  shares?: PdexJsonInteger;
  estimated_value_usd?: PdexJsonInteger;
  last_deposit_timestamp?: PdexJsonInteger;
}

export interface V2PositionMarginState extends PdexStateRecord {
  market_id?: PdexJsonInteger;
  collateral_asset_id?: PdexJsonInteger;
  side?: PdexJsonInteger;
  equity_usd?: PdexJsonInteger;
  initial_margin_required_usd?: PdexJsonInteger;
  maintenance_margin_required_usd?: PdexJsonInteger;
  initial_margin_breached?: boolean | PdexJsonInteger;
  liquidatable?: boolean | PdexJsonInteger;
  liquidation_price_estimate?: PdexJsonInteger;
  index_price?: PdexJsonInteger;
  entry_price?: PdexJsonInteger;
  pnl_usd?: PdexJsonInteger;
  failure_reasons?: unknown[];
}

export interface V2AccountMarginState extends PdexStateRecord {
  equity_usd?: PdexJsonInteger;
  initial_margin_required_usd?: PdexJsonInteger;
  maintenance_margin_required_usd?: PdexJsonInteger;
  initial_margin_breached_count?: PdexJsonInteger;
  liquidatable_count?: PdexJsonInteger;
  generated_at?: PdexJsonInteger;
  expires_at?: PdexJsonInteger;
  indexed_round?: PdexJsonInteger;
  positions?: V2PositionMarginState[];
}

export interface V2AccountActivityItemState extends PdexStateRecord {
  activity_key?: string;
  root_tx_id?: string;
  source_tx_id?: string;
  round?: PdexJsonInteger;
  occurred_at?: PdexJsonInteger;
  action_type?: string;
  event_type?: string;
  market_id?: PdexJsonInteger;
  pool_id?: PdexJsonInteger;
  vault_id?: PdexJsonInteger;
  owner_order_id?: PdexJsonInteger;
  detail?: PdexStateRecord;
}

export interface PdexAssetDisplay {
  assetId: number;
  symbol: string;
  displayName: string;
  decimals: number;
}

export interface PdexCatalog {
  indexMarkets: Map<number, PdexStateRecord>;
  custodyAssets: Map<number, PdexAssetDisplay>;
  marketDefinitions: Map<number, PdexStateRecord>;
}

export interface PdexPriceSnapshot {
  index?: bigint;
  indexMin?: bigint;
  indexMax?: bigint;
  long?: bigint;
  longMin?: bigint;
  longMax?: bigint;
  short?: bigint;
  shortMin?: bigint;
  shortMax?: bigint;
  timestamp?: number;
}

export interface PdexMarket {
  marketId: string;
  symbol: string;
  displayName: string;
  baseSymbol: string;
  quoteSymbol: string;
  builderFamily: string;
  singleToken: boolean;
  defaultPoolId: string;
  indexAssetId: number;
  longAssetId: number;
  shortAssetId: number;
  backingAssetId: number;
  collateralAssetIds: number[];
  positionTokenScale?: bigint;
  positionConversionScale?: bigint;
  virtualLongOpenInterestUsd: bigint;
  virtualShortOpenInterestUsd: bigint;
  prices: PdexPriceSnapshot;
  raw: V2MarketState;
}

export interface PdexPool {
  poolId: string;
  marketId: string;
  poolAssetId: string;
  longAssetId: number;
  shortAssetId: number;
  longAmount: bigint;
  shortAmount: bigint;
  swapImpactLongAmount: bigint;
  swapImpactShortAmount: bigint;
  lpSupply: bigint;
  poolValueUsd?: bigint;
  rawPoolValueUsd?: bigint;
  markedPoolValueUsd?: bigint;
  pendingBorrowingTotalUsd?: bigint;
  raw: V2PoolState;
}

export interface PdexPosition {
  owner: string;
  marketId: string;
  poolId: string;
  side: number;
  sizeUsd: bigint;
  collateralAmount: bigint;
  collateralAssetId: number;
  collateralAssetIds: number[];
  backingAssetId: number;
  builderFamily: string;
  singleToken: boolean;
  swapAvailable: boolean;
  raw: V2PositionState;
}

export interface PdexOrder {
  owner: string;
  orderId: string;
  marketId: string;
  poolId: string;
  side: number;
  orderType: number;
  sizeUsd: bigint;
  collateralAmount: bigint;
  collateralAssetId: number;
  keeperFeeAssetId: number;
  keeperFeeAmount: bigint;
  triggerPrice: bigint;
  acceptablePrice: bigint;
  minOutputAmount: bigint;
  timeInForce: number;
  expiryTime: bigint;
  status: string;
  raw: V2OrderState;
}

export interface PdexLiquidityPosition {
  owner: string;
  marketId: string;
  poolId: string;
  shares: bigint;
  estimatedValueUsd?: bigint;
  lastDepositTimestamp?: bigint;
  raw: V2LpState;
}

export interface PdexPositionMargin {
  marketId: string;
  collateralAssetId: number;
  side: number;
  equityUsd: bigint;
  initialMarginRequiredUsd: bigint;
  maintenanceMarginRequiredUsd: bigint;
  initialMarginBreached: boolean;
  liquidatable: boolean;
  liquidationPriceEstimate?: bigint;
  indexPrice?: bigint;
  entryPrice?: bigint;
  pnlUsd?: bigint;
  failureReasons: string[];
  raw: V2PositionMarginState;
}

export interface PdexAccountMargin {
  equityUsd: bigint;
  initialMarginRequiredUsd: bigint;
  maintenanceMarginRequiredUsd: bigint;
  initialMarginBreachedCount: number;
  liquidatableCount: number;
  generatedAt: number;
  expiresAt: number;
  indexedRound: number;
  positions: PdexPositionMargin[];
  raw: V2AccountMarginState;
}

export interface PdexAccountActivity {
  activityKey: string;
  txId: string;
  round: number;
  occurredAt: number;
  actionType: string;
  eventType: string;
  marketId?: string;
  poolId?: string;
  vaultId?: string;
  orderId?: string;
  detail: PdexStateRecord;
  raw: V2AccountActivityItemState;
}

export interface PdexAccountActivityPage {
  activities: PdexAccountActivity[];
  nextCursor?: string;
}

export interface PdexMarketSummary {
  markets: PdexMarket[];
  pools: PdexPool[];
  catalog: PdexCatalog;
  indexedRound?: number;
}

export function pdexRecord(value: unknown): PdexStateRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as PdexStateRecord
    : {};
}

export function pdexRecords(value: unknown): PdexStateRecord[] {
  return Array.isArray(value)
    ? value.filter((item): item is PdexStateRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

export function pdexString(value: unknown, fallback = ""): string {
  if (value === undefined || value === null) return fallback;
  const parsed = String(value);
  return parsed.length ? parsed : fallback;
}

export function pdexNumber(value: unknown, fallback = 0): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function pdexBigInt(value: unknown, fallback = 0n): bigint {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? BigInt(value) : fallback;
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return fallback;
  return BigInt(value.trim());
}

export function pdexOptionalBigInt(value: unknown): bigint | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return Number.isSafeInteger(value) ? BigInt(value) : undefined;
  if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return undefined;
  return BigInt(value.trim());
}

export function pdexBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "bigint") return value !== 0n;
  if (typeof value === "string" && value.length) {
    return !["0", "false", "no", "none", "null"].includes(value.toLowerCase());
  }
  return fallback;
}

export function normalizeV2Catalog(value: unknown): PdexCatalog {
  const catalog = pdexRecord(value);
  const custodyAssets = new Map<number, PdexAssetDisplay>();
  for (const [key, entryValue] of Object.entries(pdexRecord(catalog.custody_assets))) {
    const entry = pdexRecord(entryValue);
    const assetId = safeNonNegativeInteger(entry.asset_id ?? key);
    if (assetId === undefined) continue;
    const symbol = pdexString(entry.symbol, assetId === 0 ? "ALGO" : `Asset #${assetId}`);
    custodyAssets.set(assetId, {
      assetId,
      symbol,
      displayName: pdexString(entry.display_name, symbol),
      decimals: pdexNumber(entry.decimals, 6),
    });
  }
  if (!custodyAssets.has(0)) {
    custodyAssets.set(0, { assetId: 0, symbol: "ALGO", displayName: "ALGO", decimals: 6 });
  }
  return {
    indexMarkets: recordMap(catalog.index_markets),
    custodyAssets,
    marketDefinitions: recordMap(catalog.market_definitions),
  };
}

export function normalizeV2Market(
  value: V2MarketState,
  options: { pool?: V2PoolState; catalog?: PdexCatalog } = {},
): PdexMarket {
  const record = value;
  const pool = options.pool ?? {};
  const marketId = pdexString(record.market_id, "0");
  const indexAssetId = pdexNumber(record.index_asset_id);
  const definition = options.catalog?.marketDefinitions.get(pdexNumber(marketId)) ?? {};
  const indexMarket = options.catalog?.indexMarkets.get(indexAssetId) ?? {};
  const symbol = pdexString(definition.symbol, pdexString(record.symbol, pdexString(indexMarket.display_name, `Market ${marketId}`)));
  const [symbolBase = symbol, symbolQuote = "USD"] = symbol.split("/");
  const longAssetId = pdexNumber(record.long_asset_id, indexAssetId);
  const collateralAssetIds = Array.isArray(record.collateral_asset_ids)
    ? uniqueNumbers(record.collateral_asset_ids.map((assetId) => pdexNumber(assetId)))
    : [];
  const shortAssetId = pdexNumber(record.short_asset_id, collateralAssetIds[0] ?? 0);
  const conversionScale = pdexOptionalBigInt(record.position_conversion_scale);
  const tokenScale = pdexOptionalBigInt(record.position_token_scale)
    ?? (conversionScale !== undefined && conversionScale % 1_000_000n === 0n
      ? conversionScale / 1_000_000n
      : undefined);
  return {
    marketId,
    symbol,
    displayName: pdexString(definition.display_name, symbol),
    baseSymbol: pdexString(indexMarket.symbol, symbolBase),
    quoteSymbol: pdexString(indexMarket.quote_symbol, symbolQuote),
    builderFamily: pdexString(record.builder_family, pdexString(record.market_family, "two_token")),
    singleToken: pdexBoolean(record.is_single_token_market),
    defaultPoolId: pdexString(pool.pool_id, marketId),
    indexAssetId,
    longAssetId,
    shortAssetId,
    backingAssetId: pdexNumber(record.backing_asset_id, longAssetId),
    collateralAssetIds,
    positionTokenScale: tokenScale,
    positionConversionScale: conversionScale,
    virtualLongOpenInterestUsd: pdexBigInt(record.virtual_long_oi_usd),
    virtualShortOpenInterestUsd: pdexBigInt(record.virtual_short_oi_usd),
    prices: {
      index: pdexOptionalBigInt(record.index_price),
      indexMin: pdexOptionalBigInt(record.index_price_min),
      indexMax: pdexOptionalBigInt(record.index_price_max),
      long: pdexOptionalBigInt(record.long_price),
      longMin: pdexOptionalBigInt(record.long_price_min),
      longMax: pdexOptionalBigInt(record.long_price_max),
      short: pdexOptionalBigInt(record.short_price),
      shortMin: pdexOptionalBigInt(record.short_price_min),
      shortMax: pdexOptionalBigInt(record.short_price_max),
      timestamp: record.oracle_timestamp === undefined ? undefined : pdexNumber(record.oracle_timestamp),
    },
    raw: record,
  };
}

export function normalizeV2Pool(value: V2PoolState): PdexPool {
  return {
    poolId: pdexString(value.pool_id, pdexString(value.market_id, "0")),
    marketId: pdexString(value.market_id, "0"),
    poolAssetId: pdexString(value.pool_asset_id, "0"),
    longAssetId: pdexNumber(value.long_asset_id),
    shortAssetId: pdexNumber(value.short_asset_id),
    longAmount: pdexBigInt(value.long_pool_amount),
    shortAmount: pdexBigInt(value.short_pool_amount),
    swapImpactLongAmount: pdexBigInt(value.swap_impact_pool_long_amount),
    swapImpactShortAmount: pdexBigInt(value.swap_impact_pool_short_amount),
    lpSupply: pdexBigInt(value.lp_supply),
    poolValueUsd: pdexOptionalBigInt(value.pool_value_usd),
    rawPoolValueUsd: pdexOptionalBigInt(value.raw_pool_value_usd),
    markedPoolValueUsd: pdexOptionalBigInt(value.marked_pool_value_usd),
    pendingBorrowingTotalUsd: pdexOptionalBigInt(value.pending_borrowing_total_usd),
    raw: value,
  };
}

export function normalizeV2MarketSummary(value: PdexStateRecord): PdexMarketSummary {
  const rawMarkets = pdexRecords(value.markets) as V2MarketState[];
  const rawPools = pdexRecords(value.pools) as V2PoolState[];
  const poolsByMarket = new Map(rawPools.map((pool) => [pdexString(pool.market_id), pool]));
  const catalog = normalizeV2Catalog(value.product_catalog);
  return {
    markets: rawMarkets.map((market) => normalizeV2Market(market, {
      pool: poolsByMarket.get(pdexString(market.market_id)),
      catalog,
    })),
    pools: rawPools.map(normalizeV2Pool),
    catalog,
    indexedRound: value.last_indexed_round === undefined ? undefined : pdexNumber(value.last_indexed_round),
  };
}

export function normalizeV2Position(value: V2PositionState): PdexPosition {
  const collateralAssetIds = Array.isArray(value.collateral_asset_ids)
    ? uniqueNumbers(value.collateral_asset_ids.map((assetId) => pdexNumber(assetId)))
    : [];
  return {
    owner: pdexString(value.owner),
    marketId: pdexString(value.market_id, "0"),
    poolId: pdexString(value.pool_id, pdexString(value.market_id, "0")),
    side: pdexNumber(value.side),
    sizeUsd: pdexBigInt(value.size_usd ?? value.size_usdc),
    collateralAmount: pdexBigInt(value.collateral_amount ?? value.collateral_usd),
    collateralAssetId: pdexNumber(value.collateral_asset_id),
    collateralAssetIds,
    backingAssetId: pdexNumber(value.backing_asset_id),
    builderFamily: pdexString(value.builder_family, pdexString(value.market_family, "two_token")),
    singleToken: pdexBoolean(value.is_single_token_market),
    swapAvailable: pdexBoolean(value.swap_available),
    raw: value,
  };
}

export function normalizeV2Order(value: V2OrderState): PdexOrder {
  return {
    owner: pdexString(value.owner),
    orderId: pdexString(value.owner_order_id ?? value.order_id, "0"),
    marketId: pdexString(value.market_id, "0"),
    poolId: pdexString(value.pool_id, pdexString(value.market_id, "0")),
    side: pdexNumber(value.side),
    orderType: pdexNumber(value.order_type),
    sizeUsd: pdexBigInt(value.size_usd_delta ?? value.size_usd),
    collateralAmount: pdexBigInt(value.collateral_amount),
    collateralAssetId: pdexNumber(value.collateral_asset_id),
    keeperFeeAssetId: pdexNumber(value.keeper_fee_asset_id, pdexNumber(value.collateral_asset_id)),
    keeperFeeAmount: pdexBigInt(value.keeper_fee_amount),
    triggerPrice: pdexBigInt(value.trigger_price),
    acceptablePrice: pdexBigInt(value.acceptable_price),
    minOutputAmount: pdexBigInt(value.min_output_amount),
    timeInForce: pdexNumber(value.time_in_force),
    expiryTime: pdexBigInt(value.expiry_time),
    status: pdexString(value.status),
    raw: value,
  };
}

export function normalizeV2LiquidityPosition(value: V2LpState): PdexLiquidityPosition {
  return {
    owner: pdexString(value.owner),
    marketId: pdexString(value.market_id, "0"),
    poolId: pdexString(value.pool_id, pdexString(value.market_id, "0")),
    shares: pdexBigInt(value.share_amount ?? value.shares),
    estimatedValueUsd: pdexOptionalBigInt(value.estimated_value_usd),
    lastDepositTimestamp: pdexOptionalBigInt(value.last_deposit_timestamp),
    raw: value,
  };
}

export function normalizeV2PositionMargin(value: V2PositionMarginState): PdexPositionMargin {
  return {
    marketId: pdexString(value.market_id, "0"),
    collateralAssetId: pdexNumber(value.collateral_asset_id),
    side: pdexNumber(value.side),
    equityUsd: pdexBigInt(value.equity_usd),
    initialMarginRequiredUsd: pdexBigInt(value.initial_margin_required_usd),
    maintenanceMarginRequiredUsd: pdexBigInt(value.maintenance_margin_required_usd),
    initialMarginBreached: pdexBoolean(value.initial_margin_breached),
    liquidatable: pdexBoolean(value.liquidatable),
    liquidationPriceEstimate: pdexOptionalBigInt(value.liquidation_price_estimate),
    indexPrice: pdexOptionalBigInt(value.index_price),
    entryPrice: pdexOptionalBigInt(value.entry_price),
    pnlUsd: pdexOptionalBigInt(value.pnl_usd),
    failureReasons: Array.isArray(value.failure_reasons) ? value.failure_reasons.map(String).filter(Boolean) : [],
    raw: value,
  };
}

export function normalizeV2AccountMargin(value: V2AccountMarginState): PdexAccountMargin {
  return {
    equityUsd: pdexBigInt(value.equity_usd),
    initialMarginRequiredUsd: pdexBigInt(value.initial_margin_required_usd),
    maintenanceMarginRequiredUsd: pdexBigInt(value.maintenance_margin_required_usd),
    initialMarginBreachedCount: pdexNumber(value.initial_margin_breached_count),
    liquidatableCount: pdexNumber(value.liquidatable_count),
    generatedAt: pdexNumber(value.generated_at),
    expiresAt: pdexNumber(value.expires_at),
    indexedRound: pdexNumber(value.indexed_round),
    positions: pdexRecords(value.positions).map((position) => normalizeV2PositionMargin(position)),
    raw: value,
  };
}

export function normalizeV2AccountActivity(value: PdexStateRecord): PdexAccountActivityPage {
  return {
    activities: pdexRecords(value.activities).map((activityValue) => {
      const activity = activityValue as V2AccountActivityItemState;
      return {
        activityKey: pdexString(activity.activity_key),
        txId: pdexString(activity.root_tx_id, pdexString(activity.source_tx_id)),
        round: pdexNumber(activity.round),
        occurredAt: pdexNumber(activity.occurred_at),
        actionType: pdexString(activity.action_type),
        eventType: pdexString(activity.event_type),
        marketId: optionalString(activity.market_id),
        poolId: optionalString(activity.pool_id),
        vaultId: optionalString(activity.vault_id),
        orderId: optionalString(activity.owner_order_id),
        detail: pdexRecord(activity.detail),
        raw: activity,
      };
    }),
    nextCursor: optionalString(value.next_cursor),
  };
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return String(value);
}

function recordMap(value: unknown): Map<number, PdexStateRecord> {
  const result = new Map<number, PdexStateRecord>();
  for (const [key, entry] of Object.entries(pdexRecord(value))) {
    const record = pdexRecord(entry);
    const id = safeNonNegativeInteger(record.market_id ?? record.asset_id ?? key);
    if (id !== undefined) result.set(id, record);
  }
  return result;
}

function safeNonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values.filter((value) => Number.isSafeInteger(value) && value >= 0))];
}
