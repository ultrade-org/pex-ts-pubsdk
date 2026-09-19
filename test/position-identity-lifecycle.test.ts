import assert from "node:assert/strict";
import test from "node:test";
import { analyzeV2OrderLifecycle as orders } from "../src/orders.js";
import { analyzeV2OrderLifecycle as lifecycle } from "../src/orderLifecycle.js";
import { V2_ORDER_LINK_MODE as LINK } from "../src/constants.js";

const key = { owner: "owner", market_id: 1, collateral_asset_id: 2, side: 1 };
const position = { ...key, position_id: 0n, size_usd: 100n };
const order = { ...key, schema_version: 4, position_id: 0n, owner_order_id: 41,
  order_kind: 2, size_usd_delta: 50n, trigger_price: 90n, acceptable_price: 80n,
  index_price_min: 100n, index_price_max: 100n };

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

  test(`${analyze === orders ? "orders" : "lifecycle"}: legacy retirement and standalone entries remain distinct`, () => {
    const legacy = { ...order, schema_version: 3, position_id: undefined, index_price_min: 1n };
    assert.equal(analyze(legacy, [position], []).cleanupReason, "legacy_retired");
    assert.equal(analyze(legacy, [position], []).executable, false);
    const parent = { ...legacy, owner_order_id: 40, order_kind: 1, link_mode: LINK.BRACKET_PARENT, link_base_order_id: 40 };
    assert.equal(analyze(parent, [], []).cleanupReason, "legacy_retired");
    const pending = { ...legacy, link_mode: LINK.CHILD_WAIT_PARENT, link_base_order_id: 40 };
    assert.equal(analyze(pending, [], [parent]).cleanupReason, "");
    assert.equal(analyze(pending, [], []).cleanupReason, "legacy_retired");
    const entry = { ...order, schema_version: 3, position_id: undefined, order_kind: 1, trigger_price: 110n, acceptable_price: 120n };
    assert.equal(analyze(entry, [], []).executable, true);
  });
}
