import { config } from './maeumgil-config.js';
import { createBreathingCard } from './maeumgil-breathing.js?v=20261019-clear';
import { apiHeaders, hostedConnectionUrl, readAPIResponse } from './maeumgil-connection.js?v=20261020-review2';
import { createSpeechReader } from './maeumgil-speech.js?v=20261027-welcome';
import { createSpeechInput } from './maeumgil-input.js?v=20261027-welcome';
import { createOnboarding, AI_DATA_NOTICE } from './maeumgil-onboarding.js?v=20261027-popup2';
import { profiles, questions, scale, summarizeCheck, assessSafety, helpMessage, redactPII, topics } from './maeumgil-core.js?v=20261020-review';
import { createCheckSession } from './maeumgil-check.js';
import { readingSupport, scaleHelp } from './maeumgil-reading.js';

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
const state = { profile: 'upper', topic: 'challenge', stage: 'welcome', check: createCheckSession(), lastPlan: null, mood: '', goal: null, history: [], token: '', connected: false, busy: false, generation: 0, abort: null, breathing: null, recognition: null };
const speechInput = createSpeechInput({
  onText: text => { $('message').value = text; $('message').dispatchEvent(new Event('input')); $('message').focus(); },
  onState: ({ state: inputState, detail }) => {
    const recording = inputState === 'recording';
    $('mic').classList.toggle('recording', recording);
    $('mic').setAttribute('aria-pressed', String(recording));
    $('mic').setAttribute('aria-label', recording ? '말하기 끝내기' : '말로 입력하기');
    $('mic').disabled = state.busy || ['preparing', 'permission', 'transcribing'].includes(inputState);
    if (detail) notice(detail, inputState === 'error');
  },
});
let agreementStorage;
try { agreementStorage = window.sessionStorage; } catch {}
let afterWelcome;
const onboarding = createOnboarding({
  storage: agreementStorage, prepareReader: options => reader.prepare(options), prepareInput: options => speechInput.prepare(options),
  cancelReader: () => reader.stop(), cancelInput: () => speechInput.cancel(),
  onPreparationError: error => console.warn('Voice preparation:', error.message),
  onState: ({ phase, detail, percent }) => {
    const preparing = phase === 'preparing';
    $('welcome-dialog').setAttribute('aria-busy', String(preparing));
    $('welcome-download').hidden = false; $('welcome-status').textContent = detail;
    $('welcome-confirm').hidden = true; $('welcome-retry').hidden = phase !== 'error';
    $('welcome-progress').hidden = phase === 'error';
    if (Number.isFinite(percent)) { $('welcome-progress').value = percent; $('welcome-percent').textContent = `${percent}%`; }
    else $('welcome-percent').textContent = '';
    $('welcome-skip').textContent = preparing ? '준비를 멈추고 글과 버튼으로 시작하기' : '음성 없이 시작하기';
  },
});
$('welcome-ai-notice').textContent = AI_DATA_NOTICE;
$('privacy-ai-notice').textContent = AI_DATA_NOTICE;
function showWelcome(next) {
  afterWelcome = next;
  if (!onboarding.agreed) { $('welcome-download').hidden = true; $('welcome-confirm').hidden = false; $('welcome-retry').hidden = true; $('welcome-skip').textContent = '동의하지 않고 기본 활동 하기'; }
  if (!$('welcome-dialog').open) $('welcome-dialog').showModal();
}
async function prepareWelcome(accept = false) {
  const ready = await (accept ? onboarding.accept() : onboarding.prepare());
  if (!ready || !$('welcome-dialog').open) return;
  $('welcome-dialog').close();
  notice('하고 싶은 활동을 골라 줘.');
  const next = afterWelcome; afterWelcome = undefined;
  if (next) next(); else $('entry-start').focus({ preventScroll: true });
}
function withAgreement(action) { if (!onboarding.agreed) showWelcome(action); else action(); }
const apiBase = config.apiBase.replace(/\/$/, '');
let serverReady = false;
let healthCheck = null;
let connecting = false;
let connectionGeneration = 0;

