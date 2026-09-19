import { dayEndsAt, noonCentralOnOrAfter } from '../utils';

const utc = (iso) => Date.parse(iso);
const H = 3600_000;

// Same cases as functions/schedule.test.js - the two copies must agree.
test('finds the first noon Central at or after an instant', () => {
  expect(noonCentralOnOrAfter(utc('2026-09-19T15:00:00Z'))).toBe(utc('2026-09-19T17:00:00Z'));
  expect(noonCentralOnOrAfter(utc('2026-09-19T17:00:00Z'))).toBe(utc('2026-09-19T17:00:00Z'));
  expect(noonCentralOnOrAfter(utc('2026-09-19T17:00:01Z'))).toBe(utc('2026-09-20T17:00:00Z'));
  expect(noonCentralOnOrAfter(utc('2026-12-01T05:00:00Z'))).toBe(utc('2026-12-01T18:00:00Z'));
});

test('a day that opened at noon ends at the next noon; day one is at least 12 hours', () => {
  expect(dayEndsAt(utc('2026-09-19T17:00:00Z'))).toBe(utc('2026-09-20T17:00:00Z'));
  expect(dayEndsAt(utc('2026-09-19T16:30:00Z'))).toBe(utc('2026-09-20T17:00:00Z'));
  expect(dayEndsAt(utc('2026-09-20T04:00:00Z'))).toBe(utc('2026-09-20T17:00:00Z'));
});

test('clock changes make a day 25 or 23 hours', () => {
  const oct31Noon = utc('2026-10-31T17:00:00Z');
  expect((dayEndsAt(oct31Noon) - oct31Noon) / H).toBe(25);
  const mar7Noon = utc('2026-03-07T18:00:00Z');
  expect((dayEndsAt(mar7Noon) - mar7Noon) / H).toBe(23);
});
