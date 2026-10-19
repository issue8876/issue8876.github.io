const DURATION = 30000;
const CYCLE = 6000;

export function breathingFrame(elapsed) {
  const time = Math.max(0, Math.min(DURATION, elapsed));
  return {
    done: time >= DURATION,
    phase: time % CYCLE < 3000 ? 'in' : 'out',
    remaining: Math.ceil((DURATION - time) / 1000),
    round: Math.min(5, Math.floor(time / CYCLE) + 1),
    progress: time / DURATION,
  };
}

export function createBreathingCard({ onFinish = () => {}, onLeave = () => {} } = {}) {
  const card = document.createElement('section');
  card.className = 'breathing-card';
  card.setAttribute('aria-label', '그림과 함께 숨 고르기');
  card.innerHTML = `
    <div class="breathing-heading"><h3 class="breathing-phase" aria-live="polite" aria-atomic="true">편하게 숨 쉬어 봐</h3><span class="breathing-time" aria-hidden="true">30초</span></div>
    <div class="breathing-scene" aria-hidden="true">
      <svg viewBox="0 0 260 180" focusable="false">
        <circle class="breath-halo" cx="130" cy="96" r="75" />
        <circle class="breath-ring" cx="130" cy="96" r="62" />
        <g class="breath-person">
          <path class="breath-body" d="M72 169v-34c0-26 20-41 43-42h30c23 1 43 16 43 42v34" />
          <path class="breath-neck" d="M116 84v16c8 8 20 8 28 0V84" />
          <ellipse class="breath-face" cx="130" cy="60" rx="30" ry="34" />
          <path class="breath-hair" d="M101 59c-5-31 12-43 31-42 25 1 35 20 28 44l-7-20c-14 7-29 5-39-2z" />
          <path class="breath-feature" d="M114 64q5 5 10 0m13 0q5 5 10 0m-22 16q5 3 10 0" />
          <path class="breath-arm" d="M88 131c8 12 19 20 43 21m41-21c-8 12-19 20-43 21" />
          <path class="breath-hand" d="M118 150q12-6 23 0m-20 5h18" />
        </g>
        <path class="breath-air breath-air-left" d="M35 90q13-8 24 0m-30 16q14-8 27 0" />
        <path class="breath-air breath-air-right" d="M201 90q13-8 24 0m-21 16q14-8 27 0" />
      </svg>
    </div>
    <p class="breathing-caption">그림이 커질 때 들이쉬고, 작아질 때 내쉬어 봐.</p>
    <p class="breathing-note">그림보다 네가 편한 속도가 먼저야. 불편하면 멈춰도 돼.</p>
    <div class="breathing-progress" role="progressbar" aria-label="숨 고르기 진행" aria-valuemin="0" aria-valuemax="30" aria-valuenow="0"><span></span></div>
    <div class="breathing-controls"><button type="button" class="breathing-toggle">30초 함께하기</button><button type="button" class="breathing-leave">다른 활동 하기</button></div>`;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const motion = document.createElement('button'); motion.type = 'button'; motion.className = 'breathing-motion'; motion.textContent = '그림 움직임 켜기'; motion.setAttribute('aria-pressed', 'false');
    motion.addEventListener('click', () => { const enabled = card.classList.toggle('allow-motion'); motion.setAttribute('aria-pressed', String(enabled)); motion.textContent = enabled ? '그림 움직임 끄기' : '그림 움직임 켜기'; });
    card.querySelector('.breathing-controls').append(motion);
  }
  const phase = card.querySelector('.breathing-phase');
  const time = card.querySelector('.breathing-time');
  const caption = card.querySelector('.breathing-caption');
  const progress = card.querySelector('.breathing-progress');
  const fill = progress.firstElementChild;
  const toggle = card.querySelector('.breathing-toggle');
  let animation = null, running = false, started = 0, previousLabel = '';
  function stop() {
    running = false; cancelAnimationFrame(animation); animation = null;
    card.classList.remove('is-running');
    phase.textContent = '잠깐 쉬어도 괜찮아';
    caption.textContent = '다시 하고 싶을 때 아래 버튼을 눌러 줘.';
    toggle.textContent = '처음부터 다시하기';
  }
  function tick(now) {
    if (!running) return;
    const frame = breathingFrame(now - started);
    const label = frame.done ? '편하게 숨 쉬어 줘' : frame.phase === 'in' ? '천천히 들이쉬기' : '편하게 내쉬기';
    if (label !== previousLabel) { phase.textContent = label; previousLabel = label; }
    time.textContent = frame.done ? '마쳤어' : `${frame.remaining}초 · ${frame.round}/5`;
    fill.style.width = `${frame.progress * 100}%`;
    progress.setAttribute('aria-valuenow', String(30 - frame.remaining));
    if (frame.done) {
      running = false; animation = null; card.classList.remove('is-running');
      caption.textContent = '이제 평소처럼 편하게 숨 쉬면 돼.';
      toggle.textContent = '한 번 더 함께하기'; onFinish(); return;
    }
    animation = requestAnimationFrame(tick);
  }
  toggle.addEventListener('click', () => {
    if (running) { stop(); return; }
    running = true; previousLabel = ''; started = performance.now();
    caption.textContent = '그림이 커질 때 들이쉬고, 작아질 때 내쉬어 봐.';
    toggle.textContent = '잠깐 멈추기'; card.classList.add('is-running'); tick(started);
  });
  card.querySelector('.breathing-leave').addEventListener('click', onLeave);
  return { element: card, stop, destroy() { running = false; cancelAnimationFrame(animation); card.remove(); } };
}
