// Extra lives: the streamer plays a run with a number of lives, loses one
// each time an attack isn't a 6-star, and viewers pool Gold to buy another.
// Each life bought multiplies the price of the next. Pure helpers - the Cloud
// Functions in index.js apply them.

const MAX_LIVES = 99;

// Whether a settled betting round's result costs a life: the attack wasn't a
// 6-star. That's "fail" on a succeed/fail round, or anything under 6 on an
// exact-stars round. A cancelled round costs nothing.
function attackCostsLife(kind, result) {
  if (kind === 'stars') return result !== '6' && result !== 'cancel';
  return result === 'fail';
}

// A run after a failed attack: one life fewer, never below zero.
function loseLife(run) {
  return { lives: Math.max(0, run.lives - 1) };
}

// What the life after this one will cost: the current price times the run's
// multiplier (2 doubles it: 500,000, then 1,000,000, 2,000,000), as whole Gold.
function nextPrice(run) {
  return Math.round(run.price * run.priceMultiplier);
}

// A run after its goal has just been filled: one more life, the bar back to
// empty, and the next life at the multiplied price.
function buyLife(run) {
  return {
    lives: Math.min(MAX_LIVES, run.lives + 1),
    bought: run.bought + 1,
    raised: 0,
    price: nextPrice(run),
  };
}

module.exports = { MAX_LIVES, attackCostsLife, loseLife, nextPrice, buyLife };