function notice(text, error = false) { $('notice').textContent = text; $('notice').classList.toggle('error', error); }
function scroll() { requestAnimationFrame(() => { const el = $('chat-scroll'); el.scrollTop = el.scrollHeight; }); }
function active(name) { document.querySelectorAll('[data-start]').forEach(b => b.classList.toggle('active', b.dataset.start === name)); }
function clearBreathing() { $('question-card')?.remove(); $('check-result')?.remove(); $('session-summary')?.remove(); state.breathing?.destroy(); state.breathing = null; document.querySelector('.conversation').classList.remove('is-breathing'); reader.stop(); speechInput.cancel(); }
function clearChoices() { $('choices').replaceChildren(); }
function button(label, callback) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', callback); return b; }
function choices(items) { clearChoices(); for (const [label, cb] of items) $('choices').append(button(label, () => { if (!state.busy) cb(); })); const first = $('choices').querySelector('button'); requestAnimationFrame(() => first?.focus({ preventScroll: true })); }
function addMessage(role, text, { alert = false, remember = true } = {}) {
  $('intro').hidden = true; document.body.classList.remove('at-start');
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
function setBusy(busy) { state.busy = busy; $('send').disabled = busy; $('mic').disabled = busy || ['preparing', 'permission', 'transcribing'].includes(speechInput.activity); $('message').disabled = busy; document.querySelectorAll('#choices button').forEach(b => b.disabled = busy); }
function clearTyping() { $('pending')?.remove(); document.querySelector('.conversation').classList.remove('is-waiting'); }
function positionTyping() {
  const pending = $('pending'); if (!pending) return;
  const bounds = $('chat-scroll').getBoundingClientRect();
  const headerBottom = document.querySelector('.topbar').getBoundingClientRect().bottom;
  const top = Math.max(bounds.top, headerBottom, 12), bottom = Math.min(bounds.bottom, window.innerHeight - 12);
  const left = Math.max(bounds.left, 12), right = Math.min(bounds.right, window.innerWidth - 12);
  pending.style.left = `${right > left ? (left + right) / 2 : window.innerWidth / 2}px`;
  pending.style.top = `${bottom > top ? (top + bottom) / 2 : window.innerHeight / 2}px`;
}
function showTyping() {
  clearTyping();
  const pending = document.createElement('div'); pending.id = 'pending'; pending.className = 'reply-pending'; pending.setAttribute('role', 'status');
  const label = document.createElement('span'); label.className = 'sr-only'; label.textContent = 'AI가 답변을 준비하고 있어.';
  const dots = document.createElement('span'); dots.className = 'typing-dots'; dots.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 3; index++) { const dot = document.createElement('span'); dot.className = 'typing-dot'; dots.append(dot); }
  pending.append(label, dots); document.querySelector('.conversation').append(pending);
  document.querySelector('.conversation').classList.add('is-waiting'); positionTyping(); requestAnimationFrame(positionTyping);
}
window.addEventListener('resize', positionTyping);
window.addEventListener('scroll', positionTyping, { capture: true, passive: true });
function cancelPending() { state.generation++; state.abort?.abort(); state.abort = null; clearTyping(); setBusy(false); }
function clearGoal() { state.goal = null; $('goal-card').hidden = true; }
function startTopic(key) {
  clearGoal(); state.lastPlan = null;
  cancelPending(); clearBreathing(); state.topic = key; state.stage = 'explore'; active('talk');
  addMessage('assistant', topics[key].intro);
  choices(topics[key].choices.map(label => [label, () => chooseTopicAnswer(label)]));
  notice(state.connected ? 'AI 연결 중 · 이름이나 연락처는 적지 않아도 돼.' : '아래 버튼에서 하나만 골라 줘.');
}
function startTalk() {
  clearGoal(); state.lastPlan = null;
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
  clearGoal();
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
  clearGoal();
  state.mood = mood; addMessage('user', mood);
  addMessage('assistant', ({ '괜찮아': '오늘 기억에 남는 일이 있어?', '속상해': '어떤 일 때문에 속상했어?', '걱정돼': '뭐가 걱정되는지 이야기해 줄래?', '화가 나': '무슨 일이 있었어?', '잘 모르겠어': '그럼 오늘 있었던 일부터 이야기해 볼까?' })[mood]);
  state.stage = 'topic'; choices(Object.entries(topics).map(([key, t]) => [t.label, () => startTopic(key)]));
}
function startCheck() {
  clearGoal(); cancelPending(); clearBreathing(); clearChoices(); active('check');
  state.stage = 'check'; $('intro').hidden = true; document.body.classList.remove('at-start');
  if (state.check.enter() === 'result') renderCheckResult(); else renderQuestion();
}
function renderQuestion() {
  $('question-card')?.remove(); $('check-result')?.remove(); $('intro').hidden = true;
  const index = state.check.index, support = readingSupport(state.profile, index);
  const card = document.createElement('section'); card.id = 'question-card'; card.className = 'question-card';
  const label = document.createElement('span'); label.className = 'eyebrow'; label.textContent = `마음 점검 ${index + 1} / 6`;
  const purpose = document.createElement('p'); purpose.className = 'question-hint'; purpose.textContent = '시작하는 힘과 방법 찾기 돌아보기';
  const intro = document.createElement('p'); intro.className = 'question-hint'; intro.textContent = support.intro;
  const fieldset = document.createElement('fieldset'); fieldset.className = 'check-options'; fieldset.setAttribute('role', 'radiogroup'); fieldset.setAttribute('aria-labelledby', 'check-prompt'); fieldset.setAttribute('aria-describedby', 'check-word-help');
  const legend = document.createElement('legend'); legend.id = 'check-prompt'; legend.textContent = questions[index]; legend.tabIndex = -1;
  const hint = document.createElement('p'); hint.id = 'check-word-help'; hint.className = 'question-word-help'; hint.textContent = support.hint;
  const readQuestion = button('문장 읽어주기', () => reader.read(`${questions[index]} ${support.hint}`)); readQuestion.className = 'read-question';
  const grid = document.createElement('div'); grid.className = 'scale-grid';
  const selected = document.createElement('p'); selected.className = 'question-hint'; selected.setAttribute('role', 'status');
  const next = button(index === 5 ? (state.check.phase === 'reviewing' ? '바뀐 답으로 돌아보기' : '돌아보기') : '다음', () => {
    if (state.stage !== 'check') return;
    const nextPage = state.check.next(index);
    if (nextPage === 'result') renderCheckResult(); else if (nextPage) renderQuestion();
  }); next.className = 'primary-button'; next.disabled = !state.check.answers[index];
  scale.forEach((text, i) => {
    const option = document.createElement('label'); option.className = 'scale-option';
    const radio = document.createElement('input'); radio.type = 'radio'; radio.name = 'check-answer'; radio.value = String(i + 1); radio.checked = state.check.answers[index] === i + 1;
    const name = document.createElement('span'); name.textContent = `${i + 1} · ${text}`;
    if (state.profile === 'lower') { const help = document.createElement('small'); help.textContent = scaleHelp[i]; name.append(help); }
    radio.addEventListener('change', () => { if (state.check.index === index && state.check.select(i + 1)) { next.disabled = false; selected.textContent = `‘${text}’를 골랐어. ${index === 5 ? '돌아보기를' : '다음을'} 눌러 줘.`; } });
    option.append(radio, name); grid.append(option);
  });
  fieldset.append(legend, hint, grid);
  const note = document.createElement('p'); note.className = 'question-hint'; note.textContent = support.note;
  const controls = document.createElement('div'); controls.className = 'question-controls';
  const back = button('이전 문항', () => { state.check.previous(); renderQuestion(); }); back.disabled = index === 0;
  controls.append(back, next, button('이야기 먼저 하기', startTalk));
  card.append(label, purpose, intro, readQuestion, fieldset, selected, note);
  if (state.profile === 'lower') {
    const practice = document.createElement('details'); practice.className = 'check-practice';
    const summary = document.createElement('summary'); summary.textContent = '응답 고르기 연습';
    const prompt = document.createElement('p'); prompt.textContent = '연습 문장: “어려울 때 도움을 청해본 적이 있다.” 비슷한 때가 얼마나 자주 있는지 골라 봐. 이 답은 점검에 넣지 않아.';
    const result = document.createElement('p'); result.setAttribute('role', 'status');
    const options = document.createElement('div'); options.className = 'practice-options';
    scale.forEach((label, i) => options.append(button(`${i + 1} · ${label}`, () => { result.textContent = `‘${label}’는 ${scaleHelp[i]} 실제 문장도 이런 뜻으로 골라 주면 돼.`; })));
    practice.append(summary, prompt, options, result); card.append(practice);
  }
  card.append(controls); $('messages').append(card); notice(''); legend.focus({ preventScroll: true }); scroll();
}
function answerCheck(score) { if (state.stage === 'check' && state.check.select(score)) renderQuestion(); }
function renderCheckResult() {
  const answers = state.check.resultAnswers; if (!answers) return;
  $('question-card')?.remove(); $('check-result')?.remove(); state.stage = 'checked'; clearChoices();
  const result = summarizeCheck(answers), card = document.createElement('section'); card.id = 'check-result'; card.className = 'question-card check-result'; card.setAttribute('aria-label', '마음 점검 돌아보기');
  const title = document.createElement('h3'); title.textContent = '마음 점검을 마쳤어'; title.tabIndex = -1;
  const purpose = document.createElement('p'); purpose.textContent = '시작하는 힘과 방법 찾기를 돌아봤어. 여기서 필요한 도움을 골라볼 수 있어.';
  const reflection = document.createElement('p');
  reflection.textContent = answers[result.strongest] >= 4 ? `‘${questions[result.strongest]}’에 ‘${scale[answers[result.strongest] - 1]}’를 골랐어. 이 경험을 다음 활동에서 떠올려 봐도 좋아.` : '지금은 도움이나 다른 방법이 필요한 때일 수 있어. 어떤 도움부터 살펴볼지 직접 골라 줘.';
  const controls = document.createElement('div'); controls.className = 'question-controls';
  controls.append(button('응답 살펴보기', () => { state.check.review(); state.stage = 'check'; renderQuestion(); }), button('새로 점검하기', () => { state.check.restart(); state.stage = 'check'; renderQuestion(); }));
  const basis = document.createElement('a'); basis.href = new URL('../pages/teacher-guide.html#check-basis', import.meta.url).href; basis.textContent = '점검의 목적과 문항 안내'; controls.append(basis);
  card.append(title, purpose, reflection, controls); $('messages').append(card);
  const help = [['시작하는 힘 찾기', () => startStrategy('agency')], ['다른 방법 찾기', () => startStrategy('pathways')]];
  if (result.pathways < result.agency) help.reverse();
  choices([...help, ['어려웠던 일부터 이야기하기', startTalk]]); notice('교육용 돌아보기야. 점수로 너를 판단하거나 상태를 진단하지 않아.'); title.focus({ preventScroll: true }); scroll();
}
function offerGoals(context = '') {
  clearGoal();
  cancelPending(); clearBreathing(); $('question-card')?.remove(); active('talk');
  state.stage = 'goal'; addMessage('assistant', (typeof context === 'string' && context ? context + ' ' : '') + '오늘 해볼 수 있는 일 하나를 골라볼까?');
  choices(topics[state.topic].goals.map(goal => [goal, () => chooseGoal(goal)]).concat([['지금은 쉬고 싶어', () => finishRest()]]));
}

