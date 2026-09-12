import assert from "node:assert/strict";
import test from "node:test";
import { encodeAddress, type SuggestedParams } from "algosdk";
import {
  appendV2TransactionGroupTransactions,
  buildV2FundStorageTransactions,
  prependV2TransactionGroupTransactions,
  toApplicationNoOpTxn,
  v2TransactionGroupResult,
} from "../src/transactions.js";
import { setProtocolManifest } from "../src/manifest.js";

setProtocolManifest({ apps: {
  PDexV2Trading: { method_specs: { fund_storage: {
    signature: "fund_storage(pay)void", args: [{ type: "pay" }], returns: { type: "void" },
  } } },
} }, 2);

const sender = encodeAddress(new Uint8Array(32).fill(1));
const params: SuggestedParams = {
  fee: 1_000, minFee: 1_000, flatFee: true,
  firstValid: 1, lastValid: 1_001,
  genesisHash: new Uint8Array(32), genesisID: "testnet-carrier-identity",
};

function carrier() {
  return toApplicationNoOpTxn({
    type: "appl", appName: "PDexV2Math", appId: 1001,
    sender, method: "noop", appArgs: [Uint8Array.from([0xe8, 0x3a, 0x87, 0xab])],
    appArgsB64: ["6DqHqw=="], foreignApps: [1004], foreignAssets: [], accounts: [],
    boxes: [
      { appIndex: 1004, name: new TextEncoder().encode("same-yield-config") },
      { appIndex: 1004, name: new TextEncoder().encode("same-yield-runtime") },
    ],
    boxesB64: [], flatFeeMicroAlgo: 1_000n,
  }, params);
}

function action() {
  return v2TransactionGroupResult(buildV2FundStorageTransactions({
    v2MarketsAppId: 1002, v2TradingAppId: 1003,
    sender, paymentMicroAlgo: 100_000,
  }, params));
}

test("composing a yield refresh and action preserves duplicate helper calls with distinct IDs", () => {
  const first = carrier();
  const second = carrier();
  assert.equal(first.txID(), second.txID());
  const original = second.toEncodingData();
  const base = action();
  const business = base.transactions.map((transaction) => transaction.toEncodingData());
  const group = prependV2TransactionGroupTransactions(
    appendV2TransactionGroupTransactions(base, [second]), [first],
  );
  assert.equal(group.transactions.length, 4);
  assert.equal(group.primaryIndex, 2);
  assert.equal(new Set(group.transactions.map((transaction) => transaction.txID())).size, 4);
  const changed = second.toEncodingData();
  original.delete("grp"); changed.delete("grp");
  original.delete("note"); changed.delete("note");
  assert.deepEqual(changed, original, "only the duplicate helper note and group may change");
  for (const [index, transaction] of base.transactions.entries()) {
    const actual = transaction.toEncodingData();
    actual.delete("grp"); business[index].delete("grp");
    assert.deepEqual(actual, business[index], "business transactions remain intact");
  }
  const extra = carrier();
  const regrouped = appendV2TransactionGroupTransactions(group, [extra]);
  assert.equal(new Set(regrouped.transactions.map((transaction) => transaction.txID())).size, 5);
});

test("composition rejects repeated business transactions without silently changing them", () => {
  const base = action();
  const duplicate = action().transactions[0];
  assert.throws(() => prependV2TransactionGroupTransactions(base, [duplicate]), /duplicate_non_carrier_transaction/);
});

test("composition rejects the same mutable carrier object appearing twice", () => {
  const shared = carrier();
  assert.throws(() => prependV2TransactionGroupTransactions(action(), [shared, shared]), /duplicate_transaction_object/);
});
