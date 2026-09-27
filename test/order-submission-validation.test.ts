import assert from "node:assert/strict";
import test from "node:test";
import { ABIType, type Transaction } from "algosdk";
import { type BigNumberish, TIME_IN_FORCE, V2_ORDER_KIND } from "../src/constants.js";
import {
  buildV2SubmitOrderCall, buildV2SubmitLinkedOrderCall,
  buildV2SubmitOrderTransactions, buildV2SubmitLinkedOrderTransactions,
  buildV2MarketOpenWithAttachedOrdersTransactions, buildV2ActiveAttachedOrdersTransactions,
  buildV2OpenLimitWithAttachedOrdersTransactions,
} from "../src/transactions.js";

const spec = (name: string, fields: string[], returns: string) => {
  const args = fields.map(field => { const [name, type] = field.split(":"); return { name, type }; });
  return { signature: `${name}(${args.map(a => a.type).join(",")})${returns}`, args, returns: { type: returns } };
};
const manifest = { apps: {
  PDexV2Math: { method_specs: {
    noop: spec("noop", [], "void"),
  } },
  PDexV2Trading: { method_specs: {
    open_or_increase: spec("open_or_increase", ["market_id:uint64", "collateral_transfer:txn", "side:uint64", "size_usd_delta:uint64", "acceptable_price:uint64", "builder_fee:(address,uint64)", "oracle_message:byte[]", "oracle_signature:byte[]"], "byte[]"),
  } },
  PDexV2SingleTokenTrading: { method_specs: {
    open_or_increase: spec("open_or_increase", ["market_id:uint64", "collateral_transfer:txn", "side:uint64", "size_usd_delta:uint64", "acceptable_price:uint64", "oracle_message:byte[]", "oracle_signature:byte[]"], "byte[]"),
  } },
  PDexV2OrderOps: { method_specs: {
    submit_order: spec("submit_order", ["owner_order_id:uint64", "order_kind:uint64", "target_kind:uint64", "market_id:uint64", "side:uint64", "collateral_asset_id:uint64", "size_usd_delta:uint64", "collateral_amount:uint64", "trigger_price:uint64", "acceptable_price:uint64", "keeper_fee_asset_id:uint64", "keeper_fee_amount:uint64", "output_swap_mode:uint64", "min_primary_output_amount:uint64", "min_secondary_output_amount:uint64", "time_in_force:uint64", "expiry_time:uint64", "expected_position_id:uint64", "entry_group_offset:uint64", "builder_fee:(address,uint64)", "escrow_transfer:txn", "storage_payment:pay", "oracle_message:byte[]", "oracle_signature:byte[]"], "byte[]"),
    submit_linked_order: spec("submit_linked_order", ["owner_order_id:uint64", "order_kind:uint64", "target_kind:uint64", "market_id:uint64", "side:uint64", "collateral_asset_id:uint64", "size_usd_delta:uint64", "collateral_amount:uint64", "trigger_price:uint64", "acceptable_price:uint64", "keeper_fee_asset_id:uint64", "keeper_fee_amount:uint64", "output_swap_mode:uint64", "min_primary_output_amount:uint64", "min_secondary_output_amount:uint64", "time_in_force:uint64", "expiry_time:uint64", "link_mode:uint64", "link_base_order_id:uint64", "expected_position_id:uint64", "entry_group_offset:uint64", "builder_fee:(address,uint64)", "escrow_transfer:txn", "storage_payment:pay", "oracle_message:byte[]", "oracle_signature:byte[]"], "byte[]"),
  } },
} };
const owner = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
const P = 1_000_000_000_000n;
// Received public payload, used only to exercise offline transaction construction.
const oracleMessage = Uint8Array.from(Buffer.from("5044583203c061c4d8fc1dbdded2d7604be4568e3f6d041987ac37bde4b620b5ab39248adf00000000dbf5a6280000000000000001000000000000000000000000000000000000000001e1ab70000000143aa8af81000000143bf1103f000000143aa8af81000000143bf1103f000000e8c3f49a00000000e8d458c4c0000000006aaac8f3", "hex"));
const common = {
  manifest, sender: owner, v2OrderOpsAppId: 2010, v2MarketsAppId: 2001,
  v2TradingAppId: 2002, v2AdminControlAppId: 2003, v2MathAppId: 2004,
  v2SingleTokenTradingAppId: 2006, v2TradingRiskOpsAppId: 2008, v2MarketXalgoYieldVaultAppId: 2009,
  marketId: 1, targetKind: 1, indexAssetId: 0, longAssetId: 0, shortAssetId: 31566704,
  collateralAssetId: 31566704, backingAssetId: 31566704, side: 1, collateralAmount: 1_000_000,
  sizeUsdDelta: 10_000_000, ownerOrderId: 40, baseOrderId: 40,
  orderKind: V2_ORDER_KIND.OPEN_LIMIT, triggerPrice: P / 20n, acceptablePrice: P / 10n,
  keeperFeeAssetId: 31566704, keeperFeeAmount: 100_000, timeInForce: TIME_IN_FORCE.GTC,
  yieldRecallMode: 0, oracleMessage, oracleSignature: new Uint8Array(64),
};
const params = { fee: 1000, minFee: 1000, flatFee: true, firstValid: 1, lastValid: 1000, genesisHash: new Uint8Array(32) };
const linked = { ...common, linkMode: 1, linkBaseOrderId: 40 };
const legs = {
  takeProfit: { triggerPrice: P / 5n, acceptablePrice: P / 6n },
  stopLoss: { triggerPrice: P / 25n, acceptablePrice: P / 26n },
};
function argumentsFor(method: "submit_order" | "submit_linked_order", args: readonly Uint8Array[]) {
  const fields = manifest.apps.PDexV2OrderOps.method_specs[method].args.filter(a => !["txn", "pay"].includes(a.type));
  const values = [
    ...fields.slice(0, 14).map((f, i) => ABIType.from(f.type).decode(args[i + 1])),
    ...ABIType.from(`(${fields.slice(14).map(f => f.type).join(",")})`).decode(args[15]) as unknown[],
  ];
  return Object.fromEntries(fields.map((f, i) => [f.name, values[i]]));
}

