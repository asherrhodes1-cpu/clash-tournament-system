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
