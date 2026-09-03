import { decodeAddress, encodeAddress } from "algosdk";
import { concat, readUint64, uint64Bytes } from "./codec.js";
import { loadManifest } from "./manifest.js";
export { concat, readUint64, uint64Bytes } from "./codec.js";

const UINT64_SIZE = 8;
const ADDRESS_SIZE = 32;

export interface Receipt {
  eventVersion: bigint;
  eventType: string;
  eventTypeId: bigint;
  flags: bigint;
  fields: Record<string, bigint | string>;
}

export function encodeReceipt(
  eventType: string | number | bigint,
  flags: number | bigint,
  fields: Record<string, number | bigint | string | Uint8Array>,
  manifest = loadManifest(),
): Uint8Array {
  const event = eventInfo(eventType, manifest);
  const chunks = [
    uint64Bytes(BigInt(manifest.receipts.version)),
    uint64Bytes(event.id),
    uint64Bytes(BigInt(flags)),
  ];
  for (const field of event.fields) {
    if (!(field in fields)) {
      throw new Error(`missing receipt field: ${field}`);
    }
    chunks.push(encodeReceiptField(manifest, event.name, field, fields[field]));
  }
  return concat(chunks);
}

export function decodeReceipt(data: Uint8Array, manifest = loadManifest()): Receipt {
  return decodeReceiptWithOptions(data, { manifest });
}

export function decodeReceiptFromConfirmation(
  confirmation: Record<string, unknown>,
  manifest = loadManifest(),
): Receipt | undefined {
  const logs = confirmation.logs;
  if (!Array.isArray(logs)) return undefined;
  for (const value of [...logs].reverse()) {
    const raw = receiptLogBytes(value);
    if (!raw) continue;
    for (const candidate of receiptLogCandidates(raw)) {
      try {
        return decodeReceipt(candidate, manifest);
      } catch {
        // A transaction may contain unrelated logs before the PDex receipt.
      }
    }
  }
  return undefined;
}

export function decodeReceiptWithOptions(
  data: Uint8Array,
  options: { manifest?: any; appName?: string } = {},
): Receipt {
  const manifest = options.manifest ?? loadManifest();
  if (data.byteLength < 24) {
    throw new Error("receipt too short");
  }
  const eventVersion = readUint64(data, 0);
  const eventTypeId = readUint64(data, UINT64_SIZE);
  const flags = readUint64(data, 2 * UINT64_SIZE);
  if (eventVersion !== BigInt(manifest.receipts.version)) {
    throw new Error(`unsupported receipt version: ${eventVersion}`);
  }
  const fieldPayload = data.slice(3 * UINT64_SIZE);
  const event = eventInfo(eventTypeId, manifest, undefined, options.appName, fieldPayload.byteLength);
  const fieldValues = decodeReceiptFields(manifest, event.name, fieldPayload);
  if (fieldValues.length !== event.fields.length) {
    throw new Error(`${event.name} expects ${event.fields.length} fields`);
  }
  const fields: Record<string, bigint | string> = {};
  event.fields.forEach((field: string, index: number) => {
    fields[field] = fieldValues[index];
  });
  return { eventVersion, eventType: event.name, eventTypeId, flags, fields };
}

export function hasFlag(receipt: Receipt, flagName: string, manifest = loadManifest()): boolean {
  return (receipt.flags & BigInt(manifest.receipts.flags[flagName])) !== 0n;
}

