import assert from "node:assert/strict";
import test from "node:test";
import { encodeAddress, type SuggestedParams } from "algosdk";
import {
  MAX_POSITION_BUILDER_FEE_BPS,
  MAX_SWAP_BUILDER_FEE_BPS,
  V2_ORDER_BOX_MBR_MICRO_ALGO,
  V2_ORDER_KIND,
  V2_ORDER_OPS_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_ORDER_TARGET,
  V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO,
  V2_TRADING_METHOD_FLAT_FEE_MICRO_ALGO,
  buildV2ActiveAttachedOrdersTransactions,
  buildV2DecreaseOrCloseCall,
  buildV2ExecuteOrderCall,
  buildV2OpenOrIncreaseCall,
  buildV2SubmitOrderCall,
  buildV2SwapExactInTransactions,
  buildV2SwapRouteExactInTransactions,
  normalizeBuilderFee,
  parseV2OrderState,
  quoteV2OpenLimitOrder,
  quoteV2SwapExactIn,
  setProtocolManifest,
  v2TransactionGroupResult,
} from "../src/index.js";

const OWNER = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
const BUILDER = encodeAddress(Uint8Array.from({ length: 32 }, (_, index) => index));
const ZERO = OWNER;
const builderFee = { builderAddress: BUILDER, builderFeeBps: 10n };

