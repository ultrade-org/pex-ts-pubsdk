import assert from "node:assert/strict";
import test from "node:test";
import { computeGroupID, decodeUnsignedTransaction, type Transaction } from "algosdk";
import { setProtocolManifest } from "../src/manifest.js";
import { planV2CancelRelatedReduceOrders, planV2CloseWithOrderCleanup } from "../src/orders.js";
import {
  buildV2CancelOrderTransactions, buildV2DecreaseOrCloseTransactions,
  v2TransactionGroupResult, V2_ORDER_KIND,
} from "../src/transactions.js";

const spec = (name: string, types: string[], returns = "byte[]") => ({
  signature: `${name}(${types.join(",")})${returns}`,
  args: types.map((type, i) => ({ name: `arg${i}`, type })), returns: { type: returns },
});
setProtocolManifest({ apps: {
  PDexV2Math: { method_specs: { noop: spec("noop", [], "void") } },
  PDexV2OrderOps: { method_specs: { cancel_order: spec("cancel_order", ["uint64"]) } },
  PDexV2AdminOps: { method_specs: {
    update_funding: spec("update_funding", ["uint64", "byte[]", "byte[]"]),
    update_borrowing: spec("update_borrowing", ["uint64", "byte[]", "byte[]"]),
  } },
  PDexV2Trading: { method_specs: { decrease_or_close: spec("decrease_or_close", [
    "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64",
    "(address,uint64)", "byte[]", "byte[]", "uint64", "uint64", "uint64", "uint64",
  ]) } },
} }, 2);

const owner = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
const suggestedParams = { fee: 1000, minFee: 1000, firstValid: 1, lastValid: 1000,
  genesisHash: new Uint8Array(32), genesisID: "cleanup-test" };
const common = { sender: owner, v2OrderOpsAppId: 2010, v2AdminControlAppId: 2003,
  v2MarketsAppId: 2001, v2TradingAppId: 2002, v2MathAppId: 2004,
  marketId: 7, indexAssetId: 10, longAssetId: 11, shortAssetId: 12,
  collateralAssetId: 12, side: 1, suggestedParams };
const attached = { attachedTakeProfitOrderId: 1001, attachedStopLossOrderId: 1002 };
const close = { ...common, expectedPositionId: 17n, yieldRecallMode: 0,
  sizeUsdDelta: 1000, acceptablePrice: 100, minPrimaryOutput: 0,
  oracleMessage: new Uint8Array(133).fill(1), oracleSignature: new Uint8Array(64).fill(2) };
function orders(count = 2) {
  return Array.from({ length: count }, (_, i) => ({ owner, owner_order_id: 1001 + i,
    order_kind: i % 2 ? V2_ORDER_KIND.DECREASE_STOP_LOSS : V2_ORDER_KIND.DECREASE_TAKE_PROFIT,
    market_id: 7, collateral_asset_id: 12, side: 1, keeper_fee_asset_id: 12,
    schema_version: 4, position_id: 17,
  }));
}
function assertGroup(transactions: Transaction[], app: number) {
  assert.ok(transactions.length > 0 && transactions.length <= 16);
  assert.equal(new Set(transactions.map(t => t.txID())).size, transactions.length);
  const unsigned = transactions.map(t => {
    const copy = decodeUnsignedTransaction(t.toByte()); copy.group = undefined; return copy;
  });
  const group = computeGroupID(unsigned);
  for (const txn of transactions) assert.deepEqual(txn.group, group);
  const primary = v2TransactionGroupResult(transactions);
  assert.equal(primary.primaryAppId, app);
  assert.equal(primary.transactions[primary.primaryIndex].applicationCall?.appIndex, BigInt(app));
}
function assertPreserved(actual: Transaction[], expected: Transaction[]) {
  assert.equal(actual.length, expected.length);
  for (const [index, txn] of actual.entries()) {
    const after = txn.toEncodingData(), before = expected[index].toEncodingData();
    after.delete("grp"); before.delete("grp");
    if (txn.applicationCall?.appIndex === 2004n) { after.delete("note"); before.delete("note"); }
    assert.deepEqual(after, before, "only helper notes and group IDs may change");
  }
}

test("cleanup distinguishes repeated Math carriers and preserves cancellation resources and fees", () => {
  const input = { ...common, ...attached, orders: orders() };
  const plan = planV2CancelRelatedReduceOrders(input);
  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0].length, 4);
  assertGroup(plan.groups[0], 2010);
  const original = input.orders.flatMap(order => buildV2CancelOrderTransactions({
    ...input, ownerOrderId: order.owner_order_id, keeperFeeAssetId: 12,
  }, suggestedParams));
  assertPreserved(plan.groups[0], original);
  assert.equal(plan.groups[0].filter(t => t.applicationCall?.appIndex === 2004n).length, 2);
});

