import { parseYouTubeId, tallyBets, percentOf, formatGems, effectiveStatus, secondsLeft, goalPhase, tallyChallengeVotes, challengeResult, runningFeature, ROUND_KINDS, roundKind, POCKETS, POCKET_DEGREES, ROULETTE_BETS, spinTarget } from '../live/liveUtils';

test('reads the video ID from every common YouTube link', () => {
  const id = 'dQw4w9WgXcQ';
  for (const link of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/live/${id}?feature=shared`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `youtube.com/watch?v=${id}`,
    id,
  ]) {
    expect(parseYouTubeId(link)).toBe(id);
  }
});

test('rejects links that are not a YouTube video', () => {
  for (const link of ['', '   ', 'hello', 'https://example.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/@channel', null]) {
    expect(parseYouTubeId(link)).toBeNull();
  }
});

test('adds up gems and bettors per side, free picks included', () => {
  const bets = [
    { side: 'fail', amount: 200 },
    { side: 'fail', amount: 0 },
    { side: 'succeed', amount: 50 },
    { side: 'other', amount: 999 },
  ];
  expect(tallyBets(bets)).toEqual({
    succeed: { gems: 50, bettors: 1 },
    fail: { gems: 200, bettors: 2 },
  });
});

test('percentages never divide by zero', () => {
  expect(percentOf(0, 0)).toBe(0);
  expect(percentOf(1, 3)).toBe(33);
  expect(percentOf(2, 3)).toBe(67);
});

test('gems get thousands separators', () => {
  expect(formatGems(1234567)).toBe('1,234,567');
  expect(formatGems(undefined)).toBe('0');
});

test('a timed round closes on its own when the countdown runs out', () => {
  const round = { status: 'open', openedAtMs: 10_000, bettingMs: 45_000 };
  expect(effectiveStatus(round, 10_000)).toBe('open');
  expect(effectiveStatus(round, 54_999)).toBe('open');
  expect(effectiveStatus(round, 55_000)).toBe('closed');
  expect(effectiveStatus({ ...round, status: 'settled' }, 20_000)).toBe('settled');
  expect(effectiveStatus({ status: 'open' }, 99_999_999)).toBe('open');
});

test('the countdown shows whole seconds, rounded up, never below 0', () => {
  const round = { status: 'open', openedAtMs: 0, bettingMs: 45_000 };
  expect(secondsLeft(round, 0)).toBe(45);
  expect(secondsLeft(round, 44_001)).toBe(1);
  expect(secondsLeft(round, 45_000)).toBe(0);
  expect(secondsLeft(round, 60_000)).toBe(0);
  expect(secondsLeft({ status: 'open' }, 0)).toBeNull();
});

test('a goal is decided once its voting countdown runs out', () => {
  const goal = { status: 'voting', votingOpenedAtMs: 1000, votingMs: 60000 };
  expect(goalPhase({ status: 'collecting' }, 0)).toBe('collecting');
  expect(goalPhase(goal, 60999)).toBe('voting');
  expect(goalPhase(goal, 61000)).toBe('decided');
  expect(goalPhase({ status: 'cancelled' }, 0)).toBe('cancelled');
});

test('challenge votes: a clear winner, a tie, or nobody voted', () => {
  const donations = [{ vote: 1 }, { vote: 1 }, { vote: 0 }, { vote: null }, { vote: 7 }];
  expect(tallyChallengeVotes(['A', 'B', 'C'], donations)).toEqual([1, 2, 0]);
  expect(challengeResult([1, 2, 0])).toEqual({ winner: 1 });
  expect(challengeResult([2, 2, 1])).toEqual({ tied: [0, 1] });
  expect(challengeResult([0, 0, 0])).toEqual({ none: true });
});

test('exact-stars rounds tally every star count', () => {
  const totals = tallyBets([{ side: '6', amount: 100 }, { side: '6', amount: 50 }, { side: '2', amount: 10 }], ROUND_KINDS.stars.sides);
  expect(totals['6']).toEqual({ gems: 150, bettors: 2 });
  expect(totals['2']).toEqual({ gems: 10, bettors: 1 });
  expect(totals['0']).toEqual({ gems: 0, bettors: 0 });
  expect(roundKind({})).toBe(ROUND_KINDS.outcome);
  expect(roundKind({ kind: 'stars' })).toBe(ROUND_KINDS.stars);
});

test('the roulette wheel matches the server: 18 elixir, 18 gold, 1 gem', () => {
  expect(POCKETS).toHaveLength(37);
  expect(POCKETS.filter((p) => p === 'elixir')).toHaveLength(18);
  expect(POCKETS.filter((p) => p === 'gold')).toHaveLength(18);
  expect(POCKETS[0]).toBe('gem');
  expect(Object.keys(ROULETTE_BETS)).toEqual(['elixir', 'gold', 'gem']);
});

test('a spin always turns forward and stops inside the landed pocket', () => {
  for (const current of [0, 123, 5000]) {
    for (let pocket = 0; pocket < POCKETS.length; pocket++) {
      for (const jitter of [0, 0.5, 0.999]) {
        const target = spinTarget(current, pocket, jitter);
        expect(target - current).toBeGreaterThanOrEqual(6 * 360);
        // The wheel angle that sits under the pointer at the top.
        const under = (360 - (((target % 360) + 360) % 360)) % 360;
        expect(Math.floor(under / POCKET_DEGREES)).toBe(pocket);
      }
    }
  }
});

test('only what is running takes the place under the stream, the newest first', () => {
  const now = 100_000;
  const drop = { openedAtMs: 90_000, durationMs: 60_000 };
  const round = { status: 'open', openedAtMs: 95_000 };
  const lifeRun = { status: 'active', window: { openedAtMs: 80_000 } };
  const goal = { status: 'collecting', createdAt: 70_000 };
  expect(runningFeature({}, now)).toBeNull();
  expect(runningFeature({ drop, round, lifeRun, goal }, now)).toBe('bet');
  expect(runningFeature({ drop, lifeRun, goal }, now)).toBe('drop');
  // Over: a drop past its time, a bet with its result in, a run with no goal open, a challenge picked.
  expect(runningFeature({ drop, round: { ...round, status: 'settled' }, lifeRun: { status: 'active', window: null }, goal: { status: 'decided' } }, 200_000)).toBeNull();
  // A bet stays up between betting closing and the result.
  expect(runningFeature({ round: { ...round, status: 'closed' } }, now)).toBe('bet');
});
