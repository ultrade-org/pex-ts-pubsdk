import { setProtocolManifest, type ProtocolManifest } from "./manifest.js";
import {
  ORACLE_PRICE_SCALE,
  V2_ORACLE_MESSAGE_VERSION,
  type OraclePayload,
  validateRawPrice12,
} from "./oracle.js";
import type {
  V2AccountMarginState,
  V2AccountActivityItemState,
  V2LpState,
  V2MarketState,
  V2OrderState,
  V2PoolState,
  V2PositionState,
  V2TraderState,
} from "./readModels.js";

export interface PdexApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  accountSessionToken?: string | AccountSessionTokenProvider;
  publicArtifactBaseUrl?: string;
  network?: string;
}

export type AccountSessionTokenProvider = () => string | undefined | Promise<string | undefined>;

export interface AccountSessionMessageInput {
  address: string;
  network: string;
  genesisId: string;
  genesisHash: string;
  origin: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  audience?: string;
  scopes?: readonly string[];
}

export interface AccountSessionRequest {
  address: string;
  message: string;
  signature: string;
}

export interface AccountSessionResponse extends BackendStateRecord {
  /** Direct on-chain signer bound at login; address remains the account owner. */
  authorizing_address?: string;
  session_token?: string;
  token_type?: "Bearer" | string;
  address: string;
  scopes: string[];
  network: string;
  issued_at: number;
  expires_at: number;
  seconds_until_expiry?: number;
}

export interface BackendV2OraclePayload {
  protocol_version: 2;
  oracle_message_version: 3;
  price_scale: number | string;
  market_id: number;
  app_id: number;
  index_asset_id: number;
  long_asset_id: number;
  short_asset_id: number;
  index_price_min: string;
  index_price_max: string;
  long_price_min: string;
  long_price_max: string;
  short_price_min: string;
  short_price_max: string;
  timestamp: number;
  message_hex: string;
  signature_hex: string;
  pubkey_hex: string;
  message_hash?: string;
  max_age_seconds?: number;
  max_future_skew_seconds?: number;
  valid_from_timestamp?: number;
  valid_until_timestamp?: number;
  source?: Record<string, unknown>;
}

export interface V2OraclePayloadBundleResponse extends BackendStateRecord {
  schema_version?: number;
  type?: "v2_oracle_payload_bundle_current" | string;
  oracle_message_version?: number;
  price_scale?: number | string;
  data_only?: boolean;
  network?: string;
  manifest_sha256?: string;
  updated_at?: number;
  expires_at?: number;
  current_path?: string;
  payloads?: Record<string, BackendV2OraclePayload>;
}

export type PriceCandlePeriod = "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1M";
export type PriceCandleTuple = [time: number, open: number, high: number, low: number, close: number];

export interface PriceCandlesRequest {
  marketId?: number | bigint | string;
  period: PriceCandlePeriod | string;
  limit?: number | bigint | string;
  to?: number | bigint | string;
  symbol?: string;
}

export interface PriceCandlesResponse extends BackendStateRecord {
  marketId: string;
  marketSlug?: string;
  indexSymbol?: string;
  source: string;
  pythSymbol?: string;
  pythChannel?: string;
  period: PriceCandlePeriod | string;
  resolution?: string;
  order: "asc" | "desc";
  candles: PriceCandleTuple[];
  updatedAt?: number;
  cache?: {
    status?: string;
    ttlSeconds?: number;
    bucketCount?: number;
  };
}

export interface V2LatestPriceResponse extends BackendStateRecord {
  schema_version?: number;
  type?: "v2_latest_price" | string;
  oracle_message_version?: number;
  price_scale?: number | string;
  data_only?: boolean;
  network?: string;
  manifest_sha256?: string;
  market_id: number;
  generated_at?: number;
  oracle_timestamp?: number;
  valid_from_timestamp?: number;
  valid_until_timestamp?: number;
  index_asset_id?: number;
  long_asset_id?: number;
  short_asset_id?: number;
  index_price_min?: string;
  index_price_max?: string;
  index_price?: string;
  long_price_min?: string;
  long_price_max?: string;
  long_price?: string;
  short_price_min?: string;
  short_price_max?: string;
  short_price?: string;
  artifact_hash?: string;
  artifact_path?: string;
  current_path?: string;
  source?: Record<string, unknown>;
}

