import { speechText, speechChunks, koreanVoice } from './maeumgil-speech-core.js?v=20261019-soft';

export function createSpeechReader({
  onState = () => {},
  makeWorker = () => new Worker(new URL('./maeumgil-speech-worker.js?v=20261019-soft', import.meta.url), { type: 'module' }),
  makeContext = () => new (window.AudioContext || window.webkitAudioContext)(),
  synthesis = globalThis.speechSynthesis,
  makeUtterance = text => new SpeechSynthesisUtterance(text),
} = {}) {
  let worker, context, generation = 0, active = false, done = false, nextTime = 0, timer, usingFallback = false;
  const sources = new Set();
  const report = (state, detail = '', percent) => onState({ state, detail, percent });
  const clearTimer = () => { clearTimeout(timer); timer = undefined; };

  function stop() {
    generation++; active = false; done = false; clearTimer();
    worker?.terminate(); worker = undefined;
    for (const source of sources) { source.onended = null; try { source.stop(); } catch {} }
    sources.clear();
    context?.close().catch(() => {}); context = undefined;
    synthesis?.cancel(); report('idle');
  }
  function finish(id) {
    if (id !== generation || !done || sources.size) return;
    active = false; clearTimer(); report('idle');
  }
  function fallback(text, id) {
    if (id !== generation || !active || usingFallback) return;
    usingFallback = true;
    clearTimer(); worker?.terminate(); worker = undefined;
    if (sources.size) { done = true; return; }
    if (!synthesis) { active = false; report('error', '이 기기에서는 읽어주기를 사용할 수 없어.'); return; }
    const voice = koreanVoice(synthesis.getVoices().filter(voice => voice.localService === true));
    if (!voice) { active = false; report('error', '이 기기에서 목소리를 준비하지 못했어. 인터넷 연결을 확인하고 다시 눌러 줘.'); return; }
    const chunks = speechChunks(text);
    report('playing', '새 목소리를 불러오지 못해서 기기의 기본 목소리로 읽어줄게.');
    let index = 0;
    const next = () => {
      if (id !== generation || !active) return;
      if (index === chunks.length) { active = false; report('idle'); return; }
      const utterance = makeUtterance(chunks[index++]);
      utterance.lang = 'ko-KR'; if (voice) utterance.voice = voice;
      utterance.rate = .96; utterance.pitch = 1; utterance.volume = .95;
      utterance.onend = next;
      utterance.onerror = () => { if (id === generation) { active = false; report('error', '목소리를 재생하지 못했어. 잠시 뒤 다시 눌러 줘.'); } };
      synthesis.speak(utterance);
    };
    next();
  }

  function read(value) {
    if (active) { stop(); return; }
    const text = speechText(value);
    if (!text) return;
    const id = ++generation;
    active = true; done = false; usingFallback = false;
    report('loading', '목소리를 준비하고 있어. 처음에는 약 260MB를 내려받아. 다시 누르면 멈출 수 있어.');
    try {
      if (!context || context.state === 'closed') context = makeContext();
      context.resume().catch(() => fallback(text, id));
      nextTime = context.currentTime;
      if (!worker) worker = makeWorker();
      timer = setTimeout(() => fallback(text, id), 180000);
      worker.onerror = () => fallback(text, id);
      worker.onmessage = ({ data }) => {
        if (id !== generation || data.id !== id || !active) return;
        if (data.type === 'loading') {
          if (!sources.size) report('loading', '목소리를 준비하고 있어. 처음 한 번은 약 260MB를 내려받아.', data.percent);
        } else if (data.type === 'generating') {
          clearTimer(); timer = setTimeout(() => fallback(text, id), 60000);
          if (!sources.size) report('loading', '읽을 준비를 하고 있어. 잠깐만 기다려 줘.');
        } else if (data.type === 'audio') {
          clearTimer();
          const pcm = data.pcm;
          if (!(pcm instanceof Float32Array) || !pcm.length || !Number.isFinite(data.sampleRate)) { fallback(text, id); return; }
          const buffer = context.createBuffer(1, pcm.length, data.sampleRate);
          buffer.copyToChannel(pcm, 0);
          const source = context.createBufferSource(); source.buffer = buffer;
          const gain = context.createGain();
          const start = Math.max(context.currentTime + .025, nextTime);
          const end = start + buffer.duration;
          gain.gain.setValueAtTime(0, start);
          gain.gain.linearRampToValueAtTime(.95, start + Math.min(.012, buffer.duration / 4));
          gain.gain.setValueAtTime(.95, Math.max(start, end - .025));
          gain.gain.linearRampToValueAtTime(0, end);
          source.connect(gain); gain.connect(context.destination);
          sources.add(source);
          source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); finish(id); };
          source.start(start); nextTime = end + .06;
          report('playing', 'AI 목소리로 읽고 있어. 다시 누르면 멈출 수 있어.');
        } else if (data.type === 'done') { done = true; clearTimer(); finish(id); }
        else if (data.type === 'error') fallback(text, id);
      };
      worker.postMessage({ id, text });
    } catch { fallback(text, id); }
  }
  return { read, stop, get active() { return active; } };
}
