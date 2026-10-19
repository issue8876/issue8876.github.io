import { config } from './maeumgil-config.js';
import { createBreathingCard } from './maeumgil-breathing.js?v=20261019-clear';
import { apiHeaders } from './maeumgil-connection.js';
import { createSpeechReader } from './maeumgil-speech.js?v=20261019-soft';
import { profiles, questions, scale, summarizeCheck, assessSafety, helpMessage, redactPII, topics } from './maeumgil-core.js';

const $ = id => document.getElementById(id);
const reader = createSpeechReader({ onState: ({ state, detail, percent }) => {
  const active = state === 'loading' || state === 'playing';
  $('read-aloud').setAttribute('aria-pressed', String(active));
  $('read-aloud').setAttribute('aria-busy', String(state === 'loading'));
  $('read-aloud').querySelector('span').textContent = state === 'loading' ? '준비 멈추기' : state === 'playing' ? '읽기 멈추기' : '읽어주기';
  if ($('speech-state').textContent !== detail) $('speech-state').textContent = detail;
  $('speech-progress').textContent = Number.isFinite(percent) ? ` · ${percent}%` : '';
  $('speech-status').hidden = !detail;
  $('voice-preview').textContent = state === 'loading' ? '준비 멈추기' : state === 'playing' ? '듣기 멈추기' : '목소리 미리 듣기';
  $('voice-preview').setAttribute('aria-pressed', String(active));
  if ($('voice-preview-status').textContent !== detail) $('voice-preview-status').textContent = detail;
} });
const state = { profile: 'upper', topic: 'challenge', stage: 'welcome', answers: [], question: 0, mood: '', goal: null, history: [], token: '', connected: false, busy: false, generation: 0, abort: null, breathing: null, recognition: null };
const apiBase = config.apiBase.replace(/\/$/, '');
let serverReady = false;
let healthCheck = null;
let connecting = false;
let connectionGeneration = 0;

