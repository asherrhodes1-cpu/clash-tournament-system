// Bracket seeding. Both single and double elimination use the standard
// bracket layout: the field is padded to a power of two, the best seeds get
// the byes, and seeds are placed so the top two can only meet in the final,
// the top four not before the semifinals, the top eight not before the
// quarterfinals, and so on. Later rounds pair consecutive winners in match
// order, so that structure only holds if matches are read in bracket
// position (see matchPosition), not in document-id string order.
function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// e.g. size 8 -> [1, 8, 4, 5, 2, 7, 3, 6]: consecutive pairs are the
// first-round matches, and the higher seed of each pair comes first.
function standardSeedOrder(size) {
  if (size === 1) return [1];
  const prev = standardSeedOrder(size / 2);
  const out = [];
  prev.forEach((s) => {
    out.push(s);
    out.push(size + 1 - s);
  });
  return out;
}

function seedBracket(players, playerStats) {
  const bracketSize = nextPowerOfTwo(players.length);
  const sorted = [...players].sort((a, b) => {
    const aStats = playerStats[a] || { bestBuilderBaseTrophies: 0 };
    const bStats = playerStats[b] || { bestBuilderBaseTrophies: 0 };
    return bStats.bestBuilderBaseTrophies - aStats.bestBuilderBaseTrophies;
  });
  const slots = standardSeedOrder(bracketSize).map((seed) => sorted[seed - 1] || 'BYE');
  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) pairs.push([slots[i], slots[i + 1]]);
  return { pairs, bracketSize };
}

const generateSeededBracket = (players, playerStats) => seedBracket(players, playerStats).pairs;
const seedDoubleEliminationBracket = seedBracket;

// Match ids end in their position in the round ("...-10"), but Firestore
// returns documents sorted as strings, which puts "-10" before "-2".
function matchPosition(m) {
  const n = /(\d+)$/.exec(m.id || '');
  return n ? parseInt(n[1], 10) : 0;
}

module.exports = { nextPowerOfTwo, standardSeedOrder, generateSeededBracket, seedDoubleEliminationBracket, matchPosition };
