const test = require('node:test');
const assert = require('node:assert');
const { planSingleElimAdvancement, roundsFor } = require('./advancement');

const T = 1_000_000_000_000;
const DAY = 24 * 3600_000;
const tournament = { id: 't', removedPlayers: [], playerStats: { A: { tag: '#A' } } };
const m = (round, index, p1, p2, status, winner) => ({
  id: round === 1 ? `t-${index}` : `t-r${round}-${index}`, round, player1: p1, player2: p2, status, winner: winner || null, unlockAt: T,
});
const done = (round, index, p1, p2, winner) => m(round, index, p1, p2, 'completed', winner);
const ids = (plan) => plan.create.map((x) => x.id);

// 8 players -> round 1 has 4 matches.
const round1 = [done(1, 0, 'A', 'B', 'A'), done(1, 1, 'C', 'D', 'C'), done(1, 2, 'E', 'F', 'E'), done(1, 3, 'G', 'H', 'G')];

test('a full round creates the whole next round, paired by bracket position', () => {
  const plan = planSingleElimAdvancement({ tournament, matches: round1, now: T + 1000 });
  assert.deepStrictEqual(ids(plan), ['t-r2-0', 't-r2-1']);
  assert.deepStrictEqual(plan.create.map((x) => [x.player1, x.player2, x.status]), [['A', 'C', 'pending'], ['E', 'G', 'pending']]);
  assert.strictEqual(plan.create[0].player1Tag, '#A');
  assert.strictEqual(plan.champion, null);
});

test('a stuck match only holds up its own branch', () => {
  const stuck = [...round1.slice(0, 2), m(1, 2, 'E', 'F', 'needs_staff_review'), round1[3]];
  const plan = planSingleElimAdvancement({ tournament, matches: stuck, now: T + 1000 });
  assert.deepStrictEqual(ids(plan), ['t-r2-0']); // A vs C proceeds; E vs G waits on E/F
});

test('once staff decides the stuck match, the waiting branch is created and opens with its siblings', () => {
  const existing = [...round1, { id: 't-r2-0', round: 2, player1: 'A', player2: 'C', status: 'pending', unlockAt: T + 2 * DAY }];
  const plan = planSingleElimAdvancement({ tournament, matches: existing, now: T + DAY });
  assert.deepStrictEqual(ids(plan), ['t-r2-1']);
  assert.strictEqual(plan.create[0].unlockAt, T + 2 * DAY); // same future day as its sibling
  // If that day has already started, the late match opens right away.
  const late = planSingleElimAdvancement({ tournament, matches: existing, now: T + 3 * DAY });
  assert.strictEqual(late.create[0].unlockAt, T + 3 * DAY);
});

test('does not recreate matches that already exist', () => {
  const existing = [...round1, { id: 't-r2-0', round: 2, status: 'pending', unlockAt: T }, { id: 't-r2-1', round: 2, status: 'pending', unlockAt: T }];
  assert.deepStrictEqual(ids(planSingleElimAdvancement({ tournament, matches: existing })), []);
});

test('crowns the champion only when the real final is decided', () => {
  const r2 = [done(2, 0, 'A', 'C', 'A'), done(2, 1, 'E', 'G', 'E')];
  const all = [...round1, ...r2];
  assert.strictEqual(planSingleElimAdvancement({ tournament, matches: all }).champion, null);
  const final = done(3, 0, 'A', 'E', 'E');
  const plan = planSingleElimAdvancement({ tournament, matches: [...all, final] });
  assert.strictEqual(plan.champion, 'E');
  assert.deepStrictEqual(ids(plan), []);
});

test('a lone match in a partly built round is not mistaken for the final', () => {
  // Round 2 has only its first match so far; it must not crown anyone.
  const matches = [...round1, done(2, 0, 'A', 'C', 'A'), m(2, 1, 'E', 'G', 'pending')];
  assert.strictEqual(planSingleElimAdvancement({ tournament, matches }).champion, null);
});

test('an odd tail gets a bye (fields that are not a power of two)', () => {
  // 3 round-1 matches: pairs (0,1) and a lone 2.
  const r1 = [done(1, 0, 'A', 'B', 'A'), done(1, 1, 'C', 'D', 'C'), done(1, 2, 'E', 'BYE', 'E')];
  const plan = planSingleElimAdvancement({ tournament, matches: r1 });
  assert.deepStrictEqual(plan.create.map((x) => [x.id, x.player1, x.player2, x.status, x.winner]), [
    ['t-r2-0', 'A', 'C', 'pending', null],
    ['t-r2-1', 'E', 'BYE', 'completed', 'E'],
  ]);
  assert.strictEqual(roundsFor(3), 3);
});

test('a player removed after winning leaves their opponent a bye', () => {
  const plan = planSingleElimAdvancement({ tournament: { ...tournament, removedPlayers: ['C'] }, matches: round1 });
  const first = plan.create[0];
  assert.deepStrictEqual([first.player1, first.player2, first.status, first.winner], ['A', 'BYE', 'completed', 'A']);
});

test('two feeders with nobody advancing leave a completed empty slot so later pairing still lines up', () => {
  const r1 = [done(1, 0, 'A', 'BYE', null), done(1, 1, 'C', 'BYE', null), done(1, 2, 'E', 'F', 'E'), done(1, 3, 'G', 'H', 'G')];
  const plan = planSingleElimAdvancement({ tournament: { ...tournament, removedPlayers: [] }, matches: r1 });
  assert.deepStrictEqual([plan.create[0].player1, plan.create[0].status, plan.create[0].winner], ['BYE', 'completed', null]);
});

test('waits when round 1 has no matches at all', () => {
  assert.deepStrictEqual(planSingleElimAdvancement({ tournament, matches: [] }), { create: [], champion: null });
});
