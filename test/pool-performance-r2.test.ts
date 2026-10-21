import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { loadPoolPerformanceBundleFromR2, type V2PoolPerformanceBundleResponse } from "../src/api.js";

const fixture = JSON.parse(readFileSync("test/fixtures/v2_pool_performance_bundle_v1.json", "utf8")) as V2PoolPerformanceBundleResponse;
const options = { publicArtifactBaseUrl: "https://artifacts.example/testnet/", network: "testnet" };
function transport(data: unknown): typeof fetch {
  return async () => new Response(JSON.stringify(data), { status: 200 });
}

test("daily pool loader consumes the producer fixture without changing financial fields", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "https://artifacts.example/testnet/v2/pool-performance/testnet/current.json");
    assert.equal(init?.credentials, "omit");
    assert.equal(init?.cache, "no-store");
    assert.equal(new Headers(init?.headers).get("authorization"), null);
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    assert.ok(init?.signal);
    return new Response(JSON.stringify(fixture));
  };
  const result = await loadPoolPerformanceBundleFromR2({ ...options, fetchImpl });
  assert.deepEqual(result.bundle, fixture);
  assert.equal(calls, 1);
  assert.ok(result.bundle.payloads["market-7"].performance["30d"].summary.product_return_bps < 0);
  assert.equal(result.bundle.payloads["cva-77"].income_apr.total_apr_7d_bps, null);
  assert.equal(result.bundle.payloads["cva-77"].performance["7d"].reason, "insufficient_history");
});

test("daily pool loader distinguishes current and expired data and preserves additional fields", async () => {
  const today = Math.floor(Date.now() / 1000 / 86400) * 86400;
  for (const [offset, stale] of [[0, false], [-3 * 86400, true]] as const) {
    const data = structuredClone(fixture);
    const shift = today + offset - data.as_of;
    data.as_of += shift;
    data.updated_at += shift;
    data.expires_at += shift;
    data.future_field = { retained: true };
    for (const entry of Object.values(data.payloads)) {
      entry.income_apr.apr_window_start += shift;
      entry.income_apr.apr_window_end += shift;
      for (const performance of Object.values(entry.performance)) {
        for (const point of performance.points) point.timestamp += shift;
      }
    }
    const result = await loadPoolPerformanceBundleFromR2({ ...options, fetchImpl: transport(data) });
    assert.equal(result.stale, stale);
    assert.deepEqual(result.bundle, data);
  }
});

const invalid: [string, (data: any) => void][] = [
  ["schema", d => { d.schema_version = 2; }],
  ["type", d => { d.type = "other"; }],
  ["network", d => { d.network = "mainnet"; }],
  ["path", d => { d.current_path = "../current.json"; }],
  ["digest", d => { d.manifest_sha256 = "bad"; }],
  ["expiry", d => { d.expires_at = d.as_of; }],
  ["updated", d => { d.updated_at = d.as_of - 1; }],
  ["round", d => { d.source_round = 0; }],
  ["cutoff", d => { d.as_of++; }],
  ["empty products", d => { d.payloads = {}; }],
  ["product key", d => { d.payloads.other = d.payloads["market-7"]; }],
  ["missing period", d => { delete d.payloads["market-7"].performance["7d"]; }],
  ["product identity", d => { d.payloads["market-7"].performance["7d"].product_id = "8"; }],
  ["period identity", d => { d.payloads["market-7"].performance["7d"].period = "30d"; }],
  ["summary", d => { delete d.payloads["market-7"].performance["7d"].summary.vs_holding_bps; }],
  ["point", d => { d.payloads["market-7"].performance["7d"].points[0].gap_before = "false"; }],
  ["point cutoff", d => { d.payloads["market-7"].performance["7d"].points[0].timestamp = d.as_of; }],
  ["APR status", d => { delete d.payloads["market-7"].income_apr.apr_status; }],
  ["APR null omitted", d => { delete d.payloads["cva-77"].income_apr.total_apr_7d_bps; }],
  ["APR cutoff", d => { d.payloads["market-7"].income_apr.apr_window_end++; }],
  ["APR coverage", d => { delete d.payloads["market-7"].income_apr.apr_coverage_start; }],
];
for (const [name, mutate] of invalid) {
  test(`daily pool loader rejects invalid ${name}`, async () => {
    const data = structuredClone(fixture);
    mutate(data);
    await assert.rejects(loadPoolPerformanceBundleFromR2({ ...options, fetchImpl: transport(data) }), /Invalid pool performance/);
  });
}

test("daily pool loader preserves empty history and rejects HTTP, transport and malformed JSON errors", async () => {
  const data = structuredClone(fixture);
  for (const entry of Object.values(data.payloads)) {
    for (const p of Object.values(entry.performance)) {
      p.points = [];
      p.reason = "no_valid_completed_samples";
    }
  }
  assert.deepEqual((await loadPoolPerformanceBundleFromR2({ ...options, fetchImpl: transport(data) })).bundle, data);
  for (const fetchImpl of [
    async () => new Response("missing", { status: 404 }),
    async () => new Response("not json"),
    async () => { throw new Error("network unavailable"); },
  ]) {
    await assert.rejects(loadPoolPerformanceBundleFromR2({ ...options, fetchImpl }));
  }
});
