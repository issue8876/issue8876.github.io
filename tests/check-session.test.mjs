import test from 'node:test';
import assert from 'node:assert/strict';
import { createCheckSession } from '../js/maeumgil-check.js';
import { summarizeCheck, assessSafety, questions, scale } from '../js/maeumgil-core.js';
import { readingSupport, scaleHelp } from '../js/maeumgil-reading.js';

function complete(session, answers) {
  for (const [index, answer] of answers.entries()) {
    assert.equal(session.select(answer), true);
    assert.equal(session.index, index);
    assert.equal(session.next(index), index === 5 ? 'result' : 'question');
  }
}
test('unfinished checks resume, selecting never advances, and missing or stale next actions are rejected', () => {
  const check = createCheckSession();
  assert.equal(check.enter(), 'question');
  assert.equal(check.next(), false);
  assert.equal(check.select(7), false);
  assert.equal(check.select(3), true);
  assert.equal(check.index, 0);
  assert.equal(check.next(0), 'question');
  assert.equal(check.next(0), false);
  assert.equal(check.enter(), 'question');
  assert.equal(check.index, 1);
  check.previous(); assert.equal(check.answers[0], 3);
});
test('completed checks re-enter at results, review recomputes only on confirmation, and restarting clears results', () => {
  const check = createCheckSession(); check.enter();
  complete(check, [1, 2, 3, 4, 5, 6]);
  const saved = check.resultAnswers; saved[0] = 6;
  assert.deepEqual(check.resultAnswers, [1, 2, 3, 4, 5, 6]);
  assert.equal(check.enter(), 'result');
  assert.equal(check.select(6), false);
  assert.equal(check.review(), true);
  assert.equal(check.select(6), true);
  assert.deepEqual(check.resultAnswers, [1, 2, 3, 4, 5, 6]);
  for (let index = 0; index < 6; index++) check.next(index);
  assert.equal(summarizeCheck(check.resultAnswers).total, 26);
  assert.equal(check.enter(), 'result');
  check.restart(); assert.deepEqual(check.answers, []); assert.equal(check.resultAnswers, null);
});
test('education wording keeps six items and frequency steps, with distinct reading support and no sparse scoring', () => {
  assert.equal(questions.length, 6); assert.equal(scale.length, 6); assert.equal(scaleHelp.length, 6);
  assert.notEqual(readingSupport('lower', 2).hint, readingSupport('high', 2).hint);
  assert.match(readingSupport('lower', 2).hint, /또래/);
  assert.throws(() => summarizeCheck(new Array(6)));
  assert.throws(() => summarizeCheck([1, 2, , 4, 5, 6]));
});
test('local safety routing includes indirect and misspelled expressions without treating ordinary task completion as a crisis', () => {
  for (const text of ['죽고 십어', '내가 사라졌으면 좋겠어', '눈뜨고 싶지 않아', '아빠가 나를 때리고 있어', '친구가 사진을 퍼뜨린대', '옷을 벗으라고 협박했어']) assert.ok(assessSafety(text), text);
  for (const text of ['숙제를 다 끝내고 싶어', '발표를 끝내고 싶어', '시험 준비가 어려워']) assert.equal(assessSafety(text), null, text);
});