function eventInfo(
  eventType: string | number | bigint,
  manifest: any,
  fieldCount?: number,
  appName?: string,
  fieldPayloadSize?: number,
): any {
  if (typeof eventType === "string") {
    const event = manifest.receipts.types[eventType];
    return { name: eventType, id: BigInt(event.id), fields: event.fields };
  }
  const id = BigInt(eventType);
  const candidates: any[] = [];
  for (const [name, event] of Object.entries<any>(manifest.receipts.types)) {
    if (BigInt(event.id) === id) {
      candidates.push({ name, id, fields: event.fields, app: event.app });
    }
  }
  const filtered = candidates.filter((event) => {
    if (fieldCount !== undefined && event.fields.length !== fieldCount) return false;
    if (fieldPayloadSize !== undefined && eventPayloadSize(manifest, event.name) !== fieldPayloadSize) return false;
    if (appName && event.app && event.app !== appName && !receiptAppAlias(appName, event.app, event.name)) return false;
    return true;
  });
  if (filtered.length === 1) return filtered[0];
  if (filtered.length > 1) return filtered[0];
  throw new Error(`unknown receipt event type: ${eventType}`);
}

function receiptFieldType(manifest: any, eventName: string, fieldName: string): string {
  return manifest.receipts.types[eventName].field_types?.[fieldName] ?? "uint64";
}

function receiptFieldSize(fieldType: string): number {
  return fieldType === "address" ? ADDRESS_SIZE : UINT64_SIZE;
}

function eventPayloadSize(manifest: any, eventName: string): number {
  const event = manifest.receipts.types[eventName];
  return event.fields.reduce(
    (total: number, fieldName: string) => total + receiptFieldSize(receiptFieldType(manifest, eventName, fieldName)),
    0,
  );
}

function encodeReceiptField(
  manifest: any,
  eventName: string,
  fieldName: string,
  value: number | bigint | string | Uint8Array,
): Uint8Array {
  const fieldType = receiptFieldType(manifest, eventName, fieldName);
  if (fieldType === "address") {
    if (value instanceof Uint8Array) {
      if (value.byteLength !== ADDRESS_SIZE) throw new Error(`receipt address field must be 32 bytes: ${fieldName}`);
      return value;
    }
    return decodeAddress(String(value)).publicKey;
  }
  if (value instanceof Uint8Array) {
    throw new Error(`receipt uint64 field cannot be raw bytes: ${fieldName}`);
  }
  return uint64Bytes(BigInt(value));
}

function decodeReceiptFields(manifest: any, eventName: string, payload: Uint8Array): Array<bigint | string> {
  const values: Array<bigint | string> = [];
  let offset = 0;
  for (const fieldName of manifest.receipts.types[eventName].fields) {
    const fieldType = receiptFieldType(manifest, eventName, fieldName);
    const size = receiptFieldSize(fieldType);
    const raw = payload.slice(offset, offset + size);
    if (raw.byteLength !== size) throw new Error(`${eventName} has truncated field ${fieldName}`);
    values.push(fieldType === "address" ? encodeAddress(raw) : readUint64(raw, 0));
    offset += size;
  }
  if (offset !== payload.byteLength) throw new Error(`${eventName} has trailing receipt bytes`);
  return values;
}

function receiptAppAlias(appName: string, eventApp: string, eventName: string): boolean {
  if (
    appName === "PDexV2MarketXAlgoYieldVault"
    && eventApp === "PDexV2MarketYieldVault"
    && eventName.startsWith("v2_market_yield_")
  ) return true;
  return appName === "PDexV2SingleTokenOps"
    && eventApp === "PDexV2AdminOps"
    && ["v2_lp_deposited", "v2_lp_withdrawn", "v2_funding_updated", "v2_borrowing_updated"].includes(eventName);
}

function receiptLogBytes(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value) && value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)) {
    return Uint8Array.from(value);
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const binary = atob(value.trim());
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function receiptLogCandidates(raw: Uint8Array): Uint8Array[] {
  const arc4Prefix = [0x15, 0x1f, 0x7c, 0x75];
  if (!arc4Prefix.every((byte, index) => raw[index] === byte)) return [raw];
  const abi = raw.slice(arc4Prefix.length);
  const candidates = [raw, abi];
  if (abi.byteLength >= 2) {
    const encodedLength = (abi[0] << 8) + abi[1];
    if (encodedLength === abi.byteLength - 2) candidates.push(abi.slice(2));
  }
  return candidates;
}
