const test = require('node:test');
const assert = require('node:assert');
const { generateSeededBracket, seedDoubleEliminationBracket, matchPosition } = require('./seeding');

const field = (n) => {
  const players = Array.from({ length: n }, (_, i) => `S${i + 1}`);
  const stats = Object.fromEntries(players.map((p, i) => [p, { bestBuilderBaseTrophies: 10000 - i * 10 }]));
  return { players, stats };
};

// Plays a whole bracket where the better seed always wins, pairing consecutive
// winners in match order like the scheduler does, and records the round every
// pair of seeds first meets in.
function simulate(n) {
  const { players, stats } = field(n);
  const meetings = {};
  let round = 1;
  let matches = generateSeededBracket(players, stats);
  while (true) {
    const winners = [];
    for (const [a, b] of matches) {
      if (b === 'BYE') { winners.push(a); continue; }
      meetings[[a, b].sort().join('v')] = round;
      winners.push(Number(a.slice(1)) < Number(b.slice(1)) ? a : b);
    }
    if (winners.length === 1) return { meetings, rounds: round };
    matches = [];
    for (let i = 0; i < winners.length; i += 2) matches.push([winners[i], winners[i + 1] ?? 'BYE']);
    round++;
  }
}

test('8 players: 1v8, 4v5, 2v7, 3v6 - the strongest are on opposite sides', () => {
  const { players, stats } = field(8);
  assert.deepStrictEqual(generateSeededBracket(players, stats).map((p) => p.join(' v ')), ['S1 v S8', 'S4 v S5', 'S2 v S7', 'S3 v S6']);
});

test('the top two seeds only meet in the final, for any field size', () => {
  for (let n = 3; n <= 64; n++) {
    const { meetings, rounds } = simulate(n);
    assert.strictEqual(meetings['S1vS2'], rounds, `n=${n}: S1 vs S2 met in round ${meetings['S1vS2']} of ${rounds}`);
  }
});

test('the top four seeds never meet before the semifinals', () => {
  for (let n = 5; n <= 64; n++) {
    const { meetings, rounds } = simulate(n);
    for (const pair of ['S1vS3', 'S1vS4', 'S2vS3', 'S2vS4']) {
      // Never meeting at all is fine (a better seed knocked one of them out).
      assert.ok(meetings[pair] === undefined || meetings[pair] >= rounds - 1, `n=${n}: ${pair} met in round ${meetings[pair]} of ${rounds}`);
    }
  }
});

test('top seeds get the byes, and no two byes share a first-round match', () => {
  const { players, stats } = field(37);
  const pairs = generateSeededBracket(players, stats);
  assert.strictEqual(pairs.length, 32);
  const byes = pairs.filter((p) => p[1] === 'BYE').map((p) => p[0]);
  assert.strictEqual(byes.length, 27);
  assert.ok(pairs.every((p) => p[0] !== 'BYE'));
  assert.ok(byes.includes('S1') && byes.includes('S27') && !byes.includes('S28'));
});

test('double elimination seeding is the same layout', () => {
  const { players, stats } = field(16);
  const { pairs, bracketSize } = seedDoubleEliminationBracket(players, stats);
  assert.strictEqual(bracketSize, 16);
  assert.deepStrictEqual(pairs, generateSeededBracket(players, stats));
});

test('match position reads the number at the end of the id, not its string order', () => {
  const ids = ['t-0', 't-1', 't-10', 't-11', 't-2', 't-9'].map((id) => ({ id }));
  assert.deepStrictEqual([...ids].sort((a, b) => a.id.localeCompare(b.id)).map((m) => m.id), ['t-0', 't-1', 't-10', 't-11', 't-2', 't-9']);
  assert.deepStrictEqual([...ids].sort((a, b) => matchPosition(a) - matchPosition(b)).map((m) => m.id), ['t-0', 't-1', 't-2', 't-9', 't-10', 't-11']);
  assert.strictEqual(matchPosition({ id: 'wb-r2-3' }), 3);
});