export interface V2LatestPriceBundleResponse extends BackendStateRecord {
  schema_version?: number;
  type?: "v2_latest_price_bundle_current" | string;
  oracle_message_version?: number;
  price_scale?: number | string;
  data_only?: boolean;
  network?: string;
  manifest_sha256?: string;
  updated_at?: number;
  expires_at?: number;
  current_path?: string;
  prices?: Record<string, V2LatestPriceResponse>;
}

export type V2OracleTarget =
  | "trading"
  | "admin"
  | "admin_ops"
  | "swap"
  | "swap_ops"
  | "single_token_ops"
  | "single_token_trading"
  | "cva_vault"
  | "market_yield_vault"
  | "market_xalgo_yield_vault"
  | "market_folks_yield_vault"
  | "order_ops"
  | "orders";

export type BackendStateRecord = Record<string, unknown>;
export type MarketState = V2MarketState;
export type PoolState = V2PoolState;
export type TraderState = V2TraderState;
export type PositionState = V2PositionState;
export type LimitOrderState = V2OrderState;
export type LpState = V2LpState;
export type QuoteResponse = BackendStateRecord;
export type LiquidityPerformancePeriod = "7d" | "30d" | "90d" | "total";

export interface V2PageRequest {
  limit?: number | bigint | string;
  cursor?: string;
}

export interface V2AccountTradesRequest extends V2PageRequest {
  marketId?: number | bigint | string;
}

export interface V2AccountTradesResponse extends BackendStateRecord {
  type?: "v2_account_trades" | string;
  owner?: string;
  market_id?: string;
  limit?: number;
  cursor?: string;
  next_cursor?: string | null;
  trades?: BackendStateRecord[];
}

export interface V2AccountActivityResponse extends BackendStateRecord {
  type?: "v2_account_activity" | string;
  owner?: string;
  limit?: number;
  cursor?: string;
  next_cursor?: string | null;
  activities?: V2AccountActivityItemState[];
}

export interface V2LiquidityPerformanceResponse extends BackendStateRecord {
  product_kind?: "market_pool" | "cva" | string;
  product_id?: number | string;
  period?: LiquidityPerformancePeriod | string;
  sample_interval_seconds?: number;
  benchmark?: BackendStateRecord;
  summary?: BackendStateRecord;
  points?: BackendStateRecord[];
}

export interface V2StaticMetadataResponse extends BackendStateRecord {
  schema_version?: number;
  metadata_kind?: string;
  network?: string;
  artifact_hash?: string;
  current_path?: string;
  data_only?: boolean;
}

export interface V2AccountState {
  trader: TraderState;
  positions: PositionState[];
  orders: LimitOrderState[];
  lps: LpState[];
  margin: V2AccountMarginState;
}

export interface DeploymentState {
  apps?: Record<string, number | null>;
  assets?: Record<string, number | null>;
}

export interface V2SdkBootstrapState extends BackendStateRecord {
  schema_version?: number;
  network?: string;
  manifest_sha256?: string;
  app_ids?: Record<string, number>;
  app_addresses?: Record<string, string>;
  assets?: Record<string, number>;
  feature_flags?: Record<string, unknown>;
  data_only?: boolean;
}

export interface V2SdkResourcesState extends BackendStateRecord {
  schema_version?: number;
  network?: string;
  manifest_sha256?: string;
  app_ids?: Record<string, number>;
  app_addresses?: Record<string, string>;
  assets?: Record<string, number>;
  box_prefixes?: Record<string, string>;
  data_only?: boolean;
}

export interface V2MarketSummaryResponse extends BackendStateRecord {
  schema_version?: number;
  type?: "v2_market_summary" | string;
  data_only?: boolean;
  network?: string;
  manifest_sha256?: string;
  last_indexed_round?: number;
  markets?: MarketState[];
  pools?: PoolState[];
  product_catalog?: BackendStateRecord;
}

