import test from 'node:test';
import assert from 'node:assert/strict';
import { breathingFrame } from '../js/maeumgil-breathing.js';

test('breathing cue uses five smooth cycles without breath holds and completes at 30 seconds', () => {
  assert.deepEqual(breathingFrame(0), { done: false, phase: 'in', remaining: 30, round: 1, progress: 0 });
  assert.equal(breathingFrame(2999).phase, 'in');
  assert.equal(breathingFrame(3000).phase, 'out');
  assert.equal(breathingFrame(5999).phase, 'out');
  assert.equal(breathingFrame(6000).phase, 'in');
  assert.equal(breathingFrame(6000).round, 2);
  assert.equal(breathingFrame(29000).remaining, 1);
  assert.equal(breathingFrame(30000).done, true);
  assert.equal(breathingFrame(90000).progress, 1);
  assert.equal(breathingFrame(90000).round, 5);
  assert.equal(breathingFrame(-1).remaining, 30);
});
