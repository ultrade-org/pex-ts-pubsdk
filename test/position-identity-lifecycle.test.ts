import assert from "node:assert/strict";
import test from "node:test";
import { analyzeV2OrderLifecycle as orders } from "../src/orders.js";
import { analyzeV2OrderLifecycle as lifecycle } from "../src/orderLifecycle.js";
import { V2_ORDER_LINK_MODE as LINK } from "../src/constants.js";
import { setProtocolManifest } from "../src/manifest.js";
import { buildV2ExecuteOrderCall } from "../src/transactions.js";
import { v2OrderBoxKey, v2PositionBoxKey } from "../src/boxes.js";

const key = { owner: "owner", market_id: 1, collateral_asset_id: 2, side: 1 };
const position = { ...key, position_id: 0n, size_usd: 100n };
const order = { ...key, schema_version: 4, position_id: 0n, owner_order_id: 41,
  order_kind: 2, size_usd_delta: 50n, trigger_price: 90n, acceptable_price: 80n,
  index_price_min: 100n, index_price_max: 100n };

test("legacy orphan cleanup proves both position and parent absence", () => {
  const types = ["address", "uint64", "byte[]", "byte[]", "uint64", "uint64", "uint64"];
  setProtocolManifest({ apps: {
    PDexV2Math: { method_specs: { noop: { signature: "noop()void", args: [], returns: { type: "void" } } } },
    PDexV2OrderOps: { method_specs: { execute_order: {
    signature: `execute_order(${types.join(",")})byte[]`, args: types.map((type) => ({ type })), returns: { type: "byte[]" },
  } } } } }, 2);
  const owner = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";
  const input = {
    sender: owner, owner, v2OrderOpsAppId: 2010, v2MarketsAppId: 2001,
    v2TradingAppId: 2002, v2AdminControlAppId: 2003, v2MathAppId: 2004,
    targetTradingAppId: 2002, marketId: 7, targetKind: 1, indexAssetId: 10,
    longAssetId: 11, shortAssetId: 12, collateralAssetId: 12, side: 1,
    ownerOrderId: 41, orderKind: 2, keeperFeeAssetId: 12,
    linkMode: 2, linkBaseOrderId: 40, schemaVersion: 3, cleanup: "orphan" as const,
    oracleMessage: new Uint8Array(), oracleSignature: new Uint8Array(),
  };
  const call = buildV2ExecuteOrderCall(input);
  assert.deepEqual(call.largeProgramRoles, ["order_ops", "trading"]);
  assert.deepEqual(call.boxes.filter((box) => box.name.length).map((box) => Buffer.from(box.name).toString("hex")),
    [v2OrderBoxKey(owner, 41), v2PositionBoxKey(owner, 7, 12, 1), v2OrderBoxKey(owner, 40)].map((name) => Buffer.from(name).toString("hex")));
  assert.throws(() => buildV2ExecuteOrderCall({ ...input, schemaVersion: 4 }), /only active/);
  assert.throws(() => buildV2ExecuteOrderCall({ ...input, cleanup: "legacy" }), /legacy orders remain executable/);
});

for (const analyze of [orders, lifecycle]) {
  test(`${analyze === orders ? "orders" : "lifecycle"}: only an explicit matching lifetime is executable`, () => {
    assert.equal(analyze(order, [position], [order]).executable, true);
    for (const missing of [undefined, null, "", "bad", -1, 2 ** 48]) {
      const result = analyze(order, [{ ...position, position_id: missing }], [order]);
      assert.equal(result.executable, false);
      assert.equal(result.staleReason, "unknown_position_state");
      assert.equal(result.cleanupReason, "");
    }
    const replaced = analyze(order, [{ ...position, position_id: 1n }], [order]);
    assert.equal(replaced.cleanupReason, "position_replaced");
    assert.equal(replaced.positionMatches, false);
    assert.equal(replaced.pendingTotals.pendingTpSizeUsd, 0n);
    assert.equal(analyze(order, [], [order]).cleanupReason, "position_missing");
  });

  test(`${analyze === orders ? "orders" : "lifecycle"}: pending children never activate through parent absence`, () => {
    const pending = { ...order, link_mode: LINK.CHILD_WAIT_PARENT, link_base_order_id: 40 };
    const result = analyze(pending, [position], [pending]);
    assert.equal(result.parentPending, true);
    assert.equal(result.executable, false);
    assert.equal(result.cleanupReason, "");
    assert.equal(result.pendingTotals.pendingReduceTotalForPositionUsd, 0n);
    assert.equal(analyze({ ...pending, link_mode: LINK.CHILD_ACTIVE }, [position], []).executable, true);
  });

  test(`${analyze === orders ? "orders" : "lifecycle"}: legacy protection and brackets remain executable`, () => {
    const legacy = { ...order, schema_version: 3, position_id: undefined };
    for (const identity of [0n, 17n, undefined]) {
      const result = analyze(legacy, [{ ...position, position_id: identity }], [legacy]);
      assert.equal(result.cleanupReason, "");
      assert.equal(result.executable, true);
      assert.equal(result.pendingTotals.pendingTpSizeUsd, 50n);
    }
    assert.equal(analyze(legacy, [], []).cleanupReason, "position_missing");
    assert.equal(analyze({ ...legacy, index_price_min: 1n }, [position], []).executable, false);
    const parent = { ...legacy, owner_order_id: 40, order_kind: 1, trigger_price: 110n, acceptable_price: 120n,
      link_mode: LINK.BRACKET_PARENT, link_base_order_id: 40 };
    assert.equal(analyze(parent, [], []).executable, true);
    const pending = { ...legacy, link_mode: LINK.CHILD_WAIT_PARENT, link_base_order_id: 40 };
    const waiting = analyze(pending, [position], [parent, pending]);
    assert.equal(waiting.parentPending, true);
    assert.equal(waiting.cleanupReason, "");
    assert.equal(waiting.pendingTotals.pendingTpSizeUsd, 0n);
    const active = analyze(pending, [{ ...position, position_id: 17n }], [pending]);
    assert.equal(active.executable, true);
    assert.equal(active.pendingTotals.pendingTpSizeUsd, 50n);
    assert.equal(analyze(pending, [], []).cleanupReason, "position_missing");
  });
}