function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function scroll() { requestAnimationFrame(() => { const el = $('chat-scroll'); el.scrollTop = el.scrollHeight; }); }
function active(name) { document.querySelectorAll('[data-start]').forEach(b => b.classList.toggle('active', b.dataset.start === name)); }
function clearBreathing() { state.breathing?.destroy(); state.breathing = null; document.querySelector('.conversation').classList.remove('is-breathing'); reader.stop(); if (state.recognition) { state.recognition.abort(); state.recognition = null; $('mic').classList.remove('recording'); } }
function clearChoices() { $('choices').replaceChildren(); }
function button(label, callback) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', callback); return b; }
function choices(items) { clearChoices(); for (const [label, cb] of items) $('choices').append(button(label, () => { if (!state.busy) cb(); })); const first = $('choices').querySelector('button'); requestAnimationFrame(() => first?.focus({ preventScroll: true })); }
function addMessage(role, text, { alert = false, remember = true } = {}) {
  $('intro').hidden = true;
  const row = document.createElement('div'); row.className = `message-row ${role}${alert ? ' alert' : ''}`;
  if (role === 'assistant') { const avatar = document.createElement('span'); avatar.className = 'message-avatar'; const mark = document.createElement('img'); mark.src = new URL('../assets/icons/heart.svg', import.meta.url).href; mark.alt = ''; mark.width = 24; mark.height = 24; avatar.append(mark); avatar.setAttribute('aria-hidden', 'true'); row.append(avatar); }
  const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.textContent = text; row.append(bubble); $('messages').append(row);
  if (remember) state.history.push({ role, text: redactPII(text) });
  state.history = state.history.slice(-20);
  scroll(); return bubble;
}
function safetyRoute(text) {
  const risk = assessSafety(text);
  if (!risk) return false;
  cancelPending(); clearBreathing(); clearChoices(); $('question-card')?.remove(); $('goal-card').hidden = true; state.stage = 'help';
  addMessage('assistant', helpMessage, { alert: true, remember: false });
  choices([['도움받는 방법 보기', () => $('help-dialog').showModal()], ['잠깐 숨 고르기', () => startBreathing()]]);
  notice('안전 안내는 AI 연결 없이도 볼 수 있어. 실제 어른에게 도움을 요청해 줘.');
  return true;
}
function setBusy(busy) { state.busy = busy; $('send').disabled = busy; $('mic').disabled = busy; $('message').disabled = busy; document.querySelectorAll('#choices button').forEach(b => b.disabled = busy); }
function cancelPending() { state.generation++; state.abort?.abort(); state.abort = null; $('pending')?.remove(); setBusy(false); }
function startTopic(key) {
  cancelPending(); clearBreathing(); state.topic = key; state.stage = 'explore'; active('talk');
  addMessage('assistant', topics[key].intro);
  choices(topics[key].choices.map(label => [label, () => chooseTopicAnswer(label)]));
  notice(state.connected ? 'AI 연결 중 · 이름이나 연락처는 적지 않아도 돼.' : '아래 버튼에서 하나만 골라 줘.');
}
function startTalk() {
  cancelPending(); clearBreathing(); state.stage = 'topic'; active('talk');
  notice('');
  addMessage('assistant', '어떤 쪽 얘기야? 하나만 골라 줘.');
  choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
}
function startEntry(kind) {
  cancelPending(); clearBreathing(); $('question-card')?.remove(); $('writing-panel').open = false;
  if (kind === 'check') { addMessage('user', '마음 점검을 시작할래'); startCheck(); return; }
  if (kind === 'calm') { addMessage('user', '먼저 마음을 가라앉히고 싶어'); startBreathing(); return; }
  addMessage('user', '오늘 하기 어려웠던 일이 있어'); startTalk();
}
function chooseTopicAnswer(label) {
  if (state.connected) { sendText(label); return; }
  addMessage('user', label); state.stage = 'followup';
  if (state.topic === 'friend') {
    addMessage('assistant', '친구와 있었던 일에서 네가 바라는 도움을 먼저 골라 보자. 지금은 어떤 게 필요해?');
    choices([['내 마음부터 정리하기', () => { addMessage('user', '내 마음부터 정리하기'); addMessage('assistant', '친구에게 말하기 전에 내 마음을 한 문장으로 정리해 볼 수 있어. 어떤 방법으로 해볼까?'); choices([['혼자 작은 소리로 말해보기', () => chooseGoal('내 마음을 혼자 작은 소리로 말해보기')], ['믿을 수 있는 어른과 정리하기', () => chooseGoal('믿을 수 있는 어른과 내 마음 정리하기')], ['먼저 숨 고르기', startBreathing]]); }], ['친구에게 할 말 고르기', () => { addMessage('user', '친구에게 할 말 고르기'); offerGoals(); }], ['어른에게 도움 청하기', () => chooseGoal('믿을 수 있는 어른에게 이야기하기')]]);
    return;
  }
  if (state.topic === 'worry') {
    addMessage('assistant', '긴장될 때는 숨을 고르거나 준비를 작게 나눠볼 수 있어. 지금은 무엇부터 해볼까?');
    choices([['조금만 연습하기', () => { addMessage('user', '조금만 연습하기'); offerGoals(); }], ['먼저 숨 고르기', startBreathing], ['도움받을 사람 찾기', () => chooseGoal('믿을 수 있는 어른에게 준비 도움 요청하기')]]);
    return;
  }
  addMessage('assistant', state.topic === 'mistake' ? '실수 한 번으로 네가 어떤 사람인지 정해지지는 않아. 지금은 어떤 도움이 필요해?' : '바로 해결법을 정하기 전에, 어떤 도움이 필요한지 골라볼까?');
  choices([['전에 해본 방법 떠올리기', () => startStrategy('agency')], ['다른 방법 찾아보기', () => startStrategy('pathways')], ['먼저 마음 가라앉히기', startBreathing]]);
}
function startStrategy(kind) {
  cancelPending(); clearBreathing(); $('question-card')?.remove(); state.stage = 'strategy'; active('talk');
  addMessage('user', kind === 'agency' ? '시작하는 힘을 찾고 싶어' : '다른 방법을 찾고 싶어');
  if (kind === 'agency') {
    addMessage('assistant', '전에 비슷한 일을 조금이라도 해낸 적이 있어?');
    choices([['혼자 조금 해봤어', () => strategyAnswer('혼자 조금 해봤어', '전에 해본 것 중 다시 써볼 수 있는 방법을 골라 보자.')], ['도움을 받아 해봤어', () => strategyAnswer('도움을 받아 해봤어', '도움을 받아 해본 방법도 다시 쓸 수 있어.')], ['아직 생각이 안 나', () => strategyAnswer('아직 생각이 안 나', '지금 떠오르지 않으면 아주 작은 일부터 골라 보자.')]]);
  } else {
    addMessage('assistant', '하던 방법이 잘 안 된다면, 어느 쪽부터 바꿔볼까?');
    choices([['일을 더 작게 나누기', () => strategyAnswer('일을 더 작게 나누기', '한 번에 할 일을 줄여서 시작해 보자.')], ['다른 순서로 해보기', () => strategyAnswer('다른 순서로 해보기', '쉬운 부분부터 해보는 방법도 있어.')], ['도와줄 사람 찾기', () => chooseGoal('막힌 부분을 믿을 수 있는 어른에게 보여주기')]]);
  }
}
function strategyAnswer(label, response) { addMessage('user', label); offerGoals(response); }
function chooseMood(mood) {
  state.mood = mood; addMessage('user', mood);
  addMessage('assistant', ({ '괜찮아': '오늘 기억에 남는 일이 있어?', '속상해': '어떤 일 때문에 속상했어?', '걱정돼': '뭐가 걱정되는지 이야기해 줄래?', '화가 나': '무슨 일이 있었어?', '잘 모르겠어': '그럼 오늘 있었던 일부터 이야기해 볼까?' })[mood]);
  state.stage = 'topic'; choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
}
function startCheck() {
  cancelPending(); clearBreathing(); clearChoices(); active('check');
  state.stage = 'check'; state.question = Math.min(state.answers.length, 5);
  addMessage('assistant', '마음 점검은 어려운 일을 시작하고 방법을 찾는 나를 살펴보는 6문장이야. 평소에 얼마나 그런지 1~6 중에서 골라 줘. 시험이 아니고, 중간에 이야기부터 해도 돼.', { remember: false });
  renderQuestion(); notice('');
}
function renderQuestion() {
  $('question-card')?.remove(); $('intro').hidden = true;
  const card = document.createElement('section'); card.id = 'question-card'; card.className = 'question-card'; card.setAttribute('aria-label', '마음 점검 문항');
  const label = document.createElement('span'); label.className = 'eyebrow'; label.textContent = `마음 점검 ${state.question + 1} / 6`;
  const track = document.createElement('div'); track.className = 'progress-track'; track.setAttribute('role', 'progressbar'); track.setAttribute('aria-label', '응답한 문항'); track.setAttribute('aria-valuemin', '0'); track.setAttribute('aria-valuemax', '6'); track.setAttribute('aria-valuenow', String(state.answers.length)); const fill = document.createElement('span'); fill.style.width = `${state.answers.length / 6 * 100}%`; track.append(fill);
  const h = document.createElement('h3'); h.textContent = questions[state.question]; h.tabIndex = -1;
  const grid = document.createElement('div'); grid.className = 'scale-grid';
  scale.forEach((label, i) => { const b = button(`${i + 1} · ${label}`, () => answerCheck(i + 1)); b.setAttribute('aria-pressed', String(state.answers[state.question] === i + 1)); grid.append(b); });
  const controls = document.createElement('div'); controls.className = 'question-controls';
  const back = button('← 이전 문항', () => { state.question--; renderQuestion(); }); back.disabled = state.question === 0;
  controls.append(back, button('이야기 먼저 하기', () => { card.remove(); startTalk(); }), button('점검 새로 하기', () => { state.answers = []; state.question = 0; renderQuestion(); }));
  card.append(label, track, h, grid, controls); $('messages').append(card); h.focus({ preventScroll: true }); scroll();
}
function answerCheck(score) {
  if (!Number.isInteger(score) || score < 1 || score > 6 || state.stage !== 'check') return;
  state.answers[state.question] = score;
  if (state.question < 5) { state.question++; renderQuestion(); return; }
  if (state.answers.length < 6) { state.question = state.answers.length; renderQuestion(); return; }
  const result = summarizeCheck(state.answers); $('question-card')?.remove(); state.stage = 'checked';
  const reflections = ['평소에 해나가고 있다는 느낌은 있다고 답했어.', '해결할 방법을 여러 가지 떠올릴 때가 있다고 답했어.', '또래 친구들만큼 해나간다는 느낌은 있다고 답했어.', '중요한 일을 해낼 방법이 떠오를 때가 있다고 답했어.', '지금까지 해본 일이 앞으로 도움이 될 것 같다고 답했어.', '다른 사람이 포기하고 싶어 할 때도 다른 방법을 찾을 수 있다고 답했어.'];
  const reflection = state.answers[result.strongest] >= 4 ? reflections[result.strongest] + ' ' : '';
  const prompt = result.agency < result.pathways ? '시작하거나 이어가는 데 어떤 도움이 필요할지 찾아볼까?' : result.pathways < result.agency ? '해볼 방법을 더 찾아볼까?' : '지금 필요한 도움을 직접 골라볼까?';
  addMessage('assistant', '마음 점검은 여기까지야. ' + reflection + prompt, { remember: false });
  const supportChoices = [['시작하는 힘 찾기', () => startStrategy('agency')], ['다른 방법 찾기', () => startStrategy('pathways')]];
  if (result.pathways < result.agency) supportChoices.reverse();
  choices([...supportChoices, ['어려웠던 일부터 이야기하기', startTalk]]);
  notice('교육용 참고 답변이야. 점수로 너를 판단하거나 상태를 진단하지 않아.');
}
function offerGoals(context = '') {
  cancelPending(); clearBreathing(); $('question-card')?.remove(); active('talk');
  state.stage = 'goal'; addMessage('assistant', (typeof context === 'string' && context ? context + ' ' : '') + '오늘 해볼 수 있는 일 하나를 골라볼까?');
  choices(topics[state.topic].goals.map(goal => [goal, () => chooseGoal(goal)]).concat([['지금은 쉬고 싶어', () => finishRest()]]));
}

