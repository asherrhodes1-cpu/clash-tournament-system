const test = require('node:test');
const assert = require('node:assert');
const { newOpponentMessage, chatMessage, opponentReadyMessage, sentToStaffMessage } = require('./messages');

const NOW = 1_000_000_000_000;
const match = { player1: 'Ana', player2: 'Bo', round: 2, unlockAt: NOW - 1000 };

test('the new-opponent DM names the opponent from each player\'s point of view', () => {
  assert.match(newOpponentMessage(match, 'Ana', NOW).text, /New opponent:\*\* \*\*Bo\*\* \(Day 2\)/);
  assert.match(newOpponentMessage(match, 'Bo', NOW).text, /\*\*Ana\*\* \(Day 2\)/);
});

test('the new-opponent DM is where players are told replies must go through the site', () => {
  const { text } = newOpponentMessage(match, 'Ana', NOW);
  assert.match(text, /chat messages will show up here/);
  assert.match(text, /Replying here won't reach them, so reply in your match chat on the site\./);
});

test('open matches prompt to ready up, future ones say when they open', () => {
  const open = newOpponentMessage(match, 'Ana', NOW);
  assert.match(open.text, /ready up/);
  assert.strictEqual(open.linkLabel, 'Open Rainbow League to ready up');
  const later = newOpponentMessage({ ...match, unlockAt: NOW + 86_400_000 }, 'Ana', NOW);
  assert.match(later.text, /opens <t:\d+:R>/);
  assert.strictEqual(later.linkLabel, 'Open Rainbow League');
});

test('a relayed chat message is just who said what, with no repeated explanation', () => {
  const m = chatMessage('Bo', 'gg, ready when you are');
  assert.strictEqual(m.text, '💬 **Bo:** gg, ready when you are');
  assert.doesNotMatch(m.text, /Replying|won't reach/);
  assert.strictEqual(m.linkLabel, 'Open Rainbow League to reply');
});

test('long messages are trimmed', () => {
  assert.match(chatMessage('Bo', 'x'.repeat(300)).text, /x{200}\.\.\.$/);
  assert.strictEqual(chatMessage('Bo', 'short').text, '💬 **Bo:** short');
});

test('the ready-up ping names who is waiting and when the day ends', () => {
  // A day that opened at 12:00 PM Central ends 24h later.
  const unlockAt = Date.parse('2026-09-19T17:00:00Z');
  const readyAt = unlockAt + 2 * 3600_000;
  const m = opponentReadyMessage({ unlockAt }, 'Bo', readyAt);
  assert.match(m.text, /\*\*Bo\*\* is ready and waiting for you/);
  assert.ok(m.text.includes(`<t:${Math.floor((unlockAt + 24 * 3600_000) / 1000)}:R>`));
  assert.match(m.text, /forfeit/);
  assert.strictEqual(m.linkLabel, 'Open Rainbow League to ready up');
});

test('the staff-review DM says why, from each player\'s point of view', () => {
  const noReport = { player1: 'Ana', player2: 'Bo', status: 'needs_staff_review' };
  assert.match(sentToStaffMessage(noReport, 'Ana').text, /against \*\*Bo\*\* has been sent to staff: neither of you reported a result in time/);
  assert.match(sentToStaffMessage(noReport, 'Bo').text, /against \*\*Ana\*\*/);
  const disputed = { ...noReport, status: 'disputed' };
  assert.match(sentToStaffMessage(disputed, 'Ana').text, /reported different winners/);
});
