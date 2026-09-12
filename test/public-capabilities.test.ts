import assert from "node:assert/strict";
import { test } from "node:test";

import * as sdk from "../src/index.js";

const actionBuilders = [
  "buildV2DepositLiquidityTransactions",
  "buildV2WithdrawLiquidityTransactions",
  "buildV2WithdrawLiquidityWithSwapTransactions",
  "buildV2SwapExactInTransactions",
  "buildV2SwapRouteExactInTransactions",
  "buildV2OpenOrIncreaseTransactions",
  "buildV2OpenOrIncreaseWithStorageTransactions",
  "buildV2AddPositionMarginTransactions",
  "buildV2WithdrawPositionMarginTransactions",
  "buildV2DecreaseOrCloseTransactions",
  "buildV2DecreaseOrCloseWithSwapTransactions",
  "buildV2LiquidateTransactions",
  "buildV2SubmitOrderTransactions",
  "buildV2SubmitLinkedOrderTransactions",
  "buildV2MarketOpenWithAttachedOrdersTransactions",
  "buildV2ActiveAttachedOrdersTransactions",
  "buildV2OpenLimitWithAttachedOrdersTransactions",
  "buildV2ExecuteOrderTransactions",
  "buildV2CancelOrderTransactions",
  "buildV2CancelExpiredOrderTransactions",
  "buildV2SingleTokenDepositLiquidityTransactions",
  "buildV2SingleTokenWithdrawLiquidityTransactions",
  "buildV2SingleTokenOpenOrIncreaseTransactions",
  "buildV2SingleTokenOpenOrIncreaseWithStorageTransactions",
  "buildV2SingleTokenAddPositionMarginTransactions",
  "buildV2SingleTokenWithdrawPositionMarginTransactions",
  "buildV2SingleTokenDecreaseOrCloseTransactions",
  "buildV2SingleTokenLiquidateTransactions",
  "buildV2CvaDepositTransactions",
  "buildV2CvaWithdrawTransactions",
  "buildV2CvaWithdrawFromMarketTransactions",
  "buildV2MarketYieldPublicMarkCalls",
] as const;

const applicationCompositionSurface = [
  "V2_ORDER_KIND",
  "V2_ORDER_LINK_MODE",
  "MAX_POSITION_BUILDER_FEE_BPS",
  "MAX_SWAP_BUILDER_FEE_BPS",
  "appendV2TransactionGroupTransactions",
  "buildV2AddPositionMarginCall",
  "buildV2AddPositionMarginTransactions",
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
  "buildV2DepositLiquidityCall",
  "buildV2DepositLiquidityTransactions",
  "buildV2FundStorageCall",
  "buildV2FundStorageTransactions",
  "buildV2MarketOpenWithAttachedOrdersTransactions",
  "buildV2ActiveAttachedOrdersTransactions",
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
  "buildV2SingleTokenOpenOrIncreaseCall",
  "buildV2SingleTokenOpenOrIncreaseTransactions",
  "buildV2SingleTokenOpenOrIncreaseWithStorageTransactions",
  "buildV2SingleTokenWithdrawLiquidityCall",
  "buildV2SingleTokenWithdrawLiquidityTransactions",
  "buildV2SingleTokenWithdrawPositionMarginCall",
  "buildV2SingleTokenWithdrawPositionMarginTransactions",
  "buildV2SubmitLinkedOrderCall",
  "buildV2SubmitOrderCall",
  "buildV2SubmitOrderTransactions",
  "buildV2SwapExactInCall",
  "buildV2SwapExactInTransactions",
  "buildV2WithdrawLiquidityCall",
  "buildV2WithdrawLiquidityTransactions",
  "buildV2WithdrawPositionMarginCall",
  "buildV2WithdrawPositionMarginTransactions",
  "prependV2TransactionGroupTransactions",
  "normalizeBuilderFee",
  "toApplicationNoOpTxn",
  "v2ExpectedLinkedChildOrderId",
  "v2TransactionGroupResult",
] as const;

