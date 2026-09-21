import assert from "node:assert/strict";
import test from "node:test";
import { UNCHECKED_CLOSE_POSITION_ID } from "../src/constants.js";
import { decodeUint64 } from "algosdk";
import { buildV2DecreaseOrCloseCall, buildV2SingleTokenDecreaseOrCloseCall, buildV2AddPositionMarginCall, buildV2SingleTokenAddPositionMarginCall, buildV2SingleTokenWithdrawPositionMarginCall, buildV2WithdrawPositionMarginCall } from "../src/transactions.js";
import { planV2Flow } from "../src/planners.js";
import { setProtocolManifest } from "../src/manifest.js";

const manifest = {
  receipts: { version: 1, flags: {}, types: {} },
  apps: {
    PDexV2Math: {
      method_specs: {
        noop: methodSpec("noop()void", []),
      },
    },
    PDexV2Trading: {
      method_specs: {
        open_or_increase: methodSpec(
          "open_or_increase(uint64,txn,uint64,uint64,uint64,(address,uint64),byte[],byte[])byte[]",
          ["uint64", "txn", "uint64", "uint64", "uint64", "(address,uint64)", "byte[]", "byte[]"],
        ),
        decrease_or_close: methodSpec(
          "decrease_or_close(uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,(address,uint64),byte[],byte[],uint64,uint64,uint64,uint64)byte[]",
          ["uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "(address,uint64)", "byte[]", "byte[]", "uint64", "uint64", "uint64", "uint64"],
        ),
      },
    },
    PDexV2SingleTokenTrading: {
      method_specs: {
        open_or_increase: methodSpec(
          "open_or_increase(uint64,txn,uint64,uint64,uint64,byte[],byte[])byte[]",
          ["uint64", "txn", "uint64", "uint64", "uint64", "byte[]", "byte[]"],
        ),
        decrease_or_close: methodSpec(
          "decrease_or_close(uint64,uint64,uint64,uint64,uint64,uint64,byte[],byte[],uint64,uint64,uint64)byte[]",
          ["uint64", "uint64", "uint64", "uint64", "uint64", "uint64", "byte[]", "byte[]", "uint64", "uint64", "uint64"],
        ),
      },
    },
  },
};

setProtocolManifest(manifest, 2);

const sender = Uint8Array.from({ length: 32 }, (_, index) => index);
const common = {
  expectedPositionId: 17n,
  // These descriptor fixtures explicitly select the no-recall path.
  yieldRecallMode: 0,
  v2MarketsAppId: 2001,
  v2AdminControlAppId: 2003,
  v2TradingAppId: 2002,
  v2SingleTokenTradingAppId: 2009,
  v2TradingRiskOpsAppId: 2008,
  v2MathAppId: 2004,
  sender,
  marketId: 7,
  indexAssetId: 10,
  longAssetId: 11,
  shortAssetId: 12,
  collateralAssetId: 12,
  backingAssetId: 11,
  side: 1,
  acceptablePrice: 50_100_000,
  oracleMessage: new Uint8Array(133),
  oracleSignature: new Uint8Array(64),
};

test("V2 margin adjustment builders use Math resource carriers", () => {
  const add = buildV2AddPositionMarginCall({ ...common, collateralAmount: 2_000_000 });
  const withdraw = buildV2WithdrawPositionMarginCall({ ...common, collateralAmount: 1_000_000 });
  const singleAdd = buildV2SingleTokenAddPositionMarginCall({ ...common, collateralAmount: 2_000_000 });
  const singleWithdraw = buildV2SingleTokenWithdrawPositionMarginCall({ ...common, collateralAmount: 1_000_000 });

  assert.equal(add.resourceCarrier?.method, "noop");
  assert.equal(add.method, "open_or_increase");
  assert.equal(add.appArgs.length, 8);
  assert.deepEqual(add.foreignApps, [2003, 2008]);

  assert.equal(withdraw.resourceCarrier?.method, "noop");
  assert.equal(withdraw.method, "decrease_or_close");
  assert.equal(withdraw.appArgs.length, 16);
  assert.deepEqual(withdraw.foreignApps, [2003, 2008]);
  assert.ok(withdraw.boxes.some((box) => Number(box.appIndex) === 2008));

  assert.equal(singleAdd.resourceCarrier?.method, "noop");
  assert.equal(singleAdd.method, "open_or_increase");
  assert.equal(singleAdd.appArgs.length, 7);
  assert.deepEqual(singleAdd.foreignApps, [2003, 2008]);

  assert.equal(singleWithdraw.resourceCarrier?.method, "noop");
  assert.equal(singleWithdraw.method, "decrease_or_close");
  assert.equal(singleWithdraw.appArgs.length, 12);
  assert.deepEqual(singleWithdraw.foreignApps, [2003, 2008]);
  assert.ok(singleWithdraw.boxes.some((box) => Number(box.appIndex) === 2008));
});

test("V2 margin adjustment planner flow names are registered", () => {
  const add = planV2Flow("v2_add_position_margin", { ...common, collateralAmount: 2_000_000 });
  const withdraw = planV2Flow("v2_withdraw_position_margin", { ...common, collateralAmount: 1_000_000 });
  const singleAdd = planV2Flow("v2_single_token_add_position_margin", { ...common, collateralAmount: 2_000_000 });
  const singleWithdraw = planV2Flow("v2_single_token_withdraw_position_margin", { ...common, collateralAmount: 1_000_000 });

  assert.equal(add.ok, true);
  assert.equal(withdraw.ok, true);
  assert.equal(singleAdd.ok, true);
  assert.equal(singleWithdraw.ok, true);
});

function methodSpec(signature: string, types: string[]) {
  return {
    signature,
    args: types.map((type, index) => ({ type, name: `arg${index}` })),
  };
}

for (const builder of [buildV2DecreaseOrCloseCall, buildV2SingleTokenDecreaseOrCloseCall,
  buildV2WithdrawPositionMarginCall, buildV2SingleTokenWithdrawPositionMarginCall]) {
  test(`${builder.name}: direct close requires a lifetime or explicit unchecked opt-out`, () => {
    const input = { ...common, collateralAmount: 1_000_000, sizeUsdDelta: 1_000_000, minPrimaryOutput: 0 };
    for (const expectedPositionId of [0n, 17n, (1n << 48n) - 1n, UNCHECKED_CLOSE_POSITION_ID]) {
      const call = builder({ ...input, expectedPositionId });
      assert.equal(decodeUint64(call.appArgs.at(-1)!, "bigint"), expectedPositionId);
    }
    const { expectedPositionId: _id, ...omitted } = input;
    // @ts-expect-error omission must also be rejected for JavaScript callers
    assert.throws(() => builder(omitted), /expectedPositionId is required/);
    for (const invalid of [null, true, -1, 1.5, "", 1n << 48n, 1n << 64n, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => builder({ ...input, expectedPositionId: invalid as never }));
    }
  });
}
