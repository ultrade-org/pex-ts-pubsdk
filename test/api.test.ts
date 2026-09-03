import assert from "node:assert/strict";
import test from "node:test";
import { buildAccountSessionMessage, createPdexApiClient } from "../src/api.js";
import { ORACLE_PRICE_SCALE, V2_ORACLE_MESSAGE_VERSION } from "../src/oracle.js";

test("v2PriceCandles builds the backend candle endpoint without direct Pyth coupling", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    return new Response(JSON.stringify({
      marketId: "42",
      source: "deterministic",
      period: "5m",
      order: "asc",
      candles: [[1700000000, 1, 2, 0.5, 1.5]],
    }));
  };
  const client = createPdexApiClient({ baseUrl: "http://backend/", fetchImpl });

  const candles = await client.v2PriceCandles({
    marketId: 42,
    period: "5m",
    limit: 300,
    to: 1_700_000_000,
  });

  assert.equal(candles.marketId, "42");
  assert.equal(candles.candles[0][4], 1.5);
  assert.equal(
    requests[0],
    "http://backend/v2/prices/candles?marketId=42&period=5m&limit=300&to=1700000000",
  );
});

test("v2LatestPrice builds the published latest price endpoint", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    return new Response(JSON.stringify({
      schema_version: 2,
      type: "v2_latest_price",
      oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
      price_scale: ORACLE_PRICE_SCALE.toString(),
      data_only: true,
      market_id: 42,
      index_price: "70200000000000",
      oracle_timestamp: 1_700_000_050,
    }));
  };
  const client = createPdexApiClient({ baseUrl: "http://backend/", fetchImpl });

  const latest = await client.v2LatestPrice(42);

  assert.equal(latest.type, "v2_latest_price");
  assert.equal(latest.index_price, "70200000000000");
  assert.equal(requests[0], "http://backend/v2/prices/latest/42");
});

test("public artifact config reads latest prices and signed oracle payloads without backend oracle routes", async () => {
  const requests: Array<{ url: string; cache?: RequestCache }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, cache: init?.cache });
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    if (url === "https://cdn.example/testnet/v2/latest-prices/testnet/current.json") {
      return new Response(JSON.stringify({
        schema_version: 2,
        type: "v2_latest_price_bundle_current",
        oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
        price_scale: ORACLE_PRICE_SCALE.toString(),
        network: "testnet",
        prices: {
          "7": {
            schema_version: 2,
            type: "v2_latest_price",
            oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
            price_scale: ORACLE_PRICE_SCALE.toString(),
            data_only: true,
            network: "testnet",
            market_id: 7,
            index_price: "50000000000000",
          },
        },
      }));
    }
    if (url === "https://cdn.example/testnet/v2/oracle-payloads/testnet/current.json") {
      return new Response(JSON.stringify({
        schema_version: 2,
        type: "v2_oracle_payload_bundle_current",
        oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
        price_scale: ORACLE_PRICE_SCALE.toString(),
        network: "testnet",
        payloads: {
          "app-2002/market-7": {
            protocol_version: 2,
            oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
            price_scale: ORACLE_PRICE_SCALE.toString(),
            type: "v2_oracle_payload",
            data_only: true,
            network: "testnet",
            market_id: 7,
            app_id: 2002,
            index_asset_id: 10,
            long_asset_id: 11,
            short_asset_id: 12,
            index_price_min: "49900000000000",
            index_price_max: "50100000000000",
            long_price_min: "49900000000000",
            long_price_max: "50100000000000",
            short_price_min: "1000000000000",
            short_price_max: "1000000000000",
            timestamp: 123,
            message_hex: "03",
            signature_hex: "04",
            pubkey_hex: "05",
          },
        },
      }));
    }
    return new Response("unexpected request", { status: 500 });
  };
  const client = createPdexApiClient({
    baseUrl: "https://pdex.example",
    publicArtifactBaseUrl: "https://cdn.example/testnet",
    network: "testnet",
    fetchImpl,
  });

  const latest = await client.v2LatestPrice(7);
  const oracle = await client.v2OracleArgs({ marketId: 7, appId: 2002, target: "trading" });

  assert.equal(latest.type, "v2_latest_price");
  assert.equal(latest.index_price, "50000000000000");
  assert.equal(Buffer.from(oracle.signature).toString("hex"), "04");
  assert.equal(requests.some(({ url }) => url.includes("/v2/oracle/")), false);
  assert.deepEqual(requests, [
    {
      url: "https://cdn.example/testnet/v2/latest-prices/testnet/current.json",
      cache: "no-store",
    },
    {
      url: "https://cdn.example/testnet/v2/oracle-payloads/testnet/current.json",
      cache: "no-store",
    },
  ]);
});

