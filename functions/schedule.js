const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// When the next round should open. Days are chained 24h slots: the next day
// opens exactly one day after the latest day opened, so a round that finishes
// early waits for the boundary (players see a countdown) instead of dragging
// every later day out by however early it finished. A round that overran its
// own 24h just opens the next one right away - a full 24h then starts from
// that moment, since later rounds chain off this one's unlockAt.
function nextRoundUnlockAt(matches, now = Date.now()) {
  const latest = Math.max(0, ...matches.map((m) => m.unlockAt || 0));
  // Matches from before unlockAt existed have no anchor to chain from.
  if (!latest) return now + ONE_DAY_MS;
  return Math.max(now, latest + ONE_DAY_MS);
}

module.exports = { nextRoundUnlockAt, ONE_DAY_MS };
