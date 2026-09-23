import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";
import { ABIType, encodeAddress } from "algosdk";
import { V2_ORDER_STATUS, V2_ORDER_BRACKET_CLEANUP_REASON } from "../src/index.js";

import { decodeReceipt, decodeReceiptFromConfirmation, encodeReceipt } from "../src/receipts.js";

const manifest = {
  receipts: {
    version: 1,
    flags: {},
    types: {
      v2_example: {
        id: 9,
        fields: ["amount"],
        field_types: { amount: "uint64" },
      },
    },
  },
};

test("decodeReceiptFromConfirmation accepts direct and ARC4 return logs", () => {
  const receipt = encodeReceipt("v2_example", 0, { amount: 42 }, manifest);
  const direct = decodeReceiptFromConfirmation({ logs: [receipt] }, manifest);
  assert.equal(direct?.eventType, "v2_example");
  assert.equal(direct?.fields.amount, 42n);

  const arc4 = Uint8Array.from([
    0x15, 0x1f, 0x7c, 0x75,
    receipt.byteLength >> 8,
    receipt.byteLength & 0xff,
    ...receipt,
  ]);
  const encoded = Buffer.from(arc4).toString("base64");
  const decoded = decodeReceiptFromConfirmation({ logs: ["unrelated", encoded] }, manifest);
  assert.equal(decoded?.fields.amount, 42n);
});

const orderManifest = {
  receipts: {
    version: 1,
    enums: {
      order_status: { values: V2_ORDER_STATUS, reserved_values: [9] },
      order_bracket_cleanup_reason: { values: V2_ORDER_BRACKET_CLEANUP_REASON, reserved_values: [4] },
    },
    types: {
      v2_order_cancelled: {
        id: 232,
        fields: ["status", "owner", "owner_order_id", "order_kind", "target_kind", "market_id", "side", "size_usd_delta", "keeper_fee_amount", "storage_refund_microalgo"],
        field_types: { owner: "address" },
        field_enums: { status: "order_status" },
      },
      v2_order_bracket_cleanup: {
        id: 235,
        fields: ["reason", "owner", "base_order_id", "child_order_id", "storage_refund_microalgo", "keeper_fee_refund", "keeper_fee_paid"],
        field_types: { owner: "address" },
        field_enums: { reason: "order_bracket_cleanup_reason" },
      },
    },
  },
};

test("cancel receipt codes retain raw bigint values with old and enriched manifests", () => {
  const owner = encodeAddress(new Uint8Array(32).fill(7));
  const abi = ABIType.from("(uint64,uint64,uint64,uint64,address,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64)");
  // 99 models an unknown future code: clients must retain it, not mislabel it.
  for (const status of [...Object.values(V2_ORDER_STATUS), 99]) {
    const raw = abi.encode([1, 232, 0, status, owner, 41, 3, 1, 2, 1, 5_000_000, 10_000, 99_700]);
    const decoded = decodeReceipt(raw, orderManifest);
    assert.equal(decoded.eventType, "v2_order_cancelled");
    assert.equal(decoded.fields.status, BigInt(status));
    assert.equal(decoded.fields.owner_order_id, 41n);
    assert.equal(decoded.fields.owner, owner);
    assert.equal(decoded.fields.keeper_fee_amount, 10_000n);
    assert.deepEqual(encodeReceipt(decoded.eventType, decoded.flags, decoded.fields, orderManifest), raw);
    const oldManifest = { receipts: { version: 1, types: {
      v2_order_cancelled: { ...orderManifest.receipts.types.v2_order_cancelled, field_enums: undefined },
    } } };
    assert.deepEqual(decodeReceipt(raw, oldManifest), decoded);
  }
});

test("bracket cleanup identifies the removed child and preserves refund fields", () => {
  const owner = encodeAddress(new Uint8Array(32).fill(7));
  const abi = ABIType.from("(uint64,uint64,uint64,uint64,address,uint64,uint64,uint64,uint64,uint64)");
  for (const reason of [...Object.values(V2_ORDER_BRACKET_CLEANUP_REASON), 99]) {
    const raw = abi.encode([1, 235, 0, reason, owner, 41, 42, 99_700, 10_000, 0]);
    const decoded = decodeReceipt(raw, orderManifest);
    assert.equal(decoded.eventType, "v2_order_bracket_cleanup");
    assert.equal(decoded.fields.reason, BigInt(reason));
    assert.equal(decoded.fields.base_order_id, 41n);
    assert.equal(decoded.fields.child_order_id, 42n);
    assert.equal(decoded.fields.storage_refund_microalgo, 99_700n);
    assert.equal(decoded.fields.keeper_fee_refund, 10_000n);
    assert.equal(decoded.fields.keeper_fee_paid, 0n);
    assert.deepEqual(encodeReceipt(decoded.eventType, decoded.flags, decoded.fields, orderManifest), raw);
  }
});
