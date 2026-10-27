export const AGREEMENT_KEY = 'maeum-start-agreement';
export const AGREEMENT_VERSION = '20261027-local-voice-v2';
export const AI_DATA_NOTICE = 'AI를 연결하면 지금 보내는 말과 최근 대화 일부가 OpenAI로 전송돼.';

export function createOnboarding({ storage, prepareReader, prepareInput, cancelReader, cancelInput, onState = () => {}, onPreparationError = () => {} }) {
  let agreed = false, ready = false, generation = 0, pending;
  try { agreed = storage?.getItem(AGREEMENT_KEY) === AGREEMENT_VERSION; } catch {}
  const report = (phase, detail, percent) => onState({ phase, detail, percent });
  function prepare() {
    if (pending) return pending;
    if (!agreed) return Promise.resolve(false);
    const id = ++generation;
    pending = (async () => {
      try {
        report('preparing', '읽어주는 목소리를 준비하고 있어. 처음 한 번은 시간이 걸릴 수 있어.', 0);
        await prepareReader({ onProgress: percent => { if (id === generation) report('preparing', '읽어주는 목소리를 내려받고 있어.', Math.round(percent * .75)); } });
        if (id !== generation) return false;
        report('preparing', '말로 입력하기를 준비하고 있어.', 75);
        await prepareInput({ onProgress: percent => { if (id === generation) report('preparing', '말로 입력하기 파일을 내려받고 있어.', 75 + Math.round(percent * .25)); } });
        if (id !== generation) return false;
        ready = true; report('ready', '음성 준비가 끝났어. 시작해 볼까?', 100); return true;
      } catch (error) {
        if (id === generation) { ready = false; onPreparationError(error); report('error', '음성 준비를 마치지 못했어. 다시 시도하거나 글과 버튼으로 시작할 수 있어.'); }
        return false;
      } finally { if (id === generation) pending = undefined; }
    })();
    return pending;
  }
  function accept() {
    agreed = true;
    try { storage?.setItem(AGREEMENT_KEY, AGREEMENT_VERSION); } catch {}
    return prepare();
  }
  function skip() { generation++; pending = undefined; ready = false; cancelReader(); cancelInput(); report('skipped', '글과 버튼으로 시작할 수 있어.'); }
  return { accept, prepare, skip, get agreed() { return agreed; }, get ready() { return ready; } };
}
