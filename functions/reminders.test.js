const test = require('node:test');
const assert = require('node:assert');
const { dueReminders, readyUpDeadline, TIMEOUT_MS, READY_UP_MIN_WINDOW_MS } = require('./reminders');

const H = 60 * 60 * 1000;
// A day that opened at 12:00 PM Central; it ends 24h later, at the next 12:00 PM.
const base = { player1: 'A', player2: 'B', status: 'pending', unlockAt: Date.parse('2026-09-19T17:00:00Z') };
const DAY = 24 * H;
const keys = (m, now) => dueReminders(m, now).map((r) => `${r.key}:${r.recipients.join('+')}`);

test('nothing before the round unlocks', () => {
  assert.deepStrictEqual(keys(base, base.unlockAt - 1), []);
});

test('unlock ping goes to both players once the round opens', () => {
  assert.deepStrictEqual(keys(base, base.unlockAt + 60_000), ['unlock:A+B']);
});

test('unlock ping is skipped for a round that unlocked long ago', () => {
  assert.deepStrictEqual(keys(base, base.unlockAt + 3 * H), []);
});

test('unlock ping is not repeated and skips a player already ready', () => {
  assert.deepStrictEqual(keys({ ...base, remindersSent: { unlock: true } }, base.unlockAt + 60_000), []);
  assert.deepStrictEqual(keys({ ...base, player1Ready: true }, base.unlockAt + 60_000), ['unlock:B']);
});

test('nudge at 12h only if nobody has readied up', () => {
  assert.deepStrictEqual(keys(base, base.unlockAt + 12 * H), ['nudge:A+B']);
  assert.deepStrictEqual(keys({ ...base, player1Ready: true, player1ReadyTime: base.unlockAt + H }, base.unlockAt + 12 * H), []);
});

test('waiting on a slow opponent: warn them 4h before the day ends', () => {
  const m = { ...base, player1Ready: true, player1ReadyTime: base.unlockAt + H };
  const deadline = base.unlockAt + DAY; // the day's end, not 16h after they readied
  assert.strictEqual(readyUpDeadline(m, m.player1ReadyTime), deadline);
  assert.deepStrictEqual(keys(m, deadline - 5 * H), []);
  assert.deepStrictEqual(keys(m, deadline - 3 * H), ['deadline_ready:B']);
  assert.deepStrictEqual(keys(m, deadline + 1), []);
});

test('an opponent readying up early does not start a shorter clock for the other player', () => {
  const readyAt = base.unlockAt + 2 * H;
  const deadline = readyUpDeadline(base, readyAt);
  // The old rule forfeited them 16h after this; the day is still running then.
  assert.ok(deadline > readyAt + TIMEOUT_MS, 'still open 16h after the opponent readied');
  assert.strictEqual(deadline, base.unlockAt + DAY);
});

test('readying up at the very end of the day still leaves the other player a fair window', () => {
  const readyAt = base.unlockAt + DAY - H; // an hour before the day ends
  assert.strictEqual(readyUpDeadline(base, readyAt), readyAt + READY_UP_MIN_WINDOW_MS);
  // And after the day has already ended (a match that overran):
  const late = base.unlockAt + DAY + 5 * H;
  assert.strictEqual(readyUpDeadline(base, late), late + READY_UP_MIN_WINDOW_MS);
});

test('matches from before days were tracked keep the old 16h clock', () => {
  const readyAt = base.unlockAt + 2 * H;
  assert.strictEqual(readyUpDeadline({ ...base, unlockAt: undefined }, readyAt), readyAt + TIMEOUT_MS);
});

test('report warning only goes to whoever has not reported', () => {
  const m = { ...base, status: 'waiting_for_opponent', player1Ready: true, player2Ready: true, scheduledStartTime: 5_000_000_000_000, winner1Vote: 'A' };
  const deadline = m.scheduledStartTime + TIMEOUT_MS;
  assert.deepStrictEqual(keys(m, deadline - 5 * H), []);
  assert.deepStrictEqual(keys(m, deadline - 3 * H), ['deadline_report:B']);
  assert.deepStrictEqual(keys({ ...m, remindersSent: { deadline_report: true } }, deadline - 3 * H), []);
});

test('finished, disputed and BYE matches never get reminders', () => {
  const now = base.unlockAt + 60_000;
  assert.deepStrictEqual(keys({ ...base, status: 'completed' }, now), []);
  assert.deepStrictEqual(keys({ ...base, status: 'disputed' }, now), []);
  assert.deepStrictEqual(keys({ ...base, player2: 'BYE' }, now), []);
});

test('every reminder carries a specific prompt for the link back to the site', () => {
  const ready = dueReminders(base, base.unlockAt + 60_000)[0];
  assert.strictEqual(ready.linkLabel, 'Open Builder League to ready up');
  const m = { ...base, status: 'waiting_for_opponent', player1Ready: true, player2Ready: true, scheduledStartTime: 5_000_000_000_000, winner1Vote: 'A' };
  assert.strictEqual(dueReminders(m, m.scheduledStartTime + TIMEOUT_MS - 3 * H)[0].linkLabel, 'Open Builder League to report your result');
});
