import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const failures = [];

const expectedSourceFiles = [
  "api.ts",
  "boxes.ts",
  "codec.ts",
  "constants.ts",
  "externalYield.ts",
  "index.ts",
  "integration.ts",
  "manifest.ts",
  "marketYield.ts",
  "oracle.ts",
  "orderLifecycle.ts",
  "orders.ts",
  "planners.ts",
  "receipts.ts",
  "readModels.ts",
  "testFunds.ts",
  "transactions.ts",
  "v2OrderQuotes.ts",
  "v2PositionResolution.ts",
  "v2Quotes.ts",
  "v2Risk.ts",
];

const expectedTopLevelEntries = [
  ".gitignore",
  "INTEGRATION_GUIDE.md",
  "PUBLIC_API.md",
  "QUICKSTART.md",
  "README.md",
  "package-lock.json",
  "package.json",
  "scripts",
  "src",
  "test",
  "tsconfig.json",
];

const expectedScriptFiles = [
  "check-built-package.mjs",
  "check-package.mjs",
  "clean-dist.mjs",
];

const expectedTestFiles = [
  "action-recall.test.ts",
  "api.test.ts",
  "builder-fees.test.ts",
  "fixtures",
  "funding-recipient-split.test.ts",
  "integration.test.ts",
  "lp-swap-recall.test.ts",
  "margin-adjustment.test.ts",
  "position-token-precision.test.ts",
  "public-capabilities.test.ts",
  "read-models.test.ts",
  "receipts.test.ts",
  "test-funds.test.ts",
  "transaction-materialization.test.ts",
  "v2-order-quotes.test.ts",
  "v2-quotes.test.ts",
  "v2-risk.test.ts",
];

const expectedFixtureFiles = [
  "v2-admission-liquidation-consistency-v1.json",
  "v2-cva-active-mark-withdraw-v1.json",
  "v2-cva-allocation-sizing-v2.json",
  "v2-cva-withdraw-route-v1.json",
  "v2-funding-recipient-split-v1.json",
  "v2-impact-setting-policy-v1.json",
  "v2-lp-nav-v2.json",
  "v2-oracle-message-v3.json",
  "v2-oracle-position-precision-v1.json",
  "v2-transaction-materialization-v1.json",
  "v2_adl_pnl_cap_vectors.json",
];

const expectedPackageFiles = [
  "INTEGRATION_GUIDE.md",
  "PUBLIC_API.md",
  "QUICKSTART.md",
  "README.md",
  "dist/src",
  "package.json",
];

const expectedPackageExports = [
  ".",
  "./api",
  "./boxes",
  "./codec",
  "./constants",
  "./externalYield",
  "./manifest",
  "./marketYield",
  "./oracle",
  "./orderLifecycle",
  "./orders",
  "./package.json",
  "./planners",
  "./receipts",
  "./readModels",
  "./integration",
  "./testFunds",
  "./transactions",
  "./v2OrderQuotes",
  "./v2PositionResolution",
  "./v2Quotes",
  "./v2Risk",
];

const expectedLockedPackages = {
  "node_modules/@noble/ed25519": "3.1.0",
  "node_modules/@noble/hashes": "2.2.0",
  "node_modules/@types/node": "24.12.3",
  "node_modules/algorand-msgpack": "1.1.0",
  "node_modules/algosdk": "3.5.2",
  "node_modules/bignumber.js": "9.3.1",
  "node_modules/hi-base32": "0.5.1",
  "node_modules/js-sha256": "0.9.0",
  "node_modules/js-sha3": "0.8.0",
  "node_modules/js-sha512": "0.8.0",
  "node_modules/json-bigint": "1.0.0",
  "node_modules/tweetnacl": "1.0.3",
  "node_modules/typescript": "5.9.3",
  "node_modules/undici-types": "7.16.0",
  "node_modules/vlq": "2.0.4",
};