test("signed oracle payload falls back to the backend when the public artifact transport fails", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === "https://cdn.example/testnet/v2/oracle-payloads/testnet/current.json") {
      throw new TypeError("Failed to fetch");
    }
    if (url.startsWith("https://pdex.example/v2/oracle/7?")) {
      return new Response(JSON.stringify({
        protocol_version: 2,
        oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
        price_scale: ORACLE_PRICE_SCALE.toString(),
        market_id: 7,
        app_id: 2002,
        index_asset_id: 10,
        long_asset_id: 11,
        short_asset_id: 12,
        index_price_min: "49900000000000",
        index_price_max: "50100000000000",
        long_price_min: "49900000000000",
        long_price_max: "50100000000000",
        short_price_min: "1000000000000",
        short_price_max: "1000000000000",
        timestamp: 123,
        message_hex: "03",
        signature_hex: "04",
        pubkey_hex: "05",
      }));
    }
    return new Response("unexpected request", { status: 500 });
  };
  const client = createPdexApiClient({
    baseUrl: "https://pdex.example",
    publicArtifactBaseUrl: "https://cdn.example/testnet",
    network: "testnet",
    fetchImpl,
  });

  const oracle = await client.v2OracleArgs({ marketId: 7, appId: 2002, target: "trading" });

  assert.equal(Buffer.from(oracle.signature).toString("hex"), "04");
  assert.equal(requests.length, 2);
  assert.equal(requests[0], "https://cdn.example/testnet/v2/oracle-payloads/testnet/current.json");
  assert.match(requests[1], /^https:\/\/pdex\.example\/v2\/oracle\/7\?/);
});

test("oracle API rejects numeric raw prices in a versioned backend response", async () => {
  const client = createPdexApiClient({
    baseUrl: "https://pdex.example",
    fetchImpl: async () => new Response(JSON.stringify({
      protocol_version: 2,
      oracle_message_version: V2_ORACLE_MESSAGE_VERSION,
      price_scale: ORACLE_PRICE_SCALE.toString(),
      market_id: 7,
      app_id: 2002,
      index_asset_id: 10,
      long_asset_id: 11,
      short_asset_id: 12,
      index_price_min: 49_900_000_000_000,
      index_price_max: "50100000000000",
      long_price_min: "49900000000000",
      long_price_max: "50100000000000",
      short_price_min: "1000000000000",
      short_price_max: "1000000000000",
      timestamp: 123,
      message_hex: "03",
      signature_hex: "04",
      pubkey_hex: "05",
    })),
  });

  await assert.rejects(
    client.v2OraclePayload({ marketId: 7, appId: 2002 }),
    /index_price_min must be a canonical decimal string/,
  );
});

test("v2MarketSummary builds the compact public market summary endpoint", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push(String(input));
    assert.equal(new Headers(init?.headers).get("accept"), "application/json");
    return new Response(JSON.stringify({
      schema_version: 1,
      type: "v2_market_summary",
      data_only: true,
      markets: [{ market_id: 7 }],
      pools: [{ pool_id: 7 }],
      product_catalog: { index_markets: {}, custody_assets: {} },
    }));
  };
  const client = createPdexApiClient({ baseUrl: "http://backend/", fetchImpl });

  const summary = await client.v2MarketSummary();

  assert.equal(summary.type, "v2_market_summary");
  assert.equal(summary.markets?.[0]?.market_id, 7);
  assert.equal(summary.pools?.[0]?.pool_id, 7);
  assert.equal(requests[0], "http://backend/v2/summary/markets");
});

test("buildAccountSessionMessage emits canonical account-read login JSON", () => {
  const message = buildAccountSessionMessage({
    address: "ADDR",
    network: "localnet",
    genesisId: "localnet-v1",
    genesisHash: "localnet",
    origin: "http://localhost:5173",
    nonce: "nonce-1234567890",
    issuedAt: 1_700_000_000.9,
    expiresAt: 1_700_000_060.9,
  });

  assert.equal(
    message,
    '{"address":"ADDR","audience":"pdex-public-api","expires_at":1700000060,"genesis_hash":"localnet","genesis_id":"localnet-v1","issued_at":1700000000,"network":"localnet","nonce":"nonce-1234567890","origin":"http://localhost:5173","protocol":"PDex","purpose":"account:read","scopes":["account:read"],"version":1}',
  );
});

