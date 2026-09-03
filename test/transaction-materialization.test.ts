import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  assignGroupID,
  makeAssetTransferTxnWithSuggestedParamsFromObject,
  makePaymentTxnWithSuggestedParamsFromObject,
  type SuggestedParams,
  type Transaction,
} from "algosdk";
import { toApplicationNoOpTxn } from "../src/transactions.js";

type Descriptor = Record<string, any>;

const fixture = JSON.parse(
  readFileSync(resolve(process.cwd(), "test/fixtures/v2-transaction-materialization-v1.json"), "utf8"),
);

function suggestedParams(): SuggestedParams {
  const source = fixture.suggested_params;
  return {
    fee: BigInt(source.fee),
    firstValid: BigInt(source.first),
    lastValid: BigInt(source.last),
    genesisID: source.genesis_id,
    genesisHash: Uint8Array.from(Buffer.from(source.genesis_hash_b64, "base64")),
    flatFee: source.flat_fee,
    minFee: BigInt(source.min_fee),
  };
}

function atomic(descriptor: Descriptor, params: SuggestedParams): Transaction {
  const type = descriptor.type ?? "appl";
  if (type === "appl") {
    return toApplicationNoOpTxn(
      {
        type: "appl",
        sender: descriptor.sender,
        appId: descriptor.app_id,
        appName: descriptor.app_name,
        method: descriptor.method,
        appArgs: (descriptor.app_args_b64 ?? []).map((value: string) =>
          Uint8Array.from(Buffer.from(value, "base64")),
        ),
        appArgsB64: descriptor.app_args_b64 ?? [],
        foreignApps: descriptor.foreign_apps ?? [],
        foreignAssets: descriptor.foreign_assets ?? [],
        accounts: descriptor.accounts ?? [],
        boxes: (descriptor.boxes_b64 ?? []).map((value: string) => ({
          appIndex: 0,
          name: Uint8Array.from(Buffer.from(value, "base64")),
        })),
        boxesB64: descriptor.boxes_b64 ?? [],
        flatFeeMicroAlgo: descriptor.flat_fee_micro_algos,
      },
      params,
    );
  }
  if (type === "pay") {
    return makePaymentTxnWithSuggestedParamsFromObject({
      sender: descriptor.sender,
      receiver: descriptor.receiver,
      amount: BigInt(descriptor.amount ?? descriptor.amt ?? 0),
      closeRemainderTo: descriptor.close_remainder_to ?? descriptor.closeRemainderTo,
      suggestedParams: {
        ...params,
        flatFee: true,
        fee: BigInt(descriptor.flat_fee_micro_algos ?? params.fee),
      },
    });
  }
  if (type === "axfer") {
    return makeAssetTransferTxnWithSuggestedParamsFromObject({
      sender: descriptor.sender,
      receiver: descriptor.receiver,
      amount: BigInt(descriptor.amount ?? descriptor.amt ?? 0),
      assetIndex: Number(descriptor.asset_id ?? descriptor.assetId ?? descriptor.index),
      closeRemainderTo: descriptor.close_assets_to ?? descriptor.closeAssetsTo,
      suggestedParams: {
        ...params,
        flatFee: true,
        fee: BigInt(descriptor.flat_fee_micro_algos ?? params.fee),
      },
    });
  }
  throw new Error(`unsupported fixture transaction type: ${type}`);
}

function materialize(descriptor: Descriptor): {
  transactions: Transaction[];
  primaryIndex: number;
  primaryAppName: string;
} {
  let descriptors: Descriptor[];
  let primaryIndex: number;
  if (descriptor.type === "group") {
    descriptors = descriptor.transactions;
    primaryIndex = descriptor.primary_index ?? descriptors.length - 1;
  } else {
    descriptors = [
      ...(descriptor.active_mark_calls ?? []),
      descriptor,
      ...(descriptor.resource_carriers ?? []),
      ...(descriptor.resource_carrier ? [descriptor.resource_carrier] : []),
    ];
    primaryIndex = (descriptor.active_mark_calls ?? []).length;
  }
  const transactions = descriptors.map((item) => atomic(item, suggestedParams()));
  if (transactions.length > 1) assignGroupID(transactions);
  return {
    transactions,
    primaryIndex,
    primaryAppName: descriptor.app_name ?? descriptors[primaryIndex].app_name ?? "",
  };
}

function canonical(txn: Transaction): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: txn.type,
    sender: txn.sender.toString(),
    fee: Number(txn.fee),
  };
  if (txn.applicationCall) {
    Object.assign(result, {
      app_id: Number(txn.applicationCall.appIndex),
      app_args_b64: txn.applicationCall.appArgs.map((value) => Buffer.from(value).toString("base64")),
      foreign_apps: txn.applicationCall.foreignApps.map(Number),
      foreign_assets: txn.applicationCall.foreignAssets.map(Number),
      accounts: txn.applicationCall.accounts.map((value) => value.toString()),
      boxes: txn.applicationCall.boxes.map((box) => [
        Number(box.appIndex),
        Buffer.from(box.name).toString("base64"),
      ]),
    });
  } else if (txn.payment) {
    Object.assign(result, {
      receiver: txn.payment.receiver.toString(),
      amount: Number(txn.payment.amount),
    });
  } else if (txn.assetTransfer) {
    Object.assign(result, {
      receiver: txn.assetTransfer.receiver.toString(),
      amount: Number(txn.assetTransfer.amount),
      asset_id: Number(txn.assetTransfer.assetIndex),
    });
  }
  return result;
}

test("transaction descriptors materialize to the canonical Algorand encoding", () => {
  for (const vector of fixture.vectors) {
    const result = materialize(vector.descriptor);
    assert.equal(result.primaryIndex, vector.primary_index, vector.id);
    assert.equal(result.primaryAppName, vector.primary_app_name, vector.id);
    assert.deepEqual(result.transactions.map(canonical), vector.expected, vector.id);
    if (result.transactions.length === 1) {
      assert.equal(result.transactions[0].group, undefined, vector.id);
    } else {
      const groups = new Set(result.transactions.map((txn) => Buffer.from(txn.group ?? []).toString("hex")));
      assert.equal(groups.size, 1, vector.id);
      assert.notEqual([...groups][0], "", vector.id);
    }
  }
});
