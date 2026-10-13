import { voteWinners, asked, isReady, quizWinners, soundLeague, soundQuestion, tallyAnswers, tallyVotes, voteShares } from '../league/leagueState';

test('with nothing saved the section is off, with no vote and no question', () => {
  expect(soundLeague(undefined)).toEqual({ active: false, title: 'BUILDER LEAGUE', stage: 'FINAL 8', videoUrl: '', voteReward: 100, voting: null, quiz: null });
});

test('votes are counted by side and shown as shares that add up to 100', () => {
  const tally = tallyVotes([{ side: 'r' }, { side: 'b' }, { side: 'r' }, { side: 'x' }, {}]);
  expect(tally).toEqual({ r: 2, b: 1 });
  expect(voteShares(2, 1)).toEqual({ r: 67, b: 33 });
  expect(voteShares(0, 0)).toEqual({ r: 50, b: 50 });
  expect(voteShares(0, 9)).toEqual({ r: 0, b: 100 });
});

test('a vote is open or locked, never anything else', () => {
  expect(soundLeague({ voting: { matchId: 'm1', red: 'MrSixStar', blue: 'J3fri', status: 'open', redVotes: 3, blueVotes: '2' } }).voting)
    .toEqual({ matchId: 'm1', red: 'MrSixStar', blue: 'J3fri', status: 'open', redVotes: 3, blueVotes: 2, reward: 100, winner: null });
  // A winner is only named once voting is locked, and those who picked them are found.
  expect(soundLeague({ voting: { matchId: 'm1', status: 'open', winner: 'r' } }).voting.winner).toBeNull();
  expect(soundLeague({ voteReward: 300, voting: { matchId: 'm1', status: 'locked', winner: 'b' } }).voting).toMatchObject({ winner: 'b', reward: 300 });
  expect(voteWinners([{ uid: 'a', username: 'Ann', side: 'r' }, { uid: 'b', username: 'Bo', side: 'b' }], 'b')).toEqual([{ uid: 'b', username: 'Bo' }]);
  expect(soundLeague({ voting: { matchId: 'm1', status: 'whatever' } }).voting.status).toBe('locked');
  expect(soundLeague({ voting: { red: 'no id' } }).voting).toBeNull();
});

test('the right answer only reaches the audience once it is revealed', () => {
  const prepared = soundQuestion({ question: 'How many stars in a perfect attack?', options: ['3', '6', '9'], correct: 1, points: 250 });
  expect(isReady(prepared)).toBe(true);
  const up = asked(prepared);
  expect(up).toMatchObject({ question: 'How many stars in a perfect attack?', options: ['3', '6', '9'], points: 250, status: 'open', correct: null, counts: null });
  expect(up.id).not.toBe(prepared.id);
  // It takes answers for 45 seconds from when it goes up.
  expect(asked(prepared, 1000).endsAt).toBe(46000);
  // Even if a right answer were saved while it is still open, it is not passed on.
  expect(soundLeague({ quiz: { ...up, correct: 1, counts: [1, 5, 0] } }).quiz).toMatchObject({ status: 'open', correct: null, counts: null });
  expect(soundLeague({ quiz: { ...up, status: 'revealed', correct: 1, counts: [1, 5, 0] } }).quiz).toMatchObject({ status: 'revealed', correct: 1, counts: [1, 5, 0] });
});

test('answers are counted per option and the right ones win', () => {
  const answers = [{ uid: 'a', username: 'Ann', choice: 1 }, { uid: 'b', username: 'Bo', choice: 0 }, { uid: 'c', username: 'Cy', choice: 1 }, { uid: 'd', username: 'Di', choice: 7 }];
  expect(tallyAnswers(answers, 3)).toEqual([1, 2, 0]);
  expect(quizWinners(answers, 1)).toEqual([{ uid: 'a', username: 'Ann' }, { uid: 'c', username: 'Cy' }]);
});

test('a prepared question needs a question and at least two filled answers', () => {
  expect(isReady(soundQuestion({}))).toBe(false);
  expect(soundQuestion({}).options).toEqual(['', '']);
  expect(isReady(soundQuestion({ question: 'Q', options: ['A', ''] }))).toBe(false);
  expect(isReady(soundQuestion({ question: 'Q', options: ['A', 'B'] }))).toBe(true);
  // No more than four answers, and the right one is always one of them.
  const many = soundQuestion({ question: 'Q', options: ['A', 'B', 'C', 'D', 'E'], correct: 9, points: 0 });
  expect([many.options.length, many.correct, many.points]).toEqual([4, 0, 100]);
});
