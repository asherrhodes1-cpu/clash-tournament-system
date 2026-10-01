// Gem Roulette: a solo gem game laid out like European roulette. The wheel
// has 37 pockets - 18 Elixir, 18 Gold, alternating, and a single Gem pocket
// (the green zero). The player bets on Elixir, Gold or Gem; like the real
// thing every bet returns 36/37 on average, so the wheel slowly takes gems
// out of circulation. Keep in step with tournament/src/live/liveUtils.js.

const POCKET_COUNT = 37;
// Pocket 0 is the Gem; after it the colours alternate round the wheel.
const POCKETS = Array.from({ length: POCKET_COUNT }, (_, i) => {
  if (i === 0) return 'gem';
  return i % 2 === 1 ? 'elixir' : 'gold';
});

// What a right bet pays back, as a multiple of the stake.
const PAYOUTS = { elixir: 2, gold: 2, gem: 36 };

// One spin every few seconds at most, so a script can't hammer the wheel.
const SPIN_COOLDOWN_MS = 3000;

// Checks a spin before the roll. Throws an Error whose message is safe to show.
function checkSpin({ balance, pick, amount, lastSpinAt = 0, now }) {
  if (!Object.prototype.hasOwnProperty.call(PAYOUTS, pick)) throw new Error('Pick Elixir, Gold or Gem');
  if (!Number.isInteger(amount) || amount < 1) throw new Error('Bet at least 1 gem');
  if (amount > balance) throw new Error(`You only have ${balance} gems`);
  if (now - lastSpinAt < SPIN_COOLDOWN_MS) throw new Error('The wheel is still spinning - try again in a moment');
}

// What a spin pays back once it's landed on `pocket` (an index into POCKETS).
function spinPayout(pick, pocket, amount) {
  return POCKETS[pocket] === pick ? amount * PAYOUTS[pick] : 0;
}

module.exports = { POCKET_COUNT, POCKETS, PAYOUTS, SPIN_COOLDOWN_MS, checkSpin, spinPayout };
