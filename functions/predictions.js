// Scoring for match predictions. A prediction is right when the player it
// picked won the match. Results that weren't decided by playing the match
// (a player removed, a no-show) don't count either way, and a result staff
// change later re-scores the votes: each prediction remembers what it was last
// scored as, so only the difference is applied to the leaderboard totals.
const VOID_REASONS = ['player_removed', 'mutual_no_show', 'grace_period'];

// true / false once the match has a played result, null while it doesn't.
function scoreOutcome(match, pick) {
  if (match.status !== 'completed' || !match.winner || VOID_REASONS.includes(match.resolvedReason)) return null;
  return pick === match.winner;
}

// predictions: [{ id, username, pick, correct }] where `correct` is what it was
// last scored as (true / false / null / missing). Returns only the ones that change.
function planScoreChanges(match, predictions) {
  const changes = [];
  for (const p of predictions) {
    const now = scoreOutcome(match, p.pick);
    const before = p.correct === undefined ? null : p.correct;
    if (now === before) continue;
    changes.push({
      id: p.id,
      username: p.username,
      correct: now,
      deltaTotal: (now !== null ? 1 : 0) - (before !== null ? 1 : 0),
      deltaCorrect: (now === true ? 1 : 0) - (before === true ? 1 : 0),
    });
  }
  return changes;
}

module.exports = { scoreOutcome, planScoreChanges, VOID_REASONS };
