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

test('an odd tail gets a bye when its player has not just had one', () => {
  // 3 round-1 matches: pairs (0,1) and a lone 2 - whose winner won a real match.
  const r1 = [done(1, 0, 'A', 'B', 'A'), done(1, 1, 'C', 'D', 'C'), done(1, 2, 'E', 'F', 'E')];
  const plan = planSingleElimAdvancement({ tournament, matches: r1 });
  assert.deepStrictEqual(plan.create.map((x) => [x.id, x.player1, x.player2, x.status, x.winner]), [
    ['t-r2-0', 'A', 'C', 'pending', null],
    ['t-r2-1', 'E', 'BYE', 'completed', 'E'],
  ]);
  assert.strictEqual(roundsFor(3), 3);
});

test('a player who just had a bye is not given another: the three are re-dealt', () => {
  // E was byed in round 1 (E vs BYE). The lone tail would bye E again, so the bye
  // goes to A (who played) and C plays E.
  const r1 = [done(1, 0, 'A', 'B', 'A'), done(1, 1, 'C', 'D', 'C'), done(1, 2, 'E', 'BYE', 'E')];
  const plan = planSingleElimAdvancement({ tournament, matches: r1 });
  assert.deepStrictEqual(plan.create.map((x) => [x.id, x.player1, x.player2, x.status, x.winner]), [
    ['t-r2-0', 'A', 'BYE', 'completed', 'A'],
    ['t-r2-1', 'C', 'E', 'pending', null],
  ]);
});

test('the re-deal waits until the neighbouring pair is decided, and never creates that pair on its own', () => {
  const r1 = [done(1, 0, 'A', 'B', 'A'), m(1, 1, 'C', 'D', 'pending'), done(1, 2, 'E', 'BYE', 'E')];
  assert.deepStrictEqual(planSingleElimAdvancement({ tournament, matches: r1 }).create, []);
});

test('with only two left in the pair, they play each other and nobody is byed twice', () => {
  // The neighbouring pair has just one player left (the other feeder produced nobody).
  const r1 = [done(1, 0, 'A', 'BYE', null), done(1, 1, 'C', 'D', 'C'), done(1, 2, 'E', 'BYE', 'E')];
  const plan = planSingleElimAdvancement({ tournament: { ...tournament, removedPlayers: ['A'] }, matches: r1 });
  const real = plan.create.filter((x) => x.status === 'pending');
  assert.deepStrictEqual(real.map((x) => [x.player1, x.player2]), [['C', 'E']]);
});

// The old seeding: the strongest paired with each other, one odd leftover gets the bye.
function legacyRoundOne(n) {
  const players = Array.from({ length: n }, (_, i) => `S${i + 1}`);
  const top = [];
  const bottom = [];
  players.forEach((p, i) => (i % 2 === 0 ? top.push(p) : bottom.unshift(p)));
  const seeded = [...top, ...bottom];
  const matches = [];
  for (let i = 0; i < seeded.length; i += 2) {
    const [a, b] = [seeded[i], seeded[i + 1] || 'BYE'];
    matches.push({ id: `t-${i / 2}`, round: 1, player1: a, player2: b, unlockAt: T, status: b === 'BYE' ? 'completed' : 'pending', winner: b === 'BYE' ? a : null });
  }
  return matches;
}

const seedNumber = (name) => Number(name.slice(1));

test('nobody gets two byes in a row, whatever the field size or seeding', () => {
  for (const legacy of [true, false]) {
    for (let n = 3; n <= 40; n++) {
      let matches;
      if (legacy) matches = legacyRoundOne(n);
      else {
        // Standard power-of-two seeding (see seeding.js).
        const { seedDoubleEliminationBracket } = require('./seeding');
        const players = Array.from({ length: n }, (_, i) => `S${i + 1}`);
        const stats = Object.fromEntries(players.map((p, i) => [p, { bestBuilderBaseTrophies: 9999 - i }]));
        matches = seedDoubleEliminationBracket(players, stats).pairs.map(([a, b], i) => ({
          id: `t-${i}`, round: 1, player1: a, player2: b, unlockAt: T, status: b === 'BYE' ? 'completed' : 'pending', winner: b === 'BYE' ? a : null,
        }));
      }
      let champion = null;
      for (let pass = 0; pass < 40 && !champion; pass++) {
        matches.filter((x) => x.status === 'pending').forEach((x) => {
          x.status = 'completed';
          x.winner = seedNumber(x.player1) < seedNumber(x.player2) ? x.player1 : x.player2;
        });
        const plan = planSingleElimAdvancement({ tournament: { id: 't', playerStats: {}, removedPlayers: [] }, matches, now: T + (pass + 1) * 3600_000 });
        matches.push(...plan.create);
        champion = plan.champion;
      }
      assert.ok(champion, `legacy=${legacy} n=${n}: no champion`);
      const byRound = {};
      matches.filter((x) => x.player1 !== 'BYE' || x.player2 !== 'BYE').forEach((x) => {
        [x.player1, x.player2].filter((p) => p !== 'BYE').forEach((p) => { (byRound[p] = byRound[p] || {})[x.round] = x.player1 === 'BYE' || x.player2 === 'BYE'; });
      });
      Object.entries(byRound).forEach(([player, rounds]) => {
        Object.keys(rounds).map(Number).forEach((r) => {
          assert.ok(!(rounds[r] && rounds[r + 1]), `legacy=${legacy} n=${n}: ${player} had a bye in rounds ${r} and ${r + 1}`);
        });
      });
    }
  }
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