const quoteAndStateFunctions = [
  "quoteV2OpenPosition",
  "quoteV2DecreasePosition",
  "quoteV2PositionHealth",
  "quoteV2LiquidationPrice",
  "quoteV2LpDeposit",
  "quoteV2LpWithdraw",
  "quoteV2SwapExactIn",
  "quoteV2SwapRouteExactIn",
  "quoteV2OpenLimitOrder",
  "quoteV2DecreaseOrder",
  "quoteV2ExecuteOrder",
  "quoteV2CvaDeposit",
  "quoteV2CvaWithdrawRoute",
  "quoteV2Liquidation",
  "quoteV2SingleTokenOpen",
  "quoteV2SingleTokenDecrease",
  "quoteV2SingleTokenLpDeposit",
  "quoteV2SingleTokenLpWithdraw",
  "readV2PositionCostResolutionRequest",
  "simulateV2PositionCostResolution",
  "analyzeV2OrderLifecycle",
  "decodeV2OracleSnapshotMessage",
  "verifyOraclePayload",
  "parseV2PositionState",
  "parseV2OrderState",
  "decodeReceipt",
] as const;

const applicationIntegrationFunctions = [
  "authorizePdexAccount",
  "decodeReceiptFromConfirmation",
  "loadPdexContext",
  "normalizeV2AccountActivity",
  "normalizeV2AccountMargin",
  "normalizeV2LiquidityPosition",
  "normalizeV2MarketSummary",
  "normalizeV2Order",
  "normalizeV2Position",
  "pdexMarketAssetRefs",
  "resolvePdexV2AppRefs",
  "submitPdexTransactionGroup",
] as const;

test("documented action families are exported", () => {
  for (const name of actionBuilders) {
    assert.equal(typeof sdk[name], "function", `${name} must be exported`);
  }
});

test("application transaction composition surface is exported", () => {
  for (const name of applicationCompositionSurface) {
    assert.ok(sdk[name] !== undefined, `${name} must be exported`);
  }
});

test("documented quote and state capabilities are exported", () => {
  for (const name of quoteAndStateFunctions) {
    assert.equal(typeof sdk[name], "function", `${name} must be exported`);
  }
});

test("browser integration and normalized read-model helpers are exported", () => {
  for (const name of applicationIntegrationFunctions) {
    assert.equal(typeof sdk[name], "function", `${name} must be exported`);
  }
});

test("large-program roles cover public cross-application calls", () => {
  assert.deepEqual(sdk.v2LargeProgramRoles("PDexV2OrderOps", "submit_order"), ["markets", "trading"]);
  assert.deepEqual(sdk.v2LargeProgramRoles("PDexV2CvaVault", "mark_market"), ["markets", "cva_vault"]);
  assert.deepEqual(sdk.v2LargeProgramRoles("PDexV2MarketYieldVault", "folks_mark_market_strategy"), ["markets"]);
  assert.deepEqual(sdk.v2LargeProgramRoles("PDexV2AdminOps", "deposit_liquidity"), ["markets"]);
});

test("API client includes the complete scoped integration surface", () => {
  const methods = [
    "loadProtocol",
    "deployment",
    "v2SdkBootstrap",
    "v2SdkResources",
    "v2StaticMetadataCurrent",
    "v2MarketSummary",
    "v2Markets",
    "v2Pools",
    "v2LatestPrice",
    "v2PriceCandles",
    "v2PoolPerformance",
    "createAccountSession",
    "v2Account",
    "v2AccountTrades",
    "v2AccountActivity",
    "v2CvaPerformance",
    "v2MarketYieldResourceRegistry",
    "v2MarketYieldActionRecallPlan",
    "v2QuoteAdjustMargin",
    "v2QuoteCvaWithdrawRoute",
    "v2OracleArgs",
  ] as const;
  for (const name of methods) {
    assert.equal(typeof sdk.PdexApiClient.prototype[name], "function", `${name} must be available`);
  }
});
