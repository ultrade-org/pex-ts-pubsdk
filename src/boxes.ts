import { decodeAddress, encodeAddress } from "algosdk";
import { loadManifest, type ProtocolManifest } from "./manifest.js";
import { concat, uint64Bytes } from "./codec.js";
import { decodeV2PendingImpactQty, V2_SIGNED_QTY_BIAS } from "./constants.js";

export type AddressLike = string | Uint8Array;
export type Uint64Like = number | bigint | string;
export { decodeV2PendingImpactQty, V2_SIGNED_QTY_BIAS } from "./constants.js";

export const V2_MARKET_CORE_SCHEMA_VERSION = 3n;
export const V2_ORACLE_TO_USD_SCALE = 1_000_000n;
export const V2_ALLOWED_POSITION_TOKEN_SCALES = Object.freeze(
  Array.from({ length: 13 }, (_, exponent) => 10n ** BigInt(exponent)),
);

export function accountBytes(value: AddressLike): Uint8Array {
  if (value instanceof Uint8Array) {
    if (value.byteLength !== 32) throw new Error("account bytes must be 32 bytes");
    return value;
  }
  const raw = /^[0-9a-fA-F]{64}$/.test(value)
    ? hexToBytes(value)
    : /^[A-Z2-7]{58}$/.test(value)
      ? decodeAddress(value).publicKey
      : base64ToBytes(value);
  if (raw.byteLength !== 32) throw new Error("account string must decode to 32 bytes");
  return new Uint8Array(raw);
}

export function v2MarketCoreBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("m2:"), uint64Bytes(bigint(marketId))]);
}

export function v2MarketRiskBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("mr2:"), uint64Bytes(bigint(marketId))]);
}

export function v2DynamicOiMarginBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("doi:"), uint64Bytes(bigint(marketId))]);
}

export function v2MarketPoolBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("mp2:"), uint64Bytes(bigint(marketId))]);
}

export function v2MarketOpenInterestBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("mo2:"), uint64Bytes(bigint(marketId))]);
}

export function v2MarketFundingBorrowingBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("mf2:"), uint64Bytes(bigint(marketId))]);
}

export function v2MarketAdaptiveFundingBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("ma2:"), uint64Bytes(bigint(marketId))]);
}

export function v2VirtualPositionInventoryBoxKey(indexAssetId: Uint64Like): Uint8Array {
  return concat([ascii("vi2:"), uint64Bytes(bigint(indexAssetId))]);
}

export function v2LpBoxKey(owner: AddressLike, marketId: Uint64Like): Uint8Array {
  return concat([ascii("ml2:"), uint64Bytes(bigint(marketId)), accountBytes(owner)]);
}

export function v2TraderBoxKey(owner: AddressLike): Uint8Array {
  return concat([ascii("t2:"), accountBytes(owner)]);
}

export function v2PositionBoxKey(
  owner: AddressLike,
  marketId: Uint64Like,
  collateralAssetId: Uint64Like,
  side: Uint64Like,
): Uint8Array {
  return concat([
    ascii("p2:"),
    uint64Bytes(bigint(marketId)),
    uint64Bytes(bigint(collateralAssetId)),
    uint64Bytes(bigint(side)),
    accountBytes(owner),
  ]);
}

export function v2OrderBoxKey(owner: AddressLike, orderId: Uint64Like): Uint8Array {
  return concat([ascii("o2:"), accountBytes(owner), uint64Bytes(bigint(orderId))]);
}

export function v2CvaUserBoxKey(owner: AddressLike): Uint8Array {
  return concat([ascii("gu2:"), accountBytes(owner)]);
}

export function v2CvaMarketAllocationBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("gm2:"), uint64Bytes(bigint(marketId))]);
}

export function v2YieldStorageKey(marketId: Uint64Like, assetId: Uint64Like): Uint8Array {
  return concat([uint64Bytes(bigint(marketId)), uint64Bytes(bigint(assetId))]);
}

export function v2MarketYieldBoxKey(marketId: Uint64Like, assetId: Uint64Like): Uint8Array {
  return concat([ascii("my2:"), v2YieldStorageKey(marketId, assetId)]);
}

export function v2MarketYieldStrategyConfigBoxKey(marketId: Uint64Like, assetId: Uint64Like): Uint8Array {
  return concat([ascii("yc2:"), v2YieldStorageKey(marketId, assetId)]);
}

export function v2MarketYieldStrategyRuntimeBoxKey(marketId: Uint64Like, assetId: Uint64Like): Uint8Array {
  return concat([ascii("yr2:"), v2YieldStorageKey(marketId, assetId)]);
}

export function v2MarketXalgoStrategyConfigBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("mxac:"), uint64Bytes(bigint(marketId))]);
}

