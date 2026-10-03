const test = require('node:test');
const assert = require('node:assert');
const {
  attackCostsLife, loseLife, nextPrice, buyLife, MAX_LIVES, LIFE_WINDOW_MS, windowIsOpen, windowHasExpired,
} = require('./lives');

test('an attack that is not a 6-star costs a life', () => {
  assert.strictEqual(attackCostsLife('outcome', 'fail'), true);
  assert.strictEqual(attackCostsLife('outcome', 'succeed'), false);
  assert.strictEqual(attackCostsLife('stars', '6'), false);
  assert.strictEqual(attackCostsLife('stars', '5'), true);
  assert.strictEqual(attackCostsLife('stars', '0'), true);
});

test('a cancelled round costs nothing', () => {
  assert.strictEqual(attackCostsLife('outcome', 'cancel'), false);
  assert.strictEqual(attackCostsLife('stars', 'cancel'), false);
});

test('losing a life never goes below zero', () => {
  assert.deepStrictEqual(loseLife({ lives: 3 }), { lives: 2 });
  assert.deepStrictEqual(loseLife({ lives: 1 }), { lives: 0 });
  assert.deepStrictEqual(loseLife({ lives: 0 }), { lives: 0 });
});

test('buying a life adds one and multiplies the price', () => {
  const run = { lives: 2, bought: 0, price: 500000, priceMultiplier: 2 };
  const once = buyLife(run);
  assert.deepStrictEqual(once, { lives: 3, bought: 1, price: 1000000 });
  assert.deepStrictEqual(buyLife({ ...run, ...once }), { lives: 4, bought: 2, price: 2000000 });
});

test('prices stay whole Gold, and a multiplier of 2 is plain doubling', () => {
  assert.strictEqual(nextPrice({ price: 625000, priceMultiplier: 2.5 }), 1562500);
  assert.strictEqual(nextPrice({ price: 333, priceMultiplier: 2.5 }), 833);
  assert.strictEqual(nextPrice({ price: 100000, priceMultiplier: 2 }), 200000);
});

test('a life bought at zero lives brings the run back', () => {
  assert.strictEqual(buyLife({ lives: 0, bought: 3, price: 100, priceMultiplier: 1 }).lives, 1);
});

test('lives are capped, and a multiplier of 1 keeps the price flat', () => {
  const run = { lives: MAX_LIVES, bought: 0, price: 100, priceMultiplier: 1 };
  assert.strictEqual(buyLife(run).lives, MAX_LIVES);
  assert.strictEqual(buyLife(run).price, 100);
});

test('a window takes donations for five minutes from when it opened', () => {
  assert.strictEqual(LIFE_WINDOW_MS, 5 * 60 * 1000);
  const window = { state: 'open', openedAtMs: 1000, ms: LIFE_WINDOW_MS };
  assert.strictEqual(windowIsOpen(window, 1000), true);
  assert.strictEqual(windowIsOpen(window, 300999), true);
  assert.strictEqual(windowIsOpen(window, 301000), false);
  assert.strictEqual(windowHasExpired(window, 300999), false);
  assert.strictEqual(windowHasExpired(window, 301000), true);
});

test('no window, an unstamped one, or one being refunded takes no donations', () => {
  assert.strictEqual(windowIsOpen(null, 5000), false);
  assert.strictEqual(windowHasExpired(null, 5000), false);
  assert.strictEqual(windowIsOpen({ state: 'open', openedAtMs: null, ms: 1000 }, 5000), false);
  assert.strictEqual(windowIsOpen({ state: 'refunding', openedAtMs: 1000, ms: LIFE_WINDOW_MS }, 2000), false);
});
