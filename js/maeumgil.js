import { config } from './maeumgil-config.js';
import { profiles, questions, scale, summarizeCheck, assessSafety, helpMessage, redactPII, topics } from './maeumgil-core.js';

const $ = id => document.getElementById(id);
const state = { profile: 'upper', topic: 'daily', stage: 'welcome', answers: [], question: 0, mood: '', goal: null, history: [], code: '', connected: false, busy: false, generation: 0, abort: null, breathTimer: null, recognition: null };
const apiBase = config.apiBase.replace(/\/$/, '');
let serverReady = false;

function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function scroll() { requestAnimationFrame(() => { const el = $('chat-scroll'); el.scrollTop = el.scrollHeight; }); }
function active(name) { document.querySelectorAll('[data-start]').forEach(b => b.classList.toggle('active', b.dataset.start === name)); }
function clearBreathing() { clearInterval(state.breathTimer); state.breathTimer = null; document.querySelectorAll('.breathing-circle').forEach(el => el.classList.remove('running')); window.speechSynthesis?.cancel(); $('read-aloud').setAttribute('aria-pressed', 'false'); if (state.recognition) { state.recognition.abort(); state.recognition = null; $('mic').classList.remove('recording'); } }
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
  addMessage('assistant', '어떤 쪽 얘기야? 하나만 골라 줘.');
  choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
}
function startEntry(kind) {
  cancelPending(); clearBreathing(); $('question-card')?.remove(); active('talk');
  state.topic = 'daily'; $('writing-panel').open = false;
  const labels = { light: '그냥 놀러 왔어', unsure: '할 말은 있는데…', rest: '잠깐 쉬고 싶어' };
  addMessage('user', labels[kind]);
  if (kind === 'rest') { finishRest(); return; }
  if (kind === 'unsure') { startTalk(); return; }
  lightQuestion(0);
}
const lightRounds = [
  { text: '지금 하나만 고른다면?', options: ['좋아하는 노래 듣기', '재미있는 영상 보기', '간식 먹기', '아무것도 안 하기'] },
  { text: '쉬는 시간이 길어진다면 뭐 하고 싶어?', options: ['친구랑 놀기', '혼자 편하게 있기', '좋아하는 놀이 하기', '아직 모르겠어'] },
];
function lightQuestion(index) {
  state.stage = 'light'; state.topic = 'daily';
  const round = lightRounds[index];
  if (!round) {
    addMessage('assistant', '이제 뭘 해볼까?');
    choices([['한 번 더 고를래', () => lightQuestion(0)], ['다른 얘기도 해볼래', startTalk], ['잠깐 쉴래', finishRest]]);
    notice('다른 이야기를 고르거나 잠깐 쉬어 갈 수 있어.');
    return;
  }
  addMessage('assistant', round.text);
  choices(round.options.map(label => [label, () => { addMessage('user', label); lightQuestion(index + 1); }]));
  notice('버튼을 눌러서 이어가면 돼.');
}
function chooseTopicAnswer(label) {
  if (state.topic === 'daily') {
    addMessage('user', label);
    if (label === '잠깐 쉬기') finishRest();
    else lightQuestion(label === '쉬는 시간 상상하기' ? 1 : 0);
    return;
  }
  if (state.connected) { sendText(label); return; }
  addMessage('user', label);
  if (['잠깐 쉬고 싶어', '잠깐 마음을 가라앉힐래'].includes(label)) { finishRest(); return; }
  if (label === '어른에게 도움을 청할래') { chooseGoal('믿을 수 있는 어른에게 이야기하기'); return; }
  offerGoals();
}
function chooseMood(mood) {
  state.mood = mood; addMessage('user', mood);
  addMessage('assistant', ({ '괜찮아': '오늘 기억에 남는 일이 있어?', '속상해': '어떤 일 때문에 속상했어?', '걱정돼': '뭐가 걱정되는지 이야기해 줄래?', '화가 나': '무슨 일이 있었어?', '잘 모르겠어': '그럼 오늘 있었던 일부터 이야기해 볼까?' })[mood]);
  state.stage = 'topic'; choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
}
function startCheck() {
  cancelPending(); clearBreathing(); clearChoices(); active('check');
  state.stage = 'check'; state.question = Math.min(state.answers.length, 5);
  addMessage('assistant', '문장 여섯 개를 읽고 지금 너와 얼마나 비슷한지 골라 줘. 정답은 없어. 중간에 그만해도 돼.', { remember: false });
  renderQuestion(); notice('교육용 마음 점검 · 표준화된 심리검사나 진단이 아니야.');
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
  const responses = ['오늘 해볼 일을 정하는 건 할 만하다고 답했어.', '다른 방법을 떠올리는 건 할 만하다고 답했어.', '조금씩 시작하는 건 할 만하다고 답했어.', '도움을 청할 사람은 떠올릴 수 있다고 답했어.', '전에 해낸 일이 생각난다고 답했어.', '다른 방법으로 다시 해볼 수 있다고 답했어.'];
  const text = result.strongest === result.support || state.answers[result.strongest] < 4 ? '다 골랐어. 요즘 어떤 일이 있는지 이야기해 볼까?' : `${responses[result.strongest]} 지금 그걸 해보고 싶은 일이 있어?`;
  addMessage('assistant', text, { remember: false }); choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
  notice('이 답변만으로 성격이나 마음 상태를 판단할 수는 없어.');
}
function offerGoals() {
  cancelPending(); clearBreathing(); $('question-card')?.remove(); active('talk');
  state.stage = 'goal'; addMessage('assistant', '지금 해볼 만한 게 있어? 하나만 골라 줘.');
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
function renderGoal() { $('goal-card').hidden = !state.goal; if (!state.goal) return; $('goal-text').textContent = state.goal.text; $('goal-when').textContent = state.goal.when; $('goal-feedback').textContent = state.goal.done ? '해본 일로 표시했어.' : ''; }
function reflectGoal() { if (!state.goal) return; state.goal.done = true; renderGoal(); addMessage('assistant', '해보니까 어땠어?'); choices([['조금 편해졌어', () => { addMessage('user', '조금 편해졌어'); addMessage('assistant', '어떤 점이 도움이 됐어? 기억해 두고 싶으면 카드를 복사해 둬도 돼.'); choices([['오늘은 여기까지', endSession], ['다른 이야기하기', startTalk]]); }], ['아직 어려워', () => { offerGoals(); }]]); }
function finishRest() { state.stage = 'rest'; addMessage('assistant', '잠깐 쉬자. 물 한 모금 마시고 편하게 앉아 있어도 좋아.'); choices([['숨 고르기', startBreathing], ['오늘은 여기까지', endSession]]); }
function endSession() { cancelPending(); clearBreathing(); state.stage = 'end'; clearChoices(); addMessage('assistant', '오늘은 여기까지 하자. 힘든 일이 계속되면 믿을 수 있는 어른에게도 이야기해 줘.'); choices([['다른 이야기하기', startTalk], ['대화 지우기', () => $('reset-dialog').showModal()]]); }
function startBreathing() {
  cancelPending(); clearBreathing(); clearChoices(); $('question-card')?.remove(); active('breathe'); state.stage = 'breathe';
  addMessage('assistant', '편하게 앉아서 숨을 천천히 내쉬어 봐. 억지로 깊게 쉴 필요는 없어. 불편하거나 어지러우면 바로 멈춰 줘.');
  const card = document.createElement('div'); card.className = 'breathing-card'; const circle = document.createElement('div'); circle.className = 'breathing-circle'; circle.textContent = '편안하게';
  const desc = document.createElement('p'); desc.textContent = '편하게 들이쉬고, 천천히 내쉬기.\n네가 편한 속도로 쉬어 줘.';
  const toggle = button('30초 함께하기', () => { if (state.breathTimer) { clearBreathing(); toggle.textContent = '다시 함께하기'; circle.textContent = '편안하게'; return; } let left = 30; circle.classList.add('running'); toggle.textContent = '멈추기'; state.breathTimer = setInterval(() => { left--; circle.textContent = `${left}초`; if (left <= 0) { clearBreathing(); circle.textContent = '수고했어'; toggle.textContent = '다시 함께하기'; notice('조금 쉬었네. 이제 하고 싶은 걸 골라 줘.'); } }, 1000); });
  card.append(circle, desc, toggle); $('messages').append(card); choices([['이야기 나누기', startTalk], ['오늘은 여기까지', endSession]]); scroll();
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
    const res = await fetch(`${apiBase}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.code}` }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.json(); if (generation !== state.generation) return;
    if (!res.ok) throw new Error(data.error || '연결이 잠시 끊겼어. 다시 시도해 줄래?');
    addMessage('assistant', data.message, { alert: Boolean(data.safety) });
    state.stage = data.safety ? 'help' : 'explore';
    if (data.safety) choices([['도움받는 방법 보기', () => $('help-dialog').showModal()]]);
    else choices([['작은 행동 고르기', offerGoals], ['다른 이야기 고르기', startTalk], ['잠깐 쉬기', finishRest]]);
    notice(data.filtered ? '안전하게 이야기할 수 있도록 안내를 바꿨어.' : 'AI의 답변은 틀릴 수 있어. 네 생각과 다르면 말해 줘.');
  } catch (error) {
    if (generation !== state.generation) return;
    notice(error.name === 'AbortError' ? '답변이 늦어지고 있어. 다시 보내거나 기본 활동을 골라줘.' : error.message, true);
    choices([['다시 보내기', () => requestAI()], ['기본 활동으로 계속', () => { state.connected = false; state.code = ''; updateConnection(); offlineReply(); }]]);
  } finally { clearTimeout(timeout); if (generation === state.generation) { pending.remove(); state.abort = null; setBusy(false); if ($('writing-panel').open) $('message').focus(); } }
}
async function sendText(raw) {
  const text = raw.trim(); if (!text || state.busy) return;
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
function updateConnection() { $('connect-open').textContent = state.connected ? 'AI 연결 설정' : 'AI 대화 설정'; }
async function checkServer() {
  if (!apiBase && !['localhost', '127.0.0.1'].includes(location.hostname)) { $('connection-info').textContent = '아직 AI 대화 서버가 연결되지 않았어. 마음 점검·숨 고르기·실천 카드는 지금 사용할 수 있어.'; serverReady = false; return; }
  try { const res = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(5000) }); if (!res.ok) throw new Error(); const data = await res.json(); serverReady = data.ready === true; $('connection-info').textContent = serverReady ? 'AI 대화를 사용할 수 있어. 운영자에게 받은 이용 코드를 입력해 줘.' : '운영자가 AI 연결을 준비하고 있어. 지금은 기본 활동을 사용할 수 있어.'; } catch { serverReady = false; $('connection-info').textContent = '지금은 AI 서버에 연결할 수 없어. 기본 활동은 계속 사용할 수 있어.'; }
}
function reset() { cancelPending(); clearBreathing(); state.history = []; state.answers = []; state.question = 0; state.goal = null; state.mood = ''; state.topic = 'daily'; state.stage = 'welcome'; $('writing-panel').open = false; $('mood-picker').open = false; $('topic-picker').open = false; $('chat-scroll').scrollTop = 0; state.code = ''; state.connected = false; $('access-code').value = ''; $('transfer-consent').checked = false; $('messages').replaceChildren(); $('intro').hidden = false; $('goal-card').hidden = true; $('message').value = ''; $('connect-status').textContent = ''; clearChoices(); updateConnection(); active('talk'); notice('다시 시작할 수 있어. 아래에서 하고 싶은 걸 골라 줘.'); }

