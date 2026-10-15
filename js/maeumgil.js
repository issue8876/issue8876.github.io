import { config } from './maeumgil-config.js';
import { profiles, questions, scale, summarizeCheck, assessSafety, helpMessage, redactPII, topics } from './maeumgil-core.js';

const $ = id => document.getElementById(id);
const state = { profile: 'upper', topic: 'study', stage: 'welcome', answers: [], question: 0, mood: '', goal: null, history: [], code: '', connected: false, busy: false, generation: 0, abort: null, breathTimer: null, recognition: null };
const apiBase = config.apiBase.replace(/\/$/, '');
let serverReady = false;

function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function scroll() { requestAnimationFrame(() => { const el = $('chat-scroll'); el.scrollTop = el.scrollHeight; }); }
function active(name) { document.querySelectorAll('[data-start]').forEach(b => b.classList.toggle('active', b.dataset.start === name)); }
function clearBreathing() { clearInterval(state.breathTimer); state.breathTimer = null; document.querySelectorAll('.breathing-circle').forEach(el => el.classList.remove('running')); window.speechSynthesis?.cancel(); $('read-aloud').setAttribute('aria-pressed', 'false'); if (state.recognition) { state.recognition.abort(); state.recognition = null; $('mic').classList.remove('recording'); } }
function clearChoices() { $('choices').replaceChildren(); }
function button(label, callback) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', callback); return b; }
function choices(items) { clearChoices(); for (const [label, cb] of items) $('choices').append(button(label, () => { if (!state.busy) cb(); })); }
function addMessage(role, text, { alert = false, remember = true } = {}) {
  $('intro').hidden = true;
  const row = document.createElement('div'); row.className = `message-row ${role}${alert ? ' alert' : ''}`;
  if (role === 'assistant') { const avatar = document.createElement('span'); avatar.className = 'message-avatar'; avatar.textContent = '🌱'; avatar.setAttribute('aria-hidden', 'true'); row.append(avatar); }
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
  choices(topics[key].choices.map(label => [label, () => sendText(label)]));
  notice(state.connected ? 'AI 연결 중 · 이름이나 연락처는 적지 않아도 돼.' : '기본 활동 · 준비된 질문과 선택지로 천천히 이어가 볼게.');
}
function startTalk() {
  cancelPending(); clearBreathing(); state.stage = 'topic'; active('talk');
  addMessage('assistant', state.profile === 'middle' ? '지금 가장 마음에 걸리는 주제를 골라줘. 직접 적어도 괜찮아.' : '어떤 이야기를 나눠 볼까? 편한 것을 하나 골라 줘.');
  choices(Object.entries(topics).map(([key, t]) => [`${t.emoji} ${t.label}`, () => startTopic(key)]));
}
function chooseMood(mood) {
  state.mood = mood; addMessage('user', mood);
  addMessage('assistant', mood === '잘 모르겠어' ? '정확히 고르지 않아도 괜찮아. 오늘 있었던 일부터 살펴볼까?' : `${mood} 쪽에 가까운 마음이구나. 어떤 이야기와 연결돼 있을까?`);
  state.stage = 'topic'; choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
}
function startCheck() {
  cancelPending(); clearBreathing(); clearChoices(); active('check');
  state.stage = 'check'; state.question = Math.min(state.answers.length, 5);
  addMessage('assistant', '여섯 문장으로 지금 느낌을 살펴볼게. 시험이 아니고 정답도 없어. 중간에 쉬거나 이야기로 바꿔도 괜찮아.', { remember: false });
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
  const strengths = ['작은 일을 정하기', '다른 방법 떠올리기', '작게 시작하기', '도움 청하기', '해낸 경험 떠올리기', '다시 시도하기'];
  const text = result.strongest === result.support ? '여섯 문장을 모두 살펴봤어. 지금 느낌을 알려줘서 고마워. 오늘 해볼 수 있는 작은 일 하나를 함께 골라볼까?' : `지금은 ‘${strengths[result.strongest]}’ 쪽이 조금 더 편하게 느껴지는구나. ‘${strengths[result.support]}’는 함께 방법을 찾아봐도 좋겠어. 오늘 어떤 상황에서 작은 한 걸음을 해보고 싶어?`;
  addMessage('assistant', text, { remember: false }); choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
  notice('점수로 너를 판단하지 않아. 지금 고른 느낌을 대화의 출발점으로만 사용할게.');
}
function offerGoals() {
  cancelPending(); clearBreathing(); $('question-card')?.remove(); active('talk');
  state.stage = 'goal'; addMessage('assistant', '오늘 해볼 수 있는 만큼만 골라보자. 더 작게 바꿔도 괜찮아.');
  choices(topics[state.topic].goals.map(goal => [goal, () => chooseGoal(goal)]).concat([['지금은 쉬고 싶어', () => finishRest()]]));
}
function chooseGoal(text) {
  addMessage('user', text); state.goal = { text, when: '', done: false }; state.stage = 'when';
  addMessage('assistant', '언제 해보면 가장 편할까?'); choices(['지금 잠깐', '오늘 쉬는 시간', '오늘 집에서'].map(when => [when, () => saveGoal(when)]));
}
function saveGoal(when) {
  state.goal.when = when; state.stage = 'followup'; renderGoal(); addMessage('assistant', `좋아. ‘${when}’에 ‘${state.goal.text}’를 해보기로 했어. 해본 뒤에는 ‘해봤어’나 ‘바꿀래’를 골라줘. 힘들면 더 작게 바꿔도 괜찮아.`);
  choices([['해봤어', () => reflectGoal()], ['더 작게 바꿀래', () => offerGoals()], ['오늘은 여기까지', () => endSession()]]);
}
function renderGoal() { $('goal-card').hidden = !state.goal; if (!state.goal) return; $('goal-text').textContent = state.goal.text; $('goal-when').textContent = state.goal.when; $('goal-feedback').textContent = state.goal.done ? '네가 해본 방법을 기억해 두자.' : ''; }
function reflectGoal() { if (!state.goal) return; state.goal.done = true; renderGoal(); addMessage('assistant', '직접 해봤구나. 해보기 전과 비교하면 지금 느낌은 어때?'); choices([['조금 편해졌어', () => { addMessage('user', '조금 편해졌어'); addMessage('assistant', '어떤 부분이 도움이 됐는지 기억해 두면 좋겠어. 오늘의 실천 카드는 복사해서 네가 보관할 수도 있어.'); choices([['오늘은 여기까지', endSession], ['다른 이야기하기', startTalk]]); }], ['아직 어려워', () => { addMessage('assistant', '여전히 어렵게 느껴지는구나. 네 잘못은 아니야. 행동을 더 작게 나누거나 도움을 청하는 방법을 골라보자.'); offerGoals(); }]]); }
function finishRest() { state.stage = 'rest'; addMessage('assistant', '지금은 쉬는 것을 골랐구나. 물 한 모금 마시거나 편한 자세로 잠깐 쉬어도 좋아.'); choices([['숨 고르기', startBreathing], ['오늘은 여기까지', endSession]]); }
function endSession() { cancelPending(); clearBreathing(); state.stage = 'end'; clearChoices(); addMessage('assistant', '오늘 네 마음을 살펴보는 데 시간을 내줬구나. 여기서 쉬어도 좋아. 힘든 일이 계속되면 믿을 수 있는 어른과 함께 이야기해 줘.'); choices([['다른 이야기하기', startTalk], ['대화 지우기', () => $('reset-dialog').showModal()]]); }
function startBreathing() {
  cancelPending(); clearBreathing(); clearChoices(); $('question-card')?.remove(); active('breathe'); state.stage = 'breathe';
  addMessage('assistant', '숨을 억지로 크게 쉬지 않아도 돼. 편한 자세로 천천히 내쉬어 보자. 불편하거나 어지러우면 바로 멈춰도 괜찮아.');
  const card = document.createElement('div'); card.className = 'breathing-card'; const circle = document.createElement('div'); circle.className = 'breathing-circle'; circle.textContent = '편안하게';
  const desc = document.createElement('p'); desc.textContent = '편하게 들이쉬고, 천천히 내쉬기.\n화면을 따라 하지 않아도 괜찮아.';
  const toggle = button('30초 함께하기', () => { if (state.breathTimer) { clearBreathing(); toggle.textContent = '다시 함께하기'; circle.textContent = '편안하게'; return; } let left = 30; circle.classList.add('running'); toggle.textContent = '멈추기'; state.breathTimer = setInterval(() => { left--; circle.textContent = `${left}초`; if (left <= 0) { clearBreathing(); circle.textContent = '수고했어'; toggle.textContent = '다시 함께하기'; notice('지금 느낌이 어떤지 살펴보고, 편한 다음 활동을 골라줘.'); } }, 1000); });
  card.append(circle, desc, toggle); $('messages').append(card); choices([['이야기 나누기', startTalk], ['오늘은 여기까지', endSession]]); scroll();
}
function offlineReply(text = '') {
  if (state.stage === 'help') { addMessage('assistant', '지금은 너를 안전하게 도와줄 수 있는 실제 어른과 함께하는 게 중요해. 선생님이나 상담 선생님에게 이 화면을 보여줘도 괜찮아.'); choices([['도움받는 방법 보기', () => $('help-dialog').showModal()], ['잠깐 숨 고르기', startBreathing]]); return; }
  if (state.stage === 'goal' && text) { chooseGoal(redactPII(text)); return; }
  if (state.stage === 'when' && state.goal && text) { saveGoal(redactPII(text)); return; }
  addMessage('assistant', state.profile === 'lower' ? '이야기해 줘서 고마워. 지금은 준비된 활동을 함께할 수 있어. 작은 일을 골라 볼까?' : '이야기해 줘서 고마워. 지금은 준비된 활동으로 이어갈게. 이 상황에서 해볼 작은 행동을 고르거나, 다른 이야기를 선택해도 괜찮아.');
  choices([['작은 행동 고르기', offerGoals], ['잠깐 숨 고르기', startBreathing], ['다른 주제 고르기', startTalk]]);
}
async function requestAI() {
  const generation = state.generation; const payload = { profile: state.profile, topic: state.topic, mood: state.mood, messages: state.history.slice(-16) };
  const controller = new AbortController(); state.abort = controller; setBusy(true);
  const pending = document.createElement('div'); pending.className = 'busy'; pending.id = 'pending'; pending.setAttribute('role', 'status'); pending.textContent = '네 이야기를 살펴보고 있어…'; $('messages').append(pending); scroll();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const res = await fetch(`${apiBase}/api/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.code}` }, body: JSON.stringify(payload), signal: controller.signal });
    const data = await res.json(); if (generation !== state.generation) return;
    if (!res.ok) throw new Error(data.error || '연결이 잠시 끊겼어. 다시 시도해 줄래?');
    addMessage('assistant', data.message, { alert: Boolean(data.safety) });
    state.stage = data.safety ? 'help' : 'explore';
    if (data.safety) choices([['도움받는 방법 보기', () => $('help-dialog').showModal()]]);
    else choices([['작은 행동 고르기', offerGoals], ['더 이야기할래', () => { clearChoices(); $('message').focus(); }], ['잠깐 쉬기', finishRest]]);
    notice(data.filtered ? '안전하게 이야기할 수 있도록 안내를 바꿨어.' : 'AI 대화 · 답변이 맞지 않으면 다른 방법을 골라도 괜찮아.');
  } catch (error) {
    if (generation !== state.generation) return;
    notice(error.name === 'AbortError' ? '답변이 늦어지고 있어. 다시 보내거나 기본 활동을 골라줘.' : error.message, true);
    choices([['다시 보내기', () => requestAI()], ['기본 활동으로 계속', () => { state.connected = false; state.code = ''; updateConnection(); offlineReply(); }]]);
  } finally { clearTimeout(timeout); if (generation === state.generation) { pending.remove(); state.abort = null; setBusy(false); $('message').focus(); } }
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
function updateConnection() { $('mode-badge').textContent = state.connected ? 'AI 대화 연결됨' : '기본 활동'; $('mode-badge').classList.toggle('connected', state.connected); $('connect-open').textContent = state.connected ? 'AI 연결 관리' : 'AI 연결'; }
async function checkServer() {
  if (!apiBase && !['localhost', '127.0.0.1'].includes(location.hostname)) { $('connection-info').textContent = '아직 AI 대화 서버가 연결되지 않았어. 마음 점검·숨 고르기·실천 카드는 지금 사용할 수 있어.'; serverReady = false; return; }
  try { const res = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(5000) }); if (!res.ok) throw new Error(); const data = await res.json(); serverReady = data.ready === true; $('connection-info').textContent = serverReady ? 'AI 대화를 사용할 수 있어. 운영자에게 받은 이용 코드를 입력해 줘.' : '운영자가 AI 연결을 준비하고 있어. 지금은 기본 활동을 사용할 수 있어.'; } catch { serverReady = false; $('connection-info').textContent = '지금은 AI 서버에 연결할 수 없어. 기본 활동은 계속 사용할 수 있어.'; }
}
function reset() { cancelPending(); clearBreathing(); state.history = []; state.answers = []; state.question = 0; state.goal = null; state.mood = ''; state.stage = 'welcome'; state.code = ''; state.connected = false; $('access-code').value = ''; $('transfer-consent').checked = false; $('messages').replaceChildren(); $('intro').hidden = false; $('goal-card').hidden = true; $('message').value = ''; $('connect-status').textContent = ''; clearChoices(); updateConnection(); active('talk'); notice('새 마음길을 시작했어. 편한 방법으로 이야기해 줘.'); }

