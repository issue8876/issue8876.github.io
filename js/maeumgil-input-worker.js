import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
const MODEL = 'onnx-community/whisper-tiny';
const REVISION = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
const TOTAL = 40844231;
let transcriber;
async function prepare(id) {
  if (transcriber) return transcriber;
  const downloaded = new Map();
  transcriber = await pipeline('automatic-speech-recognition', MODEL, {
    device: 'wasm', dtype: 'q8', revision: REVISION,
    progress_callback: event => {
      if (event.status === 'progress' && event.file?.endsWith('.onnx')) {
        downloaded.set(event.file, event.loaded || 0);
        const received = [...downloaded.values()].reduce((sum, value) => sum + value, 0);
        postMessage({ id, type: 'loading', percent: Math.min(99, Math.round(received / TOTAL * 100)) });
      }
    },
  });
  return transcriber;
}
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    const model = await prepare(id);
    if (type === 'prepare') { postMessage({ id, type: 'ready' }); return; }
    if (type !== 'transcribe' || !(data.audio instanceof Float32Array) || data.audio.length > 320000) throw new Error();
    const result = await model(data.audio, { language: 'korean', task: 'transcribe', max_new_tokens: 96 });
    postMessage({ id, type: 'text', text: typeof result.text === 'string' ? result.text.trim().slice(0, 1200) : '' });
  } catch (error) { postMessage({ id, type: 'error', preparationError: type === 'prepare' ? String(error.message).slice(0, 500) : undefined }); }
};