test("account session API posts signed canonical login messages", async () => {
  const requests: Array<{ url: string; method?: string; body?: unknown; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response(JSON.stringify({
      session_token: "session-token",
      token_type: "Bearer",
      address: "ADDR",
      scopes: ["account:read"],
      network: "localnet",
      issued_at: 1,
      expires_at: 2,
    }));
  };
  const client = createPdexApiClient({ baseUrl: "http://backend", fetchImpl });

  const session = await client.createAccountSession({
    address: "ADDR",
    message: "{}",
    signature: "sig",
  });

  assert.equal(session.session_token, "session-token");
  assert.equal(requests[0].url, "http://backend/v2/auth/session");
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].authorization, null);
  assert.deepEqual(requests[0].body, { address: "ADDR", message: "{}", signature: "sig" });
});

test("account session token provider adds bearer auth to account reads", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response(JSON.stringify([]));
  };
  const client = createPdexApiClient({
    baseUrl: "http://backend",
    fetchImpl,
    accountSessionToken: async () => "account-token",
  });

  await client.v2Positions("ADDR");
  await client.v2AccountTrades("ADDR", { limit: 10 });

  assert.equal(requests[0].url, "http://backend/v2/accounts/ADDR/positions");
  assert.equal(requests[0].authorization, "Bearer account-token");
  assert.equal(requests[1].url, "http://backend/v2/accounts/ADDR/trades?limit=10");
  assert.equal(requests[1].authorization, "Bearer account-token");
});

test("current public read methods target the scoped backend endpoints", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      authorization: new Headers(init?.headers).get("authorization"),
    });
    return new Response(JSON.stringify({ ok: true }));
  };
  const client = createPdexApiClient({
    baseUrl: "https://pdex.example/",
    fetchImpl,
    accountSessionToken: "account-token",
  });

  await client.ready();
  await client.v2StaticMetadataCurrent();
  await client.v2StaticMetadataArtifact("resources", "a".repeat(64));
  await client.v2PoolPerformance(7, "90d");
  await client.v2CvaPerformance(9, "total");
  await client.v2MarketYieldResourceRegistry();
  await client.v2MarketYieldStrategy(7, 0);
  await client.v2MarketYieldObservations();
  await client.v2MarketYieldObservation(7, 0);
  await client.v2AccountTrades("ADDR/ONE", { marketId: 7, limit: 25, cursor: "42" });
  await client.v2AccountActivity("ADDR/ONE", { limit: 10, cursor: "next/value" });

  assert.deepEqual(requests.map(({ url }) => url), [
    "https://pdex.example/ready",
    "https://pdex.example/v2/static-metadata/resources/current",
    `https://pdex.example/v2/static-metadata/resources/${"a".repeat(64)}`,
    "https://pdex.example/v2/pools/7/performance?period=90d",
    "https://pdex.example/v2/cva/vaults/9/performance?period=total",
    "https://pdex.example/v2/resource-registry/market-yield",
    "https://pdex.example/v2/market-yield/strategies/7/0",
    "https://pdex.example/v2/market-yield/observations",
    "https://pdex.example/v2/market-yield/observations/7/0",
    "https://pdex.example/v2/accounts/ADDR%2FONE/trades?market_id=7&limit=25&cursor=42",
    "https://pdex.example/v2/accounts/ADDR%2FONE/activity?limit=10&cursor=next%2Fvalue",
  ]);
  assert.equal(requests.at(-1)?.authorization, "Bearer account-token");
});

test("public planning methods post JSON to their current endpoints", async () => {
  const requests: Array<{ url: string; method?: string; body?: unknown }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify({ ok: true }));
  };
  const client = createPdexApiClient({ baseUrl: "https://pdex.example", fetchImpl });

  await client.v2QuoteAdjustMargin({ market_id: 7, collateral_delta: 10n });
  await client.v2QuoteCvaWithdrawRoute({ vault_id: 9, share_amount: 20n });
  await client.v2QuoteCvaAllocate({ vault_id: 9, market_id: 7 });
  await client.v2QuoteCvaRebalance({ vault_id: 9, market_id: 7 });
  await client.v2MarketYieldActionRecallPlan({ market_id: 7, payout_amount: 30n });

  assert.deepEqual(requests, [
    {
      url: "https://pdex.example/v2/quote/adjust-margin",
      method: "POST",
      body: { market_id: 7, collateral_delta: "10" },
    },
    {
      url: "https://pdex.example/v2/cva/quote/withdraw-route",
      method: "POST",
      body: { vault_id: 9, share_amount: "20" },
    },
    {
      url: "https://pdex.example/v2/cva/quote/allocate",
      method: "POST",
      body: { vault_id: 9, market_id: 7 },
    },
    {
      url: "https://pdex.example/v2/cva/quote/rebalance",
      method: "POST",
      body: { vault_id: 9, market_id: 7 },
    },
    {
      url: "https://pdex.example/v2/market-yield/action-recall-plan",
      method: "POST",
      body: { market_id: 7, payout_amount: "30" },
    },
  ]);
});