export interface V2OrderPolicyResponse extends BackendStateRecord {
  schema_version?: number;
  type?: "v2_order_policy" | string;
  data_only?: boolean;
  network?: string;
  manifest_sha256?: string;
  last_indexed_round?: number;
  order_policy?: BackendStateRecord;
}

export class PdexApiClient {
  readonly baseUrl: string;
  readonly publicArtifactBaseUrl?: string;
  readonly network?: string;
  private readonly fetchImpl: typeof fetch;
  private accountSessionToken?: string | AccountSessionTokenProvider;

  constructor(options: PdexApiClientOptions | string) {
    const config = typeof options === "string" ? undefined : options;
    this.baseUrl = trimSlash(typeof options === "string" ? options : options.baseUrl);
    this.publicArtifactBaseUrl = config?.publicArtifactBaseUrl ? trimSlash(config.publicArtifactBaseUrl) : undefined;
    this.network = config?.network?.trim() || undefined;
    this.fetchImpl = typeof options === "string" ? fetch : (options.fetchImpl ?? fetch);
    this.accountSessionToken = typeof options === "string" ? undefined : options.accountSessionToken;
  }

  setAccountSessionToken(token: string | AccountSessionTokenProvider | undefined): void {
    this.accountSessionToken = token;
  }

  async health(): Promise<{ ok: boolean }> {
    return this.get("/health");
  }

  async ready(): Promise<BackendStateRecord> {
    return this.get("/ready");
  }

  async loadProtocol(version = 2): Promise<ProtocolManifest> {
    if (Number(version) !== 2) throw new Error("PDex API client only supports the V2 protocol manifest");
    const manifest = await this.get<ProtocolManifest>(`/v${version}/protocol`);
    return setProtocolManifest(manifest, version);
  }

  async v2Markets(): Promise<MarketState[]> {
    return this.get("/v2/markets");
  }

  async v2Market(marketId: number | bigint | string): Promise<MarketState> {
    return this.get(`/v2/markets/${pathPart(marketId)}`);
  }

  async v2Pools(): Promise<PoolState[]> {
    return this.get("/v2/pools");
  }

  async v2Pool(poolId: number | bigint | string): Promise<PoolState> {
    return this.get(`/v2/pools/${pathPart(poolId)}`);
  }

  async v2PoolPerformance(
    poolId: number | bigint | string,
    period: LiquidityPerformancePeriod = "30d",
  ): Promise<V2LiquidityPerformanceResponse> {
    return this.get(`/v2/pools/${pathPart(poolId)}/performance?${queryString({ period })}`);
  }

  async v2MarketSummary(): Promise<V2MarketSummaryResponse> {
    return this.get("/v2/summary/markets");
  }

  async v2OrderPolicy(): Promise<V2OrderPolicyResponse> {
    return this.get("/v2/order-policy");
  }

  async v2StaticMetadataCurrent(kind = "resources"): Promise<V2StaticMetadataResponse> {
    return this.get(`/v2/static-metadata/${encodeURIComponent(kind)}/current`);
  }

  async v2StaticMetadataArtifact(kind: string, artifactHash: string): Promise<V2StaticMetadataResponse> {
    return this.get(
      `/v2/static-metadata/${encodeURIComponent(kind)}/${encodeURIComponent(artifactHash)}`,
    );
  }

  async deployment(network: string): Promise<DeploymentState> {
    return this.get(`/v2/networks/${encodeURIComponent(network)}/deployments`);
  }

  async v2SdkBootstrap(): Promise<V2SdkBootstrapState> {
    return this.get("/v2/sdk/bootstrap");
  }

  async v2SdkResources(): Promise<V2SdkResourcesState> {
    return this.get("/v2/sdk/resources");
  }

  async v2PriceCandles(input: PriceCandlesRequest): Promise<PriceCandlesResponse> {
    return this.get(`/v2/prices/candles?${queryString({
      marketId: input.marketId,
      period: input.period,
      limit: input.limit,
      to: input.to,
      symbol: input.symbol,
    })}`);
  }

