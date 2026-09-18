const test = require('node:test');
const assert = require('node:assert');
const { dueReminders, TIMEOUT_MS } = require('./reminders');

const H = 60 * 60 * 1000;
const base = { player1: 'A', player2: 'B', status: 'pending', unlockAt: 1_000_000_000_000 };
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

test('waiting on a slow opponent: warn them 4h before the forfeit', () => {
  const m = { ...base, player1Ready: true, player1ReadyTime: base.unlockAt + H };
  const deadline = m.player1ReadyTime + TIMEOUT_MS;
  assert.deepStrictEqual(keys(m, deadline - 5 * H), []);
  assert.deepStrictEqual(keys(m, deadline - 3 * H), ['deadline_ready:B']);
  assert.deepStrictEqual(keys(m, deadline + 1), []);
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
