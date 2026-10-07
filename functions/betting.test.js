const test = require('node:test');
const assert = require('node:assert');
const { planBet, payoutFor, bettingIsOpen, kindOf, ROUND_KINDS, FREE_PICK_REWARD } = require('./betting');

test('a new bet comes out of the balance', () => {
  assert.deepStrictEqual(planBet({ balance: 1000, side: 'fail', amount: 300 }), {
    bet: { side: 'fail', amount: 300 },
    balance: 700,
  });
});

test('changing a bet refunds the old stake first', () => {
  // 700 left after a 300 bet; switching to 900 on the other side is allowed.
  assert.deepStrictEqual(planBet({ balance: 700, existingAmount: 300, side: 'succeed', amount: 900 }), {
    bet: { side: 'succeed', amount: 900 },
    balance: 100,
  });
  assert.strictEqual(planBet({ balance: 700, existingAmount: 300, side: 'fail', amount: 1000 }).balance, 0);
});

test('you can not bet more than you have', () => {
  assert.throws(() => planBet({ balance: 100, side: 'fail', amount: 101 }), /only have 100/);
  assert.throws(() => planBet({ balance: 100, existingAmount: 50, side: 'fail', amount: 151 }), /only have 150/);
});

test('only whole, non-negative amounts on a real side', () => {
  assert.throws(() => planBet({ balance: 100, side: 'maybe', amount: 10 }), /one of the options/);
  assert.throws(() => planBet({ balance: 100, side: 'fail', amount: 1.5 }), /whole number/);
  assert.throws(() => planBet({ balance: 100, side: 'fail', amount: -5 }), /whole number/);
  assert.throws(() => planBet({ balance: 100, side: 'fail', amount: '10' }), /whole number/);
});

test('a free pick is only for players with no gems', () => {
  assert.deepStrictEqual(planBet({ balance: 0, side: 'succeed', amount: 0 }), {
    bet: { side: 'succeed', amount: 0 },
    balance: 0,
  });
  assert.throws(() => planBet({ balance: 5, side: 'succeed', amount: 0 }), /at least 1/);
  // Gems already on the round count: pulling them back to 0 isn't a free pick.
  assert.throws(() => planBet({ balance: 0, existingAmount: 20, side: 'fail', amount: 0 }), /at least 1/);
});

test('a right bet pays the multiplier for its side, a wrong one nothing, free picks the small reward', () => {
  // The streamer 6-stars about 90% of the time: backing that pays 1.3x,
  // betting against it pays 10x.
  assert.strictEqual(payoutFor({ side: 'succeed', amount: 1000 }, 'succeed'), 1300);
  assert.strictEqual(payoutFor({ side: 'fail', amount: 250 }, 'fail'), 2500);
  assert.strictEqual(payoutFor({ side: 'fail', amount: 250 }, 'succeed'), 0);
  assert.strictEqual(payoutFor({ side: 'succeed', amount: 0 }, 'succeed'), FREE_PICK_REWARD);
  assert.strictEqual(payoutFor({ side: 'succeed', amount: 0 }, 'fail'), 0);
});

test('6 stars pays the same on both kinds of round', () => {
  assert.strictEqual(ROUND_KINDS.stars.multipliers[6], ROUND_KINDS.outcome.multipliers.succeed);
});

test('a 1.3x payout is always whole Gold, rounded down, never a float slip', () => {
  for (let amount = 1; amount <= 20000; amount++) {
    assert.strictEqual(payoutFor({ side: 'succeed', amount }, 'succeed'), Math.floor((amount * 13) / 10));
  }
  assert.strictEqual(payoutFor({ side: 'succeed', amount: 1_000_000_000 }, 'succeed'), 1_300_000_000);
});

test('a timed round takes bets only until its countdown runs out', () => {
  const round = { status: 'open', openedAtMs: 10_000, bettingMs: 45_000 };
  assert.strictEqual(bettingIsOpen(round, 10_000), true);
  assert.strictEqual(bettingIsOpen(round, 54_999), true);
  assert.strictEqual(bettingIsOpen(round, 55_000), false);
  assert.strictEqual(bettingIsOpen({ ...round, status: 'closed' }, 20_000), false);
  // Timestamp not written yet: treat as closed rather than open forever.
  assert.strictEqual(bettingIsOpen({ ...round, openedAtMs: null }, 20_000), false);
  // No countdown: open until staff close it.
  assert.strictEqual(bettingIsOpen({ status: 'open' }, 999_999_999), true);
});

test('exact-stars rounds take bets on 0 to 6 stars and pay more for rarer counts', () => {
  const { sides, multipliers } = ROUND_KINDS.stars;
  assert.deepStrictEqual(planBet({ balance: 500, side: '4', amount: 100, sides }).bet, { side: '4', amount: 100 });
  assert.throws(() => planBet({ balance: 500, side: '7', amount: 100, sides }), /one of the options/);
  assert.throws(() => planBet({ balance: 500, side: 'succeed', amount: 100, sides }), /one of the options/);
  assert.strictEqual(payoutFor({ side: '6', amount: 100 }, '6', multipliers), 130);
  assert.strictEqual(payoutFor({ side: '0', amount: 100 }, '0', multipliers), 1000);
  assert.strictEqual(payoutFor({ side: '5', amount: 100 }, '6', multipliers), 0);
  assert.strictEqual(payoutFor({ side: '3', amount: 0 }, '3', multipliers), FREE_PICK_REWARD);
});

test('older rounds without a kind are succeed/fail rounds', () => {
  assert.strictEqual(kindOf({}), 'outcome');
  assert.strictEqual(kindOf({ kind: 'stars' }), 'stars');
  assert.strictEqual(kindOf({ kind: 'nonsense' }), 'outcome');
});

test('a player in the red (an undone payout they had spent) can only make a free pick', () => {
  assert.deepStrictEqual(planBet({ balance: -500, side: 'fail', amount: 0 }), {
    bet: { side: 'fail', amount: 0 },
    balance: -500,
  });
  assert.throws(() => planBet({ balance: -500, side: 'fail', amount: 10 }), /only have 0/);
  // Their own stake coming back off the round can still be re-bet.
  assert.strictEqual(planBet({ balance: -100, existingAmount: 300, side: 'fail', amount: 200 }).balance, 0);
});
