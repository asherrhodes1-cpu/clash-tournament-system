// Scoring for match predictions. A prediction is right when the player it
// picked won the match. Results that weren't decided by playing the match
// (a player removed, a no-show) don't count either way, and a result staff
// change later re-scores the votes: each prediction remembers what it was last
// scored as, so only the difference is applied to the leaderboard totals.
const VOID_REASONS = ['player_removed', 'mutual_no_show', 'grace_period'];

// The day a match is on, as the app shows it: matches that store a day use it,
// and in single elimination the round is the day.
const matchDay = (match) => match.day ?? match.round;

// true / false once the match has a played result, null while it doesn't - or
// when it's on a day before the tournament's leaderboard starts counting
// (`fromDay`, set by staff), so those votes never count either way.
function scoreOutcome(match, pick, fromDay = 1) {
  if (matchDay(match) < fromDay) return null;
  if (match.status !== 'completed' || !match.winner || VOID_REASONS.includes(match.resolvedReason)) return null;
  return pick === match.winner;
}

// predictions: [{ id, username, pick, correct }] where `correct` is what it was
// last scored as (true / false / null / missing). Returns only the ones that change.
function planScoreChanges(match, predictions, fromDay = 1) {
  const changes = [];
  for (const p of predictions) {
    const now = scoreOutcome(match, p.pick, fromDay);
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

// Recounts everything from scratch, for when the starting day changes.
// entries: [{ match, predictions: [{ id, username, pick }] }]. Returns the
// totals to store per player and what each prediction should now be marked as.
function tallyScores(entries, fromDay = 1) {
  const totals = {};
  const marks = [];
  for (const { match, predictions } of entries) {
    for (const p of predictions) {
      const correct = scoreOutcome(match, p.pick, fromDay);
      marks.push({ matchId: match.id, id: p.id, correct });
      if (correct === null) continue;
      const key = p.username.toLowerCase();
      totals[key] = totals[key] || { username: p.username, correct: 0, total: 0 };
      totals[key].total += 1;
      if (correct) totals[key].correct += 1;
    }
  }
  return { totals, marks };
}

module.exports = { scoreOutcome, planScoreChanges, tallyScores, matchDay, VOID_REASONS };
