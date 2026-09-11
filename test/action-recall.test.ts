import assert from "node:assert/strict";
import test from "node:test";
import { prepareV2ActionRecall } from "../src/marketYield.js";
import { buildV2DecreaseOrCloseTransactions, prepareV2DecreaseOrCloseTransactions } from "../src/transactions.js";
import { setProtocolManifest } from "../src/manifest.js";

const owner = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
const registry = {
  registry_version: "resources-1", registry_hash: "hash-1", markets_app_id: 2001,
  market_yield_vault_app_id: 2009, market_xalgo_yield_vault_app_id: 2009,
  market_xalgo_yield_vault_app_address: owner, xalgo_consensus_app_id: 2010, xalgo_asset_id: 2011,
  markets: [{ market_id: 7, index_asset_id: 0, long_asset_id: 0, short_asset_id: 12 }],
  strategies: [{ market_id: 7, asset_id: 0, strategy_kind: 2, xalgo_consensus_app_id: 2010,
    xalgo_asset_id: 2011, xalgo_proposer_addresses: [owner], xalgo_provider_fee_credit_per_call_microalgos: 10000 }],
};

function fixture(options: { configured?: boolean; hot?: bigint } = {}) {
  const currentRegistry = { ...registry, strategies: options.configured === false ? [] : registry.strategies };
  const requests: Record<string, unknown>[] = [];
  let registryReads = 0;
  const client = {
    async v2MarketYieldResourceRegistry() { registryReads++; return structuredClone(currentRegistry); },
    async v2MarketYieldActionRecallPlan(payload: Record<string, unknown>) {
      requests.push(payload);
      const outputs = payload.outputs as Array<{ asset_id: string; required_hot_amount: string }>;
      const plans = outputs.map(output => {
        const configured = output.asset_id === "0" && options.configured !== false;
        const amount = BigInt(output.required_hot_amount);
        const cap = configured ? "2000000" : "0";
        return { ...output, market_id: payload.market_id, yield_configured: configured,
          atomic_action_ready: true, blockers: [], requires_pre_recall: false, cap_sufficient: true,
          hot_balance: String(options.hot ?? 131401n), available_receipt_amount: cap, max_receipt_amount: cap,
          action_recall_capacity_available: configured, will_call_action_recall: configured && amount > (options.hot ?? 131401n) };
      });
      return { market_id: payload.market_id, registry_version: registry.registry_version, registry_hash: registry.registry_hash,
        atomic_action_ready: true, blockers: [], plans,
        yield_recall_mode: plans.some(p => p.max_receipt_amount !== "0") ? 1 : 0,
        caps_by_asset: Object.fromEntries(plans.map(p => [p.asset_id, p.max_receipt_amount])) };
    },
  };
  return { client, requests, currentRegistry, registryReads: () => registryReads };
}

const input = { marketId: 7, indexAssetId: 0, assetIds: [0, 12], outputs: [{ assetId: 0, requiredHotAmount: 1355832n }] };

test("recall preparation covers ALGO shortfall and still authorizes recall when idle cash covers the preview", async () => {
  for (const hot of [131401n, 10000000n]) {
    const f = fixture({ hot });
    const recall = await prepareV2ActionRecall(f.client, input);
    assert.equal(recall.yieldRecallMode, 1);
    assert.equal(recall.capForAsset(0), 2000000n);
    assert.equal(recall.capForAsset(12), 0n);
    assert.deepEqual(f.requests[0].outputs, [{ asset_id: "0", required_hot_amount: "1355832" }, { asset_id: "12", required_hot_amount: "0" }]);
    assert.equal(f.registryReads(), 1);
    assert.throws(() => recall.capForAsset(99), /not prepared/);
  }
});

test("a zero-output preview still reserves bounded recall; confirmed no-yield markets use explicit mode zero", async () => {
  const f = fixture();
  assert.equal((await prepareV2ActionRecall(f.client, { ...input, outputs: [] })).yieldRecallMode, 1);
  const noYield = fixture({ configured: false });
  assert.equal((await prepareV2ActionRecall(noYield.client, input)).yieldRecallMode, 0);
});