  async v2LatestPrice(marketId: number | bigint | string): Promise<V2LatestPriceResponse> {
    const artifactKey = this.v2LatestPriceBundleArtifactKey();
    if (artifactKey) {
      const id = numericPathPart(marketId);
      const bundle = await this.getPublicArtifactJson<V2LatestPriceBundleResponse>(artifactKey);
      validatePriceEnvelopeContext(bundle, "latest-price bundle");
      const payload = id ? bundle.prices?.[id] : undefined;
      if (!payload) throw new Error(`PDex latest-price artifact has no market ${String(marketId)}`);
      validateLatestPricePayload(payload);
      return payload;
    }
    const payload = await this.get<V2LatestPriceResponse>(`/v2/prices/latest/${pathPart(marketId)}`);
    validateLatestPricePayload(payload);
    return payload;
  }

  async createAccountSession(input: AccountSessionRequest): Promise<AccountSessionResponse> {
    return this.post("/v2/auth/session", input);
  }

  async logoutAccountSession(): Promise<{ ok: boolean }> {
    return this.post("/v2/auth/logout", {});
  }

  async v2Trader(address: string): Promise<TraderState> {
    return this.get(`/v2/accounts/${encodeURIComponent(address)}`);
  }

  async v2Positions(address: string): Promise<PositionState[]> {
    return this.get(`/v2/accounts/${encodeURIComponent(address)}/positions`);
  }

  async v2Orders(owner?: string): Promise<LimitOrderState[]> {
    const query = owner ? `?owner=${encodeURIComponent(owner)}` : "";
    return this.get(`/v2/orders${query}`);
  }

  async v2Order(owner: string, ownerOrderId: number | bigint | string): Promise<LimitOrderState> {
    return this.get(`/v2/orders/${encodeURIComponent(owner)}/${pathPart(ownerOrderId)}`);
  }

  async v2AccountOrders(address: string): Promise<LimitOrderState[]> {
    return this.get(`/v2/accounts/${encodeURIComponent(address)}/orders`);
  }

  async v2AccountTrades(
    address: string,
    input: V2AccountTradesRequest = {},
  ): Promise<V2AccountTradesResponse> {
    const query = queryString({
      market_id: input.marketId,
      limit: input.limit,
      cursor: input.cursor,
    });
    return this.get(`/v2/accounts/${encodeURIComponent(address)}/trades${query ? `?${query}` : ""}`);
  }

  async v2AccountActivity(
    address: string,
    input: V2PageRequest = {},
  ): Promise<V2AccountActivityResponse> {
    const query = queryString({ limit: input.limit, cursor: input.cursor });
    return this.get(`/v2/accounts/${encodeURIComponent(address)}/activity${query ? `?${query}` : ""}`);
  }

  async v2Lps(address: string): Promise<LpState[]> {
    return this.get(`/v2/accounts/${encodeURIComponent(address)}/lps`);
  }

  async margin(address: string): Promise<V2AccountMarginState> {
    return this.v2AccountMargin(address);
  }

  async v2Account(address: string): Promise<V2AccountState> {
    const [trader, positions, orders, lps, margin] = await Promise.all([
      this.v2Trader(address),
      this.v2Positions(address),
      this.v2AccountOrders(address),
      this.v2Lps(address),
      this.v2AccountMargin(address),
    ]);
    return { trader, positions, orders, lps, margin };
  }

  async v2QuoteOpen(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/open", input);
  }

  async v2QuoteDecrease(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/decrease", input);
  }

  async v2QuoteDecreaseWithSwap(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/decrease-with-swap", input);
  }

  async v2QuoteAdjustMargin(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/adjust-margin", input);
  }

  async v2QuoteLpDeposit(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/lp-deposit", input);
  }

  async v2QuoteLpWithdraw(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/lp-withdraw", input);
  }

  async v2MarketYieldStrategies(): Promise<BackendStateRecord[]> {
    return this.get("/v2/market-yield/strategies");
  }