for (const value of [0, 0n, "0", -1, 4, "", " ", 1.5, Number.MAX_SAFE_INTEGER + 1, null, undefined, true]) {
  test(`standalone and linked submissions reject invalid timeInForce ${String(value)} (${typeof value})`, () => {
    const timeInForce = value as BigNumberish;
    assert.throws(() => buildV2SubmitOrderCall({ ...common, timeInForce }));
    assert.throws(() => buildV2SubmitLinkedOrderCall({ ...linked, timeInForce }));
    assert.throws(() => buildV2SubmitOrderTransactions({ ...common, timeInForce }, params));
    assert.throws(() => buildV2SubmitLinkedOrderTransactions({ ...linked, timeInForce }, params));
  });
}

test("zero produces an actionable error, while standalone IOC remains supported", () => {
  assert.throws(() => buildV2SubmitOrderCall({ ...common, timeInForce: 0 }), /timeInForce must be GTC \(1\), GTD \(2\), or IOC \(3\)/);
  for (const tif of [1, 2, 3]) {
    for (const timeInForce of [tif, BigInt(tif), String(tif)]) {
      const args = argumentsFor("submit_order", buildV2SubmitOrderCall({ ...common, timeInForce, expiryTime: 2_000_000_000 }).appArgs);
      assert.equal(args.time_in_force, BigInt(tif));
    }
  }
  assert.throws(() => buildV2SubmitLinkedOrderCall({ ...linked, timeInForce: TIME_IN_FORCE.IOC }), /linked orders require.*IOC/);
});

const builders = [buildV2MarketOpenWithAttachedOrdersTransactions, buildV2ActiveAttachedOrdersTransactions, buildV2OpenLimitWithAttachedOrdersTransactions];
for (const build of builders) {
  for (const targetKind of [1, 2]) {
    const input = { ...common, ...legs, targetKind, ...(build === buildV2ActiveAttachedOrdersTransactions ? { expectedPositionId: 17n } : {}) };
    test(`${build.name}, target ${targetKind}: defaults and explicit GTC/GTD survive group encoding`, () => {
      for (const childTimeInForce of [undefined, 1, 2n, "2"]) {
        const group: Transaction[] = build({ ...input, childTimeInForce, childExpiryTime: 2_000_000_000 }, params);
        const children = group.filter(txn => txn.applicationCall?.appIndex === 2010n)
          .map(txn => argumentsFor("submit_linked_order", txn.applicationCall!.appArgs))
          .filter(args => args.order_kind !== BigInt(V2_ORDER_KIND.OPEN_LIMIT));
        assert.equal(children.length, 2);
        for (const child of children) {
          assert.equal(child.time_in_force, BigInt(childTimeInForce ?? TIME_IN_FORCE.GTC));
          assert.equal(child.expiry_time, 2_000_000_000n);
        }
        assert.equal(new Set(group.map(t => t.txID())).size, group.length);
      }
    });
    test(`${build.name}, target ${targetKind}: invalid inherited and per-leg TIF are rejected`, () => {
      for (const timeInForce of [0, 3, 4]) {
        assert.throws(() => build({ ...input, childTimeInForce: timeInForce }, params), /timeInForce/);
        for (const name of ["takeProfit", "stopLoss"] as const) {
          assert.throws(() => build({ ...input, [name]: { ...legs[name], timeInForce } }, params), /timeInForce/);
        }
      }
    });
    test(`${build.name}, target ${targetKind}: a leg overrides the child default`, () => {
      const group = build({ ...input, childTimeInForce: 2, childExpiryTime: 2_000_000_000,
        takeProfit: { ...legs.takeProfit, timeInForce: 1 } }, params);
      const children = group.filter(t => t.applicationCall?.appIndex === 2010n)
        .map(t => argumentsFor("submit_linked_order", t.applicationCall!.appArgs));
      assert.equal(children.find(a => a.order_kind === 2n)!.time_in_force, 1n);
      assert.equal(children.find(a => a.order_kind === 3n)!.time_in_force, 2n);
    });
  }
}
test("bracket entry itself rejects IOC before signing", () => {
  assert.throws(() => buildV2OpenLimitWithAttachedOrdersTransactions({ ...common, ...legs, timeInForce: 3 }, params), /linked orders require/);
});