export function v2MarketXalgoStrategyRuntimeBoxKey(marketId: Uint64Like): Uint8Array {
  return concat([ascii("mxar:"), uint64Bytes(bigint(marketId))]);
}

export function parseUint64Struct(data: Uint8Array, fields: string[]): Record<string, bigint> {
  if (data.byteLength !== fields.length * 8) {
    throw new Error(`struct expects ${fields.length * 8} bytes`);
  }
  const out: Record<string, bigint> = {};
  fields.forEach((field, index) => {
    out[field] = new DataView(data.buffer, data.byteOffset + index * 8, 8).getBigUint64(0);
  });
  return out;
}

export type V2BoxFieldValue = bigint | string | Uint8Array;

export interface V2OrderStateV3 {
  /** Stored order schema version. */
  schema_version: bigint;
  /** Open-limit, take-profit, or stop-loss order kind. */
  order_kind: bigint;
  /** Pair or single-token Trading target. */
  target_kind: bigint;
  /** Market whose position the order changes. */
  market_id: bigint;
  /** Owner-scoped order identifier. */
  owner_order_id: bigint;
  /** Long or short position side. */
  side: bigint;
  /** Token held as position collateral. */
  collateral_asset_id: bigint;
  /** Requested USD position-size change; zero means full resting close. */
  size_usd_delta: bigint;
  /** Gross collateral escrowed for an open order. */
  collateral_amount: bigint;
  /** Oracle trigger price for resting execution. */
  trigger_price: bigint;
  /** User-signed execution-price bound. */
  acceptable_price: bigint;
  /** Asset used to compensate the executing keeper. */
  keeper_fee_asset_id: bigint;
  /** Keeper compensation escrowed with the order. */
  keeper_fee_amount: bigint;
  /** Optional close-output swap selection. */
  output_swap_mode: bigint;
  /** Minimum accepted primary output after all fees. */
  min_primary_output_amount: bigint;
  /** Minimum accepted secondary output after all fees. */
  min_secondary_output_amount: bigint;
  /** Optional order expiry timestamp. */
  expiry_time: bigint;
  /** Timestamp at which the order was created. */
  created_at: bigint;
  /** Time-in-force and linked-order state flags. */
  flags: bigint;
  /** User-authorized account that receives any paid builder fee. */
  builder_address: string;
  /** User-authorized builder fee rate in basis points. */
  builder_fee_bps: bigint;
}

export interface V2OrderStateV4 extends V2OrderStateV3 {
  /** Bound lifetime for active protection; waiting entries remain unbound. */
  position_id: bigint;
}
export type V2DecodedOrderState = V2OrderStateV3 | V2OrderStateV4;

export function parseTypedStruct(
  data: Uint8Array,
  fields: Array<{ name: string; type?: string; size?: number }>,
): Record<string, any> {
  const expected = fields.reduce(
    (total, field) => total + Number(field.size ?? ({address: 32, uint48: 6, uint16: 2}[field.type ?? "uint64"] ?? 8)),
    0,
  );
  if (data.byteLength !== expected) throw new Error(`struct expects ${expected} bytes`);
  const out: Record<string, V2BoxFieldValue> = {};
  let offset = 0;
  for (const field of fields) {
    const fieldType = field.type ?? "uint64";
    const size = Number(field.size ?? ({address: 32, uint48: 6, uint16: 2}[fieldType] ?? 8));
    const raw = data.slice(offset, offset + size);
    offset += size;
    if (fieldType === "uint64" || fieldType === "uint48" || fieldType === "uint16") {
      const width = {uint64: 8, uint48: 6, uint16: 2}[fieldType];
      if (size !== width) throw new Error(`${fieldType} field ${field.name} must be ${width} bytes`);
      let value = 0n;
      for (const byte of raw) value = (value << 8n) | BigInt(byte);
      out[field.name] = value;
    } else if (fieldType === "address") {
      if (size !== 32) throw new Error(`address field ${field.name} must be 32 bytes`);
      out[field.name] = encodeAddress(raw);
    } else {
      out[field.name] = raw;
    }
  }
  return out;
}

export function parseBoxState(
  valueType: string,
  data: Uint8Array,
  manifest: ProtocolManifest = loadManifest(),
): Record<string, any> {
  let fields = manifest.boxes.structs?.[valueType];
  if (!fields) {
    const format = Object.values<any>(manifest.boxes.formats ?? {}).find((item: any) => item.value_type === valueType);
    fields = format?.fields;
  }
  if (!fields) throw new Error(`unknown box value type: ${valueType}`);
  return parseTypedStruct(data, fields);
}

export function parseV2OrderState(
  data: Uint8Array,
  manifest: ProtocolManifest = loadManifest(undefined, 2),
): V2DecodedOrderState {
  return parseV2BoxState("order_state", data, manifest) as unknown as V2DecodedOrderState;
}