const expectedClientMethods = [
  "createAccountSession",
  "deployment",
  "health",
  "loadProtocol",
  "logoutAccountSession",
  "margin",
  "ready",
  "setAccountSessionToken",
  "v2Account",
  "v2AccountActivity",
  "v2AccountMargin",
  "v2AccountOrders",
  "v2AccountTrades",
  "v2AnalyzeOrder",
  "v2CvaAccount",
  "v2CvaAllocations",
  "v2CvaPerformance",
  "v2CvaVault",
  "v2CvaVaults",
  "v2LatestPrice",
  "v2Lps",
  "v2Market",
  "v2MarketSummary",
  "v2MarketYieldActionRecallPlan",
  "v2MarketYieldHealth",
  "v2MarketYieldObservation",
  "v2MarketYieldObservations",
  "v2MarketYieldResourceRegistry",
  "v2MarketYieldStrategies",
  "v2MarketYieldStrategy",
  "v2Markets",
  "v2OracleArgs",
  "v2OraclePayload",
  "v2Order",
  "v2OrderPolicy",
  "v2Orders",
  "v2Pool",
  "v2PoolPerformance",
  "v2Pools",
  "v2Positions",
  "v2PriceCandles",
  "v2QuoteAdjustMargin",
  "v2QuoteAdl",
  "v2QuoteCvaAllocate",
  "v2QuoteCvaDeposit",
  "v2QuoteCvaRebalance",
  "v2QuoteCvaWithdraw",
  "v2QuoteCvaWithdrawRoute",
  "v2QuoteDecrease",
  "v2QuoteDecreaseWithSwap",
  "v2QuoteLiquidation",
  "v2QuoteLpDeposit",
  "v2QuoteLpWithdraw",
  "v2QuoteLpWithdrawWithSwap",
  "v2QuoteOpen",
  "v2QuoteOrderDecrease",
  "v2QuoteOrderExecute",
  "v2QuoteOrderOpenLimit",
  "v2QuoteSingleTokenAdl",
  "v2QuoteSingleTokenDecrease",
  "v2QuoteSingleTokenLiquidation",
  "v2QuoteSingleTokenLpDeposit",
  "v2QuoteSingleTokenLpWithdraw",
  "v2QuoteSingleTokenOpen",
  "v2QuoteSwap",
  "v2QuoteSwapRoute",
  "v2SdkBootstrap",
  "v2SdkResources",
  "v2StaticMetadataArtifact",
  "v2StaticMetadataCurrent",
  "v2Trader",
];

