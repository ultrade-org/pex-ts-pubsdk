import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PdexApiClient } from "../src/api.js";
import { loadPdexContext } from "../src/integration.js";
import {
  loadManifestFromR2,
  loadManifestVersion,
  ProtocolManifestUnavailableError,
  setProtocolManifest,
} from "../src/manifest.js";

const baseUrl = "https://builder.example";
const publicArtifactBaseUrl = "https://artifacts.example/mainnet";
const protocol = { manifest_version: 2, apps: {}, boxes: {}, receipts: {}, label: "PEX – definitions" };
const body = JSON.stringify(protocol, null, 2) + "\n";

function pointerFor(bytes = body, network = "mainnet") {
  const hash = createHash("sha256").update(bytes).digest("hex");
  return {
    type: "v2_protocol_manifest_current", schema_version: 1, manifest_version: 2, network,
    artifact_hash: hash, artifact_path: `v2/protocol/${network}/${hash}.json`, updated_at: 123,
  };
}

test("R2 loader verifies exact bytes, caches V2, and refreshes the network pointer", async () => {
  for (const network of ["mainnet", "testnet"]) {
    const pointer = pointerFor(body, network);
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return String(input).endsWith("current.json") ? Response.json(pointer) : new Response(body);
    };
    const root = `https://artifacts.example/${network}`;
    const manifest = await loadManifestFromR2({ publicArtifactBaseUrl: root + "/", network, fetchImpl });
    assert.deepEqual(manifest, protocol);
    assert.equal(loadManifestVersion(2), manifest);
    assert.deepEqual(requests.map(({ url }) => url), [
      `${root}/v2/protocol/${network}/current.json`, `${root}/${pointer.artifact_path}`,
    ]);
    assert.equal(requests[0].init?.cache, "no-store");
    assert.equal(requests[1].init?.cache, undefined);
    for (const { init } of requests) {
      assert.equal(init?.credentials, "omit");
      assert.deepEqual(Object.fromEntries(new Headers(init?.headers)), { accept: "application/json" });
    }
  }
});

test("client loads R2 without calling the API or resolving account credentials", async () => {
  const pointer = pointerFor();
  const requests: string[] = [];
  const client = new PdexApiClient({
    baseUrl, publicArtifactBaseUrl, network: "mainnet",
    accountSessionToken() { assert.fail("R2 must not request a wallet session"); },
    fetchImpl: async (input) => {
      requests.push(String(input));
      assert.ok(String(input).startsWith(publicArtifactBaseUrl));
      return String(input).endsWith("current.json") ? Response.json(pointer) : new Response(body);
    },
  });
  assert.deepEqual(await client.loadProtocol(), protocol);
  assert.equal(requests.length, 2);
  await assert.rejects(client.loadProtocol(1), /only supports the V2/);
  assert.equal(requests.length, 2);
});

test("client falls back only to its configured API on pointer or object unavailability", async (t) => {
  for (const stage of ["pointer", "object"]) {
    for (const failure of ["404", "503", "network", "body"]) {
      await t.test(`${stage}: ${failure}`, async () => {
        const requests: string[] = [];
        const client = new PdexApiClient({
          baseUrl, publicArtifactBaseUrl, network: "mainnet", accountSessionToken: "test-session",
          fetchImpl: async (input, init) => {
            const url = String(input);
            requests.push(url);
            if (url === `${baseUrl}/v2/protocol`) {
              assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-session");
              return Response.json(protocol);
            }
            assert.equal(new Headers(init?.headers).get("authorization"), null);
            if (stage === "object" && url.endsWith("current.json")) return Response.json(pointerFor());
            if (failure === "network") throw new TypeError("fetch failed");
            if (failure === "body") {
              return new Response(new ReadableStream({ start(controller) { controller.error(new Error("disconnected")); } }));
            }
            return new Response(null, { status: Number(failure) });
          },
        });
        assert.deepEqual(await client.loadProtocol(), protocol);
        assert.equal(requests.at(-1), `${baseUrl}/v2/protocol`);
        assert.equal(requests.length, stage === "pointer" ? 2 : 3);
      });
    }
  }
});

