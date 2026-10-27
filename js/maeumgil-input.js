import { speechPCM } from './maeumgil-input-core.js';

export function createSpeechInput({
  onState = () => {}, onText = () => {},
  makeWorker = () => new Worker(new URL('./maeumgil-input-worker.js?v=20261027-welcome', import.meta.url), { type: 'module' }),
  supported = () => Boolean(globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.MediaRecorder && (globalThis.AudioContext || globalThis.webkitAudioContext)),
  getMedia = () => navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false }),
  makeRecorder = stream => new MediaRecorder(stream),
  makeContext = () => new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }),
} = {}) {
  let worker, job, sequence = 0, epoch = 0, ready = false, preparation, recorder, stream, limit, activity = 'idle';
  const report = (state, detail = '') => { activity = state; onState({ state, detail }); };
  const releaseMic = () => { clearTimeout(limit); stream?.getTracks().forEach(track => track.stop()); stream = undefined; };
  function cancel() {
    epoch++; releaseMic();
    if (recorder) { recorder.onstop = null; if (recorder.state !== 'inactive') { try { recorder.stop(); } catch {} } recorder = undefined; }
    if (job) { clearTimeout(job.timer); job.reject(Object.assign(new Error('취소했어.'), { name: 'AbortError' })); job = undefined; }
    worker?.terminate(); worker = undefined; ready = false; preparation = undefined; report('idle');
  }
  function run(type, data = {}, onProgress = () => {}) {
    return new Promise((resolve, reject) => {
      try {
        worker ||= makeWorker();
        const id = ++sequence;
        const failed = error => {
          if (!job || job.id !== id) return;
          clearTimeout(job.timer); job = undefined; worker?.terminate(); worker = undefined; ready = false;
          reject(new Error(type === 'prepare' && error?.message ? error.message : '말로 입력하기를 준비하지 못했어.'));
        };
        job = { id, resolve, reject, timer: setTimeout(failed, type === 'prepare' ? 300000 : 60000) };
        worker.onerror = failed;
        worker.onmessage = ({ data: response }) => {
          if (!job || response.id !== job.id) return;
          if (response.type === 'loading') onProgress(response.percent);
          else if (response.type === 'ready' || response.type === 'text') { clearTimeout(job.timer); job = undefined; resolve(response.text); }
          else if (response.type === 'error') failed(new Error(response.preparationError || '말로 입력하기를 준비하지 못했어.'));
        };
        worker.postMessage({ id, type, ...data }, data.audio ? [data.audio.buffer] : []);
      } catch { clearTimeout(job?.timer); job = undefined; reject(new Error('말로 입력하기를 준비하지 못했어.')); }
    });
  }
  async function prepare({ onProgress = () => {} } = {}) {
    if (!supported()) throw new Error('이 브라우저는 기기 음성 입력을 지원하지 않아.');
    if (ready) { onProgress(100); return; }
    if (preparation) return preparation;
    const current = epoch;
    report('preparing', '말로 입력하기를 준비하고 있어.');
    preparation = run('prepare', {}, onProgress).then(() => {
      if (current !== epoch) return;
      ready = true; onProgress(100); report('idle');
    }).catch(error => { if (current === epoch) report('error'); throw error; }).finally(() => { if (current === epoch) preparation = undefined; });
    return preparation;
  }
  async function start() {
    if (activity === 'recording') { stop(); return; }
    if (!['idle', 'error'].includes(activity)) return;
    const current = epoch;
    let context;
    try {
      await prepare();
      if (current !== epoch) return;
      report('permission', '마이크 사용을 허용한 뒤 말해 줘.');
      const captured = await getMedia();
      if (current !== epoch) { captured.getTracks().forEach(track => track.stop()); return; }
      stream = captured; recorder = makeRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = event => { if (event.data?.size && current === epoch) chunks.push(event.data); };
      recorder.onerror = () => { cancel(); report('error', '마이크를 사용하지 못했어. 글로 적거나 버튼을 골라 줘.'); };
      recorder.onstop = async () => {
        releaseMic(); recorder = undefined;
        if (current !== epoch) return;
        report('transcribing', '말을 글자로 바꾸고 있어.');
        try {
          const bytes = await new Blob(chunks).arrayBuffer(); chunks.length = 0;
          if (current !== epoch) return;
          context = makeContext();
          const decoded = await context.decodeAudioData(bytes);
          const audio = speechPCM(decoded.getChannelData(0), decoded.sampleRate);
          await context.close(); context = undefined;
          if (current !== epoch) return;
          const text = await run('transcribe', { audio });
          if (current !== epoch) return;
          if (!text) throw new Error();
          onText(text); report('idle', '알아들은 말을 확인하고 보내기를 눌러 줘.');
        } catch { if (current === epoch) report('error', '말을 알아듣지 못했어. 다시 말하거나 글로 적어 줘.'); }
        finally { context?.close().catch(() => {}); }
      };
      recorder.start(); limit = setTimeout(stop, 20000); report('recording', '듣고 있어. 다 말했으면 마이크를 다시 눌러 줘.');
    } catch { if (current === epoch) { releaseMic(); recorder = undefined; report('error', '마이크 권한을 확인하거나 글로 적어 줘.'); } }
  }
  function stop() { if (recorder?.state === 'recording') recorder.stop(); }
  return { prepare, start, stop, cancel, get ready() { return ready; }, get activity() { return activity; } };
}
