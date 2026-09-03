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
