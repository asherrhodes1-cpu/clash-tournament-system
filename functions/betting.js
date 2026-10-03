// Live-stream betting with a pretend currency, Gold (stored as `gems`, its
// original name, in gemBalances - players already hold balances there).
// Viewers bet on how the streamer's attack goes; balances only ever change
// in the Cloud Functions that use these helpers, never from the client.

const STARTING_GEMS = 1000;
// A player with no gems can still pick a side for free, and wins this much
// if they're right, so being broke never locks anyone out.
const FREE_PICK_REWARD = 50;

// The kinds of round, each with the sides you can bet on and what a right
// bet pays back (as a multiple of the stake). Rounds from before `kind`
// existed are 'outcome'. Keep in step with tournament/src/live/liveUtils.js.
const ROUND_KINDS = {
  // Will I 6-star it? Even money.
  outcome: {
    sides: ['succeed', 'fail'],
    multipliers: { succeed: 2, fail: 2 },
  },
  // Exactly how many stars (Builder Base tops out at 6); rarer results pay more.
  stars: {
    sides: ['0', '1', '2', '3', '4', '5', '6'],
    multipliers: { 6: 2, 5: 3, 4: 4, 3: 5, 2: 6, 1: 8, 0: 10 },
  },
};

function kindOf(round) {
  return ROUND_KINDS[round.kind] ? round.kind : 'outcome';
}

// Works out a new or changed bet. `balance` is the player's current gems
// (their gems already on this round are held separately in existingAmount,
// since changing a bet refunds the old one first). Returns the new bet and
// balance, or throws an Error whose message is safe to show the player.
function planBet({ balance, existingAmount = 0, side, amount, sides = ROUND_KINDS.outcome.sides }) {
  if (!sides.includes(side)) throw new Error('Pick one of the options');
  if (!Number.isInteger(amount) || amount < 0) throw new Error('Bet a whole number of Gold');
  // What they could stake: their balance plus what's already on this round.
  // It can be below zero - an undone payout they'd already spent - in which
  // case there's nothing to stake, but a free pick is still allowed.
  const available = balance + existingAmount;
  const spendable = Math.max(0, available);
  if (amount > spendable) throw new Error(`You only have ${spendable} Gold`);
  if (amount === 0 && spendable > 0) throw new Error('Bet at least 1 Gold');
  return { bet: { side, amount }, balance: available - amount };
}

// Rounds with a countdown (bettingMs) stop taking bets once it runs out,
// checked here against the server clock rather than trusting the browser.
// openedAtMs is when betting (re)opened; rounds without bettingMs stay open
// until staff close them.
function bettingIsOpen(round, now) {
  if (round.status !== 'open') return false;
  if (!round.bettingMs) return true;
  return round.openedAtMs != null && now < round.openedAtMs + round.bettingMs;
}

// What a settled bet pays back: the stake times that side's multiplier when
// right, the free-pick reward for a right 0-gem pick, else 0.
function payoutFor(bet, result, multipliers = ROUND_KINDS.outcome.multipliers) {
  if (bet.side !== result) return 0;
  return bet.amount > 0 ? Math.floor(bet.amount * multipliers[result]) : FREE_PICK_REWARD;
}

module.exports = { STARTING_GEMS, FREE_PICK_REWARD, ROUND_KINDS, kindOf, planBet, payoutFor, bettingIsOpen };
