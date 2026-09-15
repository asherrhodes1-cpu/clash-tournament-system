// Pure helpers with no storage dependency, shared between App.js and the api/ modules.

export function generateSeededBracket(players, playerStats) {
  const sorted = [...players].sort((a, b) => {
    const aStats = playerStats[a] || { bestBuilderBaseTrophies: 0 };
    const bStats = playerStats[b] || { bestBuilderBaseTrophies: 0 };
    return bStats.bestBuilderBaseTrophies - aStats.bestBuilderBaseTrophies;
  });

  const seeded = [];
  const top = [];
  const bottom = [];

  sorted.forEach((player, index) => {
    if (index % 2 === 0) {
      top.push(player);
    } else {
      bottom.unshift(player);
    }
  });

  seeded.push(...top, ...bottom);

  const pairs = [];
  for (let i = 0; i < seeded.length; i += 2) {
    if (i + 1 < seeded.length) {
      pairs.push([seeded[i], seeded[i + 1]]);
    } else {
      pairs.push([seeded[i], 'BYE']);
    }
  }

  return pairs;
}

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standard bracket seed order (e.g. size 8 -> [1,8,4,5,2,7,3,6]), so that
// when byes are needed they land on the strongest seeds and are spread
// across different first-round matches - never facing each other.
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

// Seeds round 1 of the winners bracket for a double-elimination tournament.
// Unlike generateSeededBracket (which just byes off one odd leftover), this
// pads all the way up to a power of two so the bracket has a fixed, known
// number of winners-bracket rounds - the losers-bracket routing depends on
// that being fixed and known in advance.
export function seedDoubleEliminationBracket(players, playerStats) {
  const bracketSize = nextPowerOfTwo(players.length);
  const sorted = [...players].sort((a, b) => {
    const aStats = playerStats[a] || { bestBuilderBaseTrophies: 0 };
    const bStats = playerStats[b] || { bestBuilderBaseTrophies: 0 };
    return bStats.bestBuilderBaseTrophies - aStats.bestBuilderBaseTrophies;
  });

  const seedOrder = standardSeedOrder(bracketSize);
  const slots = seedOrder.map((seed) => sorted[seed - 1] || 'BYE');

  const pairs = [];
  for (let i = 0; i < slots.length; i += 2) {
    pairs.push([slots[i], slots[i + 1]]);
  }

  return { pairs, bracketSize };
}

export const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Every round is pinned to a fixed 24h-spaced "day" counted from the
// tournament's start, so a round decided early still can't be played early -
// everyone advances at the same pace.
export function getRoundUnlockTime(tournament, round) {
  if (!tournament?.startedAt) return null;
  return tournament.startedAt + (round - 1) * ONE_DAY_MS;
}

// Rounds are paced one per day, so this doubles as "how many days will this
// tournament take" - purely a function of player count and format, since
// bracket size is always chosen automatically to fit however many sign up.
export function estimateTournamentDays(playerCount, format) {
  if (!playerCount || playerCount < 2) return 0;
  const k = Math.ceil(Math.log2(playerCount));
  if (format === 'double_elimination') {
    const totalLbRounds = Math.max(2 * (k - 1), 1);
    return totalLbRounds + 2; // grand final + a possible bracket-reset decider
  }
  return k;
}

export function formatCountdown(ms) {
  if (ms <= 0) return null;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}

export function getTimeRemaining(startTime) {
  if (!startTime) return null;
  const now = new Date().getTime();
  const elapsed = now - startTime;
  const TIMEOUT_MS = 16 * 60 * 60 * 1000;
  const remaining = TIMEOUT_MS - elapsed;

  if (remaining <= 0) return 'EXPIRED';

  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));

  return `${hours}h ${minutes}m`;
}

export function getTimeRemainingDisplay(startTime) {
  const remaining = getTimeRemaining(startTime);
  if (!remaining) return null;
  if (remaining === 'EXPIRED') return { text: 'TIMEOUT', color: 'text-white font-bold' };

  const hours = parseInt(remaining);
  if (hours <= 2) return { text: remaining, color: 'text-white font-bold' };
  if (hours <= 8) return { text: remaining, color: 'text-white' };
  return { text: remaining, color: 'text-neutral-400' };
}
