const test = require('node:test');
const assert = require('node:assert');
const { nextRoundUnlockAt, dayEndsAt, noonCentralOnOrAfter } = require('./schedule');

const utc = (iso) => Date.parse(iso);
const H = 3600_000;

// September is daylight time (CDT, UTC-5): noon Central is 17:00 UTC.
// December is standard time (CST, UTC-6): noon Central is 18:00 UTC.
test('finds the first noon Central at or after an instant', () => {
  assert.strictEqual(noonCentralOnOrAfter(utc('2026-09-19T15:00:00Z')), utc('2026-09-19T17:00:00Z')); // 10am -> that noon
  assert.strictEqual(noonCentralOnOrAfter(utc('2026-09-19T17:00:00Z')), utc('2026-09-19T17:00:00Z')); // exactly noon stays
  assert.strictEqual(noonCentralOnOrAfter(utc('2026-09-19T17:00:01Z')), utc('2026-09-20T17:00:00Z')); // just past -> next day
  assert.strictEqual(noonCentralOnOrAfter(utc('2026-12-01T05:00:00Z')), utc('2026-12-01T18:00:00Z')); // winter is UTC-6
});

test('a day that opened at noon ends at the next noon', () => {
  assert.strictEqual(dayEndsAt(utc('2026-09-19T17:00:00Z')), utc('2026-09-20T17:00:00Z'));
});

test('day one is never shorter than 12 hours', () => {
  // Starting at 11:30am Central: noon is half an hour away, so it runs to the next noon.
  const start = utc('2026-09-19T16:30:00Z');
  assert.strictEqual(dayEndsAt(start), utc('2026-09-20T17:00:00Z'));
  // Starting at 11pm Central: next noon is 13h away, which is fine.
  assert.strictEqual(dayEndsAt(utc('2026-09-20T04:00:00Z')), utc('2026-09-20T17:00:00Z'));
});

test('a clock change makes that day 25 or 23 hours, not 24', () => {
  // Daylight saving ends 1 Nov 2026: Oct 31 noon is CDT, Nov 1 noon is CST.
  const oct31Noon = utc('2026-10-31T17:00:00Z');
  const end = dayEndsAt(oct31Noon);
  assert.strictEqual(end, utc('2026-11-01T18:00:00Z'));
  assert.strictEqual((end - oct31Noon) / H, 25);
  // Daylight saving starts 8 Mar 2026: Mar 7 noon is CST, Mar 8 noon is CDT.
  const mar7Noon = utc('2026-03-07T18:00:00Z');
  assert.strictEqual((dayEndsAt(mar7Noon) - mar7Noon) / H, 23);
});

test('round finished early: the next day opens at noon, not 24h after finishing', () => {
  const dayOpened = utc('2026-09-19T17:00:00Z');
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: dayOpened }], dayOpened + 2 * H), utc('2026-09-20T17:00:00Z'));
});

test('days chain noon to noon', () => {
  const d1 = utc('2026-09-19T17:00:00Z');
  const d2 = utc('2026-09-20T17:00:00Z');
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: d1 }, { unlockAt: d2 }], d2 + 3 * H), utc('2026-09-21T17:00:00Z'));
});

test('a tournament started at a random time gets a first day that ends at the next noon', () => {
  const started = utc('2026-09-19T20:20:00Z'); // 3:20pm Central
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: started }], started + 6 * H), utc('2026-09-20T17:00:00Z'));
});

test('round overran its day: the next one opens immediately, and days re-align after', () => {
  const dayOpened = utc('2026-09-19T17:00:00Z');
  const late = utc('2026-09-20T22:00:00Z'); // 5pm the next day, past the noon end
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: dayOpened }], late), late);
  // Opened at 5pm, so it ends at the next noon (19h later) and every day after is noon to noon.
  assert.strictEqual(nextRoundUnlockAt([{ unlockAt: dayOpened }, { unlockAt: late }], late + H), utc('2026-09-21T17:00:00Z'));
});

test('legacy matches with no unlockAt fall back to the next noon at least 12h away', () => {
  const now = utc('2026-09-19T20:00:00Z');
  assert.strictEqual(nextRoundUnlockAt([{}], now), utc('2026-09-20T17:00:00Z'));
});