document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => { $('question-card')?.remove(); ({ talk: startTalk, check: startCheck, breathe: startBreathing })[b.dataset.start](); }));
document.querySelectorAll('[data-entry]').forEach(b => b.addEventListener('click', () => startEntry(b.dataset.entry)));
document.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => startTopic(b.dataset.topic)));
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => chooseMood(b.dataset.mood)));
$('chat-form').addEventListener('submit', e => { e.preventDefault(); sendText($('message').value); });
$('message').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText($('message').value); } });
$('message').addEventListener('input', () => { $('message').style.height = 'auto'; $('message').style.height = `${Math.min($('message').scrollHeight, 140)}px`; $('message').style.overflowY = $('message').scrollHeight > 140 ? 'auto' : 'hidden'; });
$('profile').addEventListener('change', () => { cancelPending(); state.profile = $('profile').value; document.body.classList.toggle('low-literacy', state.profile === 'lower'); if (state.history.length) { state.history = []; addMessage('assistant', `${profiles[state.profile].label}으로 바꿨어. 하고 싶은 활동을 골라 줘.`, { remember: false }); } });
$('privacy-open').addEventListener('click', () => $('privacy-dialog').showModal());
$('connect-open').addEventListener('click', () => { $('connect-dialog').showModal(); checkServer(); });
$('help-open').addEventListener('click', () => $('help-dialog').showModal());
$('reset').addEventListener('click', () => $('reset-dialog').showModal());
$('confirm-reset').addEventListener('click', () => { reset(); $('reset-dialog').close(); });
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('connect-form').addEventListener('submit', async e => {
  e.preventDefault(); await checkServer(); if (!serverReady) { $('connect-status').textContent = '아직 AI 서버가 준비되지 않았어. 기본 활동을 이용해 줘.'; return; }
  const code = $('access-code').value.trim(); if (!code) { $('connect-status').textContent = '이용 코드를 입력해 줘.'; return; }
  try { const res = await fetch(`${apiBase}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}` }, body: '{}', signal: AbortSignal.timeout(8000) }); if (!res.ok) throw new Error('이용 코드를 확인하거나 잠시 뒤 다시 시도해 줘.'); cancelPending(); state.code = code; state.connected = true; state.history = []; updateConnection(); $('access-code').value = ''; $('connect-dialog').close(); notice('지금부터 입력하는 대화가 AI로 전송돼. 이전 기본 활동의 대화는 전송하지 않아.'); } catch (error) { $('connect-status').textContent = error.message; }
});
$('disconnect').addEventListener('click', () => { cancelPending(); state.code = ''; state.connected = false; state.history = []; $('access-code').value = ''; updateConnection(); $('connect-dialog').close(); notice('AI 연결을 해제했어. 기본 활동으로 계속할 수 있어.'); });
document.querySelectorAll('[data-goal]').forEach(b => b.addEventListener('click', () => { cancelPending(); b.dataset.goal === 'done' ? reflectGoal() : offerGoals(); }));
$('copy-goal').addEventListener('click', async () => { if (!state.goal) return; try { await navigator.clipboard.writeText(`오늘의 작은 한 걸음\n${state.goal.text}\n언제: ${state.goal.when}`); $('goal-feedback').textContent = '실천 카드를 복사했어. 공유할 사람은 네가 고르면 돼.'; } catch { $('goal-feedback').textContent = '복사가 어려워. 카드의 문장을 직접 선택해서 복사해 줘.'; } });
$('read-aloud').addEventListener('click', () => { if (!('speechSynthesis' in window)) { notice('이 브라우저에서는 읽어주기가 지원되지 않아.', true); return; } if (speechSynthesis.speaking) { speechSynthesis.cancel(); $('read-aloud').setAttribute('aria-pressed', 'false'); return; } const bubbles = document.querySelectorAll('.message-row.assistant .bubble'); const text = bubbles.length ? bubbles[bubbles.length - 1].textContent : '잠깐 쉬었다 가. 그냥 놀러 왔어, 할 말은 있는데, 잠깐 쉬고 싶어 중에서 하나만 눌러 봐.'; const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR'; utterance.rate = .9; utterance.onend = () => $('read-aloud').setAttribute('aria-pressed', 'false'); utterance.onerror = utterance.onend; speechSynthesis.speak(utterance); $('read-aloud').setAttribute('aria-pressed', 'true'); });
$('mic').addEventListener('click', () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { notice('말로 입력하기를 지원하지 않는 브라우저야. 버튼을 고르거나 글로 적어줘.', true); return; } if (state.recognition) { state.recognition.stop(); return; } if (!window.confirm('말로 입력하면 브라우저의 음성 서비스로 음성이 전송될 수 있어. 계속할까?')) return; const recognition = new Recognition(); state.recognition = recognition; recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.onresult = e => { $('message').value = e.results[0][0].transcript.slice(0, 1200); notice('알아들은 말을 확인하고 보내기를 눌러줘.'); }; recognition.onerror = () => notice('음성을 받지 못했어. 마이크 권한을 확인하거나 글로 적어줘.', true); recognition.onend = () => { state.recognition = null; $('mic').classList.remove('recording'); }; try { recognition.start(); $('mic').classList.add('recording'); notice('듣고 있어. 실명이나 학교 이름은 말하지 않아도 돼.'); } catch { state.recognition = null; notice('마이크를 시작하지 못했어.', true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearBreathing(); window.speechSynthesis?.cancel(); } });
window.addEventListener('pagehide', () => { cancelPending(); clearBreathing(); window.speechSynthesis?.cancel(); state.code = ''; state.history = []; });
checkServer();
