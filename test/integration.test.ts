import assert from "node:assert/strict";
import test from "node:test";
import { encodeAddress, type SuggestedParams } from "algosdk";

import { createPdexApiClient } from "../src/api.js";
import {
  authorizePdexAccount,
  loadPdexContext,
  normalizeSignedTransactionBytes,
  pdexMarketAssetRefs,
  submitPdexTransactionGroup,
} from "../src/integration.js";
import { setProtocolManifest } from "../src/manifest.js";
import { buildV2FundStorageTransactions } from "../src/transactions.js";

const protocol = {
  protocol_version: 2,
  apps: {
    PDexV2Trading: {
      methods: {
        fund_storage: {
          signature: "fund_storage(pay)void",
          args: [{ type: "pay" }],
        },
      },
    },
  },
  receipts: { version: 1, flags: {}, types: {} },
};

test("loadPdexContext resolves deployment IDs and normalized market data in one call", async () => {
  const requests: string[] = [];
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/v2/protocol")) return Response.json(protocol);
    if (url.endsWith("/v2/networks/testnet/deployments")) {
      return Response.json({
        apps: { PDexV2Markets: 1001, PDexV2Trading: 1002 },
        assets: { usdc: 2001 },
      });
    }
    if (url.endsWith("/v2/sdk/bootstrap")) return Response.json({ app_ids: { PDexV2MarketsLogic: 1003 } });
    if (url.endsWith("/v2/sdk/resources")) return Response.json({ assets: { palgo: 2002 } });
    if (url.endsWith("/v2/summary/markets")) {
      return Response.json({
        markets: [{ market_id: 7, index_asset_id: 2002, long_asset_id: 2002, short_asset_id: 2001 }],
        pools: [{ market_id: 7, pool_id: 70 }],
        product_catalog: {},
      });
    }
    return new Response("not found", { status: 404 });
  };

  const context = await loadPdexContext({ baseUrl: "https://pdex.example", network: "testnet", fetchImpl });

  assert.equal(context.appRefs.v2MarketsAppId, 1001);
  assert.equal(context.appRefs.v2TradingAppId, 1002);
  assert.equal(context.assets.palgo, 2002);
  assert.deepEqual(pdexMarketAssetRefs(context.markets[0]), {
    indexAssetId: 2002,
    longAssetId: 2002,
    shortAssetId: 2001,
  });
  assert.equal(requests.length, 5);
});

test("authorizePdexAccount creates, signs, installs, and returns an account session", async () => {
  const requests: Array<{ url: string; body?: Record<string, unknown>; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : undefined,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    if (String(input).endsWith("/v2/auth/session")) {
      return Response.json({
        session_token: "token-1",
        address: "ADDR",
        scopes: ["account:read"],
        network: "testnet",
        issued_at: 100,
        expires_at: 160,
      });
    }
    return Response.json({ owner: "ADDR" });
  };
  const client = createPdexApiClient({ baseUrl: "https://pdex.example", fetchImpl });

  const authorized = await authorizePdexAccount({
    client,
    address: "ADDR",
    network: "testnet",
    genesisId: "testnet-v1.0",
    genesisHash: "GENESIS",
    origin: "https://app.example",
    nonce: "00112233445566778899aabbccddeeff",
    issuedAt: 100,
    signMessage: () => Uint8Array.of(1, 2, 3),
  });
  await client.v2Trader("ADDR");

  assert.equal(authorized.session.session_token, "token-1");
  assert.equal(requests[0].body?.signature, "AQID");
  assert.equal(requests[1].authorization, "Bearer token-1");
});

test("submitPdexTransactionGroup signs every transaction, submits, waits, and reports progress", async () => {
  setProtocolManifest(protocol, 2);
  const sender = encodeAddress(new Uint8Array(32).fill(1));
  const suggestedParams: SuggestedParams = {
    fee: 1_000,
    minFee: 1_000,
    flatFee: true,
    firstValid: 100n,
    lastValid: 1_100n,
    genesisID: "testnet-v1.0",
    genesisHash: new Uint8Array(32).fill(2),
  };
  const transactions = buildV2FundStorageTransactions({
    sender,
    v2MarketsAppId: 1001,
    v2TradingAppId: 1002,
    paymentMicroAlgo: 50_000,
    manifest: protocol,
  }, suggestedParams);
  const phases: string[] = [];
  let submittedCount = 0;
  const result = await submitPdexTransactionGroup({
    transactions,
    signTransactions: (txns, indexes) => {
      assert.deepEqual(indexes, [0, 1]);
      return txns.map((transaction) => ({ signedTxn: transaction.toByte() }));
    },
    algod: {
      sendRawTransaction(signed) {
        submittedCount = Array.isArray(signed) ? signed.length : 1;
        return { async do() { return {}; } };
      },
      status() {
        return { async do() { return { lastRound: 100n }; } };
      },
      pendingTransactionInformation() {
        return { async do() { return { confirmedRound: 101n, logs: [] }; } };
      },
      statusAfterBlock() {
        return { async do() { return {}; } };
      },
    },
    onProgress: ({ phase }) => { phases.push(phase); },
  });

  assert.equal(submittedCount, 2);
  assert.equal(result.confirmedRound, 101);
  assert.equal(result.group.primaryIndex, 1);
  assert.deepEqual(phases, ["signing", "submitting", "confirming", "confirmed"]);
  assert.deepEqual(normalizeSignedTransactionBytes("0x010203"), Uint8Array.of(1, 2, 3));
});
