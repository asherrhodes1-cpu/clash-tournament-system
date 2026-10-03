// Extra lives: the streamer plays a run with a number of lives, loses one
// each time an attack isn't a 6-star, and viewers pool Gold to buy another.
// Buying is done in timed windows the streamer opens: fill the bar before
// the countdown ends and the run gains a life (and the next one costs more);
// run out of time and everyone gets their Gold back. Pure helpers - the
// Cloud Functions in index.js apply them.

const MAX_LIVES = 99;
// How long viewers have to fill the bar once a window is opened.
const LIFE_WINDOW_MS = 5 * 60 * 1000;

// When a run's window ends (ms), or null if it has no window. `openedAtMs`
// is the server time it was opened.
function windowEndsAt(window) {
  if (!window || window.openedAtMs == null) return null;
  return window.openedAtMs + window.ms;
}

// A window takes donations while it's 'open' and its countdown is running,
// checked on the server clock.
function windowIsOpen(window, now) {
  const endsAt = windowEndsAt(window);
  return !!window && window.state === 'open' && endsAt != null && now < endsAt;
}

// A window whose countdown has run out without the bar being filled.
function windowHasExpired(window, now) {
  const endsAt = windowEndsAt(window);
  return !!window && endsAt != null && now >= endsAt;
}

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

// A run after its bar has just been filled: one more life, and the next
// life at the multiplied price.
function buyLife(run) {
  return {
    lives: Math.min(MAX_LIVES, run.lives + 1),
    bought: run.bought + 1,
    price: nextPrice(run),
  };
}

module.exports = {
  MAX_LIVES, LIFE_WINDOW_MS, attackCostsLife, loseLife, nextPrice, buyLife,
  windowEndsAt, windowIsOpen, windowHasExpired,
};
