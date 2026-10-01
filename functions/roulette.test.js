const test = require('node:test');
const assert = require('node:assert');
const { POCKET_COUNT, POCKETS, PAYOUTS, checkSpin, spinPayout } = require('./roulette');

test('the wheel is laid out like European roulette: 18 elixir, 18 gold, 1 gem', () => {
  assert.strictEqual(POCKET_COUNT, 37);
  assert.strictEqual(POCKETS.filter((p) => p === 'elixir').length, 18);
  assert.strictEqual(POCKETS.filter((p) => p === 'gold').length, 18);
  assert.deepStrictEqual(POCKETS.slice(0, 4), ['gem', 'elixir', 'gold', 'elixir']);
  // Colours alternate all the way round - never two of the same side by side.
  for (let i = 2; i < POCKET_COUNT; i++) assert.notStrictEqual(POCKETS[i], POCKETS[i - 1]);
});

test('every bet returns 36/37 on average, like the real thing', () => {
  for (const pick of Object.keys(PAYOUTS)) {
    const hits = POCKETS.filter((p) => p === pick).length;
    assert.ok(Math.abs((hits / POCKET_COUNT) * PAYOUTS[pick] - 36 / 37) < 1e-9, pick);
  }
});

test('a spin needs a real pick, a whole affordable stake, and the cooldown over', () => {
  const ok = { balance: 100, pick: 'gold', amount: 50, lastSpinAt: 0, now: 10_000 };
  assert.doesNotThrow(() => checkSpin(ok));
  assert.doesNotThrow(() => checkSpin({ ...ok, pick: 'gem' }));
  assert.throws(() => checkSpin({ ...ok, pick: 'red' }), /Elixir, Gold or Gem/);
  assert.throws(() => checkSpin({ ...ok, pick: 'toString' }), /Elixir, Gold or Gem/);
  assert.throws(() => checkSpin({ ...ok, amount: 0 }), /at least 1/);
  assert.throws(() => checkSpin({ ...ok, amount: 2.5 }), /at least 1/);
  assert.throws(() => checkSpin({ ...ok, amount: 101 }), /only have 100/);
  assert.throws(() => checkSpin({ ...ok, lastSpinAt: 8_000 }), /still spinning/);
});

test('a right colour pays double, the gem pays 36x, a miss pays nothing', () => {
  assert.strictEqual(spinPayout('elixir', 1, 100), 200);
  assert.strictEqual(spinPayout('gold', 2, 100), 200);
  assert.strictEqual(spinPayout('gem', 0, 10), 360);
  assert.strictEqual(spinPayout('gold', 1, 100), 0);
  assert.strictEqual(spinPayout('elixir', 0, 100), 0);
});