export function parseV2BoxState(
  boxFormat: string,
  data: Uint8Array,
  manifest: ProtocolManifest = loadManifest(undefined, 2),
): Record<string, any> {
  let fields = manifest.boxes.formats[boxFormat]?.fields;
  if (!fields) throw new Error(`unknown V2 box format: ${boxFormat}`);
  if (boxFormat === "order_state" && data.byteLength === 192 && fields.at(-1)?.name === "position_id") {
    fields = fields.slice(0, -1);
  }
  const parsed = parseTypedStruct(data, fields);
  if (boxFormat === "order_state") {
    const expectedSchema = data.byteLength === 192 ? 3n : data.byteLength === 200 ? 4n : undefined;
    if (expectedSchema === undefined || parsed.schema_version !== expectedSchema) throw new Error("order schema/length mismatch");
    if (parsed.position_id !== undefined && parsed.position_id >= 1n << 48n) throw new Error("position id out of range");
  }
  return parsed;
}

export function parseV2MarketCoreState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  const parsed = parseV2BoxState("market_core", data, manifest ?? loadManifest(undefined, 2));
  if (parsed.schema_version !== V2_MARKET_CORE_SCHEMA_VERSION) {
    throw new Error("unsupported V2 market core schema");
  }
  return {
    ...(parsed as Record<string, bigint>),
    ...positionScalesFromConversionScale(parsed.position_conversion_scale as bigint),
  };
}

export function positionScalesFromConversionScale(
  positionConversionScale: Uint64Like,
): Record<"position_token_scale" | "position_conversion_scale", bigint> {
  const conversionScale = strictUint64(positionConversionScale, "position conversion scale");
  if (conversionScale === 0n || conversionScale % V2_ORACLE_TO_USD_SCALE !== 0n) {
    throw new Error("invalid market position conversion scale");
  }
  const tokenScale = conversionScale / V2_ORACLE_TO_USD_SCALE;
  if (!V2_ALLOWED_POSITION_TOKEN_SCALES.includes(tokenScale)) {
    throw new Error("invalid market position token scale");
  }
  return {
    position_token_scale: tokenScale,
    position_conversion_scale: conversionScale,
  };
}

export function readV2MarketPositionScales(
  market: Record<string, unknown>,
): Record<"position_token_scale" | "position_conversion_scale", bigint> {
  const value = market.position_conversion_scale ?? market.positionConversionScale;
  if (value === undefined || value === null) throw new Error("market position conversion scale is required");
  return positionScalesFromConversionScale(value as Uint64Like);
}

export function parseV2MarketRiskState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_risk", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketPoolState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_pool", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketOpenInterestState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_open_interest", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketFundingBorrowingState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_funding_borrowing", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketAdaptiveFundingState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  const parsed = parseV2BoxState("market_adaptive_funding", data, manifest ?? loadManifest(undefined, 2));
  if (parsed.schema_version !== 3n) {
    throw new Error("unsupported V2 adaptive funding schema");
  }
  const share = parsed.opposing_trader_share_bps;
  if (share === undefined || share < 0n || share > 10_000n) {
    throw new Error("invalid opposing trader share");
  }
  return parsed;
}

export function parseV2LpState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("lp_state", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2TraderState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("trader_state", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2PositionState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  const parsed = parseV2BoxState("position_state", data, manifest ?? loadManifest(undefined, 2));
  return { ...parsed, ...decodeV2PendingImpactQty(parsed.pending_impact_qty_signed ?? V2_SIGNED_QTY_BIAS) };
}

export function parseV2CvaUserState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("cva_user_state", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2CvaMarketAllocationState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("cva_market_allocation", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketYieldState(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_yield_state", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketYieldStrategyConfig(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_yield_strategy_config", data, manifest ?? loadManifest(undefined, 2));
}

export function parseV2MarketYieldStrategyRuntime(data: Uint8Array, manifest?: ProtocolManifest): Record<string, bigint> {
  return parseV2BoxState("market_yield_strategy_runtime", data, manifest ?? loadManifest(undefined, 2));
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hexToBytes(value: string): Uint8Array {
  if (value.length % 2 !== 0) throw new Error("hex string must have even length");
  const out = new Uint8Array(value.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function base64ToBytes(value: string): Uint8Array {
  const maybeBuffer = (globalThis as any).Buffer;
  if (maybeBuffer) return new Uint8Array(maybeBuffer.from(value, "base64"));
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

function bigint(value: Uint64Like): bigint {
  return typeof value === "bigint" ? value : BigInt(value);
}

function strictUint64(value: Uint64Like, name: string): bigint {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new TypeError(`${name} number must be a safe integer; use bigint or decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= 2n ** 64n) throw new RangeError(`${name} is outside uint64`);
  return parsed;
}