setProtocolManifest({
  receipts: { version: 1, flags: {}, types: {} },
  boxes: {
    formats: {
      order_state: {
        fields: [
          ...[
            "schema_version", "order_kind", "target_kind", "market_id", "owner_order_id", "side",
            "collateral_asset_id", "size_usd_delta", "collateral_amount", "trigger_price", "acceptable_price",
            "keeper_fee_asset_id", "keeper_fee_amount", "output_swap_mode", "min_primary_output_amount",
            "min_secondary_output_amount", "expiry_time", "created_at", "flags",
          ].map((name) => ({ name, type: "uint64", size: 8 })),
          { name: "builder_address", type: "address", size: 32 },
          { name: "builder_fee_bps", type: "uint64", size: 8 },
        ],
      },
    },
  },
  apps: {
    PDexV2Math: { method_specs: { noop: methodSpec("noop()void", []) } },
    PDexV2Trading: { method_specs: {
      open_or_increase: methodSpec(
        "open_or_increase(uint64,txn,uint64,uint64,uint64,(address,uint64),byte[],byte[])byte[]",
        ["uint64", "txn", "uint64", "uint64", "uint64", "(address,uint64)", "byte[]", "byte[]"],
      ),
      decrease_or_close: methodSpec(
        "decrease_or_close(uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,(address,uint64),byte[],byte[],uint64,uint64,uint64,uint64)byte[]",
        ["uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "(address,uint64)", "byte[]", "byte[]", "uint64", "uint64", "uint64", "uint64"],
      ),
    } },
    PDexV2SwapOps: { method_specs: {
      swap_exact_in: methodSpec(
        "swap_exact_in(uint64,uint64,uint64,txn,uint64,address,byte[],byte[],byte[],byte[],uint64,uint64,uint64)byte[]",
        ["uint64", "uint64", "uint64", "txn", "uint64", "address", "byte[]", "byte[]", "byte[]", "byte[]", "uint64", "uint64", "uint64"],
      ),
      swap_exact_in_with_builder: methodSpec(
        "swap_exact_in_with_builder(uint64,uint64,uint64,txn,txn,(address,uint64),uint64,address,byte[],byte[],byte[],byte[],uint64,uint64,uint64)byte[]",
        ["uint64", "uint64", "uint64", "txn", "txn", "(address,uint64)", "uint64", "address", "byte[]", "byte[]", "byte[]", "byte[]", "uint64", "uint64", "uint64"],
      ),
    } },
    PDexV2OrderOps: { method_specs: {
      submit_order: methodSpec(
        "submit_order(uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,(address,uint64),txn,pay,byte[],byte[])byte[]",
        ["uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "(address,uint64)", "txn", "pay", "byte[]", "byte[]"],
      ),
      submit_linked_order: methodSpec(
        "submit_linked_order(uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,(address,uint64),txn,pay,byte[],byte[])byte[]",
        ["uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "(address,uint64)", "txn", "pay", "byte[]", "byte[]"],
      ),
      execute_order: methodSpec(
        "execute_order(address,uint64,byte[],byte[],uint64,uint64,uint64)byte[]",
        ["address", "uint64", "byte[]", "byte[]", "uint64", "uint64", "uint64"],
      ),
    } },
  },
}, 2);

const params: SuggestedParams = {
  fee: 1_000n,
  minFee: 1_000n,
  firstValid: 1n,
  lastValid: 1_000n,
  genesisHash: new Uint8Array(32),
  genesisID: "builder-fee-sdk-v1",
};

const common = {
  // These descriptor fixtures explicitly select the no-recall path.
  yieldRecallMode: 0,
  sender: OWNER,
  v2MarketsAppId: 2001,
  v2TradingAppId: 2002,
  v2AdminControlAppId: 2003,
  v2MathAppId: 2004,
  v2AdminOpsAppId: 2005,
  v2SwapOpsAppId: 2007,
  v2TradingRiskOpsAppId: 2008,
  v2MarketXalgoYieldVaultAppId: 2009,
  marketId: 7,
  indexAssetId: 10,
  longAssetId: 11,
  shortAssetId: 12,
  oracleMessage: new Uint8Array(133).fill(1),
  oracleSignature: new Uint8Array(64).fill(2),
};

test("builder normalization enforces paired values and action caps", () => {
  assert.deepEqual(normalizeBuilderFee(undefined), [ZERO, 0n]);
  assert.deepEqual(normalizeBuilderFee(builderFee, MAX_POSITION_BUILDER_FEE_BPS), [BUILDER, 10n]);
  assert.throws(
    () => normalizeBuilderFee({ builderAddress: BUILDER, builderFeeBps: MAX_SWAP_BUILDER_FEE_BPS + 1n }, MAX_SWAP_BUILDER_FEE_BPS),
    /exceeds action cap/,
  );
  assert.throws(
    () => normalizeBuilderFee({ builderAddress: ZERO, builderFeeBps: 1n }),
    /address\/rate mismatch/,
  );
});

test("one-hop and two-hop swaps charge the initial input once", () => {
  const oneHop = buildV2SwapExactInTransactions({
    ...common,
    tokenInAssetId: 11,
    amountIn: 1_000_000n,
    minAmountOut: 1n,
    builderFee: { builderAddress: BUILDER, builderFeeBps: 100n },
  }, params);
  assert.deepEqual(oneHop.slice(0, 3).map((txn) => String(txn.type)), ["axfer", "axfer", "appl"]);
  assert.equal(oneHop[1].assetTransfer?.receiver.toString(), BUILDER);
  assert.equal(oneHop[1].assetTransfer?.amount, 10_000n);
  assert.equal(v2TransactionGroupResult(oneHop).primaryIndex, 2);

  const route = buildV2SwapRouteExactInTransactions({
    ...common,
    tokenInAssetId: 11,
    amountIn: 1_000_000n,
    minFinalAmountOut: 1n,
    builderFee: { builderAddress: BUILDER, builderFeeBps: 100n },
    hops: [
      { ...common, marketId: 7, tokenInAssetId: 11 },
      { ...common, marketId: 8, indexAssetId: 13, longAssetId: 13, tokenInAssetId: 12 },
    ],
  }, params);
  assert.equal(route.filter((txn) => txn.assetTransfer?.receiver.toString() === BUILDER).length, 1);
  assert.equal(route[1].assetTransfer?.amount, 10_000n);
  assert.equal(v2TransactionGroupResult(route).primaryIndex, 2);

  const roundedZero = buildV2SwapExactInTransactions({
    ...common,
    tokenInAssetId: 11,
    amountIn: 99n,
    minAmountOut: 0n,
    builderFee: { builderAddress: BUILDER, builderFeeBps: 1n },
  }, params);
  assert.equal(roundedZero.filter((txn) => txn.assetTransfer?.receiver.toString() === BUILDER).length, 0);
  assert.equal(v2TransactionGroupResult(roundedZero).primaryIndex, 1);
});

test("pair descriptors and stored orders preserve builder authorization", () => {
  const open = buildV2OpenOrIncreaseCall({
    ...common,
    collateralAssetId: 12,
    collateralAmount: 6_000_000n,
    side: 1,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: 50_100_000n,
    builderFee,
  });
  assert.equal(open.accounts.at(-1), BUILDER);
  assert.equal(open.flatFeeMicroAlgo, BigInt(V2_TRADING_METHOD_FLAT_FEE_MICRO_ALGO) + 1_000n);
  assert.ok(
    (open.foreignApps?.length ?? 0)
      + (open.foreignAssets?.length ?? 0)
      + (open.accounts?.length ?? 0)
      + (open.boxes?.length ?? 0)
      <= 8,
  );
  assert.equal(
    (open.resourceCarriers ?? []).filter(
      (carrier) => carrier.foreignApps?.length === 1
        && carrier.foreignApps[0] === 2008
        && carrier.boxes?.length === 1,
    ).length,
    1,
  );

  const close = buildV2DecreaseOrCloseCall({
    ...common,
    collateralAssetId: 12,
    side: 1,
    sizeUsdDelta: 10_000_000n,
    acceptablePrice: 49_900_000n,
    outputSwapMode: 0,
    minPrimaryOutput: 0,
    minPrimaryOutputAmount: 0,
    minSecondaryOutputAmount: 0,
    builderFee,
  });
  assert.ok(
    (close.foreignApps?.length ?? 0)
      + (close.foreignAssets?.length ?? 0)
      + (close.accounts?.length ?? 0)
      + (close.boxes?.length ?? 0)
      <= 8,
  );

  const submissionInput = {
    ...common,
    v2OrderOpsAppId: 2010,
    v2SingleTokenTradingAppId: 3002,
    ownerOrderId: 9,
    orderKind: V2_ORDER_KIND.OPEN_LIMIT,
    targetKind: V2_ORDER_TARGET.PAIR,
    side: 1,
    collateralAssetId: 12,
    collateralAmount: 6_000_000n,
    sizeUsdDelta: 10_000_000n,
    triggerPrice: 50_000_000n,
    acceptablePrice: 50_100_000n,
    keeperFeeAssetId: 12,
    keeperFeeAmount: 5_000n,
    timeInForce: 1,
    builderFee,
  };
  const submit = buildV2SubmitOrderCall(submissionInput);
  for (const invalid of [null, true, false, "", " ", 1.5]) {
    assert.throws(() => buildV2SubmitOrderCall({ ...submissionInput, expectedPositionId: invalid as never }));
  }
  assert.deepEqual(submit.accounts, [BUILDER]);
  assert.equal(submit.flatFeeMicroAlgo, BigInt(V2_ORDER_OPS_METHOD_FLAT_FEE_MICRO_ALGO) + 1_000n);

  const execute = buildV2ExecuteOrderCall({
    ...common,
    v2OrderOpsAppId: 2010,
    sender: OWNER,
    owner: OWNER,
    ownerOrderId: 9,
    orderKind: V2_ORDER_KIND.OPEN_LIMIT,
    targetTradingAppId: 2002,
    side: 1,
    collateralAssetId: 12,
    builderFee,
  });
  assert.equal(execute.accounts.includes(OWNER), true);
  assert.equal(execute.accounts.at(-1), BUILDER);
  assert.equal(execute.flatFeeMicroAlgo, BigInt(V2_ORDER_OPS_EXECUTE_METHOD_FLAT_FEE_MICRO_ALGO) + 1_000n);

  assert.throws(() => buildV2SubmitOrderCall({
    ...common,
    v2OrderOpsAppId: 2010,
    v2SingleTokenTradingAppId: 3002,
    ownerOrderId: 10,
    orderKind: V2_ORDER_KIND.OPEN_LIMIT,
    targetKind: V2_ORDER_TARGET.SINGLE_TOKEN,
    side: 1,
    collateralAssetId: 12,
    collateralAmount: 6_000_000n,
    sizeUsdDelta: 10_000_000n,
    triggerPrice: 50_000_000n,
    acceptablePrice: 50_100_000n,
    keeperFeeAssetId: 12,
    keeperFeeAmount: 5_000n,
    timeInForce: 1,
    builderFee,
  }), /exceeds action cap/);
});

test("quotes disclose additive fees and typed OrderStateV3 decodes the persisted pair", () => {
  const market = marketState();
  const pool = poolState();
  const swap = quoteV2SwapExactIn({
    market,
    pool,
    tokenInAssetId: 11n,
    amountIn: 1_000_000n,
    builderFee: { builderAddress: BUILDER, builderFeeBps: 100n },
  });
  assert.equal(swap.builder_fee_amount, 10_000n);
  assert.equal(swap.total_wallet_debit, 1_010_000n);
  assert.equal(swap.required_group_flat_fee_microalgos, BigInt(V2_SWAP_EXACT_IN_METHOD_FLAT_FEE_MICRO_ALGO) + 2_000n);

  const order = quoteV2OpenLimitOrder({
    market,
    pool,
    owner: OWNER,
    collateralAssetId: 12n,
    side: 1n,
    sizeUsdDelta: 10_000_000n,
    collateralAmount: 6_000_000n,
    triggerPrice: 49_000_000_000_000_000n,
    keeperFeeAmount: 5_000n,
    prices: { ...market, index_price_max: 50_000_000_000_000_000n },
    builderFee,
  });
  assert.equal(order.builder_address, BUILDER);
  assert.equal(order.builder_fee_bps, 10n);

  const words = Array.from({ length: 19 }, (_, index) => {
    const raw = new Uint8Array(8);
    new DataView(raw.buffer).setBigUint64(0, BigInt(index === 0 ? 3 : index));
    return raw;
  });
  const bytes = new Uint8Array(192);
  let offset = 0;
  for (const word of words) { bytes.set(word, offset); offset += word.length; }
  bytes.set(Uint8Array.from({ length: 32 }, (_, index) => index), offset);
  offset += 32;
  new DataView(bytes.buffer).setBigUint64(offset, 10n);
  const decoded = parseV2OrderState(bytes);
  assert.equal(decoded.builder_address, BUILDER);
  assert.equal(decoded.builder_fee_bps, 10n);
  assert.equal(V2_ORDER_BOX_MBR_MICRO_ALGO, 99_700);
});


test("active attached orders build one bounded atomic group", () => {
  const group = buildV2ActiveAttachedOrdersTransactions({
    expectedPositionId: 0n,
    ...common,
    v2OrderOpsAppId: 2010,
    v2SingleTokenTradingAppId: 3002,
    baseOrderId: 40,
    targetKind: V2_ORDER_TARGET.PAIR,
    side: 1,
    collateralAssetId: 12,
    collateralAmount: 0,
    sizeUsdDelta: 10_000_000,
    acceptablePrice: 50_100_000,
    takeProfit: { keeperFeeAmount: 5_000, keeperFeeAssetId: 12, timeInForce: 1, triggerPrice: 55_000_000, acceptablePrice: 54_900_000 },
    stopLoss: { keeperFeeAmount: 5_000, keeperFeeAssetId: 12, timeInForce: 1, triggerPrice: 45_000_000, acceptablePrice: 44_900_000 },
  }, params);
  assert.equal(group.length, 8);
  assert.equal(v2TransactionGroupResult(group).primaryIndex, 2);
  assert.equal(group.filter((txn) => Number(txn.applicationCall?.appIndex ?? 0) === 2010).length, 2);
  assert.deepEqual(
    group.filter((txn) => txn.payment).map((txn) => txn.payment?.amount),
    [BigInt(V2_ORDER_BOX_MBR_MICRO_ALGO), BigInt(V2_ORDER_BOX_MBR_MICRO_ALGO)],
  );
  assert.equal(new Set(group.map((txn) => Buffer.from(txn.group ?? new Uint8Array()).toString("hex"))).size, 1);
});

function marketState(): Record<string, bigint> {
  return {
    market_id: 7n,
    index_asset_id: 10n,
    long_asset_id: 11n,
    short_asset_id: 12n,
    position_conversion_scale: 1_000_000_000_000_000n,
    swap_fee_improve_bps: 4n,
    swap_fee_worsen_bps: 6n,
    swap_impact_factor_bps: 10n,
    max_swap_impact_bps: 100n,
    index_price: 50_000_000_000_000_000n,
    index_price_min: 49_900_000_000_000_000n,
    index_price_max: 50_100_000_000_000_000n,
    long_price: 50_000_000_000_000_000n,
    long_price_min: 49_900_000_000_000_000n,
    long_price_max: 50_100_000_000_000_000n,
    short_price: 1_000_000_000_000n,
    short_price_min: 1_000_000_000_000n,
    short_price_max: 1_000_000_000_000n,
  };
}

function poolState(): Record<string, bigint> {
  return {
    long_pool_amount: 1_000_000_000n,
    short_pool_amount: 50_000_000_000n,
    swap_impact_pool_long_amount: 10_000_000n,
    swap_impact_pool_short_amount: 10_000_000n,
  };
}

function methodSpec(signature: string, types: string[]) {
  return { signature, args: types.map((type, index) => ({ type, name: `arg${index}` })) };
}
