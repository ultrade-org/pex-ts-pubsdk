import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as oracle from "../src/oracle.js";

const sentinel = JSON.parse(readFileSync(
  "test/fixtures/v2-oracle-message-v3.json", "utf8",
).replace(/:\s*(-?\d+)/g, ': "$1"')).message;
// A saved public response, used only for reading and verification. It is not a
// fresh quote and must never be submitted in a transaction.
const received = JSON.parse(readFileSync(
  "test/fixtures/v2-oracle-received-payload.json", "utf8",
));

test("oracle module exposes only payload consumption and price conversion", () => {
  assert.deepEqual(Object.keys(oracle).sort(), [
    "MAX_ORACLE_PRICE",
    "ORACLE_PRICE_SCALE",
    "V2_ORACLE_MAGIC",
    "V2_ORACLE_MESSAGE_SIZE",
    "V2_ORACLE_MESSAGE_VERSION",
    "decodeV2OracleSnapshotMessage",
    "formatPrice12",
    "oraclePayloadFromBackend",
    "parsePrice12",
    "validateRawPrice12",
    "verifyOraclePayload",
  ].sort());
});

test("oracle decoder preserves all received uint64 fields without precision loss", () => {
  const decoded = oracle.decodeV2OracleSnapshotMessage(Buffer.from(sentinel.expected_hex, "hex"));
  assert.equal(Buffer.from(decoded.magic).toString("hex"), sentinel.magic_hex);
  assert.equal(decoded.messageVersion, Number(sentinel.message_version));
  assert.equal(Buffer.from(decoded.genesisHash).toString("hex"), sentinel.genesis_hash_hex);
  for (const [field, value] of Object.entries(decoded)) {
    if (typeof value !== "bigint") continue;
    const wireField = field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    assert.equal(value, BigInt(sentinel[wireField]), field);
  }
});

test("received payload converts and verifies without altering its signed bytes", () => {
  const payload = oracle.oraclePayloadFromBackend(received);
  for (const field of ["message", "signature", "pubkey"] as const) {
    assert.equal(Buffer.from(payload[field]).toString("hex"), received[`${field}_hex`]);
  }
  assert.equal(oracle.verifyOraclePayload(payload.message, payload.signature, payload.pubkey), true);
  const decoded = oracle.decodeV2OracleSnapshotMessage(payload.message);
  assert.equal(decoded.targetAppId, BigInt(received.app_id));
  assert.equal(decoded.marketId, BigInt(received.market_id));
  assert.equal(decoded.indexMinPrice, BigInt(received.index_price_min));
  assert.equal(decoded.publishedAt, BigInt(received.timestamp));
  assert.equal(payload.validUntilTimestamp, received.valid_until_timestamp);
});

test("verification rejects altered messages, signatures, and public keys", () => {
  const payload = oracle.oraclePayloadFromBackend(received);
  for (const field of ["message", "signature", "pubkey"] as const) {
    const altered = { ...payload, [field]: payload[field].slice() };
    altered[field][0] ^= 1;
    assert.equal(oracle.verifyOraclePayload(altered.message, altered.signature, altered.pubkey), false, field);
  }
});

test("oracle decoder rejects incomplete, unknown, and retired payloads", () => {
  const { message } = oracle.oraclePayloadFromBackend(received);
  assert.throws(() => oracle.decodeV2OracleSnapshotMessage(message.slice(1)), /133 bytes/);
  const wrongMagic = message.slice();
  wrongMagic[0] ^= 1;
  assert.throws(() => oracle.decodeV2OracleSnapshotMessage(wrongMagic), /magic/);
  const retired = message.slice();
  retired[4] = 2;
  assert.throws(() => oracle.decodeV2OracleSnapshotMessage(retired), /version/);
});
