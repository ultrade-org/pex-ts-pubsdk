import assert from "node:assert/strict";
import test from "node:test";

import { encodeAddress, type SuggestedParams } from "algosdk";

import {
  TEST_FUNDS_RETURN_NOTE,
  buildTestFundsAlgoReturnTransaction,
  buildTestFundsAssetOptInTransaction,
} from "../src/testFunds.js";

const sender = encodeAddress(new Uint8Array(32).fill(1));
const receiver = encodeAddress(new Uint8Array(32).fill(2));

function suggestedParams(): SuggestedParams {
  return {
    fee: 1_000,
    minFee: 1_000,
    flatFee: true,
    firstValid: 100n,
    lastValid: 1_100n,
    genesisID: "testnet-v1.0",
    genesisHash: new Uint8Array(32).fill(3),
  };
}

test("test-funds ALGO return is an exact user payment without close or rekey", () => {
  const txn = buildTestFundsAlgoReturnTransaction({
    sender,
    receiver,
    amount: 1_500_000,
    suggestedParams: suggestedParams(),
  });
  assert.equal(txn.sender.toString(), sender);
  assert.ok(txn.payment);
  assert.equal(txn.payment.receiver.toString(), receiver);
  assert.equal(txn.payment.amount, 1_500_000n);
  assert.equal(txn.payment.closeRemainderTo, undefined);
  assert.equal(txn.rekeyTo, undefined);
  assert.equal(new TextDecoder().decode(txn.note), TEST_FUNDS_RETURN_NOTE);
});

test("test-funds ALGO return validates amount and distinct addresses", () => {
  assert.throws(
    () => buildTestFundsAlgoReturnTransaction({
      sender,
      receiver,
      amount: 0,
      suggestedParams: suggestedParams(),
    }),
    /positive uint64/,
  );
  assert.throws(
    () => buildTestFundsAlgoReturnTransaction({
      sender,
      receiver: sender,
      amount: 1,
      suggestedParams: suggestedParams(),
    }),
    /must be different/,
  );
  assert.throws(
    () => buildTestFundsAlgoReturnTransaction({
      sender: "invalid",
      receiver,
      amount: 1,
      suggestedParams: suggestedParams(),
    }),
  );
  assert.throws(
    () => buildTestFundsAlgoReturnTransaction({
      sender,
      receiver,
      amount: Number.MAX_SAFE_INTEGER + 1,
      suggestedParams: suggestedParams(),
    }),
    /safe integer/,
  );
});

test("test-funds ASA opt-in is an exact zero self-transfer", () => {
  const txn = buildTestFundsAssetOptInTransaction({
    sender,
    assetId: 767_131_651,
    suggestedParams: suggestedParams(),
  });
  assert.equal(txn.sender.toString(), sender);
  assert.ok(txn.assetTransfer);
  assert.equal(txn.assetTransfer.assetIndex, 767_131_651n);
  assert.equal(txn.assetTransfer.receiver.toString(), sender);
  assert.equal(txn.assetTransfer.amount, 0n);
  assert.equal(txn.assetTransfer.closeRemainderTo, undefined);
  assert.equal(txn.rekeyTo, undefined);
});

test("test-funds ASA opt-in validates address and asset id", () => {
  assert.throws(
    () => buildTestFundsAssetOptInTransaction({
      sender,
      assetId: 0,
      suggestedParams: suggestedParams(),
    }),
    /positive uint64/,
  );
  assert.throws(
    () => buildTestFundsAssetOptInTransaction({
      sender: "invalid",
      assetId: 1,
      suggestedParams: suggestedParams(),
    }),
  );
  assert.throws(
    () => buildTestFundsAssetOptInTransaction({
      sender,
      assetId: Number.MAX_SAFE_INTEGER + 1,
      suggestedParams: suggestedParams(),
    }),
    /safe integer/,
  );
});