  async v2MarketYieldStrategy(
    marketId: number | bigint | string,
    assetId: number | bigint | string,
  ): Promise<BackendStateRecord> {
    return this.get(`/v2/market-yield/strategies/${pathPart(marketId)}/${pathPart(assetId)}`);
  }

  async v2MarketYieldObservations(): Promise<BackendStateRecord[]> {
    return this.get("/v2/market-yield/observations");
  }

  async v2MarketYieldObservation(
    marketId: number | bigint | string,
    assetId: number | bigint | string,
  ): Promise<BackendStateRecord> {
    return this.get(`/v2/market-yield/observations/${pathPart(marketId)}/${pathPart(assetId)}`);
  }

  async v2MarketYieldResourceRegistry(): Promise<BackendStateRecord> {
    return this.get("/v2/resource-registry/market-yield");
  }

  async v2MarketYieldActionRecallPlan(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/market-yield/action-recall-plan", input);
  }

  async v2MarketYieldHealth(): Promise<BackendStateRecord> {
    return this.get("/v2/market-yield/health");
  }

  async v2QuoteLpWithdrawWithSwap(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/lp-withdraw-with-swap", input);
  }

  async v2QuoteSwap(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/swap", input);
  }

  async v2QuoteSwapRoute(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/swap-route", input);
  }

  async v2QuoteLiquidation(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/liquidation", input);
  }

  async v2QuoteAdl(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/adl", input);
  }

  async v2QuoteSingleTokenLpDeposit(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/single-token/lp-deposit", input);
  }

  async v2QuoteSingleTokenLpWithdraw(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/single-token/lp-withdraw", input);
  }

  async v2QuoteSingleTokenOpen(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/single-token/open", input);
  }

  async v2QuoteSingleTokenDecrease(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/single-token/decrease", input);
  }

  async v2QuoteSingleTokenLiquidation(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/single-token/liquidation", input);
  }

  async v2QuoteSingleTokenAdl(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/quote/single-token/adl", input);
  }

  async v2QuoteOrderOpenLimit(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/orders/quote/open-limit", input);
  }

  async v2QuoteOrderDecrease(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/orders/quote/decrease", input);
  }

  async v2QuoteOrderExecute(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/orders/quote/execute", input);
  }

  async v2AnalyzeOrder(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/orders/analyze", input);
  }

  async v2CvaVaults(): Promise<BackendStateRecord[]> {
    return this.get("/v2/cva/vaults");
  }

  async v2CvaVault(vaultId: number | bigint | string): Promise<BackendStateRecord> {
    return this.get(`/v2/cva/vaults/${pathPart(vaultId)}`);
  }

  async v2CvaPerformance(
    vaultId: number | bigint | string,
    period: LiquidityPerformancePeriod = "30d",
  ): Promise<V2LiquidityPerformanceResponse> {
    return this.get(`/v2/cva/vaults/${pathPart(vaultId)}/performance?${queryString({ period })}`);
  }

  async v2CvaAllocations(vaultId: number | bigint | string): Promise<BackendStateRecord[]> {
    return this.get(`/v2/cva/vaults/${pathPart(vaultId)}/allocations`);
  }

  async v2CvaAccount(owner: string): Promise<BackendStateRecord> {
    return this.get(`/v2/cva/accounts/${encodeURIComponent(owner)}`);
  }

  async v2QuoteCvaDeposit(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/cva/quote/deposit", input);
  }

  async v2QuoteCvaWithdraw(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/cva/quote/withdraw", input);
  }

  async v2QuoteCvaWithdrawRoute(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/cva/quote/withdraw-route", input);
  }

  async v2QuoteCvaAllocate(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/cva/quote/allocate", input);
  }

  async v2QuoteCvaRebalance(input: BackendStateRecord): Promise<QuoteResponse> {
    return this.post("/v2/cva/quote/rebalance", input);
  }

  async v2AccountMargin(address: string): Promise<V2AccountMarginState> {
    return this.get(`/v2/accounts/${encodeURIComponent(address)}/margin`);
  }

