const test = require('node:test');
const assert = require('node:assert');
const { planDoubleElimAdvancement, slotsFor, matchId } = require('./doubleElim');
const { seedDoubleEliminationBracket } = require('./seeding');

const T = 1_000_000_000_000;
const seedOf = (name) => (name === 'BYE' ? Infinity : Number(name.slice(1)));

// A tournament of `n` players S1..Sn (S1 best), seeded like the real thing.
function start(n) {
  const players = Array.from({ length: n }, (_, i) => `S${i + 1}`);
  const stats = Object.fromEntries(players.map((p, i) => [p, { bestBuilderBaseTrophies: 10000 - i * 10, tag: `#${p}` }]));
  const { pairs, bracketSize } = seedDoubleEliminationBracket(players, stats);
  const matches = pairs.map(([p1, p2], idx) => ({
    id: `wb-r1-${idx}`, tournamentId: 't', bracket: 'winners', round: 1, player1: p1, player2: p2, unlockAt: T,
    status: p2 === 'BYE' ? 'completed' : 'pending', winner: p2 === 'BYE' ? p1 : null,
  }));
  return { tournament: { id: 't', bracketSize, playerStats: stats, removedPlayers: [] }, matches };
}

// Plays every pending match (better seed wins unless `upset` says otherwise).
const playAll = (matches, pick) => matches.forEach((m) => {
  if (m.status === 'pending') { m.status = 'completed'; m.winner = pick ? pick(m) : (seedOf(m.player1) < seedOf(m.player2) ? m.player1 : m.player2); }
});

// Runs the planner to completion, playing each batch of matches as it appears.
function runToEnd(n, pick, maxPasses = 60) {
  const { tournament, matches } = start(n);
  let now = T;
  for (let pass = 0; pass < maxPasses; pass++) {
    playAll(matches, pick);
    now += 3600_000;
    const { create, champion } = planDoubleElimAdvancement({ tournament, matches, now });
    if (champion) return { champion, matches, tournament };
    if (create.length === 0) playAll(matches, pick);
    matches.push(...create);
  }
  throw new Error(`did not finish for n=${n}`);
}

const gf = (matches) => matches.filter((m) => m.bracket === 'grand_final');

test('slot layout for 8: counts per round and every feeder is a real slot', () => {
  const { slots, lastLosersRound } = slotsFor(8);
  const count = (b, r) => slots.filter((s) => s.bracket === b && s.round === r).length;
  assert.deepStrictEqual([count('winners', 2), count('winners', 3)], [2, 1]);
  assert.deepStrictEqual([1, 2, 3, 4].map((r) => count('losers', r)), [1 + 1, 2, 1, 1].map((_, i) => [2, 2, 1, 1][i]));
  assert.strictEqual(lastLosersRound, 4);
  const exists = (f) => f.round === 1 && f.bracket === 'winners' || slots.some((s) => s.bracket === f.bracket && s.round === f.round && s.index === f.index);
  slots.forEach((s) => s.feeders.filter(Boolean).forEach((f) => assert.ok(exists(f), JSON.stringify(f))));
});

test('every winners-bracket loser drops in exactly once and every match has a place to go', () => {
  for (const n of [4, 8, 16, 32]) {
    const { slots } = slotsFor(n);
    const uses = {};
    slots.forEach((s) => s.feeders.filter(Boolean).forEach((f) => { const key = `${f.kind}:${matchId(f.bracket, f.round, f.index)}`; uses[key] = (uses[key] || 0) + 1; }));
    Object.entries(uses).forEach(([key, count]) => assert.strictEqual(count, 1, `n=${n}: ${key} used ${count} times`));
    // 2 losers-per-match dropping out of winners rounds: all of them are consumed.
    const k = Math.log2(n);
    for (let r = 1; r <= k; r++) for (let j = 0; j < n / 2 ** r; j++) {
      assert.ok(uses[`loser:${matchId('winners', r, j)}`], `n=${n}: loser of WB${r}.${j} is never used`);
    }
  }
});

test('in the drop-in rounds a survivor plays a drop-in, never another survivor', () => {
  const { slots } = slotsFor(16);
  slots.filter((s) => s.bracket === 'losers' && s.round % 2 === 0).forEach((s) => {
    assert.deepStrictEqual(s.feeders.map((f) => f.kind), ['winner', 'loser']);
    assert.strictEqual(s.feeders[0].bracket, 'losers');
    assert.strictEqual(s.feeders[1].bracket, 'winners');
  });
});

