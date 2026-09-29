import assert from "node:assert/strict";
import test from "node:test";
import { ABIMethod, decodeUint64, encodeAddress, type SuggestedParams } from "algosdk";
import { setProtocolManifest } from "../src/manifest.js";
import { v2TraderBoxKey } from "../src/boxes.js";
import {
  buildV2WithdrawStorageCreditTransactions, buildV2CloseStorageAccountTransactions,
  v2TransactionGroupResult,
} from "../src/transactions.js";

const methods = {
  withdraw_storage_credit: { signature: "withdraw_storage_credit(uint64)byte[]", args: [{ name: "amount", type: "uint64" }] },
  close_storage_account: { signature: "close_storage_account()byte[]", args: [] },
};
setProtocolManifest({ protocol_version: 2, apps: { PDexV2Trading: { methods }, PDexV2SingleTokenTrading: { methods } } }, 2);
const sender = encodeAddress(new Uint8Array(32).fill(8));
const params: SuggestedParams = { fee: 1000, minFee: 1000, flatFee: true, firstValid: 1, lastValid: 1001, genesisHash: new Uint8Array(32), genesisID: "localnet" };
for (const tradingAppName of ["PDexV2Trading", "PDexV2SingleTokenTrading"] as const) {
  for (const close of [false, true]) test(`${tradingAppName} ${close ? "close" : "withdraw"} storage encodes the owner box, inner payment fee and primary call`, () => {
    const input = { sender, tradingAppId: 123, tradingAppName, amountMicroAlgo: 90_001n };
    const txns = close ? buildV2CloseStorageAccountTransactions(input, params) : buildV2WithdrawStorageCreditTransactions(input, params);
    assert.equal(txns.length, 1);
    const txn = txns[0];
    assert.equal(txn.applicationCall!.appIndex, 123n);
    assert.equal(txn.sender.toString(), sender);
    assert.equal(txn.fee, 2000n);
    const method = ABIMethod.fromSignature(close ? "close_storage_account()byte[]" : "withdraw_storage_credit(uint64)byte[]");
    assert.deepEqual(txn.applicationCall!.appArgs[0], method.getSelector());
    if (!close) assert.equal(decodeUint64(txn.applicationCall!.appArgs[1], "bigint"), 90_001n);
    assert.deepEqual(txn.applicationCall!.boxes[0].name, v2TraderBoxKey(sender));
    assert.equal(txn.applicationCall!.boxes.filter((b) => b.name.length === 0).length, 1, "Trading program read budget");
    assert.equal(v2TransactionGroupResult(txns).primaryIndex, 0);
    assert.equal(txn.rekeyTo, undefined);
    assert.equal(txn.payment, undefined);
  });
}
test("storage withdrawals reject nonpositive amounts before signing", () => {
  for (const amountMicroAlgo of [0n, -1n]) assert.throws(() => buildV2WithdrawStorageCreditTransactions({ sender, tradingAppId: 123, tradingAppName: "PDexV2Trading", amountMicroAlgo }, params), /must_be_positive/);
});
test("storage payout fees cover two minimum fees when network minimum changes", () => {
  const [txn] = buildV2CloseStorageAccountTransactions({ sender, tradingAppId: 123, tradingAppName: "PDexV2Trading" }, { ...params, minFee: 2000 });
  assert.equal(txn.fee, 4000n);
});
