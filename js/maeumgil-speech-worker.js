import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort.wasm.min.mjs';
import { TextToSpeech, UnicodeProcessor, Style } from './vendor/supertonic.js';
import { speechChunks } from './maeumgil-speech-core.js?v=20261019-soft';

const MODEL = 'https://huggingface.co/supertone-oss-archive/supertonic-2/resolve/7edbcd0bba8cd579100a353a9e0b2b49cad7c875';
const FILES = [
  ['duration_predictor.onnx', 1521526], ['text_encoder.onnx', 27431318],
  ['vector_estimator.onnx', 132471364], ['vocoder.onnx', 101405066],
];
const TOTAL = FILES.reduce((sum, file) => sum + file[1], 0);
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/';
let engine;

async function asset(path, progress = () => {}) {
  const url = `${MODEL}/${path}`;
  let cache;
  try {
    cache = await caches.open('maeum-voice-supertonic2-v1');
    const hit = await cache.match(url);
    if (hit) return hit.arrayBuffer();
  } catch { /* Playback also works when private browsing disables persistent storage. */ }
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) throw new Error('Voice download failed');
  const reader = response.body.getReader();
  const parts = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); length += value.byteLength; progress(length);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
  parts.length = 0;
  if (cache) { try { await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch { /* Storage quota does not block speech. */ } }
  return bytes.buffer;
}
async function json(path) { return JSON.parse(new TextDecoder().decode(await asset(path))); }

async function initialize(id) {
  if (engine) return engine;
  const cfg = await json('onnx/tts.json');
  const indexer = await json('onnx/unicode_indexer.json');
  const preset = await json('voice_styles/F1.json');
  const sessions = [];
  let completed = 0;
  for (const [file, expected] of FILES) {
    const data = await asset(`onnx/${file}`, loaded => postMessage({ id, type: 'loading', percent: Math.min(99, Math.round((completed + loaded) / TOTAL * 100)) }));
    sessions.push(await ort.InferenceSession.create(data, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' }));
    completed += expected;
    postMessage({ id, type: 'loading', percent: Math.round(completed / TOTAL * 100) });
  }
  const style = new Style(
    new ort.Tensor('float32', new Float32Array(preset.style_ttl.data.flat(Infinity)), preset.style_ttl.dims),
    new ort.Tensor('float32', new Float32Array(preset.style_dp.data.flat(Infinity)), preset.style_dp.dims),
  );
  engine = { tts: new TextToSpeech(cfg, new UnicodeProcessor(indexer), ...sessions), style };
  return engine;
}

self.onmessage = async ({ data: { id, text, type } }) => {
  try {
    const { tts, style } = await initialize(id);
    if (type === 'prepare') { postMessage({ id, type: 'ready' }); return; }
    const chunks = speechChunks(text);
    for (let index = 0; index < chunks.length; index++) {
      postMessage({ id, type: 'generating', index, total: chunks.length });
      const result = await tts.call(chunks[index], 'ko', style, 8, 0.98, 0.12);
      const count = Math.min(result.wav.length, Math.ceil(result.duration[0] * tts.sampleRate));
      const pcm = Float32Array.from(result.wav.slice(0, count));
      let energy = 0;
      for (let sample = 0; sample < pcm.length; sample++) {
        if (!Number.isFinite(pcm[sample])) throw new Error('Invalid voice output');
        pcm[sample] = Math.max(-1, Math.min(1, pcm[sample]));
        energy += pcm[sample] * pcm[sample];
      }
      if (!pcm.length || energy / pcm.length < 1e-9) throw new Error('Silent voice output');
      postMessage({ id, type: 'audio', pcm, sampleRate: tts.sampleRate }, [pcm.buffer]);
    }
    postMessage({ id, type: 'done' });
  } catch (error) { postMessage({ id, type: 'error', preparationError: type === 'prepare' ? String(error.message).slice(0, 500) : undefined }); }
};
