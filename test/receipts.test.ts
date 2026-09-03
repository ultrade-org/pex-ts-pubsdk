import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { decodeReceiptFromConfirmation, encodeReceipt } from "../src/receipts.js";

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