const expectedTransactionFunctions = [
  "prepareV2DecreaseOrCloseInput",
  "prepareV2DecreaseOrCloseTransactions",
  "appendV2TransactionGroupTransactions",
  "assertV2OrderPriceCoherent",
  "buildAppCall",
  "buildSingleAppCallTransaction",
  "buildV2ActiveAttachedOrdersTransactions",
  "buildV2AddPositionMarginCall",
  "buildV2AddPositionMarginTransactions",
  "buildV2CancelExpiredOrderCall",
  "buildV2CancelExpiredOrderTransactions",
  "buildV2CancelOrderCall",
  "buildV2CancelOrderTransactions",
  "buildV2CvaDepositCall",
  "buildV2CvaDepositTransactions",
  "buildV2CvaWithdrawCall",
  "buildV2CvaWithdrawFromMarketCall",
  "buildV2CvaWithdrawFromMarketTransactions",
  "buildV2CvaWithdrawTransactions",
  "buildV2DecreaseOrCloseCall",
  "buildV2DecreaseOrCloseTransactions",
  "buildV2DecreaseOrCloseWithSwapCall",
  "buildV2DecreaseOrCloseWithSwapTransactions",
  "buildV2DepositLiquidityCall",
  "buildV2DepositLiquidityTransactions",
  "buildV2ExecuteOrderCall",
  "buildV2ExecuteOrderTransactions",
  "buildV2FundStorageCall",
  "buildV2FundStorageTransactions",
  "buildV2LiquidateCall",
  "buildV2LiquidateTransactions",
  "buildV2MarketOpenWithAttachedOrdersTransactions",
  "buildV2MarketYieldPublicMarkCalls",
  "buildV2OpenLimitWithAttachedOrdersTransactions",
  "buildV2OpenOrIncreaseCall",
  "buildV2OpenOrIncreaseTransactions",
  "buildV2OpenOrIncreaseWithStorageTransactions",
  "buildV2SingleTokenAddPositionMarginCall",
  "buildV2SingleTokenAddPositionMarginTransactions",
  "buildV2SingleTokenDecreaseOrCloseCall",
  "buildV2SingleTokenDecreaseOrCloseTransactions",
  "buildV2SingleTokenDepositLiquidityCall",
  "buildV2SingleTokenDepositLiquidityTransactions",
  "buildV2SingleTokenFundStorageCall",
  "buildV2SingleTokenFundStorageTransactions",
  "buildV2SingleTokenLiquidateCall",
  "buildV2SingleTokenLiquidateTransactions",
  "buildV2SingleTokenOpenOrIncreaseCall",
  "buildV2SingleTokenOpenOrIncreaseTransactions",
  "buildV2SingleTokenOpenOrIncreaseWithStorageTransactions",
  "buildV2SingleTokenWithdrawLiquidityCall",
  "buildV2SingleTokenWithdrawLiquidityTransactions",
  "buildV2SingleTokenWithdrawPositionMarginCall",
  "buildV2SingleTokenWithdrawPositionMarginTransactions",
  "buildV2SubmitLinkedOrderCall",
  "buildV2SubmitLinkedOrderTransactions",
  "buildV2SubmitOrderCall",
  "buildV2SubmitOrderTransactions",
  "buildV2SwapExactInCall",
  "buildV2SwapExactInTransactions",
  "buildV2SwapRouteExactInCall",
  "buildV2SwapRouteExactInTransactions",
  "buildV2UpdateFundingTransactions",
  "buildV2WithdrawLiquidityCall",
  "buildV2WithdrawLiquidityTransactions",
  "buildV2WithdrawLiquidityWithSwapCall",
  "buildV2WithdrawLiquidityWithSwapTransactions",
  "buildV2WithdrawPositionMarginCall",
  "buildV2WithdrawPositionMarginTransactions",
  "insertV2TransactionGroupTransactions",
  "normalizeBuilderFee",
  "prependV2TransactionGroupTransactions",
  "toApplicationNoOpTxn",
  "v2ExpectedLinkedChildOrderId",
  "v2LinkedOrderSubmitBoxRefs",
  "v2LargeProgramRoles",
  "v2MarketXalgoStrategyBoxRefs",
  "v2MarketYieldStrategyBoxRefs",
  "v2OrderExecutionFlatFeeMicroAlgo",
  "v2OrderLinkBase",
  "v2OrderLinkMode",
  "v2OrderPriceCoherenceFailure",
  "v2OrderSubmitBoxRefs",
  "v2PackOrderLink",
  "v2SettlementMaintenanceDue",
  "v2SiblingLinkedChildOrderId",
  "v2TransactionGroupResult",
];

function sorted(values) {
  return [...values].sort();
}

function requireExact(label, actual, expected) {
  const left = JSON.stringify(sorted(actual));
  const right = JSON.stringify(sorted(expected));
  if (left !== right) failures.push(`${label} changed; review and update the approved public contract`);
}

requireExact(
  "source module set",
  readdirSync(resolve(root, "src")).filter((name) => name.endsWith(".ts")),
  expectedSourceFiles,
);
const localOnlyTopLevelEntries = new Set([".git", ".npm", "dist", "node_modules"]);
const topLevelEntries = readdirSync(root, { withFileTypes: true })
  .filter((entry) => !localOnlyTopLevelEntries.has(entry.name))
  .filter((entry) => !(
    entry.isDirectory()
    && entry.name.startsWith(".")
    && readdirSync(resolve(root, entry.name)).length === 0
  ))
  .map((entry) => entry.name);
requireExact("repository entry set", topLevelEntries, expectedTopLevelEntries);
requireExact("script file set", readdirSync(resolve(root, "scripts")), expectedScriptFiles);
requireExact("test file set", readdirSync(resolve(root, "test")), expectedTestFiles);
requireExact("fixture file set", readdirSync(resolve(root, "test/fixtures")), expectedFixtureFiles);

const packageJson = JSON.parse(read("package.json"));
const packageLock = JSON.parse(read("package-lock.json"));
requireExact("package file set", packageJson.files ?? [], expectedPackageFiles);
requireExact("package export set", Object.keys(packageJson.exports ?? {}), expectedPackageExports);