test("invalid pointers never fetch an object, fall back, or overwrite the cached definition", async (t) => {
  const invalid: Record<string, unknown> = {
    null: null,
    array: [],
    type: { ...pointerFor(), type: "other" },
    schema: { ...pointerFor(), schema_version: 2 },
    version: { ...pointerFor(), manifest_version: 1 },
    network: { ...pointerFor(), network: "testnet" },
    hash: { ...pointerFor(), artifact_hash: "wrong" },
    path: { ...pointerFor(), artifact_path: "../other.json" },
    origin: { ...pointerFor(), artifact_path: "https://other.example/manifest.json" },
  };
  for (const [name, pointer] of Object.entries(invalid)) {
    await t.test(name, async () => {
      const previous = setProtocolManifest({ manifest_version: 2, label: "previous" }, 2);
      let count = 0;
      const client = new PdexApiClient({
        baseUrl, publicArtifactBaseUrl, network: "mainnet",
        fetchImpl: async () => { count += 1; return Response.json(pointer); },
      });
      await assert.rejects(client.loadProtocol(), /invalid protocol manifest pointer/);
      assert.equal(count, 1);
      assert.equal(loadManifestVersion(2), previous);
    });
  }
});

test("corrupt bytes and invalid JSON/manifest formats never fall back or poison the cache", async (t) => {
  const cases = [
    { name: "malformed pointer JSON", pointer: "{", bytes: body, error: SyntaxError },
    { name: "hash mismatch", pointer: JSON.stringify(pointerFor()), bytes: body + " ", error: /hash mismatch/ },
    { name: "malformed manifest JSON", bytes: "{", error: SyntaxError },
    ...[null, [], { ...protocol, manifest_version: 3 }, { ...protocol, apps: null },
      { ...protocol, boxes: [] }, { ...protocol, receipts: undefined }].map((value, i) => ({
        name: `invalid manifest ${i}`, bytes: JSON.stringify(value), error: /invalid V2 protocol manifest/,
      })),
  ];
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const previous = setProtocolManifest({ manifest_version: 2, label: "previous" }, 2);
      const requests: string[] = [];
      const client = new PdexApiClient({
        baseUrl, publicArtifactBaseUrl, network: "mainnet",
        fetchImpl: async (input) => {
          const url = String(input);
          requests.push(url);
          assert.ok(url.startsWith(publicArtifactBaseUrl));
          return new Response(url.endsWith("current.json")
            ? ("pointer" in scenario ? scenario.pointer : JSON.stringify(pointerFor(scenario.bytes)))
            : scenario.bytes);
        },
      });
      await assert.rejects(client.loadProtocol(), scenario.error);
      assert.equal(requests.length, scenario.name === "malformed pointer JSON" ? 1 : 2);
      assert.equal(loadManifestVersion(2), previous);
    });
  }
});

test("standalone loader reports availability failures; client preserves both transport failures", async () => {
  const cause = new TypeError("offline");
  const fetchImpl: typeof fetch = async () => { throw cause; };
  await assert.rejects(loadManifestFromR2({ publicArtifactBaseUrl, network: "mainnet", fetchImpl }), (error) => {
    assert.ok(error instanceof ProtocolManifestUnavailableError);
    assert.equal(error.cause, cause);
    return true;
  });
  const client = new PdexApiClient({ baseUrl, publicArtifactBaseUrl, network: "mainnet", fetchImpl });
  await assert.rejects(client.loadProtocol(), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.ok(error.errors[0] instanceof ProtocolManifestUnavailableError);
    assert.equal(error.errors[1], cause);
    return true;
  });
});

test("API-only behavior is unchanged when the R2 root and network are not both configured", async () => {
  for (const config of [{}, { network: "mainnet" }, { publicArtifactBaseUrl }]) {
    const client = new PdexApiClient({
      baseUrl, ...config,
      fetchImpl: async (input) => {
        assert.equal(String(input), `${baseUrl}/v2/protocol`);
        return Response.json(protocol);
      },
    });
    assert.deepEqual(await client.loadProtocol(), protocol);
  }
});

test("loadPdexContext uses R2 definitions and the builder API for deployment and market state", async () => {
  const requests: string[] = [];
  const context = await loadPdexContext({
    baseUrl, publicArtifactBaseUrl, network: "mainnet",
    fetchImpl: async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("current.json")) return Response.json(pointerFor());
      if (url === `${publicArtifactBaseUrl}/${pointerFor().artifact_path}`) return new Response(body);
      assert.ok(url.startsWith(baseUrl));
      if (url.endsWith("/deployments")) return Response.json({ apps: { PDexV2Markets: 123, PDexV2Trading: 124 }, assets: {} });
      if (url.endsWith("/v2/sdk/bootstrap") || url.endsWith("/v2/sdk/resources")) return Response.json({});
      if (url.endsWith("/v2/summary/markets")) return Response.json({ markets: [], pools: [] });
      assert.fail(`unexpected request: ${url}`);
    },
  });
  assert.deepEqual(context.protocol, protocol);
  assert.equal(context.appRefs.v2MarketsAppId, 123);
  assert.equal(requests.length, 6);
});
