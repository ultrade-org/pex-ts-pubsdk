import assert from "node:assert/strict";
import test from "node:test";
import {
  Address, FALCON_1024_SCHEME, SignedTransaction, addressFromPQKey,
  decodeSignedTransaction, encodeMsgpack, generateAccount,
  makePaymentTxnWithSuggestedParamsFromObject,
} from "algosdk";
import {
  couldBeEd25519Authorizer,
  prepareV2TransactionGroupForSigning, unsignedV2TransactionForSimulation,
  validateV2SignedTransactionGroup, type V2TransactionSignerContext,
} from "../src/transactions.js";

const publicKey = new Uint8Array(1793); publicKey[0] = 9;
const derived = addressFromPQKey(FALCON_1024_SCHEME, publicKey);
const pq: V2TransactionSignerContext = { scheme: "falcon-1024", authorizingAddress: derived.address.toString(), publicKey, salt: derived.salt };
const edAccount = generateAccount();
const ed: V2TransactionSignerContext = { scheme: "ed25519", authorizingAddress: edAccount.addr.toString() };
const params = { fee: 0, minFee: 1000, firstValid: 1, lastValid: 100, genesisHash: new Uint8Array(32), genesisID: "pq-test" };
function payment(sender = pq.authorizingAddress, fee = 1000, note = "test") {
  return makePaymentTxnWithSuggestedParamsFromObject({ sender, receiver: sender, amount: 0,
    note: new TextEncoder().encode(note), suggestedParams: { ...params, flatFee: true, fee } });
}

test("PQ surcharge preserves execution fees, affects only actual signers, and is idempotent", () => {
  const txns = [payment(pq.authorizingAddress, 40_000, "a"), payment(ed.authorizingAddress, 1000, "b"), payment(pq.authorizingAddress, 1000, "c")];
  const signers = [pq, ed, pq];
  assert.equal(prepareV2TransactionGroupForSigning(txns, signers, params), txns);
  assert.deepEqual(txns.map(t => t.fee), [42_000n, 1000n, 3000n]);
  const ids = txns.map(t => t.txID());
  prepareV2TransactionGroupForSigning(txns, signers, params);
  assert.deepEqual(txns.map(t => t.txID()), ids);
  assert.equal(new Set(ids).size, 3);
  txns[0].fee++;
  assert.throws(() => prepareV2TransactionGroupForSigning(txns, signers, params), /fee_changed/);
});

test("an owner rekeyed to Ed25519 incurs no PQ surcharge", () => {
  const txn = payment(pq.authorizingAddress);
  prepareV2TransactionGroupForSigning([txn], [ed], params);
  assert.equal(txn.fee, 1000n);
  const stxn = decodeSignedTransaction(txn.signTxn(edAccount.sk));
  assert.equal(stxn.sgnr?.toString(), ed.authorizingAddress);
  validateV2SignedTransactionGroup([txn], [txn.signTxn(edAccount.sk)], [ed]);
});

test("an ordinary owner rekeyed to Falcon receives a PQ envelope bound to the direct authorizer", () => {
  const txn = payment(ed.authorizingAddress);
  prepareV2TransactionGroupForSigning([txn], [pq], params);
  const stxn = unsignedV2TransactionForSimulation(txn, pq);
  assert.equal(stxn.sgnr?.toString(), pq.authorizingAddress);
  assert.deepEqual(stxn.pqsig?.pk, publicKey);
  assert.equal(stxn.pqsig?.sig.length, 0);
  assert.equal(txn.fee, 3000n);
});

test("congestion sizing includes the Falcon envelope and preserves the execution budget", () => {
  const txn = payment(pq.authorizingAddress, 20_000);
  prepareV2TransactionGroupForSigning([txn], [pq], { ...params, fee: 10 });
  const placeholder = unsignedV2TransactionForSimulation(txn, pq);
  const worst = new SignedTransaction({ txn, pqsig: { ...placeholder.pqsig!, sig: new Uint8Array(1462) } });
  assert.ok(txn.fee >= BigInt(encodeMsgpack(worst).length * 10) + 19_000n);
  const first = txn.fee;
  prepareV2TransactionGroupForSigning([txn], [pq], { ...params, fee: 10 });
  assert.equal(txn.fee, first);
});

test("unknown schemes, mismatched keys and noncanonical salts fail before fee changes", () => {
  for (const bad of [undefined, { ...pq, scheme: "unknown" }, { ...pq, salt: 255 }, { ...pq, authorizingAddress: ed.authorizingAddress }]) {
    const txn = payment();
    assert.throws(() => prepareV2TransactionGroupForSigning([txn], [bad as V2TransactionSignerContext], params));
    assert.equal(txn.fee, 1000n);
  }
});

test("signed group checks preserve original PQ bytes and reject changed bodies and categories", () => {
  const txn = payment();
  prepareV2TransactionGroupForSigning([txn], [pq], params);
  const placeholder = unsignedV2TransactionForSimulation(txn, pq);
  // Synthetic signature tests envelope validation only, not Falcon cryptography.
  const bytes = encodeMsgpack(new SignedTransaction({ txn, pqsig: { ...placeholder.pqsig!, sig: new Uint8Array(1280).fill(1) } }));
  const before = bytes.slice();
  validateV2SignedTransactionGroup([txn], [bytes], [pq]);
  assert.deepEqual(bytes, before);
  assert.throws(() => validateV2SignedTransactionGroup([txn], [txn.signTxn(edAccount.sk)], [pq]), /authorizer|scheme/);
  const wrongSigner = encodeMsgpack(new SignedTransaction({ txn, pqsig: placeholder.pqsig, sgnr: Address.fromString(ed.authorizingAddress) }));
  assert.throws(() => validateV2SignedTransactionGroup([txn], [wrongSigner], [pq]), /authorizer/);
  txn.fee++;
  assert.throws(() => validateV2SignedTransactionGroup([txn], [bytes], [pq]), /changed_reviewed/);
});

test("address screening only rules out Ed25519; it does not identify PQ", () => {
  assert.equal(couldBeEd25519Authorizer(ed.authorizingAddress), true);
  assert.equal(couldBeEd25519Authorizer(pq.authorizingAddress), false);
  // Generic hashes can also be off-curve: they are not accepted PQ proofs.
  const unknown = new Uint8Array(32).fill(2);
  assert.equal(couldBeEd25519Authorizer(new Address(unknown).toString()), false);
  assert.throws(() => couldBeEd25519Authorizer("bad address"));
});
