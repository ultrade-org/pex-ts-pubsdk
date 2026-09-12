import assert from "node:assert/strict";
import test from "node:test";
import { ABIType, encodeAddress, type modelsv2, type SuggestedParams } from "algosdk";
import {
  simulateV2PositionCostResolution,
  V2_POSITION_COST_REQUEST_FIELDS,
  V2_POSITION_COST_RESULT_FIELDS,
} from "../src/v2PositionResolution.js";

const request = {
  version: 3n, market_kind: 0n, position_size_usd: 5_000_000n,
  close_size_usd: 1_000_000n, collateral_amount: 5_010_000n,
  collateral_asset_id: 12n, long_asset_id: 11n, short_asset_id: 12n,
  collateral_price: 1_000_000_000_000n,
  current_funding_pay_factor: 0n, saved_funding_pay_factor: 0n,
  current_borrowing_factor: 0n, saved_borrowing_factor: 0n,
  current_long_claim_factor: 0n, saved_long_claim_factor: 0n,
  current_short_claim_factor: 0n, saved_short_claim_factor: 0n,
  opposing_trader_share_bps: 10_000n,
};
const tuple = (length: number) => `(${Array<string>(length).fill("uint64").join(",")})`;
const inputType = tuple(V2_POSITION_COST_REQUEST_FIELDS.length);
const resultType = tuple(V2_POSITION_COST_RESULT_FIELDS.length);
const manifest = { apps: { PDexV2TradingRiskOps: { method_specs: {
  quote_position_cost_resolution: {
    signature: `quote_position_cost_resolution(${inputType})${resultType}`,
    args: [{ type: inputType }], returns: { type: resultType },
  },
} } } };

// No accrued costs or claims: the slice leaves $4 notional and preserves all
// collateral. The raw result describes an unsettled partial slice (mode 2).
const responseValues = [
  3n, 0n, 5_000_000n, 1_000_000n, 4_000_000n, 5_010_000n, 12n, 11n, 12n,
  0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 0n, 2n,
];

function fakeAlgod(owner: string, corruptResult = false) {
  return {
    getApplicationBoxByName() { throw new Error("simulation must not read boxes"); },
    getTransactionParams() {
      return { do: async (): Promise<SuggestedParams> => ({
        fee: 1_000, minFee: 1_000, flatFee: true,
        firstValid: 10, lastValid: 1_010,
        genesisHash: new Uint8Array(32), genesisID: "simulation-test",
      }) };
    },
    simulateTransactions(simulation: modelsv2.SimulateRequest) {
      // An unsigned transaction from a rekeyed owner needs signer resolution.
      assert.equal(simulation.allowEmptySignatures, true);
      assert.equal(simulation.fixSigners, true);
      assert.equal(simulation.txnGroups.length, 1);
      const [signed] = simulation.txnGroups[0].txns;
      assert.equal(signed.sig, undefined);
      assert.equal(signed.txn.sender.toString(), owner);
      assert.equal(signed.txn.rekeyTo, undefined);
      assert.equal(signed.txn.applicationCall?.appIndex, 123n);
      const values = [...responseValues];
      if (corruptResult) values[19] = 1n;
      const encoded = ABIType.from(resultType).encode(values);
      return { do: async () => ({
        lastRound: 77n,
        txnGroups: [{ txnResults: [{ txnResult: {
          logs: [Uint8Array.from([0x15, 0x1f, 0x7c, 0x75, ...encoded])],
        } }] }],
      }) };
    },
  };
}

test("unsigned position preview resolves a rekeyed signer and preserves the owner", async () => {
  const owner = encodeAddress(new Uint8Array(32).fill(1));
  const result = await simulateV2PositionCostResolution(fakeAlgod(owner), {
    sender: owner, v2TradingRiskOpsAppId: 123, request, manifest,
  });
  assert.equal(result.simulation_round, 77n);
  assert.equal(result.preview_is_authorization, false);
  assert.equal(result.preview_may_expire, true);
  assert.equal(result.remaining_size_usd, 4_000_000n);
  assert.equal(result.minimum_top_up, 0n);
});

test("signer resolution does not bypass simulation arithmetic verification", async () => {
  const owner = encodeAddress(new Uint8Array(32).fill(2));
  await assert.rejects(simulateV2PositionCostResolution(fakeAlgod(owner, true), {
    sender: owner, v2TradingRiskOpsAppId: 123, request, manifest,
  }), /disagrees on minimum_top_up/);
});
