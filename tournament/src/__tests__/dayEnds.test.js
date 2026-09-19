import { dayEndsAt, dayEndOnOrAfter } from '../utils';

const utc = (iso) => Date.parse(iso);
const H = 3600_000;

// Same cases as functions/schedule.test.js - the two copies must agree.
// Days end at 11:00 AM Central: 16:00 UTC in summer, 17:00 UTC in winter.
test('finds the first day-end at or after an instant', () => {
  expect(dayEndOnOrAfter(utc('2026-09-19T14:00:00Z'))).toBe(utc('2026-09-19T16:00:00Z'));
  expect(dayEndOnOrAfter(utc('2026-09-19T16:00:00Z'))).toBe(utc('2026-09-19T16:00:00Z'));
  expect(dayEndOnOrAfter(utc('2026-09-19T16:00:01Z'))).toBe(utc('2026-09-20T16:00:00Z'));
  expect(dayEndOnOrAfter(utc('2026-12-01T05:00:00Z'))).toBe(utc('2026-12-01T17:00:00Z'));
});

test('a day that opened at a day-end ends at the next one; day one is at least 12 hours', () => {
  expect(dayEndsAt(utc('2026-09-19T16:00:00Z'))).toBe(utc('2026-09-20T16:00:00Z'));
  expect(dayEndsAt(utc('2026-09-19T15:30:00Z'))).toBe(utc('2026-09-20T16:00:00Z'));
  expect(dayEndsAt(utc('2026-09-20T03:00:00Z'))).toBe(utc('2026-09-20T16:00:00Z'));
});

test('clock changes make a day 25 or 23 hours', () => {
  const oct31 = utc('2026-10-31T16:00:00Z');
  expect((dayEndsAt(oct31) - oct31) / H).toBe(25);
  const mar7 = utc('2026-03-07T17:00:00Z');
  expect((dayEndsAt(mar7) - mar7) / H).toBe(23);
});