document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => { $('question-card')?.remove(); ({ talk: startTalk, check: startCheck, breathe: startBreathing })[b.dataset.start](); }));
document.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => startTopic(b.dataset.topic)));
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => chooseMood(b.dataset.mood)));
$('chat-form').addEventListener('submit', e => { e.preventDefault(); sendText($('message').value); });
$('message').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText($('message').value); } });
$('message').addEventListener('input', () => { $('message').style.height = 'auto'; $('message').style.height = `${Math.min($('message').scrollHeight, 140)}px`; $('message').style.overflowY = $('message').scrollHeight > 140 ? 'auto' : 'hidden'; });
$('profile').addEventListener('change', () => { cancelPending(); state.profile = $('profile').value; document.body.classList.toggle('low-literacy', state.profile === 'lower'); if (state.history.length) { state.history = []; addMessage('assistant', `${profiles[state.profile].label}에 맞춰 이야기할게. 이어서 하고 싶은 활동을 골라줘.`, { remember: false }); } });
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
$('read-aloud').addEventListener('click', () => { if (!('speechSynthesis' in window)) { notice('이 브라우저에서는 읽어주기가 지원되지 않아.', true); return; } if (speechSynthesis.speaking) { speechSynthesis.cancel(); $('read-aloud').setAttribute('aria-pressed', 'false'); return; } const bubbles = document.querySelectorAll('.message-row.assistant .bubble'); const text = bubbles.length ? bubbles[bubbles.length - 1].textContent : '반가워. 지금 네 마음은 어때? 가까운 마음을 골라도 좋고, 오늘 있었던 일을 이야기해도 좋아.'; const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR'; utterance.rate = .9; utterance.onend = () => $('read-aloud').setAttribute('aria-pressed', 'false'); utterance.onerror = utterance.onend; speechSynthesis.speak(utterance); $('read-aloud').setAttribute('aria-pressed', 'true'); });
$('mic').addEventListener('click', () => { const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition; if (!Recognition) { notice('말로 입력하기를 지원하지 않는 브라우저야. 버튼을 고르거나 글로 적어줘.', true); return; } if (state.recognition) { state.recognition.stop(); return; } if (!window.confirm('말로 입력하면 브라우저의 음성 서비스로 음성이 전송될 수 있어. 계속할까?')) return; const recognition = new Recognition(); state.recognition = recognition; recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.onresult = e => { $('message').value = e.results[0][0].transcript.slice(0, 1200); notice('알아들은 말을 확인하고 보내기를 눌러줘.'); }; recognition.onerror = () => notice('음성을 받지 못했어. 마이크 권한을 확인하거나 글로 적어줘.', true); recognition.onend = () => { state.recognition = null; $('mic').classList.remove('recording'); }; try { recognition.start(); $('mic').classList.add('recording'); notice('듣고 있어. 실명이나 학교 이름은 말하지 않아도 돼.'); } catch { state.recognition = null; notice('마이크를 시작하지 못했어.', true); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearBreathing(); window.speechSynthesis?.cancel(); } });
window.addEventListener('pagehide', () => { cancelPending(); clearBreathing(); window.speechSynthesis?.cancel(); state.code = ''; state.history = []; });
checkServer();
