import { waitForConfirmation, type Transaction } from "algosdk";
import {
  buildAccountSessionMessage,
  createPdexApiClient,
  type AccountSessionResponse,
  type DeploymentState,
  type PdexApiClient,
  type PdexApiClientOptions,
  type V2MarketSummaryResponse,
  type V2SdkBootstrapState,
  type V2SdkResourcesState,
} from "./api.js";
import {
  deploymentAppIds,
  deploymentAssets,
  normalizeDeploymentManifest,
  type ProtocolManifest,
} from "./manifest.js";
import {
  normalizeV2MarketSummary,
  type PdexMarket,
  type PdexMarketSummary,
} from "./readModels.js";
import { decodeReceiptFromConfirmation, type Receipt } from "./receipts.js";
import {
  v2TransactionGroupResult,
  type PdexV2AppRefs,
  type V2MarketAssetRefs,
  type V2TransactionGroupResult,
} from "./transactions.js";

export interface LoadPdexContextOptions extends PdexApiClientOptions {
  network: string;
}

export interface PdexContext {
  client: PdexApiClient;
  protocol: ProtocolManifest;
  deployment: DeploymentState;
  bootstrap: V2SdkBootstrapState;
  resources: V2SdkResourcesState;
  marketSummary: V2MarketSummaryResponse;
  appIds: Record<string, number>;
  assets: Record<string, number>;
  appRefs: PdexV2AppRefs;
  markets: PdexMarket[];
  pools: PdexMarketSummary["pools"];
  catalog: PdexMarketSummary["catalog"];
  indexedRound?: number;
}

export async function loadPdexContext(options: LoadPdexContextOptions): Promise<PdexContext> {
  const client = createPdexApiClient(options);
  const protocol = await client.loadProtocol();
  const [deployment, bootstrap, resources, marketSummary] = await Promise.all([
    client.deployment(options.network),
    client.v2SdkBootstrap(),
    client.v2SdkResources(),
    client.v2MarketSummary(),
  ]);
  const normalizedDeployment = normalizeDeploymentManifest(deployment);
  const appIds = compactIdMap(
    deploymentAppIds(normalizedDeployment),
    bootstrap.app_ids,
    resources.app_ids,
  );
  const assets = compactIdMap(
    deploymentAssets(normalizedDeployment),
    bootstrap.assets,
    resources.assets,
  );
  const normalizedSummary = normalizeV2MarketSummary(marketSummary);
  return {
    client,
    protocol,
    deployment,
    bootstrap,
    resources,
    marketSummary,
    appIds,
    assets,
    appRefs: resolvePdexV2AppRefs(appIds, protocol),
    markets: normalizedSummary.markets,
    pools: normalizedSummary.pools,
    catalog: normalizedSummary.catalog,
    indexedRound: normalizedSummary.indexedRound,
  };
}

export function resolvePdexV2AppRefs(
  appIds: Record<string, number>,
  manifest?: ProtocolManifest,
): PdexV2AppRefs {
  return {
    v2MarketsAppId: requiredAppId(appIds, "PDexV2Markets"),
    v2TradingAppId: requiredAppId(appIds, "PDexV2Trading"),
    v2AdminControlAppId: optionalAppId(appIds, "PDexV2AdminControl", "PDexV2Admin"),
    v2AdminOpsAppId: optionalAppId(appIds, "PDexV2AdminOps"),
    v2TradingRiskOpsAppId: optionalAppId(appIds, "PDexV2TradingRiskOps"),
    v2MarketXalgoYieldVaultAppId: optionalAppId(appIds, "PDexV2MarketXAlgoYieldVault"),
    v2MathAppId: optionalAppId(appIds, "PDexV2Math"),
    manifest,
  };
}

export function pdexMarketAssetRefs(
  market: Pick<PdexMarket, "indexAssetId" | "longAssetId" | "shortAssetId">,
): V2MarketAssetRefs {
  return {
    indexAssetId: market.indexAssetId,
    longAssetId: market.longAssetId,
    shortAssetId: market.shortAssetId,
  };
}

export interface AuthorizePdexAccountInput {
  client: PdexApiClient;
  address: string;
  network: string;
  genesisId: string;
  genesisHash: string;
  origin: string;
  signMessage: (message: Uint8Array) => Uint8Array | string | Promise<Uint8Array | string>;
  audience?: string;
  scopes?: readonly string[];
  nonce?: string;
  issuedAt?: number;
  lifetimeSeconds?: number;
}

export interface AuthorizedPdexAccount {
  message: string;
  session: AccountSessionResponse;
}

export async function authorizePdexAccount(
  input: AuthorizePdexAccountInput,
): Promise<AuthorizedPdexAccount> {
  const issuedAt = input.issuedAt ?? Math.floor(Date.now() / 1_000);
  const lifetimeSeconds = input.lifetimeSeconds ?? 60;
  if (!Number.isSafeInteger(issuedAt) || issuedAt <= 0) throw new Error("issuedAt must be a positive Unix timestamp");
  if (!Number.isSafeInteger(lifetimeSeconds) || lifetimeSeconds <= 0 || lifetimeSeconds > 300) {
    throw new Error("lifetimeSeconds must be between 1 and 300");
  }
  const message = buildAccountSessionMessage({
    address: input.address,
    network: input.network,
    genesisId: input.genesisId,
    genesisHash: input.genesisHash,
    origin: input.origin,
    nonce: input.nonce ?? secureRandomHex(16),
    issuedAt,
    expiresAt: issuedAt + lifetimeSeconds,
    audience: input.audience,
    scopes: input.scopes,
  });
  const signature = await input.signMessage(new TextEncoder().encode(message));
  const session = await input.client.createAccountSession({
    address: input.address,
    message,
    signature: typeof signature === "string" ? signature : bytesToBase64(signature),
  });
  if (session.session_token) input.client.setAccountSessionToken(session.session_token);
  return { message, session };
}

