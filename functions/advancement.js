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
  const isByeMatch = (m) => m.player1 === 'BYE' || m.player2 === 'BYE';

  for (let round = 1; round < MAX_ROUNDS && round <= totalRounds; round++) {
    const byPosition = {};
    matches.filter((m) => m.round === round).forEach((m) => { byPosition[matchPosition(m)] = m; });
    const count = expectedCount(round);

    if (round === totalRounds) {
      const final = outcome(byPosition[0]);
      if (final) champion = final;
      continue;
    }

    // What feeds a position: not decided yet, or decided with a player (and
    // whether that player got there on a bye) or with nobody. A position past
    // the end of the round (an odd tail) is decided with nobody.
    const feeder = (pos) => {
      if (pos >= count) return { decided: true, player: null };
      const m = byPosition[pos];
      if (!m || m.status !== 'completed') return { decided: false };
      const player = outcome(m) || null;
      return { decided: true, player, hadBye: !!player && isByeMatch(m) };
    };

    const nextCount = expectedCount(round + 1);
    const slots = Array.from({ length: nextCount }, (_, k) => {
      const id = `${tournament.id}-r${round + 1}-${k}`;
      const a = feeder(2 * k);
      const b = feeder(2 * k + 1);
      return { k, id, exists: matches.some((m) => m.id === id), a, b, ready: a.decided && b.decided };
    });
    const playersOf = (slot) => [slot.a, slot.b].filter((f) => f.player);
    const add = (slot, player1, player2) => create.push(newMatch({
      tournamentId: tournament.id, round: round + 1, index: slot.k, player1, player2,
      playerStats: tournament.playerStats, unlockAt: unlockFor(round + 1), now,
    }));

    // Nobody should get a bye straight after a bye. A slot that would give a
    // bye to a player who already had one is paired with a neighbouring slot
    // instead: the three players (or two) are re-dealt so the bye goes to
    // someone who had none - or, with only two, they simply play each other.
    // The neighbour waits for that: it isn't created on its own first.
    const neighbourOf = (slot) => {
      const tail = 2 * slot.k + 1 >= count; // an odd tail: nothing feeds its second half
      const other = tail ? slot.k - 1 : slot.k ^ 1;
      return slots[other] || slots[slot.k - 1] || null;
    };
    const needsRedeal = (slot) => !slot.exists && slot.ready && playersOf(slot).length === 1 && playersOf(slot)[0].hadBye;
    const dealt = new Set();
    for (const slot of slots) {
      if (!needsRedeal(slot) || dealt.has(slot.k)) continue;
      const nb = neighbourOf(slot);
      if (!nb || nb.exists || dealt.has(nb.k)) continue; // can't be helped: it's already been created
      dealt.add(slot.k);
      dealt.add(nb.k);
      if (!nb.ready) continue; // wait until the neighbour's players are known
      const [p] = playersOf(slot);
      const others = playersOf(nb);
      if (others.length === 2) {
        const byeFor = others.find((f) => !f.hadBye);
        if (byeFor) {
          const plays = others.find((f) => f !== byeFor);
          add(nb, byeFor.player, undefined);
          add(slot, plays.player, p.player);
        } else {
          add(nb, others[0].player, others[1].player); // they all had byes: nothing better to do
          add(slot, p.player, undefined);
        }
      } else if (others.length === 1) {
        add(nb, others[0].player, p.player); // two players, one match, and no bye for either
        add(slot, undefined, undefined);
      } else {
        add(slot, p.player, undefined); // the only player left in the pair - a bye is unavoidable
        add(nb, undefined, undefined);
      }
    }

    for (const slot of slots) {
      if (slot.exists || dealt.has(slot.k) || !slot.ready) continue;
      const [x, y] = playersOf(slot).map((f) => f.player);
      add(slot, x, y);
    }
  }
  return { create, champion };
}

module.exports = { planSingleElimAdvancement, roundsFor };
