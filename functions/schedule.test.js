const test = require('node:test');
const assert = require('node:assert');
const { nextRoundUnlockAt, ONE_DAY_MS: DAY } = require('./schedule');

const T0 = 1_000_000_000_000;

test('round finished early: next day opens on the 24h boundary, not 24h after finishing', () => {
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: T0 }], T0 + 2 * 3600_000), T0 + DAY);
});

test('days chain: day 3 opens exactly 24h after day 2 opened', () => {
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: T0 }, { unlockAt: T0 + DAY }], T0 + DAY + 3600_000), T0 + 2 * DAY);
});

test('round overran its window: next day opens immediately', () => {
  const now = T0 + DAY + 5 * 3600_000;
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: T0 }], now), now);
});

test('after an overrun the following day is a full 24h from the late open', () => {
  const lateOpen = T0 + DAY + 5 * 3600_000;
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: T0 }, { unlockAt: lateOpen }], lateOpen + 3600_000), lateOpen + DAY);
});

test('legacy matches with no unlockAt fall back to a fresh 24h', () => {
  assert.strictEqual(nextRoundUnlockAt([{}], T0), T0 + DAY);
});
