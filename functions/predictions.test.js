const test = require('node:test');
const assert = require('node:assert');
const { scoreOutcome, planScoreChanges, tallyScores } = require('./predictions');

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

test('votes on days before the starting day count for nobody', () => {
  const day3 = { ...decided, round: 3 };
  const day4 = { ...decided, round: 4 };
  assert.strictEqual(scoreOutcome(day3, 'Ana', 4), null);
  assert.strictEqual(scoreOutcome(day4, 'Ana', 4), true);
  assert.strictEqual(scoreOutcome(day3, 'Ana'), true); // no starting day: everything counts
});

test('a match that stores a day uses it over its round', () => {
  assert.strictEqual(scoreOutcome({ ...decided, round: 2, day: 5 }, 'Ana', 4), true);
  assert.strictEqual(scoreOutcome({ ...decided, round: 6, day: 3 }, 'Ana', 4), null);
});

test('moving the starting day takes earlier votes back out and leaves later ones alone', () => {
  const day3 = { ...decided, round: 3 };
  const changes = planScoreChanges(day3, [{ id: 'u1', username: 'Cy', pick: 'Ana', correct: true }], 4);
  assert.deepStrictEqual(changes, [{ id: 'u1', username: 'Cy', correct: null, deltaTotal: -1, deltaCorrect: -1 }]);
  // ...and moving it back re-adds them.
  assert.deepStrictEqual(planScoreChanges(day3, [{ id: 'u1', username: 'Cy', pick: 'Ana', correct: null }], 1), [
    { id: 'u1', username: 'Cy', correct: true, deltaTotal: 1, deltaCorrect: 1 },
  ]);
});

test('tallying from scratch only counts matches from the starting day on', () => {
  const entries = [
    { match: { ...decided, id: 'm3', round: 3 }, predictions: [{ id: 'u1', username: 'Cy', pick: 'Ana' }, { id: 'u2', username: 'Di', pick: 'Bo' }] },
    { match: { ...decided, id: 'm4', round: 4 }, predictions: [{ id: 'u1', username: 'Cy', pick: 'Bo' }, { id: 'u2', username: 'Di', pick: 'Ana' }] },
    { match: { id: 'm5', round: 5, status: 'pending', winner: null, player1: 'Ana', player2: 'Bo' }, predictions: [{ id: 'u1', username: 'Cy', pick: 'Ana' }] },
  ];
  const { totals, marks } = tallyScores(entries, 4);
  // Only day 4 counts: Cy picked Bo (wrong), Di picked Ana (right). Day 3 and the undecided day 5 match don't.
  assert.deepStrictEqual(totals, { cy: { username: 'Cy', correct: 0, total: 1 }, di: { username: 'Di', correct: 1, total: 1 } });
  assert.deepStrictEqual(marks.filter((x) => x.matchId === 'm3').map((x) => x.correct), [null, null]);
  assert.deepStrictEqual(marks.filter((x) => x.matchId === 'm4').map((x) => x.correct), [false, true]);
  // Starting from day 1 brings day 3 back.
  assert.deepStrictEqual(tallyScores(entries, 1).totals.cy, { username: 'Cy', correct: 1, total: 2 });
});