  async v2OraclePayload(input: {
    marketId: number | bigint | string;
    appId?: number | bigint | string;
    target?: V2OracleTarget | string;
    assetId?: number | bigint | string;
    asset?: string;
    indexAssetId?: number | bigint | string;
    longAssetId?: number | bigint | string;
    shortAssetId?: number | bigint | string;
  }): Promise<BackendV2OraclePayload> {
    const cacheKey = this.v2OraclePayloadCacheKey(input);
    const artifactKey = this.v2OraclePayloadBundleArtifactKey();
    if (artifactKey && cacheKey) {
      try {
        const bundle = await this.getPublicArtifactJson<V2OraclePayloadBundleResponse>(artifactKey);
        validatePriceEnvelopeContext(bundle, "oracle bundle");
        const payload = bundle.payloads?.[cacheKey];
        if (!payload) throw new Error(`PDex oracle artifact has no payload ${cacheKey}`);
        validateBackendV2OraclePayload(payload);
        return payload;
      } catch (artifactError) {
        try {
          return await this.getV2OraclePayloadFromBackend(input);
        } catch (backendError) {
          throw oracleTransportError(artifactError, backendError);
        }
      }
    }
    return this.getV2OraclePayloadFromBackend(input);
  }

  private async getV2OraclePayloadFromBackend(input: Parameters<PdexApiClient["v2OraclePayload"]>[0]): Promise<BackendV2OraclePayload> {
    const payload = await this.get<BackendV2OraclePayload>(`/v2/oracle/${pathPart(input.marketId)}?${queryString({
      oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
      price_scale: ORACLE_PRICE_SCALE,
      app_id: input.appId,
      target: input.target,
      asset_id: input.assetId,
      asset: input.asset,
      index_asset_id: input.indexAssetId,
      long_asset_id: input.longAssetId,
      short_asset_id: input.shortAssetId,
    })}`);
    validateBackendV2OraclePayload(payload);
    return payload;
  }