function chooseGoal(text) {
  addMessage('user', text); state.goal = { text, when: '', done: false }; state.stage = 'when';
  addMessage('assistant', '언제 해볼까?'); choices(['지금 잠깐', '오늘 쉬는 시간', '오늘 집에서'].map(when => [when, () => saveGoal(when)]));
}
function saveGoal(when) {
  state.goal.when = when; state.stage = 'followup'; renderGoal(); addMessage('assistant', '카드에 적어 뒀어. 해보고 나서 어땠는지 알려줘.');
  choices([['해봤어', () => reflectGoal()], ['더 작게 바꿀래', () => offerGoals()], ['오늘은 여기까지', () => endSession()]]);
}
function renderGoal() { $('goal-card').hidden = !state.goal; if (!state.goal) return; $('goal-text').textContent = state.goal.text; $('goal-when').textContent = state.goal.when; }
function reflectGoal() {
  if (!state.goal) return;
  state.goal.done = true; renderGoal(); addMessage('assistant', '해보고 나니 어땠어?');
  const reflect = (label, reply) => { addMessage('user', label); addMessage('assistant', reply); choices([['같은 방법 다시 해볼래', () => chooseGoal(state.goal.text)], ['다른 방법 찾아볼래', () => startStrategy('pathways')], ['오늘은 여기까지', endSession]]); };
  choices([['조금은 해볼 수 있었어', () => reflect('조금은 해볼 수 있었어', '작게 정한 일을 해본 경험이 생겼어. 다음에도 이 방법을 써볼까?')], ['도움을 받아 해봤어', () => reflect('도움을 받아 해봤어', '도움을 받아 해본 방법도 다음에 쓸 수 있어. 이어서 어떻게 해볼까?')], ['아직 어려워', () => { addMessage('user', '아직 어려워'); addMessage('assistant', '해보니 어느 쪽에서 막혔어?'); choices([['시작이 어려웠어', () => startStrategy('agency')], ['방법이 안 맞았어', () => startStrategy('pathways')], ['먼저 쉬고 싶어', startBreathing]]); }]]);
}
function finishRest() { state.stage = 'rest'; addMessage('assistant', '잠깐 쉬자. 물 한 모금 마시고 편하게 앉아 있어도 좋아.'); choices([['숨 고르기', startBreathing], ['오늘은 여기까지', endSession]]); }
function endSession() { cancelPending(); clearBreathing(); state.stage = 'end'; clearChoices(); addMessage('assistant', '오늘은 여기까지 하자. 힘든 일이 계속되면 믿을 수 있는 어른에게도 이야기해 줘.'); choices([['다른 이야기하기', startTalk], ['대화 지우기', () => $('reset-dialog').showModal()]]); }
function startBreathing() {
  cancelPending(); clearBreathing(); clearChoices(); $('question-card')?.remove(); active('breathe'); state.stage = 'breathe';
  addMessage('assistant', '편하게 앉아서 숨을 천천히 내쉬어 봐. 억지로 깊게 쉴 필요는 없어. 불편하거나 어지러우면 바로 멈춰 줘.');
  notice(''); $('writing-panel').open = false;
  state.breathing = createBreathingCard({ onLeave: startTalk });
  const card = state.breathing.element;
  $('messages').append(card); document.querySelector('.conversation').classList.add('is-breathing');
  requestAnimationFrame(() => card.scrollIntoView({ block: 'start', behavior: 'instant' }));
}
function offlineReply(text = '') {
  if (state.stage === 'help') { addMessage('assistant', '지금은 너를 안전하게 도와줄 수 있는 실제 어른과 함께하는 게 중요해. 선생님이나 상담 선생님에게 이 화면을 보여줘도 괜찮아.'); choices([['도움받는 방법 보기', () => $('help-dialog').showModal()], ['잠깐 숨 고르기', startBreathing]]); return; }
  if (state.stage === 'goal' && text) { chooseGoal(redactPII(text)); return; }
  if (state.stage === 'when' && state.goal && text) { saveGoal(redactPII(text)); return; }
  addMessage('assistant', '지금은 AI가 연결되지 않아서 쓴 내용에 맞춰 답할 수는 없어. 대신 아래에서 해볼 일을 고르거나 잠깐 쉬어 갈 수 있어.');
  choices([['작은 행동 고르기', offerGoals], ['잠깐 숨 고르기', startBreathing], ['다른 주제 고르기', startTalk]]);
}
async function requestAI() {
  const generation = state.generation; const payload = { profile: state.profile, topic: state.topic, mood: state.mood, messages: state.history.slice(-16) };
  const controller = new AbortController(); state.abort = controller; setBusy(true);
  const pending = document.createElement('div'); pending.className = 'busy'; pending.id = 'pending'; pending.setAttribute('role', 'status'); pending.textContent = '답변을 기다리고 있어…'; $('messages').append(pending); scroll();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const headers = await apiHeaders(); if (generation !== state.generation) return;
    headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(`${apiBase}/api/chat`, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.json(); if (generation !== state.generation) return;
    if (res.status === 401) { state.connected = false; state.token = ''; updateConnection(); }
    if (!res.ok) throw new Error(data.error || '연결이 잠시 끊겼어. 다시 시도해 줄래?');
    addMessage('assistant', data.message, { alert: Boolean(data.safety) });
    state.stage = data.safety ? 'help' : 'explore';
    if (data.safety) choices([['도움받는 방법 보기', () => $('help-dialog').showModal()]]);
    else choices([['작은 행동 고르기', offerGoals], ['다른 이야기 고르기', startTalk], ['잠깐 쉬기', finishRest]]);
    notice(data.filtered ? '안전하게 이야기할 수 있도록 안내를 바꿨어.' : 'AI의 답변은 틀릴 수 있어. 네 생각과 다르면 말해 줘.');
  } catch (error) {
    if (generation !== state.generation) return;
    notice(error.name === 'AbortError' ? '답변이 늦어지고 있어. 다시 보내거나 기본 활동을 골라줘.' : error.message, true);
    choices([[state.connected ? '다시 보내기' : '다시 연결하기', () => state.connected ? requestAI() : openConnection()], ['기본 활동으로 계속', () => { state.connected = false; state.token = ''; updateConnection(); offlineReply(); }]]);
  } finally { clearTimeout(timeout); if (generation === state.generation) { pending.remove(); state.abort = null; setBusy(false); if ($('writing-panel').open) $('message').focus(); } }
}
async function sendText(raw) {
  const text = raw.trim(); if (!text || state.busy) return;
  reader.stop();
  if (text.length > 1200) { notice('한 번에 1,200자 이내로 적어줘.', true); return; }
  $('message').value = ''; $('message').style.height = ''; clearChoices(); addMessage('user', text, { remember: state.stage !== 'check' });
  if (safetyRoute(text)) return;
  if (state.stage === 'check') {
    if (/^[1-6]$/.test(text)) answerCheck(Number(text));
    else { addMessage('assistant', '점검을 계속하려면 아래에서 골라줘. 먼저 이야기하고 싶으면 ‘이야기 먼저 하기’를 누르면 돼.', { remember: false }); renderQuestion(); }
    return;
  }
  if (state.connected) await requestAI(); else offlineReply(text);
}
function updateConnection() {
  $('connect-open').textContent = state.connected ? 'AI 연결 설정' : 'AI 대화 설정';
  $('connect-fields').hidden = state.connected;
  $('connect-submit').hidden = state.connected;
  $('disconnect').hidden = !state.connected;
}
function openConnection() {
  $('connect-status').textContent = '';
  $('transfer-consent').checked = false;
  updateConnection();
  $('connect-dialog').showModal();
  if (state.connected) { $('connection-info').textContent = 'AI와 연결되어 있어. 이야기를 계속하거나 연결을 끝낼 수 있어.'; return; }
  checkServer();
}
async function checkServer() {
  if (!config.firebase && !apiBase && !['localhost', '127.0.0.1'].includes(location.hostname)) { $('connection-info').textContent = '아직 연결을 준비하고 있어. 아래 ‘코드 없이 기본 활동 하기’를 눌러도 돼.'; serverReady = false; return; }
  if (healthCheck) return healthCheck;
  $('connection-info').textContent = '연결을 확인하고 있어. 쉬고 있던 서버는 깨어나는 데 1분 정도 걸릴 수 있어.';
  healthCheck = (async () => {
    try {
      const res = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error();
      const data = await res.json(); serverReady = data.ready === true;
      $('connection-info').textContent = serverReady ? '연결 준비가 됐어. 숫자 코드를 넣고 시작해 줘.' : '아직 연결을 준비하고 있어. 기본 활동은 지금 할 수 있어.';
    } catch { serverReady = false; $('connection-info').textContent = '연결이 늦어지고 있어. 잠시 뒤 다시 시작하거나 기본 활동을 해도 돼.'; }
    finally { healthCheck = null; }
  })();
  return healthCheck;
}
function reset() { cancelPending(); clearBreathing(); state.history = []; state.answers = []; state.question = 0; state.goal = null; state.mood = ''; state.topic = 'challenge'; state.stage = 'welcome'; $('writing-panel').open = false; $('mood-picker').open = false; $('topic-picker').open = false; $('chat-scroll').scrollTop = 0; state.token = ''; state.connected = false; $('access-code').value = ''; $('transfer-consent').checked = false; $('messages').replaceChildren(); $('intro').hidden = false; $('goal-card').hidden = true; $('message').value = ''; $('connect-status').textContent = ''; clearChoices(); updateConnection(); active('talk'); notice('다시 시작할 수 있어. 아래에서 하고 싶은 걸 골라 줘.'); }

