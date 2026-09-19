// Double-elimination advancement, one bracket slot at a time - the same idea
// as advancement.js for single elimination: every match has fixed feeders
// (which earlier matches' winners or losers fill it), and it's created the
// moment both feeders are decided, so a match stuck with staff only holds up
// the slots that depend on it. Pure: matches in, matches-to-create out.
//
// Layout for a bracket of N = 2^k (standard double elimination):
//   Winners round r+1, match j   <- winners of winners round r, matches 2j and 2j+1
//   Losers round 1, match j      <- losers of winners round 1, matches 2j and 2j+1
//   Losers round 2i (drop-in)    <- winner of losers round 2i-1 match j
//                                   vs the loser of winners round i+1, match m-1-j
//     (the drop-in index is reversed so a drop-in doesn't immediately meet the
//      player who knocked out the survivor's half)
//   Losers round 2i-1 (i >= 2)   <- winners of losers round 2i-2, matches 2j and 2j+1
//   Grand final                  <- winners bracket champion vs losers bracket champion,
//                                   plus a reset match if the losers bracket champion wins it
const { nextRoundUnlockAt } = require('./schedule');

const PREFIX = { winners: 'wb', losers: 'lb', grand_final: 'gf' };
const matchId = (bracket, round, index) => `${PREFIX[bracket]}-r${round}-${index}`;

const winner = (bracket, round, index) => ({ kind: 'winner', bracket, round, index });
const loser = (bracket, round, index) => ({ kind: 'loser', bracket, round, index });

// Every slot after winners round 1 (which is created when the tournament
// starts), with its two feeders. A null feeder is an empty seat.
function slotsFor(bracketSize) {
  const k = Math.round(Math.log2(bracketSize));
  const slots = [];

  for (let r = 2; r <= k; r++) {
    for (let j = 0; j < bracketSize / 2 ** r; j++) {
      slots.push({ bracket: 'winners', round: r, index: j, feeders: [winner('winners', r - 1, 2 * j), winner('winners', r - 1, 2 * j + 1)] });
    }
  }

  const lastLosersRound = Math.max(2 * (k - 1), 1);
  if (k === 1) {
    // Two players: the winners final's loser is the whole losers bracket.
    slots.push({ bracket: 'losers', round: 1, index: 0, feeders: [loser('winners', 1, 0), null] });
  } else {
    for (let i = 1; i <= k - 1; i++) {
      const matchesInPair = bracketSize / 2 ** (i + 1);
      for (let j = 0; j < matchesInPair; j++) {
        const oddFeeders = i === 1
          ? [loser('winners', 1, 2 * j), loser('winners', 1, 2 * j + 1)]
          : [winner('losers', 2 * i - 2, 2 * j), winner('losers', 2 * i - 2, 2 * j + 1)];
        slots.push({ bracket: 'losers', round: 2 * i - 1, index: j, feeders: oddFeeders });
        slots.push({
          bracket: 'losers', round: 2 * i, index: j,
          feeders: [winner('losers', 2 * i - 1, j), loser('winners', i + 1, matchesInPair - 1 - j)],
        });
      }
    }
  }
  return { k, lastLosersRound, slots };
}

function newMatch({ tournamentId, bracket, round, index, player1, player2, playerStats, unlockAt, day, now }) {
  const empty = !player1;
  const bye = empty || !player2;
  return {
    id: matchId(bracket, round, index),
    tournamentId,
    player1: player1 || 'BYE',
    player2: bye ? 'BYE' : player2,
    player1Tag: playerStats?.[player1]?.tag || '',
    player2Tag: bye ? '' : playerStats?.[player2]?.tag || '',
    player1Stats: playerStats?.[player1] || null,
    player2Stats: bye ? null : playerStats?.[player2] || null,
    round,
    day,
    unlockAt,
    bracket,
    status: bye ? 'completed' : 'pending',
    winner: empty ? null : bye ? player1 : null,
    completedAt: bye ? now : null,
    player1Ready: false,
    player2Ready: false,
    player1ReadyTime: null,
    player2ReadyTime: null,
    scheduledStartTime: null,
    winner1Vote: null,
    winner2Vote: null,
    player1VoteTime: null,
    player2VoteTime: null,
    player1ScreenshotPaths: [],
    player2ScreenshotPaths: [],
  };
}

