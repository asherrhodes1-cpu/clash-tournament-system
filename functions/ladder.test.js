const test = require('node:test');
const assert = require('node:assert');
const {
  kFactor, expectedScore, outcomeOf, rateMatch, allowedGap, canPair, pickOpponent, pairQueue,
} = require('./ladder');

const fresh = { rating: 1000, games: 0 };

test('expected score: even players split it, a 400-point favourite takes ~91%', () => {
  assert.strictEqual(expectedScore(1000, 1000), 0.5);
  assert.ok(Math.abs(expectedScore(1400, 1000) - 10 / 11) < 1e-9);
  assert.ok(Math.abs(expectedScore(1400, 1000) + expectedScore(1000, 1400) - 1) < 1e-9);
});

test('ratings move faster for the first 30 games', () => {
  assert.strictEqual(kFactor(0), 40);
  assert.strictEqual(kFactor(29), 40);
  assert.strictEqual(kFactor(30), 20);
});

test('a played match between equals moves both by half a K', () => {
  const { p1, p2 } = rateMatch(fresh, fresh, { type: 'played', winner: 'p1' });
  assert.deepStrictEqual(p1, { delta: 20, games: 1, wins: 1, losses: 0 });
  assert.deepStrictEqual(p2, { delta: -20, games: 1, wins: 0, losses: 1 });
});

test('beating a much weaker player earns little; an upset earns a lot', () => {
  const strong = { rating: 1400, games: 50 };
  const weak = { rating: 1000, games: 50 };
  assert.strictEqual(rateMatch(strong, weak, { type: 'played', winner: 'p1' }).p1.delta, 2);
  const upset = rateMatch(strong, weak, { type: 'played', winner: 'p2' });
  assert.strictEqual(upset.p2.delta, 18);
  assert.strictEqual(upset.p1.delta, -18);
});

test('each player uses their own K, so a new player moves more than a settled one', () => {
  const settled = { rating: 1000, games: 100 };
  const { p1, p2 } = rateMatch(fresh, settled, { type: 'played', winner: 'p1' });
  assert.strictEqual(p1.delta, 20);
  assert.strictEqual(p2.delta, -10);
});

test('a no-show loses rating but their opponent gains nothing', () => {
  const { p1, p2 } = rateMatch(fresh, fresh, { type: 'no_show', winner: 'p1' });
  assert.deepStrictEqual(p1, { delta: 0, games: 0, wins: 0, losses: 0 });
  assert.deepStrictEqual(p2, { delta: -20, games: 1, wins: 0, losses: 1 });
  const other = rateMatch(fresh, fresh, { type: 'no_show', winner: 'p2' });
  assert.strictEqual(other.p1.delta, -20);
  assert.strictEqual(other.p2.delta, 0);
});

test('when neither shows up, both lose rating', () => {
  const { p1, p2 } = rateMatch(fresh, fresh, { type: 'both_no_show' });
  assert.strictEqual(p1.delta, -20);
  assert.strictEqual(p2.delta, -20);
  assert.strictEqual(p1.losses + p2.losses, 2);
});

test('how a finished match is rated depends on why it ended', () => {
  const m = { player1: 'A', player2: 'B', status: 'completed', winner: 'B' };
  assert.deepStrictEqual(outcomeOf(m), { type: 'played', winner: 'p2' });
  assert.deepStrictEqual(outcomeOf({ ...m, resolvedReason: 'staff_override' }), { type: 'played', winner: 'p2' });
  assert.deepStrictEqual(outcomeOf({ ...m, resolvedReason: 'opponent_timeout' }), { type: 'played', winner: 'p2' });
  assert.deepStrictEqual(outcomeOf({ ...m, winner: 'A', resolvedReason: 'opponent_no_show' }), { type: 'no_show', winner: 'p1' });
  assert.deepStrictEqual(outcomeOf({ ...m, winner: null, resolvedReason: 'both_no_show' }), { type: 'both_no_show' });
  assert.strictEqual(outcomeOf({ ...m, status: 'disputed' }), null);
  assert.strictEqual(outcomeOf({ ...m, winner: null }), null);
});

test('the rating gap a player accepts widens the longer they wait', () => {
  const minute = 60 * 1000;
  assert.strictEqual(allowedGap(0), 200);
  assert.strictEqual(allowedGap(9 * minute), 200);
  assert.strictEqual(allowedGap(10 * minute), 300);
  assert.strictEqual(allowedGap(35 * minute), 500);
});

test('only similar ratings are paired, until someone has waited long enough', () => {
  const now = 100 * 60 * 1000;
  const a = { username: 'a', rating: 1000, joinedAt: now };
  const near = { username: 'near', rating: 1200, joinedAt: now };
  const far = { username: 'far', rating: 1450, joinedAt: now };
  assert.strictEqual(canPair(a, near, now), true);
  assert.strictEqual(canPair(a, far, now), false);
  // far has waited 30 minutes: their gap is now 500.
  assert.strictEqual(canPair(a, { ...far, joinedAt: now - 30 * 60 * 1000 }, now), true);
  assert.strictEqual(canPair(a, a, now), false);
  assert.strictEqual(canPair(a, near, now, () => true), false);
});

test('you get the closest-rated opponent, longest wait breaking ties', () => {
  const now = 1_000_000;
  const me = { username: 'me', rating: 1000, joinedAt: now };
  const queue = [
    { username: 'x', rating: 1150, joinedAt: now - 5 },
    { username: 'y', rating: 950, joinedAt: now - 1 },
    { username: 'z', rating: 1050, joinedAt: now - 9 },
  ];
  assert.strictEqual(pickOpponent(me, queue, now).username, 'z');
  assert.strictEqual(pickOpponent(me, [{ username: 'far', rating: 2000, joinedAt: now }], now), null);
});

test('the sweep pairs everyone it can and leaves the rest waiting', () => {
  const now = 1_000_000;
  const queue = [
    { username: 'a', rating: 1000, joinedAt: now - 30 },
    { username: 'b', rating: 1900, joinedAt: now - 20 },
    { username: 'c', rating: 1100, joinedAt: now - 10 },
    { username: 'd', rating: 1850, joinedAt: now - 5 },
    { username: 'e', rating: 1400, joinedAt: now - 1 },
  ];
  const pairs = pairQueue(queue, now).map((pair) => pair.map((p) => p.username));
  assert.deepStrictEqual(pairs, [['a', 'c'], ['b', 'd']]);
  // A blocked pair (already playing each other) isn't made again.
  assert.deepStrictEqual(pairQueue(queue.slice(0, 1).concat(queue[2]), now, () => true), []);
});