test('a full 8-player tournament: best seed wins, nobody loses more than twice, no reset', () => {
  const { champion, matches } = runToEnd(8);
  assert.strictEqual(champion, 'S1');
  assert.strictEqual(gf(matches).length, 1);
  const losses = {};
  matches.filter((m) => m.status === 'completed' && m.winner && m.player1 !== 'BYE' && m.player2 !== 'BYE').forEach((m) => {
    const l = m.winner === m.player1 ? m.player2 : m.player1;
    losses[l] = (losses[l] || 0) + 1;
  });
  Object.entries(losses).forEach(([p, c]) => assert.ok(c <= 2, `${p} lost ${c} times`));
  assert.ok(!losses.S1);
});

test('when the losers bracket champion wins the grand final, a reset match decides it', () => {
  // S1 is unbeaten but S2 (who lost to S1 and came through the losers bracket) wins game one.
  const pick = (m) => (m.bracket === 'grand_final' && m.round === 1 ? m.player2 : seedOf(m.player1) < seedOf(m.player2) ? m.player1 : m.player2);
  const { champion, matches } = runToEnd(8, pick);
  assert.strictEqual(gf(matches).length, 2);
  assert.strictEqual(champion, 'S1'); // and S1 takes the reset
});

test('runs to a champion for every field size, including uneven ones with many byes', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 16, 17, 25, 33, 37]) {
    const { champion } = runToEnd(n);
    assert.strictEqual(champion, 'S1', `n=${n}`);
  }
});

test('an upset field also finishes with a valid champion', () => {
  const pick = (m) => (m.id.length % 2 ? m.player1 : m.player2);
  for (const n of [8, 16, 20]) {
    const { champion } = runToEnd(n, (m) => (m.player2 === 'BYE' ? m.player1 : pick(m)));
    assert.ok(champion.startsWith('S'), `n=${n}`);
  }
});

test('a stuck match holds up only the slots that depend on it', () => {
  const { tournament, matches } = start(16);
  playAll(matches);
  // Winners round 1 match 2 (feeds WB2.1 and LB1.1) is sent to staff instead.
  const stuck = matches.find((m) => m.id === 'wb-r1-2');
  stuck.status = 'needs_staff_review'; stuck.winner = null;
  const created = planDoubleElimAdvancement({ tournament, matches, now: T + 3600_000 }).create.map((m) => m.id).sort();
  assert.ok(created.includes('wb-r2-0'));   // its own pair is fine
  assert.ok(!created.includes('wb-r2-1'));  // waits on wb-r1-2
  assert.ok(created.includes('lb-r1-0'));
  assert.ok(!created.includes('lb-r1-1'));  // waits on wb-r1-2's loser
  assert.ok(created.includes('lb-r1-2'));
  assert.ok(created.includes('wb-r2-3'));
});

test('once staff decide the stuck match the waiting slots appear and open with their groups', () => {
  const { tournament, matches } = start(16);
  playAll(matches);
  const stuck = matches.find((m) => m.id === 'wb-r1-2');
  stuck.status = 'needs_staff_review'; stuck.winner = null;
  const first = planDoubleElimAdvancement({ tournament, matches, now: T + 3600_000 }).create;
  matches.push(...first);
  const unlockOfWb2 = first.find((m) => m.id === 'wb-r2-0').unlockAt;
  stuck.status = 'completed'; stuck.winner = stuck.player1;
  const later = planDoubleElimAdvancement({ tournament, matches, now: T + 5 * 3600_000 }).create;
  assert.deepStrictEqual(later.map((m) => m.id).sort(), ['lb-r1-1', 'wb-r2-1']);
  later.forEach((m) => { if (m.bracket === 'winners') assert.strictEqual(m.unlockAt, unlockOfWb2); });
});

test('a group\'s late-created match shares its siblings\' day, and byes never consume a day', () => {
  const { tournament, matches } = start(8);
  playAll(matches);
  const first = planDoubleElimAdvancement({ tournament, matches, now: T + 3600_000 }).create;
  const days = new Set(first.filter((m) => m.status === 'pending').map((m) => m.day));
  assert.strictEqual(days.size, 1); // winners round 2 and losers round 1 open together
  assert.strictEqual([...days][0], 2);
});

test('removed players never come out of a match', () => {
  const { tournament, matches } = start(8);
  playAll(matches);
  const plan = planDoubleElimAdvancement({ tournament: { ...tournament, removedPlayers: ['S8'] }, matches, now: T + 1000 });
  const lb = plan.create.filter((m) => m.bracket === 'losers');
  lb.forEach((m) => assert.ok(m.player1 !== 'S8' && m.player2 !== 'S8'));
});

test('does not recreate matches that already exist', () => {
  const { tournament, matches } = start(8);
  playAll(matches);
  const first = planDoubleElimAdvancement({ tournament, matches, now: T + 1000 }).create;
  matches.push(...first);
  assert.deepStrictEqual(planDoubleElimAdvancement({ tournament, matches, now: T + 2000 }).create, []);
});
