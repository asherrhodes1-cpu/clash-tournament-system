// Single-elimination advancement, one bracket slot at a time. Match k of the
// next round is fed by matches 2k and 2k+1 of this one, so it can be created
// the moment those two are decided - a stuck match (waiting on staff, say)
// only holds up its own branch, not the whole round. Pure: it takes the
// matches and returns what to create, so the rules can be tested without
// Firebase.
const { nextRoundUnlockAt } = require('./schedule');
const { matchPosition } = require('./seeding');

const MAX_ROUNDS = 10;

const roundsFor = (roundOneCount) => (roundOneCount <= 1 ? 1 : 1 + Math.ceil(Math.log2(roundOneCount)));

function newMatch({ tournamentId, round, index, player1, player2, playerStats, unlockAt, now }) {
  const id = `${tournamentId}-r${round}-${index}`;
  const isBye = !player2 || player2 === 'BYE';
  const nobody = !player1;
  return {
    id,
    tournamentId,
    player1: player1 || 'BYE',
    player2: isBye ? 'BYE' : player2,
    player1Tag: playerStats?.[player1]?.tag || '',
    player2Tag: isBye ? '' : playerStats?.[player2]?.tag || '',
    player1Stats: playerStats?.[player1] || null,
    player2Stats: isBye ? null : playerStats?.[player2] || null,
    round,
    unlockAt,
    status: isBye || nobody ? 'completed' : 'pending',
    winner: nobody ? null : isBye ? player1 : null,
    completedAt: isBye || nobody ? now : null,
    player1Ready: false,
    player2Ready: false,
    player1ReadyTime: null,
    player2ReadyTime: null,
    scheduledStartTime: null,
    winner1Vote: null,
    winner2Vote: null,
    player1ScreenshotPaths: [],
    player2ScreenshotPaths: [],
  };
}

// Returns { create: [match docs], champion: username | null }.
function planSingleElimAdvancement({ tournament, matches, now = Date.now() }) {
  const removed = tournament.removedPlayers || [];
  const roundOne = matches.filter((m) => m.round === 1);
  if (roundOne.length === 0) return { create: [], champion: null };
  const totalRounds = roundsFor(roundOne.length);

  // undefined = not decided yet (wait); null = decided but nobody advances.
  const outcome = (m) => {
    if (!m || m.status !== 'completed') return undefined;
    return m.winner && !removed.includes(m.winner) ? m.winner : null;
  };
  const expectedCount = (round) => Math.ceil(roundOne.length / 2 ** (round - 1));

  const create = [];
  let champion = null;
  const unlockByRound = {};
  const unlockFor = (round) => {
    if (unlockByRound[round] === undefined) {
      const existing = matches.filter((m) => m.round === round);
      // Matches of a round share a day: a late one opens with its siblings, or
      // straight away if that day has already started.
      unlockByRound[round] = existing.length
        ? Math.max(now, ...existing.map((m) => m.unlockAt || 0))
        : nextRoundUnlockAt(matches, now);
    }
    return unlockByRound[round];
  };

  for (let round = 1; round < MAX_ROUNDS && round <= totalRounds; round++) {
    const byPosition = {};
    matches.filter((m) => m.round === round).forEach((m) => { byPosition[matchPosition(m)] = m; });
    const count = expectedCount(round);

    if (round === totalRounds) {
      const final = outcome(byPosition[0]);
      if (final) champion = final;
      continue;
    }

    for (let k = 0; k < expectedCount(round + 1); k++) {
      const nextId = `${tournament.id}-r${round + 1}-${k}`;
      if (matches.some((m) => m.id === nextId)) continue;

      // A position past the end of the round (an odd tail) has no one in it.
      const feeder = (pos) => (pos >= count ? null : outcome(byPosition[pos]));
      const a = feeder(2 * k);
      const b = feeder(2 * k + 1);
      if (a === undefined || b === undefined) continue; // a feeder is still undecided

      const [player1, player2] = [a, b].filter(Boolean);
      create.push(newMatch({
        tournamentId: tournament.id, round: round + 1, index: k, player1, player2,
        playerStats: tournament.playerStats, unlockAt: unlockFor(round + 1), now,
      }));
    }
  }
  return { create, champion };
}

module.exports = { planSingleElimAdvancement, roundsFor };