  async v2OracleArgs(input: Parameters<PdexApiClient["v2OraclePayload"]>[0]): Promise<OraclePayload> {
    const { oraclePayloadFromBackend } = await import("./oracle.js");
    return oraclePayloadFromBackend(await this.v2OraclePayload(input));
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: await this.headers(),
    });
    if (!response.ok) throw new Error(`PDex backend ${path} failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: { ...(await this.headers()), "content-type": "application/json" },
      body: JSON.stringify(payload, (_key, value) => (typeof value === "bigint" ? value.toString() : value)),
    });
    if (!response.ok) throw new Error(`PDex backend ${path} failed: ${response.status} ${await response.text()}`);
    return response.json() as Promise<T>;
  }

  private async getPublicArtifactJson<T>(key: string): Promise<T> {
    const response = await this.fetchImpl(`${this.publicArtifactBaseUrl}/${key}`, {
      headers: { accept: "application/json" },
      cache: key.endsWith("/current.json") ? "no-store" : "default",
    });
    if (!response.ok) {
      throw new Error(`PDex public artifact ${key} failed: ${response.status} ${await response.text()}`);
    }
    return response.json() as Promise<T>;
  }

  private v2LatestPriceBundleArtifactKey(): string | undefined {
    if (!this.publicArtifactBaseUrl || !this.network) return undefined;
    return `v2/latest-prices/${encodeURIComponent(this.network)}/current.json`;
  }

  private v2OraclePayloadBundleArtifactKey(): string | undefined {
    if (!this.publicArtifactBaseUrl || !this.network) return undefined;
    return `v2/oracle-payloads/${encodeURIComponent(this.network)}/current.json`;
  }

  private v2OraclePayloadCacheKey(input: Parameters<PdexApiClient["v2OraclePayload"]>[0]): string | undefined {
    if (!this.publicArtifactBaseUrl || !this.network || input.appId === undefined) return undefined;
    const appId = numericPathPart(input.appId);
    if (!appId) return undefined;
    const marketId = positiveNumber(input.marketId);
    let subject: string | undefined;
    if (marketId > 0) {
      subject = `market-${marketId}`;
    } else {
      const assetId = positiveNumber(input.assetId) || positiveNumber(input.indexAssetId) || positiveNumber(input.longAssetId);
      if (assetId > 0) {
        subject = `asset-${assetId}`;
      } else if (input.asset !== undefined && String(input.asset).trim()) {
        subject = `symbol-${normalizeArtifactSymbol(String(input.asset))}`;
      }
    }
    if (!subject) return undefined;
    return `app-${appId}/${subject}`;
  }

  private async headers(): Promise<Record<string, string>> {
    const headers: Record<string, string> = { accept: "application/json" };
    const tokenProvider = this.accountSessionToken;
    const token = typeof tokenProvider === "function" ? await tokenProvider() : tokenProvider;
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
  }
}

export function createPdexApiClient(options: PdexApiClientOptions | string): PdexApiClient {
  return new PdexApiClient(options);
}

export function buildAccountSessionMessage(input: AccountSessionMessageInput): string {
  return canonicalJsonString({
    address: input.address,
    audience: input.audience ?? "pdex-public-api",
    expires_at: Math.trunc(input.expiresAt),
    genesis_hash: input.genesisHash,
    genesis_id: input.genesisId,
    issued_at: Math.trunc(input.issuedAt),
    network: input.network,
    nonce: input.nonce,
    origin: input.origin,
    protocol: "PDex",
    purpose: "account:read",
    scopes: [...(input.scopes ?? ["account:read"])],
    version: 1,
  });
}

const ORACLE_RAW_PRICE_FIELDS = [
  "index_price_min",
  "index_price_max",
  "long_price_min",
  "long_price_max",
  "short_price_min",
  "short_price_max",
] as const;

const LATEST_RAW_PRICE_FIELDS = [
  ...ORACLE_RAW_PRICE_FIELDS,
  "index_price",
  "long_price",
  "short_price",
] as const;

export function validateBackendV2OraclePayload(payload: BackendV2OraclePayload): void {
  validatePriceEnvelopeContext(payload, "oracle payload");
  for (const field of ORACLE_RAW_PRICE_FIELDS) validateRawPriceString(payload[field], field);
}

export function validateLatestPricePayload(payload: V2LatestPriceResponse): void {
  validatePriceEnvelopeContext(payload, "latest-price payload");
  for (const field of LATEST_RAW_PRICE_FIELDS) {
    const value = payload[field];
    if (value !== undefined) validateRawPriceString(value, field);
  }
}

function validatePriceEnvelopeContext(
  payload: { oracle_message_version?: unknown; price_scale?: unknown },
  label: string,
): void {
  if (Number(payload.oracle_message_version ?? 0) !== V2_ORACLE_MESSAGE_VERSION) {
    throw new Error(`${label} oracle_message_version mismatch`);
  }
  if (BigInt(String(payload.price_scale ?? 0)) !== ORACLE_PRICE_SCALE) {
    throw new Error(`${label} price_scale mismatch`);
  }
}

function validateRawPriceString(value: unknown, field: string): void {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) {
    throw new TypeError(`${field} must be a canonical decimal string`);
  }
  validateRawPrice12(value);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function pathPart(value: number | bigint | string): string {
  return encodeURIComponent(String(value));
}

function queryString(values: Record<string, number | bigint | string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) params.set(key, String(value));
  }
  return params.toString();
}

function positiveNumber(value: number | bigint | string | undefined): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function numericPathPart(value: number | bigint | string): string | undefined {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return undefined;
  return String(parsed);
}

function normalizeArtifactSymbol(value: string): string {
  return encodeURIComponent(value.trim().toLowerCase().replace(/\s+/g, "-").replace(/\//g, "-"));
}

function oracleTransportError(artifactError: unknown, backendError: unknown): Error {
  return new Error(
    "PDex signed oracle payload is unavailable from both the public artifact and backend",
    { cause: new AggregateError([artifactError, backendError], "PDex oracle transports failed") },
  );
}

function canonicalJsonString(value: unknown): string {
  return JSON.stringify(canonicalJsonValue(value));
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries) result[key] = canonicalJsonValue(item);
    return result;
  }
  return value;
}