export type PdexSubmitPhase = "signing" | "submitting" | "confirming" | "confirmed" | "failed";

export interface PdexSubmitProgress {
  phase: PdexSubmitPhase;
  txId?: string;
  error?: unknown;
}

export interface PdexAlgodSubmitClient {
  sendRawTransaction(signedTransactions: Uint8Array[] | Uint8Array): { do(): Promise<unknown> };
  pendingTransactionInformation(txId: string): { do(): Promise<unknown> };
  status(): { do(): Promise<unknown> };
  statusAfterBlock(round: number | bigint): { do(): Promise<unknown> };
}

export interface SubmitPdexTransactionGroupInput {
  transactions: Transaction[];
  algod: PdexAlgodSubmitClient;
  signTransactions: (transactions: Transaction[], indexes: number[]) => unknown[] | Promise<unknown[]>;
  waitRounds?: number;
  onProgress?: (progress: PdexSubmitProgress) => void | Promise<void>;
}

export interface SubmittedPdexTransactionGroup {
  txId: string;
  confirmedRound?: number;
  receipt?: Receipt;
  confirmation: Record<string, unknown>;
  group: V2TransactionGroupResult;
}

export async function submitPdexTransactionGroup(
  input: SubmitPdexTransactionGroupInput,
): Promise<SubmittedPdexTransactionGroup> {
  const group = v2TransactionGroupResult(input.transactions);
  const txId = group.transactions[group.primaryIndex].txID();
  try {
    await input.onProgress?.({ phase: "signing", txId });
    const signedValues = await input.signTransactions(
      group.transactions,
      group.transactions.map((_, index) => index),
    );
    const signed = signedValues
      .map(normalizeSignedTransactionBytes)
      .filter((value): value is Uint8Array => value !== undefined);
    if (signed.length !== group.transactions.length) {
      throw new Error(`wallet returned ${signed.length} signed transactions for a ${group.transactions.length}-transaction group`);
    }
    await input.onProgress?.({ phase: "submitting", txId });
    await input.algod.sendRawTransaction(signed).do();
    await input.onProgress?.({ phase: "confirming", txId });
    const confirmation = await waitForConfirmation(input.algod as never, txId, input.waitRounds ?? 6)
      .then((value) => value as unknown as Record<string, unknown>);
    const result = {
      txId,
      confirmedRound: confirmationRound(confirmation),
      receipt: decodeReceiptFromConfirmation(confirmation),
      confirmation,
      group,
    };
    await input.onProgress?.({ phase: "confirmed", txId });
    return result;
  } catch (error) {
    await input.onProgress?.({ phase: "failed", txId, error });
    throw error;
  }
}

export function normalizeSignedTransactionBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item) && item >= 0 && item <= 255)) {
    return Uint8Array.from(value);
  }
  if (typeof value === "string") return encodedStringToBytes(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["stxn", "signedTxn", "signedTransaction", "blob", "bytes"]) {
      const nested = normalizeSignedTransactionBytes(record[key]);
      if (nested) return nested;
    }
  }
  return undefined;
}

function compactIdMap(...sources: Array<Record<string, number | null | undefined> | undefined>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const source of sources) {
    for (const [name, value] of Object.entries(source ?? {})) {
      const id = Number(value ?? 0);
      if (Number.isSafeInteger(id) && id > 0) result[name] = id;
    }
  }
  return result;
}

function requiredAppId(appIds: Record<string, number>, name: string): number {
  const id = optionalAppId(appIds, name);
  if (!id) throw new Error(`PDex deployment is missing ${name}`);
  return id;
}

function optionalAppId(appIds: Record<string, number>, ...names: string[]): number | undefined {
  for (const name of names) {
    const id = Number(appIds[name] ?? 0);
    if (Number.isSafeInteger(id) && id > 0) return id;
  }
  return undefined;
}

function secureRandomHex(length: number): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error("secure random generation is unavailable");
  const value = new Uint8Array(length);
  globalThis.crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < value.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...value.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function encodedStringToBytes(value: string): Uint8Array | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (/^0x[0-9a-f]+$/i.test(trimmed) && trimmed.length % 2 === 0) {
    return Uint8Array.from({ length: (trimmed.length - 2) / 2 }, (_, index) =>
      Number.parseInt(trimmed.slice(index * 2 + 2, index * 2 + 4), 16));
  }
  if (trimmed.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return undefined;
  try {
    const binary = atob(trimmed);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function confirmationRound(confirmation: Record<string, unknown>): number | undefined {
  const value = confirmation["confirmed-round"] ?? confirmation.confirmedRound;
  const round = Number(value);
  return Number.isSafeInteger(round) && round > 0 ? round : undefined;
}
