import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export type ProtocolManifest = Record<string, any>;
export type DeploymentManifest = Record<string, any>;

let cachedManifest: ProtocolManifest | undefined;
const manifestCache: Record<string, ProtocolManifest> = {};
let cachedDeploymentManifest: DeploymentManifest | undefined;

export function setProtocolManifest(manifest: ProtocolManifest, key?: string | number): ProtocolManifest {
  cachedManifest = manifest;
  const manifestKey = key ?? manifest.manifest_version ?? "default";
  manifestCache[String(manifestKey)] = manifest;
  if (manifest.protocol_version) manifestCache[String(manifest.protocol_version)] = manifest;
  return manifest;
}

export function loadManifest(manifest?: ProtocolManifest, key?: string | number): ProtocolManifest {
  if (manifest) return manifest;
  if (key !== undefined && manifestCache[String(key)]) return manifestCache[String(key)];
  if (!cachedManifest) {
    throw new Error("protocol manifest not loaded; call setProtocolManifest() or PdexApiClient.loadProtocol() first");
  }
  return cachedManifest as ProtocolManifest;
}

export function loadManifestVersion(version: string | number, manifest?: ProtocolManifest): ProtocolManifest {
  if (manifest) return manifest;
  const cached = manifestCache[String(version)];
  if (!cached) throw new Error(`protocol manifest not loaded for version: ${version}`);
  return cached;
}

export async function loadManifestFromUrl(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  version: string | number = 2,
): Promise<ProtocolManifest> {
  if (String(version) !== "2") throw new Error("PDex SDK only supports the V2 protocol manifest");
  const response = await fetchImpl(`${trimSlash(baseUrl)}/v${version}/protocol`);
  if (!response.ok) throw new Error(`failed to load protocol manifest: ${response.status}`);
  return setProtocolManifest(await response.json());
}

export interface LoadManifestFromR2Options {
  /** Artifact root, including the deployment prefix (for example, /mainnet). */
  publicArtifactBaseUrl: string;
  network: string;
  fetchImpl?: typeof fetch;
}

/** Transport/HTTP failure eligible for fallback; invalid definitions never use this error. */
export class ProtocolManifestUnavailableError extends Error {
  override name = "ProtocolManifestUnavailableError";
}

/** Load the network's current V2 definition, verify its exact bytes, then cache it. */
export async function loadManifestFromR2(options: LoadManifestFromR2Options): Promise<ProtocolManifest> {
  const baseUrl = trimSlash(options.publicArtifactBaseUrl);
  const network = options.network.trim();
  if (!baseUrl || !/^[a-zA-Z0-9_-]+$/.test(network)) {
    throw new Error("protocol manifest requires an artifact base URL and a network name");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const prefix = `v2/protocol/${network}`;
  const pointerBytes = await fetchManifestBytes(`${baseUrl}/${prefix}/current.json`, fetchImpl, "no-store");
  const pointer = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(pointerBytes));
  if (!isManifestRecord(pointer) || pointer.type !== "v2_protocol_manifest_current" ||
      pointer.schema_version !== 1 || pointer.manifest_version !== 2 || pointer.network !== network ||
      typeof pointer.artifact_hash !== "string" || !/^[0-9a-f]{64}$/.test(pointer.artifact_hash) ||
      pointer.artifact_path !== `${prefix}/${pointer.artifact_hash}.json`) {
    throw new Error("invalid protocol manifest pointer: unsupported format, network, or artifact path");
  }
  const bytes = await fetchManifestBytes(`${baseUrl}/${pointer.artifact_path}`, fetchImpl);
  if (bytesToHex(sha256(bytes)) !== pointer.artifact_hash) {
    throw new Error("protocol manifest hash mismatch");
  }
  const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  if (!isManifestRecord(manifest) || manifest.manifest_version !== 2 ||
      !isManifestRecord(manifest.apps) || !isManifestRecord(manifest.boxes) ||
      !isManifestRecord(manifest.receipts)) {
    throw new Error("invalid V2 protocol manifest format");
  }
  return setProtocolManifest(manifest, 2);
}

function isManifestRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function fetchManifestBytes(url: string, fetchImpl: typeof fetch, cache?: RequestCache): Promise<Uint8Array> {
  // Keep parsing/validation outside this catch: only availability errors permit fallback.
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      credentials: "omit",
      ...(cache ? { cache } : {}),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new ProtocolManifestUnavailableError(`failed to fetch protocol manifest: ${url}`, { cause });
  }
}

export function setDeploymentManifest(manifest: DeploymentManifest): DeploymentManifest {
  cachedDeploymentManifest = manifest;
  return manifest;
}

export function loadDeploymentManifest(manifest?: DeploymentManifest): DeploymentManifest {
  if (manifest) return manifest;
  if (!cachedDeploymentManifest) {
    throw new Error("deployment manifest not loaded; call setDeploymentManifest() first");
  }
  return cachedDeploymentManifest;
}

export async function loadDeploymentManifestFromUrl(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeploymentManifest> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`failed to load deployment manifest: ${response.status}`);
  return setDeploymentManifest(normalizeDeploymentManifest(await response.json()));
}

export function normalizeDeploymentManifest(payload: DeploymentManifest): DeploymentManifest {
  const manifest = payload?.manifest;
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
    return normalizeDeploymentManifest(manifest as DeploymentManifest);
  }
  if (payload?.app_details && typeof payload.app_details === "object") {
    return {
      ...payload,
      apps: payload.app_details,
      assets: payload.asset_details ?? payload.assets ?? {},
    };
  }
  return payload;
}

export function deploymentAppIds(deployment = loadDeploymentManifest(), includeZero = false): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [appName, app] of Object.entries(deployment.apps ?? {})) {
    const appId = Number(typeof app === "number" ? app : (app as any).app_id ?? 0);
    if (appId || includeZero) result[appName] = appId;
  }
  return result;
}

export function deploymentAppNamesById(deployment = loadDeploymentManifest()): Record<number, string> {
  const result: Record<number, string> = {};
  for (const [appName, appId] of Object.entries(deploymentAppIds(deployment))) {
    result[Number(appId)] = appName;
  }
  return result;
}

export function deploymentAssets(deployment = loadDeploymentManifest()): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [assetName, asset] of Object.entries(deployment.assets ?? {})) {
    result[assetName] = Number(typeof asset === "number" ? asset : (asset as any).asset_id ?? 0);
  }
  return result;
}

export function appMethod(appName: string, methodName: string, manifest = loadManifest()): any {
  const app = manifest.apps[appName];
  if (app.methods?.[methodName]) return app.methods[methodName];
  if (app.method_specs?.[methodName]) return app.method_specs[methodName];
  throw new Error(`unknown method: ${appName}.${methodName}`);
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
