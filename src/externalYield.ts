import { encodeAddress } from "algosdk";

const YIELD_BPS = 10_000;
const XALGO_PREMIUM_SCALE = 10_000_000_000_000_000n;

export const XALGO_PROPOSER_BOX_NAME = new TextEncoder().encode("pr");
export const V2_YIELD_STRATEGY_KIND_NONE = 0;
export const V2_YIELD_STRATEGY_KIND_FOLKS_LENDING = 1;
export const V2_YIELD_STRATEGY_KIND_XALGO_CONSENSUS = 2;
export const V2_YIELD_STATUS_DISABLED = 0;
export const V2_YIELD_STATUS_NORMAL = 1;
export const V2_YIELD_STATUS_RECALL_ONLY = 2;
export const V2_YIELD_STATUS_EMERGENCY = 3;
export const V2_YIELD_STATUS_RESERVED = 4;

export interface XAlgoConsensusState {
  consensusAppId: number;
  numProposers: number;
  feeBps: number;
  premiumRaw: bigint;
  premiumBps: number;
  canImmediateMint: boolean;
  canDelayMint: boolean;
  proposers: string[];
}

export function parseXalgoProposerBox(value: Uint8Array): string[] {
  if (value.length % 32 !== 0) {
    throw new Error("xALGO proposer box length must be a multiple of 32 bytes");
  }
  const proposers: string[] = [];
  for (let index = 0; index < value.length; index += 32) {
    proposers.push(encodeAddress(value.slice(index, index + 32)));
  }
  return proposers;
}

export async function loadXalgoConsensusState(
  algodClient: unknown,
  consensusAppId: number,
): Promise<XAlgoConsensusState> {
  const appInfo = await callAlgodMethod(
    algodClient,
    ["getApplicationByID", "applicationInformation"],
    consensusAppId,
  );
  const globals = decodeAlgodGlobalState(appInfo);
  const box = await callAlgodMethod(
    algodClient,
    ["getApplicationBoxByName", "applicationBoxByName"],
    consensusAppId,
    XALGO_PROPOSER_BOX_NAME,
  );
  const allProposers = parseXalgoProposerBox(decodeBytes(box?.value ?? box?.["value"]));
  const numProposers = Number(globals.num_proposers ?? allProposers.length);
  const premiumRaw = toBigInt(globals.premium ?? 0n);
  return {
    consensusAppId,
    numProposers,
    feeBps: Number(globals.fee ?? 0),
    premiumRaw,
    premiumBps: Number(
      (premiumRaw * BigInt(YIELD_BPS) + XALGO_PREMIUM_SCALE - 1n) /
        XALGO_PREMIUM_SCALE,
    ),
    canImmediateMint: Boolean(Number(globals.can_immediate_mint ?? 0)),
    canDelayMint: Boolean(Number(globals.can_delay_mint ?? 0)),
    proposers: allProposers.slice(0, numProposers),
  };
}

function toBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" || typeof value === "string") return BigInt(value);
  return 0n;
}

async function callAlgodMethod(client: unknown, names: string[], ...args: unknown[]): Promise<any> {
  const candidate = client as Record<string, unknown>;
  for (const name of names) {
    const fn = candidate[name];
    if (typeof fn !== "function") continue;
    const result = fn.apply(client, args);
    return typeof result?.do === "function" ? result.do() : result;
  }
  throw new Error(`algod client missing method: ${names.join(" or ")}`);
}

function decodeAlgodGlobalState(appInfo: any): Record<string, bigint | Uint8Array> {
  const params = appInfo?.params ?? appInfo?.application?.params ?? {};
  const items = params["global-state"] ?? params.globalState ?? [];
  const decoded: Record<string, bigint | Uint8Array> = {};
  for (const item of items) {
    const key = new TextDecoder().decode(decodeBytes(item.key));
    const value = item.value ?? {};
    decoded[key] = Number(value.type ?? 0) === 1
      ? decodeBytes(value.bytes ?? "")
      : toBigInt(value.uint ?? 0);
  }
  return decoded;
}

function decodeBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === "string") return base64ToBytes(value);
  if (value && typeof value === "object" && "bytes" in value) {
    return decodeBytes((value as { bytes: unknown }).bytes);
  }
  return new Uint8Array();
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(value, "base64"));
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