function chooseGoal(text) {
  clearGoal(); state.lastPlan = null;
  addMessage('user', text); state.goal = { text, when: '', helper: '', done: false }; state.stage = 'when';
  addMessage('assistant', '언제 해볼까?'); choices(['지금 잠깐', '오늘 쉬는 시간', '오늘 집에서'].map(when => [when, () => saveGoal(when)]));
}
function saveGoal(when) {
  if (!state.goal || state.stage !== 'when') return;
  state.goal.when = when; state.stage = 'helper';
  addMessage('assistant', '하다가 막히면 누구에게 도움받을까? 이름은 쓰지 않아도 돼.');
  choices(['선생님', '보호자', '상담 선생님', '믿을 수 있는 어른', '나중에 정할래'].map(helper => [helper, () => finalizeGoal(helper)]));
}
function finalizeGoal(helper) {
  if (!state.goal || state.stage !== 'helper') return;
  state.goal.helper = helper; state.lastPlan = { ...state.goal }; state.stage = 'followup'; renderGoal();
  addMessage('assistant', '오늘 할 일을 정했어. 해본 뒤 돌아보거나, 여기서 마쳐도 돼.');
  choices([['실천했어', reflectGoal], ['계획 바꾸기', offerGoals], ['여기서 마치기', endSession]]);
}
function renderGoal() {
  $('goal-card').hidden = !state.goal || state.goal.done;
  if (!state.goal || state.goal.done) return;
  $('goal-text').textContent = state.goal.text; $('goal-when').textContent = `언제: ${state.goal.when}`; $('goal-helper').textContent = `막히면: ${state.goal.helper}`;
}
function reflectGoal() {
  if (!state.goal || state.goal.done) return;
  state.goal.done = true; state.lastPlan = { ...state.goal }; renderGoal(); addMessage('assistant', '해보고 나니 어땠어?');
  const reflect = (label, reply) => { state.goal.reflection = label; state.lastPlan = { ...state.goal }; addMessage('user', label); addMessage('assistant', reply); choices([['같은 방법 다시 해볼래', () => chooseGoal(state.goal.text)], ['다른 방법 찾아볼래', () => startStrategy('pathways')], ['여기서 마치기', endSession]]); };
  choices([['조금은 해볼 수 있었어', () => reflect('조금은 해볼 수 있었어', '작게 정한 일을 해본 경험이 생겼어. 다음에도 이 방법을 써볼까?')], ['도움을 받아 해봤어', () => reflect('도움을 받아 해봤어', '도움을 받아 해본 방법도 다음에 쓸 수 있어. 이어서 어떻게 해볼까?')], ['아직 어려워', () => { state.goal.reflection = '아직 어려워'; state.lastPlan = { ...state.goal }; addMessage('user', '아직 어려워'); addMessage('assistant', '해보니 어느 쪽에서 막혔어?'); choices([['시작이 어려웠어', () => startStrategy('agency')], ['방법이 안 맞았어', () => startStrategy('pathways')], ['먼저 쉬고 싶어', startBreathing]]); }]]);
}
function finishRest() { clearGoal(); state.stage = 'rest'; addMessage('assistant', '잠깐 쉬자. 물 한 모금 마시고 편하게 앉아 있어도 좋아.'); choices([['숨 고르기', startBreathing], ['여기서 마치기', endSession]]); }
function endSession() {
  const plan = state.lastPlan ? { ...state.lastPlan } : null;
  clearGoal(); cancelPending(); clearBreathing(); state.stage = 'end'; clearChoices(); addMessage('assistant', '오늘 활동은 여기까지야. 나눌 이야기는 네가 골라도 돼.');
  if (plan) {
    const card = document.createElement('section'); card.id = 'session-summary'; card.className = 'question-card';
    const title = document.createElement('h3'); title.textContent = '오늘 정한 계획';
    const list = document.createElement('dl');
    for (const [label, text] of [['오늘 할 일', plan.text], ['언제', plan.when], ['막히면', plan.helper], ['해본 뒤', plan.reflection || (plan.done ? '실천했어. 돌아보기는 나중에 해도 돼.' : '나중에 해보고 돌아볼래')]]) { const dt = document.createElement('dt'); dt.textContent = label; const dd = document.createElement('dd'); dd.textContent = text; list.append(dt, dd); }
    const note = document.createElement('p'); note.textContent = '공유는 선택이야. 원하면 이 계획만 보여줘도 돼. 대화와 점검 답은 자동으로 공유되지 않아.';
    card.append(title, list, note); $('messages').append(card); scroll();
  }
  choices([['다른 이야기하기', startTalk], ['대화 지우기', () => $('reset-dialog').showModal()]]);
}
function startBreathing() {
  clearGoal();
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
  if (!state.connected || !state.token) {
    state.connected = false; state.token = ''; updateConnection();
    notice('지금은 기본 활동 중이야. AI와 이야기하려면 선생님이 알려 준 숫자 코드로 연결해 줘.');
    return;
  }
  const generation = state.generation; const payload = { profile: state.profile, topic: state.topic, mood: state.mood, messages: state.history.slice(-16) };
  const controller = new AbortController(); state.abort = controller; setBusy(true);
  notice(''); showTyping(); scroll();
  const timeout = setTimeout(() => controller.abort(), 35000);
  try {
    const headers = await apiHeaders(); if (generation !== state.generation) return;
    headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(`${apiBase}/api/chat`, { method: 'POST', headers, body: JSON.stringify(payload), signal: controller.signal });
    const data = await readAPIResponse(res); if (generation !== state.generation) return;
    if (res.status === 401) { state.connected = false; state.token = ''; updateConnection(); }
    if (!res.ok) throw new Error(data.error || '연결이 잠시 끊겼어. 다시 시도해 줄래?');
    clearTyping();
    addMessage('assistant', data.message, { alert: Boolean(data.safety) }).classList.add('reply-arrival');
    state.stage = data.safety ? 'help' : 'explore';
    if (data.safety) choices([['도움받는 방법 보기', () => $('help-dialog').showModal()]]);
    else choices([['작은 행동 고르기', offerGoals], ['다른 이야기 고르기', startTalk], ['잠깐 쉬기', finishRest]]);
    notice(data.filtered ? '안전하게 이야기할 수 있도록 안내를 바꿨어.' : 'AI의 답변은 틀릴 수 있어. 네 생각과 다르면 말해 줘.');
  } catch (error) {
    if (generation !== state.generation) return;
    notice(error.name === 'AbortError' ? '답변이 늦어지고 있어. 다시 보내거나 기본 활동을 골라줘.' : error.message, true);
    choices([[state.connected ? '다시 보내기' : '다시 연결하기', () => state.connected ? requestAI() : openConnection()], ['기본 활동으로 계속', () => { state.connected = false; state.token = ''; updateConnection(); offlineReply(); }]]);
  } finally { clearTimeout(timeout); if (generation === state.generation) { clearTyping(); state.abort = null; setBusy(false); if ($('writing-panel').open) $('message').focus(); } }
}
async function sendText(raw) {
  const text = raw.trim(); if (state.busy) return; if (!text) { notice('보내고 싶은 말을 적거나 아래 활동 버튼을 골라 줘.'); $('message').focus(); return; }
  reader.stop(); speechInput.cancel();
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
  updateConnectSubmit();
}
function updateConnectSubmit() {
  $('connect-submit').disabled = connecting || !/^[0-9]{4}$/.test($('access-code').value.trim());
}
function openConnection() {
  if (!onboarding.agreed) { showWelcome(openConnection); return; }
  const hostedUrl = hostedConnectionUrl(location);
  if (hostedUrl) { location.assign(hostedUrl); return; }
  $('connect-status').textContent = '';
  updateConnection();
  $('connect-dialog').showModal();
  if (state.connected) { $('connection-info').textContent = 'AI와 연결되어 있어. 이야기를 계속하거나 연결을 끝낼 수 있어.'; return; }
  checkServer();
}
async function checkServer() {
  if (!config.firebase && !apiBase && !['localhost', '127.0.0.1'].includes(location.hostname)) { $('connection-info').textContent = '아직 연결을 준비하고 있어. 아래 ‘코드 없이 기본 활동 하기’를 눌러도 돼.'; serverReady = false; return; }
  if (healthCheck) return healthCheck;
  $('connection-retry').hidden = true; $('connection-info').textContent = '연결을 확인하고 있어. 기다리는 동안 기본 활동을 해도 돼.';
  healthCheck = (async () => {
    try {
      const res = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error();
      const data = await res.json(); serverReady = data.ready === true;
      $('connection-info').textContent = serverReady ? '선생님이 알려 준 숫자 코드로 AI와 연결할 수 있어.\n코드 없이 이용하면 기본 활동만 할 수 있어.' : '아직 연결을 준비하고 있어. 기본 활동은 지금 할 수 있어.';
    } catch { serverReady = false; $('connection-info').textContent = '연결이 늦어지고 있어. 잠시 뒤 다시 시작하거나 기본 활동을 해도 돼.'; }
    finally { healthCheck = null; $('connection-retry').hidden = serverReady; }
  })();
  return healthCheck;
}
function reset() { cancelPending(); clearBreathing(); state.history = []; state.check = createCheckSession(); state.lastPlan = null; state.goal = null; state.mood = ''; state.topic = 'challenge'; state.stage = 'welcome'; $('writing-panel').open = false; $('mood-picker').open = false; $('topic-picker').open = false; $('chat-scroll').scrollTop = 0; state.token = ''; state.connected = false; $('access-code').value = ''; $('messages').replaceChildren(); $('intro').hidden = false; document.body.classList.add('at-start'); $('goal-card').hidden = true; $('message').value = ''; $('connect-status').textContent = ''; clearChoices(); updateConnection(); active('talk'); notice('다시 시작할 수 있어. 아래에서 하고 싶은 걸 골라 줘.'); }