for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
  if (packageJson.scripts?.[lifecycle]) failures.push(`install lifecycle script is defined: ${lifecycle}`);
}

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
for (const section of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
    if (!exactVersion.test(String(version))) failures.push(`${section} must pin ${name} exactly`);
  }
}

if (packageLock.lockfileVersion !== 3) failures.push("package-lock.json must use lockfileVersion 3");
requireExact(
  "locked package set",
  Object.keys(packageLock.packages ?? {}).filter(Boolean),
  Object.keys(expectedLockedPackages),
);
for (const [path, entry] of Object.entries(packageLock.packages ?? {})) {
  if (!path || entry.link) continue;
  if (!exactVersion.test(String(entry.version ?? ""))) failures.push(`lockfile entry lacks an exact version: ${path}`);
  if (expectedLockedPackages[path] !== entry.version) failures.push(`locked version changed: ${path}`);
  if (typeof entry.resolved !== "string" || !entry.resolved.startsWith("https://registry.npmjs.org/")) {
    failures.push(`lockfile entry uses an unapproved package source: ${path}`);
  }
  if (typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha512-")) {
    failures.push(`lockfile entry lacks a SHA-512 integrity hash: ${path}`);
  }
}

const rootLock = packageLock.packages?.[""] ?? {};
for (const section of ["dependencies", "devDependencies"]) {
  for (const [name, version] of Object.entries(packageJson[section] ?? {})) {
    if (rootLock[section]?.[name] !== version) failures.push(`lockfile root differs from ${section}.${name}`);
  }
}

const api = read("src/api.ts");
const clientBody = api.slice(api.indexOf("export class PdexApiClient"), api.indexOf("export function createPdexApiClient"));
const clientMethods = [...clientBody.matchAll(/^  (?!private\b)(?:async\s+)?([A-Za-z][A-Za-z0-9_]*)\(/gm)]
  .map((match) => match[1])
  .filter((name) => name !== "constructor");
requireExact("API client method set", clientMethods, expectedClientMethods);

const transactions = read("src/transactions.ts");
const transactionFunctions = [...transactions.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z][A-Za-z0-9_]*)\b/gm)]
  .map((match) => match[1]);
requireExact("transaction function set", transactionFunctions, expectedTransactionFunctions);

function repositoryTextFiles(directory = ".") {
  const files = [];
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    const path = directory === "." ? entry.name : `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (![".git", "dist", "node_modules"].includes(entry.name)) files.push(...repositoryTextFiles(path));
      continue;
    }
    if (/\.(?:json|md|mjs|ts)$/.test(entry.name) && path !== "package-lock.json") files.push(path);
  }
  return files;
}

const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:mnemonic|private[_ -]?key|api[_ -]?key|secret)["']?\s*[:=]\s*["'][^"']{16,}["']/i,
  /\/home\/[A-Za-z0-9._-]+\//,
  /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+\\/i,
];
for (const path of repositoryTextFiles()) {
  const contents = read(path);
  for (const pattern of secretPatterns) {
    if (pattern.test(contents)) failures.push(`sensitive material pattern found in ${path}`);
  }
}

const disclosurePatterns = [
  /(?:^|\W)(?:TODO|FIXME|HACK|XXX)(?:\W|$)/,
  /\b(?:internal|confidential)\s+(?:discussion|document|note|roadmap|use)\b/i,
  /\b(?:private sdk|private repository|private checkout)\b/i,
  /\b(?:deferred flows?|roadmap|review record|development workspace)\b/i,
  /\b(?:source_scenarios|authorship|authority)\b/i,
  /\bwe (?:decided|chose|removed|excluded)\b/i,
  /"(?:authorship|authority|basis|derivation|source)"\s*:/i,
  /"(?:create|set|configure|transfer|emergency|allocate)_[a-z0-9_]+"/,
];
for (const path of repositoryTextFiles()) {
  if (path === "scripts/check-package.mjs") continue;
  const contents = read(path);
  for (const pattern of disclosurePatterns) {
    if (pattern.test(contents)) failures.push(`unexpected content pattern found in ${path}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Package contract checks passed.");
}
