// Keep a finished check separate from the answers currently being reviewed.
export function createCheckSession() {
  let answers = [], saved = null, index = 0, phase = 'new';
  return {
    get answers() { return answers.slice(); },
    get resultAnswers() { return saved?.slice() || null; },
    get index() { return index; },
    get phase() { return phase; },
    enter() {
      if (saved) { phase = 'complete'; return 'result'; }
      phase = 'answering'; return 'question';
    },
    select(score) {
      if (!['answering', 'reviewing'].includes(phase) || !Number.isInteger(score) || score < 1 || score > 6) return false;
      answers[index] = score; return true;
    },
    next(expectedIndex = index) {
      if (expectedIndex !== index || !['answering', 'reviewing'].includes(phase) || !answers[index]) return false;
      if (index < 5) { index++; return 'question'; }
      if (Array.from({ length: 6 }, (_, i) => answers[i]).some(value => !value)) return false;
      saved = answers.slice(); phase = 'complete'; return 'result';
    },
    previous() { if (index > 0 && ['answering', 'reviewing'].includes(phase)) index--; },
    review() { if (!saved) return false; answers = saved.slice(); index = 0; phase = 'reviewing'; return true; },
    restart() { answers = []; saved = null; index = 0; phase = 'answering'; },
  };
}
