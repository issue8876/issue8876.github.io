import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboarding, AGREEMENT_KEY, AGREEMENT_VERSION } from '../js/maeumgil-onboarding.js';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
test('no voice download before agreement; both preparations must finish before entry', async () => {
  const reading = deferred(), input = deferred(), events = [], saved = new Map();
  let inputs = 0;
  const gate = createOnboarding({ storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) }, prepareReader: () => reading.promise, prepareInput: () => { inputs++; return input.promise; }, cancelReader() {}, cancelInput() {}, onState: state => events.push(state) });
  assert.equal(await gate.prepare(), false); assert.equal(inputs, 0); assert.equal(events.length, 0);
  const pending = gate.accept(); assert.equal(saved.get(AGREEMENT_KEY), AGREEMENT_VERSION); assert.equal(gate.ready, false);
  reading.resolve(); await tick(); assert.equal(inputs, 1); assert.equal(gate.ready, false);
  input.resolve(); assert.equal(await pending, true); assert.equal(gate.ready, true); assert.equal(events.at(-1).percent, 100);
});
test('download failure never claims readiness and retry can complete', async () => {
  let fail = true; const events = [];
  const gate = createOnboarding({ prepareReader: async () => {}, prepareInput: async () => { if (fail) throw Error(); }, cancelReader() {}, cancelInput() {}, onState: state => events.push(state) });
  assert.equal(await gate.accept(), false); assert.equal(gate.ready, false); assert.equal(events.at(-1).phase, 'error');
  fail = false; assert.equal(await gate.prepare(), true); assert.equal(gate.ready, true);
});
test('skipping preparation cancels both workers and ignores late completion', async () => {
  const reading = deferred(), events = []; let cancelled = 0, inputs = 0;
  const gate = createOnboarding({ prepareReader: () => reading.promise, prepareInput: async () => { inputs++; }, cancelReader: () => cancelled++, cancelInput: () => cancelled++, onState: state => events.push(state) });
  const pending = gate.accept(); gate.skip(); reading.resolve();
  assert.equal(await pending, false); assert.equal(cancelled, 2); assert.equal(inputs, 0); assert.equal(gate.ready, false); assert.equal(events.at(-1).phase, 'skipped');
});
test('prior tab agreement checks actual resources again and blocked storage still works', async () => {
  let calls = 0;
  const options = { prepareReader: async () => calls++, prepareInput: async () => calls++, cancelReader() {}, cancelInput() {} };
  const resumed = createOnboarding({ ...options, storage: { getItem: () => AGREEMENT_VERSION } });
  assert.equal(resumed.agreed, true); assert.equal(resumed.ready, false); assert.equal(await resumed.prepare(), true); assert.equal(calls, 2);
  const blocked = createOnboarding({ ...options, storage: { getItem() { throw Error(); }, setItem() { throw Error(); } } });
  assert.equal(blocked.agreed, false); assert.equal(await blocked.accept(), true); assert.equal(blocked.agreed, true);
});