document.querySelectorAll('[data-start]').forEach(b => b.addEventListener('click', () => { $('question-card')?.remove(); ({ talk: startTalk, check: startCheck, breathe: startBreathing })[b.dataset.start](); }));
document.querySelectorAll('[data-entry]').forEach(b => b.addEventListener('click', () => startEntry(b.dataset.entry)));
document.querySelectorAll('[data-topic]').forEach(b => b.addEventListener('click', () => startTopic(b.dataset.topic)));
document.querySelectorAll('[data-mood]').forEach(b => b.addEventListener('click', () => chooseMood(b.dataset.mood)));
$('chat-form').addEventListener('submit', e => { e.preventDefault(); sendText($('message').value); });
$('message').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendText($('message').value); } });
$('message').addEventListener('input', () => { $('message').style.height = 'auto'; $('message').style.height = `${Math.min($('message').scrollHeight, 140)}px`; $('message').style.overflowY = $('message').scrollHeight > 140 ? 'auto' : 'hidden'; });
$('profile').addEventListener('change', () => { cancelPending(); reader.stop(); state.profile = $('profile').value; document.body.classList.toggle('low-literacy', state.profile === 'lower'); if (state.stage === 'check') renderQuestion(); else if (state.stage === 'checked') renderCheckResult(); else if (state.history.length) { state.history = []; addMessage('assistant', `${profiles[state.profile].label}으로 바꿨어. 하고 싶은 활동을 골라 줘.`, { remember: false }); } });
$('privacy-open').addEventListener('click', () => { reader.stop(); $('privacy-dialog').showModal(); });
$('privacy-dialog').addEventListener('close', () => reader.stop());
$('voice-preview').addEventListener('click', () => withAgreement(() => reader.read('오늘 무슨 일이 있었어? 말하기 어려우면 아래에서 하나 골라도 돼. 천천히 같이 해보자.')));
$('access-code').addEventListener('input', updateConnectSubmit);
$('connect-open').addEventListener('click', openConnection);
$('reset').addEventListener('click', () => $('reset-dialog').showModal());
$('confirm-reset').addEventListener('click', () => { reset(); $('reset-dialog').close(); });
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
$('connect-form').addEventListener('submit', async e => {
  e.preventDefault(); if (connecting || state.connected) return;
  const code = $('access-code').value.trim();
  if (!/^[0-9]{4}$/.test(code)) { $('connect-status').textContent = '선생님께 받은 숫자 4자리를 넣어 줘.'; return; }
  const attempt = ++connectionGeneration;
  connecting = true; $('connect-submit').disabled = true; $('connect-submit').textContent = '연결하고 있어…'; $('connect-status').textContent = '';
  try {
    await checkServer(); if (attempt !== connectionGeneration) return;
    if (!serverReady) { $('connection-retry').hidden = false; $('connect-status').textContent = '아직 연결되지 않았어. 다시 확인하거나 기본 활동을 해도 돼.'; return; }
    const headers = await apiHeaders(); if (attempt !== connectionGeneration) return;
    const res = await fetch(`${apiBase}/api/session`, { method: 'POST', headers, body: JSON.stringify({ code }), signal: AbortSignal.timeout(15000) });
    const data = await readAPIResponse(res); if (attempt !== connectionGeneration) return;
    if (!res.ok) throw new Error(data.error || '잠시 뒤 다시 연결해 줘.');
    if (typeof data.token !== 'string' || data.token.length < 32) throw new Error('연결을 다시 준비해야 해. 선생님께 알려 줘.');
    cancelPending(); state.token = data.token; state.connected = true; state.history = []; updateConnection(); $('access-code').value = ''; $('connect-dialog').close(); notice('AI와 연결됐어. 이야기할 준비가 됐어.');
  } catch (error) { if (attempt === connectionGeneration) $('connect-status').textContent = error.name === 'TimeoutError' ? '연결이 늦어지고 있어. 잠시 뒤 다시 해 보자.' : error.message; }
  finally { if (attempt === connectionGeneration) { connecting = false; updateConnectSubmit(); $('connect-submit').textContent = 'AI 대화 시작하기'; } }
});
$('connect-dialog').addEventListener('close', () => { connectionGeneration++; connecting = false; $('connect-submit').textContent = 'AI 대화 시작하기'; $('access-code').value = ''; updateConnectSubmit(); });
function useBasicActivities() { cancelPending(); state.token = ''; state.connected = false; state.history = []; $('access-code').value = ''; updateConnection(); $('connect-dialog').close(); notice('지금은 기본 활동 중이야. 아래 버튼에서 하고 싶은 걸 골라 줘.'); }
$('disconnect').addEventListener('click', useBasicActivities);
$('connect-skip').addEventListener('click', useBasicActivities);
$('connection-retry').addEventListener('click', () => checkServer());
$('read-aloud').addEventListener('click', () => withAgreement(() => { const bubbles = document.querySelectorAll('.message-row.assistant .bubble'); reader.read($('question-card')?.innerText || $('check-result')?.innerText || (bubbles.length ? bubbles[bubbles.length - 1].textContent : '내 마음 살펴볼까? 마음 점검부터 해도, 어려웠던 일부터 골라도 돼. 먼저 마음을 가라앉혀도 좋아.')); }));
$('mic').addEventListener('click', () => withAgreement(() => { reader.stop(); speechInput.start(); }));
$('welcome-confirm').addEventListener('click', () => prepareWelcome(true));
$('welcome-retry').addEventListener('click', () => { reader.stop(); speechInput.cancel(); prepareWelcome(); });
function skipWelcome() { onboarding.skip(); afterWelcome = undefined; $('welcome-dialog').close(); notice('글과 버튼으로 활동을 시작할 수 있어.'); }
$('welcome-skip').addEventListener('click', skipWelcome);
$('welcome-dialog').addEventListener('cancel', event => { event.preventDefault(); skipWelcome(); });

document.addEventListener('visibilitychange', () => { if (document.hidden) { state.breathing?.stop(); if (!$('welcome-dialog').open) { reader.stop(); speechInput.cancel(); } } });
window.addEventListener('pagehide', reset);
window.addEventListener('pageshow', event => { if (event.persisted) reset(); });
updateConnection();
const entryUrl = new URL(location.href);
let connectOnStart = false;
if (entryUrl.searchParams.get('connect') === '1') {
  entryUrl.searchParams.delete('connect');
  history.replaceState(null, '', `${entryUrl.pathname}${entryUrl.search}${entryUrl.hash}`);
  connectOnStart = true;
}
showWelcome(connectOnStart ? openConnection : undefined);
if (onboarding.agreed) prepareWelcome();