test("missing, stale and strategy-free cached registries cannot suppress planning", async () => {
  for (const cached of [undefined, {}, { ...registry, registry_version: "old", strategies: [] }]) {
    const f = fixture();
    assert.equal((await prepareV2ActionRecall(f.client, { ...input, marketYieldRegistry: cached })).yieldRecallMode, 1);
    assert.equal(f.requests.length, 1);
    assert.equal(f.registryReads(), 1);
  }
  const f = fixture();
  await assert.rejects(prepareV2ActionRecall(f.client, { ...input, marketYieldRegistry: { ...registry, strategies: [] } }), /metadata mismatch/);
});

test("incomplete, inconsistent and blocked plans fail before transaction construction", async () => {
  const mutations: Array<(p: Awaited<ReturnType<ReturnType<typeof fixture>["client"]["v2MarketYieldActionRecallPlan"]>>) => void> = [
    p => { p.plans.pop(); },
    p => { p.plans.push(p.plans[0]); },
    p => { p.yield_recall_mode = 0; },
    p => { p.atomic_action_ready = false; },
    p => { p.plans[0].requires_pre_recall = true; },
    p => { p.plans[0].cap_sufficient = false; },
    p => { p.plans[0].yield_configured = false; },
    p => { p.caps_by_asset["0"] = "9007199254740993"; },
    p => { p.registry_hash = "changed"; },
    p => { p.market_id = "8"; },
  ];
  for (const mutate of mutations) {
    const f = fixture(); const original = f.client.v2MarketYieldActionRecallPlan;
    f.client.v2MarketYieldActionRecallPlan = async payload => { const p = await original(payload); mutate(p); return p; };
    await assert.rejects(prepareV2ActionRecall(f.client, input));
  }
  const f = fixture();
  f.client.v2MarketYieldActionRecallPlan = async () => { throw new Error("backend offline"); };
  await assert.rejects(prepareV2ActionRecall(f.client, input), /backend offline/);
});

function configureManifest() {
  const spec = (signature: string, types: string[]) => ({ signature, args: types.map((type, i) => ({ name: `arg${i}`, type })), returns: { type: "byte[]" } });
  setProtocolManifest({ apps: {
    PDexV2Math: { method_specs: { noop: { ...spec("noop()void", []), returns: { type: "void" } } } },
    PDexV2Trading: { method_specs: { decrease_or_close: spec(
      "decrease_or_close(uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,(address,uint64),byte[],byte[],uint64,uint64,uint64)byte[]",
      ["uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "(address,uint64)", "byte[]", "byte[]", "uint64", "uint64", "uint64"],
    ) } },
  } }, 2);
}

test("the standard prepared close encodes recall without caller flags; the old omitted-flags call is rejected", async () => {
  configureManifest();
  const f = fixture();
  const args = { sender: owner, v2MarketsAppId: 2001, v2TradingAppId: 2002, v2AdminControlAppId: 2003,
    v2MathAppId: 2004, v2AdminOpsAppId: 2005, v2TradingRiskOpsAppId: 2008, v2MarketXalgoYieldVaultAppId: 2009,
    marketId: 7, indexAssetId: 0, longAssetId: 0, shortAssetId: 12, collateralAssetId: 12, side: 1,
    sizeUsdDelta: 10000000n, acceptablePrice: 91495800000n, minPrimaryOutput: 0n,
    oracleMessage: new Uint8Array(133).fill(1), oracleSignature: new Uint8Array(64).fill(2) };
  const params = { fee: 1000n, minFee: 1000n, firstValid: 1n, lastValid: 1000n, genesisID: "sdk-test", genesisHash: new Uint8Array(32) };
  assert.throws(() => buildV2DecreaseOrCloseTransactions(args, params), /preparation is required/);
  const group = await prepareV2DecreaseOrCloseTransactions(f.client, args, params);
  const txn = group.find(t => t.applicationCall?.appIndex === 2002n)!;
  const encoded = txn.applicationCall!.appArgs.slice(-3).map(value => BigInt(`0x${Buffer.from(value).toString("hex")}`));
  assert.deepEqual(encoded, [1n, 2000000n, 0n]);
  assert.ok(group.length > 3);
  assert.equal(new Set(group.map(t => t.txID())).size, group.length);
  assert.ok(group.length <= 16);
});
