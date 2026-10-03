// Community challenge goals: viewers pool gems toward a target, and once it's
// reached everyone who chipped in votes on a challenge for the streamer's
// next attack. Pure helpers - the Cloud Functions in index.js apply them.

const VOTE_OPTIONS = 3;
const VOTING_MS = 60 * 1000;

// Works out a donation. Only what the goal still needs is taken, so the last
// donor never overpays. Throws an Error whose message is safe to show.
function planDonation({ balance, raised, target, amount }) {
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Donate at least 1 Gold');
  if (amount > balance) throw new Error(`You only have ${Math.max(0, balance)} Gold`);
  const taken = Math.min(amount, target - raised);
  if (taken <= 0) throw new Error('This goal is already full');
  const newRaised = raised + taken;
  return { taken, balance: balance - taken, raised: newRaised, reached: newRaised >= target };
}

// Up to `count` different challenges from the pool, in random order.
// `random` is injectable so tests can make it predictable.
function pickOptions(pool, count = VOTE_OPTIONS, random = Math.random) {
  const copy = [...pool];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, count);
}

// Voting runs for votingMs from votingOpenedAtMs, checked on the server clock.
function votingIsOpen(goal, now) {
  return goal.status === 'voting'
    && goal.votingOpenedAtMs != null
    && now < goal.votingOpenedAtMs + goal.votingMs;
}

module.exports = { VOTE_OPTIONS, VOTING_MS, planDonation, pickOptions, votingIsOpen };
