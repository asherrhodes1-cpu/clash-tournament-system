const test = require('node:test');
const assert = require('node:assert');
const { attackCostsLife, loseLife, nextPrice, buyLife, MAX_LIVES } = require('./lives');

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

test('buying a life adds one, empties the bar and multiplies the price', () => {
  const run = { lives: 2, bought: 0, raised: 100000, price: 100000, priceMultiplier: 2.5 };
  const once = buyLife(run);
  assert.deepStrictEqual(once, { lives: 3, bought: 1, raised: 0, price: 250000 });
  assert.deepStrictEqual(buyLife({ ...run, ...once }), { lives: 4, bought: 2, raised: 0, price: 625000 });
});

test('prices stay whole Gold, and a multiplier of 2 is plain doubling', () => {
  assert.strictEqual(nextPrice({ price: 625000, priceMultiplier: 2.5 }), 1562500);
  assert.strictEqual(nextPrice({ price: 333, priceMultiplier: 2.5 }), 833);
  assert.strictEqual(nextPrice({ price: 100000, priceMultiplier: 2 }), 200000);
});

test('a life bought at zero lives brings the run back', () => {
  assert.strictEqual(buyLife({ lives: 0, bought: 3, raised: 100, price: 100, priceMultiplier: 1 }).lives, 1);
});

test('lives are capped, and a multiplier of 1 keeps the price flat', () => {
  const run = { lives: MAX_LIVES, bought: 0, raised: 100, price: 100, priceMultiplier: 1 };
  assert.strictEqual(buyLife(run).lives, MAX_LIVES);
  assert.strictEqual(buyLife(run).price, 100);
});
