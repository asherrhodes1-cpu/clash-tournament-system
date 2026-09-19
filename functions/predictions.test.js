const test = require('node:test');
const assert = require('node:assert');
const { scoreOutcome, planScoreChanges } = require('./predictions');

const decided = { status: 'completed', winner: 'Ana', player1: 'Ana', player2: 'Bo' };

test('a prediction is right when the picked player won', () => {
  assert.strictEqual(scoreOutcome(decided, 'Ana'), true);
  assert.strictEqual(scoreOutcome(decided, 'Bo'), false);
});

test('nothing is scored until the match has a played result', () => {
  assert.strictEqual(scoreOutcome({ ...decided, status: 'pending', winner: null }, 'Ana'), null);
  assert.strictEqual(scoreOutcome({ ...decided, status: 'disputed', winner: null }, 'Ana'), null);
});

test('results not decided by playing count for nobody', () => {
  for (const resolvedReason of ['player_removed', 'mutual_no_show', 'grace_period']) {
    assert.strictEqual(scoreOutcome({ ...decided, resolvedReason }, 'Ana'), null, resolvedReason);
  }
  // A staff decision or a normal forfeit is a real result.
  assert.strictEqual(scoreOutcome({ ...decided, resolvedReason: 'staff_override' }, 'Ana'), true);
  assert.strictEqual(scoreOutcome({ ...decided, resolvedReason: 'opponent_timeout' }, 'Ana'), true);
});

test('scoring a fresh set of predictions adds one total per vote and one correct per right vote', () => {
  const changes = planScoreChanges(decided, [
    { id: 'u1', username: 'Cy', pick: 'Ana' },
    { id: 'u2', username: 'Di', pick: 'Bo' },
  ]);
  assert.deepStrictEqual(changes, [
    { id: 'u1', username: 'Cy', correct: true, deltaTotal: 1, deltaCorrect: 1 },
    { id: 'u2', username: 'Di', correct: false, deltaTotal: 1, deltaCorrect: 0 },
  ]);
});

test('re-running on the same result changes nothing (no double counting)', () => {
  assert.deepStrictEqual(planScoreChanges(decided, [
    { id: 'u1', username: 'Cy', pick: 'Ana', correct: true },
    { id: 'u2', username: 'Di', pick: 'Bo', correct: false },
  ]), []);
});

test('staff switching the winner flips each vote and moves only the difference', () => {
  const switched = { ...decided, winner: 'Bo' };
  assert.deepStrictEqual(planScoreChanges(switched, [
    { id: 'u1', username: 'Cy', pick: 'Ana', correct: true },
    { id: 'u2', username: 'Di', pick: 'Bo', correct: false },
  ]), [
    { id: 'u1', username: 'Cy', correct: false, deltaTotal: 0, deltaCorrect: -1 },
    { id: 'u2', username: 'Di', correct: true, deltaTotal: 0, deltaCorrect: 1 },
  ]);
});

test('reopening a match takes its votes back out of the totals', () => {
  const reopened = { status: 'pending', winner: null, player1: 'Ana', player2: 'Bo' };
  assert.deepStrictEqual(planScoreChanges(reopened, [{ id: 'u1', username: 'Cy', pick: 'Ana', correct: true }]), [
    { id: 'u1', username: 'Cy', correct: null, deltaTotal: -1, deltaCorrect: -1 },
  ]);
});
