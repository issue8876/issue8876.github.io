import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechInput } from '../js/maeumgil-input.js';
import { speechPCM } from '../js/maeumgil-input-core.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(t, options = {}) {
  const states = [], text = [], requests = []; let mediaCalls = 0, stopped = 0;
  const stream = { getTracks: () => [{ stop() { stopped++; } }] };
  const worker = { terminate() { this.terminated = true; }, postMessage(message) { requests.push(message); if (message.type === 'prepare') queueMicrotask(() => this.onmessage({ data: { id: message.id, type: 'ready' } })); } };
  const recorder = { state: 'inactive', start() { this.state = 'recording'; }, stop() { this.state = 'inactive'; this.ondataavailable?.({ data: new Blob(['fake audio']) }); this.onstop?.(); } };
  const input = createSpeechInput({ supported: () => true, makeWorker: () => worker, getMedia: async () => { mediaCalls++; return stream; }, makeRecorder: () => recorder, makeContext: () => ({ decodeAudioData: async () => ({ sampleRate: 48000, getChannelData: () => new Float32Array(48000).fill(.1) }), close: async () => {} }), onState: value => states.push(value), onText: value => text.push(value), ...options });
  t.after(() => input.cancel());
  return { input, states, text, requests, worker, recorder, stream, get mediaCalls() { return mediaCalls; }, get stopped() { return stopped; } };
}
test('PCM is resampled to 16kHz, bounded to 20 seconds and rejects silence or invalid audio', () => {
  assert.equal(speechPCM(new Float32Array(48000).fill(.1), 48000).length, 16000);
  assert.equal(speechPCM(new Float32Array(16000 * 22).fill(.1), 16000).length, 320000);
  assert.throws(() => speechPCM(new Float32Array(16000), 16000));
  assert.throws(() => speechPCM(new Float32Array([NaN]), 16000));
});
test('preparing speech input loads a local worker without opening the microphone', async t => {
  const h = harness(t); await h.input.prepare();
  assert.equal(h.input.ready, true); assert.equal(h.mediaCalls, 0); assert.equal(h.requests[0].type, 'prepare');
  await h.input.prepare(); assert.equal(h.requests.length, 1);
});
test('microphone action returns text for review and releases microphone before transcription', async t => {
  const h = harness(t); await h.input.prepare(); await h.input.start(); assert.equal(h.mediaCalls, 1); assert.equal(h.input.activity, 'recording');
  h.input.stop(); await tick();
  assert.equal(h.stopped, 1); assert.equal(h.input.activity, 'transcribing');
  const job = h.requests.at(-1); assert.equal(job.type, 'transcribe'); assert.ok(job.audio instanceof Float32Array); assert.equal(job.audio.length, 16000);
  h.worker.onmessage({ data: { id: job.id, type: 'text', text: '숙제를 시작하고 싶어.' } }); await tick();
  assert.deepEqual(h.text, ['숙제를 시작하고 싶어.']); assert.equal(h.input.activity, 'idle');
});
test('cancelled late transcription never changes the writing field', async t => {
  const h = harness(t); await h.input.start(); h.input.stop(); await tick();
  const late = h.worker.onmessage, id = h.requests.at(-1).id; h.input.cancel();
  late({ data: { id, type: 'text', text: 'late private text' } }); await tick(); assert.deepEqual(h.text, []); assert.equal(h.worker.terminated, true);
});
test('microphone permission arriving after navigation immediately releases tracks', async t => {
  let release; const permission = new Promise(resolve => { release = resolve; });
  const h = harness(t, { getMedia: () => permission });
  const starting = h.input.start(); await tick(); h.input.cancel(); release(h.stream); await starting;
  assert.equal(h.stopped, 1); assert.equal(h.recorder.state, 'inactive'); assert.deepEqual(h.text, []);
});
