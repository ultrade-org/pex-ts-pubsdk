import assert from "node:assert/strict";
import test from "node:test";
import { encodeAddress, getApplicationAddress } from "algosdk";
import { buildV2WithdrawLiquidityWithSwapCall } from "../src/transactions.js";

test("single-output LP withdrawal carries both providers for input-asset fees", () => {
  const owner = encodeAddress(new Uint8Array(32).fill(1));
  const proposer = encodeAddress(new Uint8Array(32).fill(2));
  const registry = {
    schema_version: 1, registry_version: "mci-test", last_indexed_round: 10,
    markets_app_id: 2001, market_yield_vault_app_id: 3000,
    market_folks_yield_vault_app_id: 3001,
    markets_app_address: getApplicationAddress(2001).toString(),
    market_yield_vault_app_address: getApplicationAddress(3000).toString(),
    market_folks_yield_vault_app_address: getApplicationAddress(3001).toString(),
    xalgo_consensus_app_id: 4000, xalgo_asset_id: 4001,
    xalgo_proposer_addresses: [proposer], action_recall_uses_router: true,
    strategies: [
      { market_id: 7, asset_id: 0, strategy_kind: 2, underlying_asset_id: 0,
        receipt_asset_id: 4001, xalgo_consensus_app_id: 4000, xalgo_asset_id: 4001,
        xalgo_proposer_addresses: [proposer], xalgo_provider_fee_credit_per_call_microalgos: 3000 },
      { market_id: 7, asset_id: 12, strategy_kind: 1, underlying_asset_id: 12,
        receipt_asset_id: 4012, folks_pool_app_id: 5000, folks_pool_manager_app_id: 5001 },
    ],
  };
  for (const outputMode of [1, 2]) {
    const result = buildV2WithdrawLiquidityWithSwapCall({
      sender: owner, marketId: 7, indexAssetId: 0, longAssetId: 0, shortAssetId: 12,
      v2MarketsAppId: 2001, v2TradingAppId: 2002, v2AdminControlAppId: 2003, v2MathAppId: 2004, v2AdminOpsAppId: 2005,
      shareAmount: 100, outputMode, yieldRecallMode: 1,
      maxLongReceiptAmount: 100, maxShortReceiptAmount: 100,
      oracleMessage: new Uint8Array(133), oracleSignature: new Uint8Array(64),
      marketYieldRegistry: registry,
    });
    const calls = [result, ...(result.resourceCarrier ? [result.resourceCarrier] : []),
      ...(result.resourceCarriers ?? [])];
    const apps = new Set(calls.flatMap((call) => call.foreignApps));
    const assets = new Set(calls.flatMap((call) => call.foreignAssets));
    for (const app of [3000, 3001, 4000, 5000, 5001]) assert.ok(apps.has(app));
    for (const asset of [4001, 4012]) assert.ok(assets.has(asset));
    assert.ok(calls.some((call) => call.accounts.includes(proposer)));
    assert.ok(calls.length <= 16);
  }
});