test("close with cleanup retains close primary metadata and a separately valid closeGroup", () => {
  const input = { ...close, ...attached, orders: orders(), includeCancelOrders: true };
  const plan = planV2CloseWithOrderCleanup(input);
  assert.equal(plan.groups[0].length, 7);
  assert.deepEqual(plan.warnings, []);
  assertGroup(plan.groups[0], 2002);
  assertGroup(plan.closeGroup, 2002);
  const original = [ ...buildV2DecreaseOrCloseTransactions(input, suggestedParams),
    ...input.orders.flatMap(order => buildV2CancelOrderTransactions({
      ...input, ownerOrderId: order.owner_order_id, keeperFeeAssetId: 12,
    }, suggestedParams)),
  ];
  assertPreserved(plan.groups[0], original);
  assertPreserved(plan.closeGroup, original.slice(0, 3));
});

for (const count of [0, 1, 2]) {
  test(`ordinary cleanup remains valid with ${count} related orders and no child hints`, () => {
    const related = orders(count);
    const cancellations = planV2CancelRelatedReduceOrders({ ...common, orders: related });
    assert.equal(cancellations.groups.length, count ? 1 : 0);
    if (count) { assert.equal(cancellations.groups[0].length, count); assertGroup(cancellations.groups[0], 2010); }
    const plan = planV2CloseWithOrderCleanup({ ...close, orders: related, includeCancelOrders: true });
    assert.equal(plan.groups[0].length, 3 + count);
    assertGroup(plan.groups[0], 2002);
    assertGroup(plan.closeGroup, 2002);
  });
}

test("one cancellation with an attached-child budget carrier retains its primary", () => {
  const plan = planV2CancelRelatedReduceOrders({ ...common, ...attached, orders: orders(1) });
  assert.equal(plan.groups[0].length, 2);
  assertGroup(plan.groups[0], 2010);
});

test("cancellation batches preserve complete call/carrier pairs across the group-size boundary", () => {
  const plan = planV2CancelRelatedReduceOrders({ ...common, ...attached, orders: orders(9) });
  assert.deepEqual(plan.groups.map(g => g.length), [16, 2]);
  for (const group of plan.groups) {
    assertGroup(group, 2010);
    group.forEach((txn, i) => assert.equal(txn.applicationCall?.appIndex, i % 2 ? 2004n : 2010n));
  }
});

for (const [count, expected] of [[13, [16]], [14, [3, 14]], [17, [3, 16, 1]]] as const) {
  test(`close cleanup preserves group limits and follow-up warnings for ${count} cancellations`, () => {
    const plan = planV2CloseWithOrderCleanup({ ...close, orders: orders(count), includeCancelOrders: true });
    assert.deepEqual(plan.groups.map(g => g.length), expected);
    plan.groups.forEach((g, i) => assertGroup(g, i === 0 ? 2002 : 2010));
    assertGroup(plan.closeGroup, 2002);
    assert.deepEqual(plan.warnings, count <= 13 ? [] : ["related_order_cancels_require_followup_group"]);
  });
}

test("separate close and cancellation mode returns independently valid groups", () => {
  const plan = planV2CloseWithOrderCleanup({ ...close, ...attached, orders: orders(), includeCancelOrders: false });
  assert.deepEqual(plan.groups.map(g => g.length), [3, 4]);
  assertGroup(plan.groups[0], 2002); assertGroup(plan.groups[1], 2010);
  assert.deepEqual(plan.warnings, ["related_reduce_orders_require_owner_cancel"]);
});

test("cleanup rejects repeated business cancellations instead of silently changing them", () => {
  const [order] = orders(1);
  assert.throws(() => planV2CancelRelatedReduceOrders({ ...common, orders: [order, order] }), /duplicate_non_carrier_transaction/);
});

for (const hints of [
  { attachedTakeProfitOrderId: 0, attachedStopLossOrderId: 0 },
  { attachedTakeProfitOrderId: "1001", attachedStopLossOrderId: 1002n },
]) {
  test(`cleanup accepts normalized child hints ${String(hints.attachedTakeProfitOrderId)}`, () => {
    const plan = planV2CancelRelatedReduceOrders({ ...common, ...hints, orders: orders() });
    assert.equal(plan.groups[0].length, hints.attachedTakeProfitOrderId ? 4 : 2);
    assertGroup(plan.groups[0], 2010);
  });
}

test("close cleanup preserves a nonzero primary index after settlement maintenance", () => {
  const input = { ...close, ...attached, orders: orders(), includeCancelOrders: true,
    v2AdminOpsAppId: 2005, settlementMaintenanceDue: true,
    settlementMaintenanceOracleMessage: close.oracleMessage,
    settlementMaintenanceOracleSignature: close.oracleSignature,
  };
  const original = v2TransactionGroupResult(buildV2DecreaseOrCloseTransactions(input, suggestedParams));
  assert.ok(original.primaryIndex > 0);
  const plan = planV2CloseWithOrderCleanup(input);
  assert.equal(plan.groups.length, 1);
  assertGroup(plan.groups[0], 2002);
  assertGroup(plan.closeGroup, 2002);
  assert.equal(v2TransactionGroupResult(plan.groups[0]).primaryIndex, original.primaryIndex);
  assert.equal(v2TransactionGroupResult(plan.closeGroup).primaryIndex, original.primaryIndex);
});