document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => { $('question-card')?.remove(); ({ talk: startTalk, check: startCheck, breathe: startBreathing })[b.dataset.start](); }));
document.querySelectorAll('[data-entry]').forEach(b => b.addEventListener('click', () => startEntry(b.dataset.entry)));
document.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => startTopic(b.dataset.topic)));
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => chooseMood(b.dataset.mood)));
$('chat-form').addEventListener('submit', e => { e.preventDefault(); sendText($('message').value); });
$('message').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText($('message').value); } });
$('message').addEventListener('input', () => { $('message').style.height = 'auto'; $('message').style.height = `${Math.min($('message').scrollHeight, 140)}px`; $('message').style.overflowY = $('message').scrollHeight > 140 ? 'auto' : 'hidden'; });
$('profile').addEventListener('change', () => { cancelPending(); reader.stop(); state.profile = $('profile').value; document.body.classList.toggle('low-literacy', state.profile === 'lower'); if (state.history.length) { state.history = []; addMessage('assistant', `${profiles[state.profile].label}으로 바꿨어. 하고 싶은 활동을 골라 줘.`, { remember: false }); } });
$('privacy-open').addEventListener('click', () => { reader.stop(); $('privacy-dialog').showModal(); });
$('privacy-dialog').addEventListener('close', () => reader.stop());
$('voice-preview').addEventListener('click', () => reader.read('오늘 무슨 일이 있었어? 말하기 어려우면 아래에서 하나 골라도 돼. 천천히 같이 해보자.'));
$('connect-open').addEventListener('click', openConnection);
$('reset').addEventListener('click', () => $('reset-dialog').showModal());
$('confirm-reset').addEventListener('click', () => { reset(); $('reset-dialog').close(); });
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('connect-form').addEventListener('submit', async e => {
  e.preventDefault(); if (connecting || state.connected) return;
  const code = $('access-code').value.trim();
  if (!/^[0-9]{4,6}$/.test(code)) { $('connect-status').textContent = '선생님께 받은 숫자 4~6자리를 넣어 줘.'; return; }
  if (!$('transfer-consent').checked) return;
  const attempt = ++connectionGeneration;
  connecting = true; $('connect-submit').disabled = true; $('connect-submit').textContent = '연결하고 있어…'; $('connect-status').textContent = '';
  try {
    await checkServer(); if (attempt !== connectionGeneration) return;
    if (!serverReady) { $('connect-status').textContent = '아직 연결되지 않았어. 아래에서 기본 활동을 먼저 해도 돼.'; return; }
    const headers = await apiHeaders(); if (attempt !== connectionGeneration) return;
    const res = await fetch(`${apiBase}/api/session`, { method: 'POST', headers, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000) });
    const data = await res.json(); if (attempt !== connectionGeneration) return;
    if (!res.ok) throw new Error(data.error || '잠시 뒤 다시 연결해 줘.');
    if (typeof data.token !== 'string' || data.token.length < 32) throw new Error('연결을 다시 준비해야 해. 선생님께 알려 줘.');
    cancelPending(); state.token = data.token; state.connected = true; state.history = []; updateConnection(); $('access-code').value = ''; $('connect-dialog').close(); notice('AI와 연결됐어. 지금부터 나누는 대화만 Google로 전송돼.');
  } catch (error) { if (attempt === connectionGeneration) $('connect-status').textContent = error.name === 'TimeoutError' ? '연결이 늦어지고 있어. 잠시 뒤 다시 해 보자.' : error.message; }
  finally { if (attempt === connectionGeneration) { connecting = false; $('connect-submit').disabled = false; $('connect-submit').textContent = '이야기 시작하기'; } }
});
$('connect-dialog').addEventListener('close', () => { connectionGeneration++; connecting = false; $('connect-submit').disabled = false; $('connect-submit').textContent = '이야기 시작하기'; $('access-code').value = ''; $('transfer-consent').checked = false; });
$('disconnect').addEventListener('click', () => { cancelPending(); state.token = ''; state.connected = false; state.history = []; $('access-code').value = ''; updateConnection(); $('connect-dialog').close(); notice('AI 연결을 해제했어. 기본 활동으로 계속할 수 있어.'); });
document.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => { cancelPending(); b.dataset.goal === 'done' ? reflectGoal() : offerGoals(); }));
$('read-aloud').addEventListener('click', () => { const bubbles = document.querySelectorAll('.message-row.assistant .bubble'); reader.read(bubbles.length ? bubbles[bubbles.length - 1].textContent : '내 마음 살펴볼까? 마음 점검부터 해도, 어려웠던 일부터 골라도 돼. 먼저 마음을 가라앉혀도 좋아.'); });
$('mic').addEventListener('click', () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { notice('말로 입력하기를 지원하지 않는 브라우저야. 버튼을 고르거나 글로 적어줘.', true); return; } if (state.recognition) { state.recognition.stop(); return; } if (!window.confirm('말로 입력하면 브라우저의 음성 서비스로 음성이 전송될 수 있어. 계속할까?')) return; const recognition = new Recognition(); state.recognition = recognition; recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.onresult = e => { $('message').value = e.results[0][0].transcript.slice(0, 1200); notice('알아들은 말을 확인하고 보내기를 눌러줘.'); }; recognition.onerror = () => notice('음성을 받지 못했어. 마이크 권한을 확인하거나 글로 적어줘.', true); recognition.onend = () => { state.recognition = null; $('mic').classList.remove('recording'); }; try { recognition.start(); $('mic').classList.add('recording'); notice('듣고 있어. 실명이나 학교 이름은 말하지 않아도 돼.'); } catch { state.recognition = null; notice('마이크를 시작하지 못했어.', true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { state.breathing?.stop(); reader.stop(); } });
window.addEventListener('pagehide', () => { cancelPending(); clearBreathing(); state.token = ''; state.history = []; });
updateConnection();
