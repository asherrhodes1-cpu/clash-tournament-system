const test = require('node:test');
const assert = require('node:assert');
const { planDonation, pickOptions, votingIsOpen } = require('./challenges');

test('a donation moves gems from the donor into the goal', () => {
  assert.deepStrictEqual(planDonation({ balance: 1000, raised: 0, target: 5000, amount: 300 }), {
    taken: 300, balance: 700, raised: 300, reached: false,
  });
});

test('the donation that fills the goal only takes what is still needed', () => {
  assert.deepStrictEqual(planDonation({ balance: 1000, raised: 4800, target: 5000, amount: 1000 }), {
    taken: 200, balance: 800, raised: 5000, reached: true,
  });
});

test('donations must be whole, affordable, and into a goal that still needs gems', () => {
  assert.throws(() => planDonation({ balance: 100, raised: 0, target: 500, amount: 0 }), /at least 1/);
  assert.throws(() => planDonation({ balance: 100, raised: 0, target: 500, amount: 2.5 }), /at least 1/);
  assert.throws(() => planDonation({ balance: 100, raised: 0, target: 500, amount: 101 }), /only have 100/);
  assert.throws(() => planDonation({ balance: 100, raised: 500, target: 500, amount: 10 }), /already full/);
});

test('vote options are distinct picks from the list, never more than it has', () => {
  const pool = ['No heroes', 'One troop type', 'No spells', 'Blindfolded deploy', 'Half army'];
  const picked = pickOptions(pool, 3);
  assert.strictEqual(picked.length, 3);
  assert.strictEqual(new Set(picked).size, 3);
  picked.forEach((p) => assert.ok(pool.includes(p)));
  assert.deepStrictEqual(pickOptions(['A', 'B'], 3).sort(), ['A', 'B']);
  // With a fixed random source the order is predictable.
  assert.deepStrictEqual(pickOptions(['A', 'B', 'C'], 3, () => 0), ['B', 'C', 'A']);
});

test('voting is open only for its window after it opens', () => {
  const goal = { status: 'voting', votingOpenedAtMs: 1000, votingMs: 60000 };
  assert.strictEqual(votingIsOpen(goal, 1000), true);
  assert.strictEqual(votingIsOpen(goal, 60999), true);
  assert.strictEqual(votingIsOpen(goal, 61000), false);
  assert.strictEqual(votingIsOpen({ ...goal, status: 'collecting' }, 2000), false);
  assert.strictEqual(votingIsOpen({ ...goal, votingOpenedAtMs: null }, 2000), false);
});
