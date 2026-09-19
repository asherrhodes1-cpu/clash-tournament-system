const test = require('node:test');
const assert = require('node:assert');
const { nextRoundUnlockAt, dayEndsAt, dayEndOnOrAfter } = require('./schedule');

const utc = (iso) => Date.parse(iso);
const H = 3600_000;

// Days end at 11:00 AM Central. September is daylight time (CDT, UTC-5), so
// that's 16:00 UTC; December is standard time (CST, UTC-6), so 17:00 UTC.
test('finds the first day-end (11:00 AM Central) at or after an instant', () => {
  assert.strictEqual(dayEndOnOrAfter(utc('2026-09-19T14:00:00Z')), utc('2026-09-19T16:00:00Z')); // 9am -> that day's end
  assert.strictEqual(dayEndOnOrAfter(utc('2026-09-19T16:00:00Z')), utc('2026-09-19T16:00:00Z')); // exactly on it stays
  assert.strictEqual(dayEndOnOrAfter(utc('2026-09-19T16:00:01Z')), utc('2026-09-20T16:00:00Z')); // just past -> next day
  assert.strictEqual(dayEndOnOrAfter(utc('2026-12-01T05:00:00Z')), utc('2026-12-01T17:00:00Z')); // winter is UTC-6
});

test('a day that opened at a day-end ends at the next one', () => {
  assert.strictEqual(dayEndsAt(utc('2026-09-19T16:00:00Z')), utc('2026-09-20T16:00:00Z'));
});

test('day one is never shorter than 12 hours', () => {
  // Starting at 10:30am Central: the day-end is half an hour away, so it runs to the next one.
  assert.strictEqual(dayEndsAt(utc('2026-09-19T15:30:00Z')), utc('2026-09-20T16:00:00Z'));
  // Starting at 10pm Central: the next day-end is 13h away, which is fine.
  assert.strictEqual(dayEndsAt(utc('2026-09-20T03:00:00Z')), utc('2026-09-20T16:00:00Z'));
});

test('a clock change makes that day 25 or 23 hours, not 24', () => {
  // Daylight saving ends 1 Nov 2026: Oct 31 11am is CDT, Nov 1 11am is CST.
  const oct31 = utc('2026-10-31T16:00:00Z');
  const end = dayEndsAt(oct31);
  assert.strictEqual(end, utc('2026-11-01T17:00:00Z'));
  assert.strictEqual((end - oct31) / H, 25);
  // Daylight saving starts 8 Mar 2026: Mar 7 11am is CST, Mar 8 11am is CDT.
  const mar7 = utc('2026-03-07T17:00:00Z');
  assert.strictEqual((dayEndsAt(mar7) - mar7) / H, 23);
});

test('round finished early: the next day opens at the day-end, not 24h after finishing', () => {
  const dayOpened = utc('2026-09-19T16:00:00Z');
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: dayOpened }], dayOpened + 2 * H), utc('2026-09-20T16:00:00Z'));
});

test('days chain day-end to day-end', () => {
  const d1 = utc('2026-09-19T16:00:00Z');
  const d2 = utc('2026-09-20T16:00:00Z');
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: d1 }, { unlockAt: d2 }], d2 + 3 * H), utc('2026-09-21T16:00:00Z'));
});

test('a tournament started at a random time gets a first day that ends at the next day-end', () => {
  const started = utc('2026-09-19T20:20:00Z'); // 3:20pm Central
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: started }], started + 6 * H), utc('2026-09-20T16:00:00Z'));
});

test('round overran its day: the next one opens immediately, and days re-align after', () => {
  const dayOpened = utc('2026-09-19T16:00:00Z');
  const late = utc('2026-09-20T22:00:00Z'); // 5pm the next day, past that day's end
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: dayOpened }], late), late);
  // Opened at 5pm, so it ends at the next day-end (18h later) and every day after is day-end to day-end.
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: dayOpened }, { unlockAt: late }], late + H), utc('2026-09-21T16:00:00Z'));
});

test('legacy matches with no unlockAt fall back to the next day-end at least 12h away', () => {
  const now = utc('2026-09-19T20:00:00Z');
  assert.strictEqual(nextRoundUnlockAt([{}], now), utc('2026-09-20T16:00:00Z'));
});
