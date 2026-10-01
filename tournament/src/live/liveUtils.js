// Keep in step with functions/betting.js, which is what actually applies them.
export const STARTING_GEMS = 1000;
export const FREE_PICK_REWARD = 50;

// The kinds of betting round. Sides are listed in display order; the
// multipliers (what a right bet pays back, as a multiple of the stake) are
// applied by functions/betting.js, which this has to match. Tailwind class
// names are spelled out in full so they survive the CSS build.
export const ROUND_KINDS = {
  outcome: {
    name: '6-star or fail',
    description: 'Will I 6-star this attack?',
    sides: ['succeed', 'fail'],
    labels: { succeed: 'Succeed', fail: 'Fail' },
    results: { succeed: 'SUCCEEDED', fail: 'FAILED' },
    multipliers: { succeed: 2, fail: 2 },
    colors: { succeed: 'bg-green-600', fail: 'bg-red-600' },
  },
  stars: {
    name: 'Exact stars',
    description: 'How many stars will I get?',
    sides: ['6', '5', '4', '3', '2', '1', '0'],
    labels: { 6: '6 stars', 5: '5 stars', 4: '4 stars', 3: '3 stars', 2: '2 stars', 1: '1 star', 0: '0 stars' },
    results: { 6: '6 STARS', 5: '5 STARS', 4: '4 STARS', 3: '3 STARS', 2: '2 STARS', 1: '1 STAR', 0: '0 STARS' },
    multipliers: { 6: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 8, 0: 10 },
    colors: {
      6: 'bg-green-600', 5: 'bg-lime-600', 4: 'bg-yellow-600', 3: 'bg-amber-600',
      2: 'bg-orange-600', 1: 'bg-red-600', 0: 'bg-red-800',
    },
  },
};

// A round's kind; rounds from before kinds existed are succeed/fail.
export function roundKind(round) {
  return ROUND_KINDS[round.kind] || ROUND_KINDS.outcome;
}

// Gem Roulette, laid out like European roulette: 37 pockets, pocket 0 the
// Gem (the green zero), then Elixir and Gold alternating. Bets are on Elixir,
// Gold or Gem. Must match functions/roulette.js, which does the real roll.
export const ROULETTE_BETS = {
  elixir: { name: 'Elixir', icon: '/elixir.png', payout: 2, color: '#8e2fd0' },
  gold: { name: 'Gold', icon: '/gold.png', payout: 2, color: '#d99a0b' },
  gem: { name: 'Gem', icon: '/gem.png', payout: 36, color: '#3f9b1c' },
};
export const POCKETS = Array.from({ length: 37 }, (_, i) => (i === 0 ? 'gem' : i % 2 === 1 ? 'elixir' : 'gold'));
export const POCKET_DEGREES = 360 / POCKETS.length;

// How far to turn the wheel (clockwise, in degrees, from `current`) so the
// pointer at the top stops inside `pocket` after a few full turns. `jitter`
// in [0, 1) picks where in the pocket, keeping clear of its edges.
export function spinTarget(current, pocket, jitter = 0.5, turns = 6) {
  const start = pocket * POCKET_DEGREES;
  const margin = POCKET_DEGREES * 0.2;
  const inside = start + margin + jitter * (POCKET_DEGREES - 2 * margin);
  // The wheel angle that puts `inside` under the pointer.
  const want = (360 - inside) % 360;
  const from = ((current % 360) + 360) % 360;
  return current + turns * 360 + ((want - from + 360) % 360);
}

// How long betting stays open on a new round (the on-screen countdown).
export const BETTING_SECONDS = 45;

// When a round's countdown ends (ms), or null for a round without one.
export function bettingEndsAt(round) {
  if (!round.bettingMs || round.openedAtMs == null) return null;
  return round.openedAtMs + round.bettingMs;
}

// The round's status as viewers should see it right now: an 'open' round
// whose countdown has run out is closed, even before anyone updates it
// (the betting function refuses late bets either way).
export function effectiveStatus(round, now) {
  if (round.status !== 'open') return round.status;
  const endsAt = bettingEndsAt(round);
  return endsAt != null && now >= endsAt ? 'closed' : 'open';
}

// Whole seconds left on the countdown, rounded up so it shows 1 until the end.
export function secondsLeft(round, now) {
  const endsAt = bettingEndsAt(round);
  return endsAt == null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export const DEFAULT_GOAL_TARGET = 5000;

// Where a challenge goal is right now. A vote whose countdown has run out is
// 'decided' - the result is read straight from the votes, nothing more is
// written.
export function goalPhase(goal, now) {
  if (goal.status !== 'voting') return goal.status;
  if (goal.votingOpenedAtMs == null) return 'voting';
  return now < goal.votingOpenedAtMs + goal.votingMs ? 'voting' : 'decided';
}

// Votes per option.
export function tallyChallengeVotes(options, donations) {
  const counts = options.map(() => 0);
  for (const { vote } of donations) {
    if (Number.isInteger(vote) && vote >= 0 && vote < counts.length) counts[vote] += 1;
  }
  return counts;
}

// The winning option's index, or the tied indexes (the streamer picks between
// them), or nothing when nobody voted.
export function challengeResult(counts) {
  const top = Math.max(0, ...counts);
  if (top === 0) return { none: true };
  const leaders = counts.flatMap((c, i) => (c === top ? [i] : []));
  return leaders.length === 1 ? { winner: leaders[0] } : { tied: leaders };
}

// The video ID out of any of the usual YouTube links (watch, youtu.be, live,
// shorts, embed), or a bare 11-character ID. null if it isn't one.
export function parseYouTubeId(input) {
  const text = (input || '').trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, kind, rest] = url.pathname.split('/');
    if (kind === 'watch') id = url.searchParams.get('v');
    else if (['live', 'shorts', 'embed'].includes(kind)) id = rest;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

// Gems and number of bettors on each side of a round.
export function tallyBets(bets, sides = ROUND_KINDS.outcome.sides) {
  const totals = Object.fromEntries(sides.map((side) => [side, { gems: 0, bettors: 0 }]));
  for (const { side, amount } of bets) {
    if (!totals[side]) continue;
    totals[side].gems += amount || 0;
    totals[side].bettors += 1;
  }
  return totals;
}

// Whole-number percentages for display; 0 across the board with nothing in.
export function percentOf(part, total) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function formatGems(n) {
  return (n || 0).toLocaleString('en-US');
}