// Returns { create: [match docs], champion: username | null }.
function planDoubleElimAdvancement({ tournament, matches, now = Date.now() }) {
  const bracketSize = tournament.bracketSize || 2;
  const { k, lastLosersRound, slots } = slotsFor(bracketSize);
  const removed = tournament.removedPlayers || [];
  const byId = Object.fromEntries(matches.map((m) => [m.id, m]));
  const isBye = (m) => m.player1 === 'BYE' || m.player2 === 'BYE';

  // undefined = not decided yet (wait); null = decided, nobody comes out of it.
  const outcome = (feeder) => {
    if (!feeder) return null;
    const m = byId[matchId(feeder.bracket, feeder.round, feeder.index)];
    if (!m || m.status !== 'completed') return undefined;
    if (feeder.kind === 'winner') {
      return m.winner && m.winner !== 'BYE' && !removed.includes(m.winner) ? m.winner : null;
    }
    if (!m.winner || isBye(m)) return null;
    const out = m.winner === m.player1 ? m.player2 : m.player1;
    return removed.includes(out) ? null : out;
  };

  // Days: a group of matches (one bracket round) opens on a shared day. A
  // group with siblings already created opens with them, or straight away if
  // that day has started; a new group opens on the next day boundary. Byes and
  // empty seats don't anchor or consume a day - they're completed on creation.
  const realMatches = matches.filter((m) => !isBye(m));
  const passUnlock = nextRoundUnlockAt(realMatches, now);
  const maxDay = Math.max(1, ...realMatches.map((m) => m.day ?? m.round));
  const dayByUnlock = {};
  realMatches.forEach((m) => { dayByUnlock[m.unlockAt] = Math.max(dayByUnlock[m.unlockAt] || 0, m.day ?? m.round); });
  const siblingsOf = (bracket, round) => realMatches.filter((m) => m.bracket === bracket && m.round === round);
  const groupUnlock = (bracket, round) => {
    const siblings = siblingsOf(bracket, round);
    return siblings.length ? Math.max(now, ...siblings.map((m) => m.unlockAt || 0)) : passUnlock;
  };
  const dayFor = (bracket, round, unlockAt) => {
    const siblings = siblingsOf(bracket, round);
    if (siblings.length) return Math.max(...siblings.map((m) => m.day ?? m.round)); // same day as its group
    return dayByUnlock[unlockAt] ?? (dayByUnlock[unlockAt] = maxDay + 1);
  };

  const create = [];
  const make = (bracket, round, index, a, b) => {
    const [player1, player2] = [a, b].filter(Boolean);
    const willBeReal = !!player1 && !!player2;
    const unlockAt = willBeReal ? groupUnlock(bracket, round) : now;
    const day = willBeReal ? dayFor(bracket, round, unlockAt) : maxDay;
    create.push(newMatch({ tournamentId: tournament.id, bracket, round, index, player1, player2, playerStats: tournament.playerStats, unlockAt, day, now }));
  };

  for (const slot of slots) {
    if (byId[matchId(slot.bracket, slot.round, slot.index)]) continue;
    const [a, b] = slot.feeders.map(outcome);
    if (a === undefined || b === undefined) continue;
    make(slot.bracket, slot.round, slot.index, a, b);
  }

  // Grand final.
  let champion = null;
  const gf1 = byId[matchId('grand_final', 1, 0)];
  if (!gf1) {
    const wbChampion = outcome(winner('winners', k, 0));
    const lbChampion = outcome(winner('losers', lastLosersRound, 0));
    if (wbChampion !== undefined && lbChampion !== undefined) {
      if (wbChampion && lbChampion) make('grand_final', 1, 0, wbChampion, lbChampion);
      else champion = wbChampion || lbChampion || null; // only one finalist left standing
    }
  } else if (gf1.status === 'completed' && gf1.winner) {
    if (gf1.winner === gf1.player1) {
      champion = gf1.winner; // the winners bracket champion still has no losses
    } else if (!byId[matchId('grand_final', 2, 0)]) {
      // The losers bracket champion won game one - both finalists now have
      // exactly one loss, so a bracket-reset decider is needed.
      make('grand_final', 2, 0, gf1.player1, gf1.player2);
    }
  }
  const gf2 = byId[matchId('grand_final', 2, 0)];
  if (gf2 && gf2.status === 'completed' && gf2.winner) champion = gf2.winner;

  return { create, champion };
}

module.exports = { planDoubleElimAdvancement, slotsFor, matchId };
