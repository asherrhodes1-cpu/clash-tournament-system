// The 1v1 ladder: players queue, get paired with someone of similar rating,
// and play it out as an ordinary match (same ready-up / self-report flow as a
// tournament match, stored under tournaments/ladder). Results move an Elo
// rating, as in chess. Pure helpers - index.js does the Firestore work.

const LADDER_ID = 'ladder';
// A 1v1 gets a flat day from when it's made (tournament days end at noon).
const LADDER_MATCH_MS = 24 * 60 * 60 * 1000;

const START_RATING = 1000;
// FIDE-style K-factor: ratings move fast while a player is new, then settle.
const PROVISIONAL_GAMES = 30;
function kFactor(games) {
  return games < PROVISIONAL_GAMES ? 40 : 20;
}

// The share of the points `rating` is expected to take against `opponent`.
function expectedScore(rating, opponent) {
  return 1 / (1 + 10 ** ((opponent - rating) / 400));
}

function ratingChange(player, opponent, score) {
  return Math.round(kFactor(player.games) * (score - expectedScore(player.rating, opponent.rating)));
}

// How a finished ladder match should be rated, or null if it isn't one:
//   { type: 'played', winner: 'p1' | 'p2' }   - a real result
//   { type: 'no_show', winner: 'p1' | 'p2' }  - the loser never readied up
//   { type: 'both_no_show' }                  - neither did
function outcomeOf(match) {
  if (match.status !== 'completed') return null;
  if (match.resolvedReason === 'both_no_show') return { type: 'both_no_show' };
  const winner = match.winner === match.player1 ? 'p1' : match.winner === match.player2 ? 'p2' : null;
  if (!winner) return null;
  return { type: match.resolvedReason === 'opponent_no_show' ? 'no_show' : 'played', winner };
}

// Rating and record changes for both players ({ rating, games } each).
// A played match is ordinary Elo. A no-show loses what a loss would have
// cost, but their opponent gains nothing for a match that never happened
// (and it doesn't count as a game for them).
function rateMatch(p1, p2, outcome) {
  const lose = (player, opponent) => ({ delta: ratingChange(player, opponent, 0), games: 1, wins: 0, losses: 1 });
  const win = (player, opponent) => ({ delta: ratingChange(player, opponent, 1), games: 1, wins: 1, losses: 0 });
  const untouched = { delta: 0, games: 0, wins: 0, losses: 0 };

  if (outcome.type === 'both_no_show') return { p1: lose(p1, p2), p2: lose(p2, p1) };
  const p1Won = outcome.winner === 'p1';
  if (outcome.type === 'no_show') {
    return p1Won ? { p1: untouched, p2: lose(p2, p1) } : { p1: lose(p1, p2), p2: untouched };
  }
  return p1Won ? { p1: win(p1, p2), p2: lose(p2, p1) } : { p1: lose(p1, p2), p2: win(p2, p1) };
}

// Matchmaking: only similar ratings are paired, and "similar" loosens the
// longer someone has been waiting so nobody is stuck in the queue forever.
const BASE_GAP = 200;
const GAP_STEP = 100;
const GAP_STEP_MS = 10 * 60 * 1000;
function allowedGap(waitedMs) {
  return BASE_GAP + GAP_STEP * Math.floor(Math.max(0, waitedMs) / GAP_STEP_MS);
}

// Queue entries are { username, rating, joinedAt }. Two can be paired once
// their rating gap is inside what the longer-waiting one will accept, unless
// they're `blocked` (they already have an unfinished 1v1 against each other).
function canPair(a, b, now, blocked = () => false) {
  if (a.username === b.username || blocked(a.username, b.username)) return false;
  const gap = Math.abs(a.rating - b.rating);
  return gap <= Math.max(allowedGap(now - a.joinedAt), allowedGap(now - b.joinedAt));
}

// The best opponent for `me` among `queue`: the closest rating, and among
// equally close ones whoever has waited longest. null if nobody fits yet.
function pickOpponent(me, queue, now, blocked) {
  const fits = queue.filter((other) => canPair(me, other, now, blocked));
  if (!fits.length) return null;
  return fits.reduce((best, other) => {
    const gap = Math.abs(other.rating - me.rating);
    const bestGap = Math.abs(best.rating - me.rating);
    if (gap !== bestGap) return gap < bestGap ? other : best;
    return other.joinedAt < best.joinedAt ? other : best;
  });
}

// Pairs off as much of the queue as it can, longest-waiting players first.
// Returns [[a, b], ...] with the longer-waiting player first in each pair.
function pairQueue(queue, now, blocked) {
  const waiting = [...queue].sort((a, b) => a.joinedAt - b.joinedAt);
  const pairs = [];
  while (waiting.length > 1) {
    const first = waiting.shift();
    const opponent = pickOpponent(first, waiting, now, blocked);
    if (!opponent) continue;
    waiting.splice(waiting.indexOf(opponent), 1);
    pairs.push([first, opponent]);
  }
  return pairs;
}

module.exports = {
  LADDER_ID, LADDER_MATCH_MS, START_RATING, PROVISIONAL_GAMES,
  kFactor, expectedScore, outcomeOf, rateMatch, allowedGap, canPair, pickOpponent, pairQueue,
};
