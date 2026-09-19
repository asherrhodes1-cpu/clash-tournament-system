import { rankPredictionScores } from '../utils';

const scores = [
  { tournamentId: 'a', username: 'Ana', correct: 3, total: 4 },
  { tournamentId: 'b', username: 'ana', correct: 2, total: 2 }, // same player, different case
  { tournamentId: 'a', username: 'Bo', correct: 5, total: 7 },
  { tournamentId: 'a', username: 'Cy', correct: 5, total: 5 },
  { tournamentId: 'b', username: 'Di', correct: 0, total: 0 },
];

test('adds a player\'s totals across tournaments, ignoring name case', () => {
  const ana = rankPredictionScores(scores).find((r) => r.username.toLowerCase() === 'ana');
  expect(ana).toMatchObject({ correct: 5, total: 6 });
});

test('ranks by correct, then accuracy, then votes cast', () => {
  // Cy 5/5, Ana 5/6, Bo 5/7: all on 5 correct, so accuracy decides.
  expect(rankPredictionScores(scores).map((r) => r.username)).toEqual(['Cy', 'Ana', 'Bo']);
});

test('can be limited to one tournament', () => {
  expect(rankPredictionScores(scores, 'b').map((r) => r.username)).toEqual(['ana']);
});

test('leaves out players with nothing scored', () => {
  expect(rankPredictionScores(scores).some((r) => r.username === 'Di')).toBe(false);
  expect(rankPredictionScores([])).toEqual([]);
});
