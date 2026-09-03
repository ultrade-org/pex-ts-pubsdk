import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { quoteV2PositionCostSlice } from "../src/v2PositionResolution.js";


const FIXTURE = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "test/fixtures/v2-funding-recipient-split-v1.json",
    ),
    "utf8",
  ),
);

function request(vector: Record<string, string>): Record<string, bigint> {
  const pair = vector.market_kind === "pair";
  const collateralLong = vector.collateral_side === "long";
  const longAssetId = 1n;
  const shortAssetId = pair ? 2n : longAssetId;
  return {
    version: 3n,
    market_kind: pair ? 0n : 1n,
    position_size_usd: BigInt(vector.position_size_usd),
    close_size_usd: BigInt(vector.close_size_usd),
    collateral_amount: 1_000_000_000_000_000_000n,
    collateral_asset_id: collateralLong ? longAssetId : shortAssetId,
    long_asset_id: longAssetId,
    short_asset_id: shortAssetId,
    collateral_price: BigInt(vector.collateral_price),
    current_funding_pay_factor: BigInt(vector.funding_pay_delta),
    saved_funding_pay_factor: 0n,
    current_borrowing_factor: BigInt(vector.borrowing_delta),
    saved_borrowing_factor: 0n,
    current_long_claim_factor: BigInt(vector.long_claim_delta),
    saved_long_claim_factor: 0n,
    current_short_claim_factor: BigInt(vector.short_claim_delta),
    saved_short_claim_factor: 0n,
    opposing_trader_share_bps: BigInt(vector.share_bps),
  };
}

function observed(quote: Record<string, any>): Record<string, string> {
  const full = quote.full_floors;
  const survivor = quote.remaining_floors;
  const slice = quote.slice_differences;
  const values: Record<string, bigint> = {
    remaining_size_usd: quote.remaining_size_usd,
    raw_full_long_claim: full.raw_long_claim,
    raw_survivor_long_claim: survivor.raw_long_claim,
    raw_full_short_claim: full.raw_short_claim,
    raw_survivor_short_claim: survivor.raw_short_claim,
    scaled_full_long_claim: full.long_claim,
    scaled_survivor_long_claim: survivor.long_claim,
    scaled_slice_long_claim: slice.long_claim,
    scaled_full_short_claim: full.short_claim,
    scaled_survivor_short_claim: survivor.short_claim,
    scaled_slice_short_claim: slice.short_claim,
    full_pay_collateral: full.pay_collateral,
    survivor_pay_collateral: survivor.pay_collateral,
    slice_pay_collateral: slice.pay_collateral,
    full_net_collateral_cost: quote.full_net_collateral_cost,
    full_same_token_credit: quote.full_same_token_credit,
    survivor_net_collateral_cost: BigInt(survivor.pay_collateral) > BigInt(survivor.same_token_claim)
      ? BigInt(survivor.pay_collateral) - BigInt(survivor.same_token_claim)
      : 0n,
    survivor_same_token_credit: BigInt(survivor.same_token_claim) > BigInt(survivor.pay_collateral)
      ? BigInt(survivor.same_token_claim) - BigInt(survivor.pay_collateral)
      : 0n,
    slice_net_collateral_cost: quote.slice_net_collateral_cost,
    slice_same_token_credit: quote.slice_same_token_credit,
    full_other_token_claim: full.other_token_claim,
    slice_other_token_claim: slice.other_token_claim,
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, value.toString()]),
  );
}

test("TypeScript SDK matches independent funding split vectors", () => {
  for (const vector of FIXTURE.vectors) {
    const quote = quoteV2PositionCostSlice(request(vector));
    assert.deepEqual(observed(quote), vector.expected, vector.label);
  }
});
