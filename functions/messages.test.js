const test = require('node:test');
const assert = require('node:assert');
const { newOpponentMessage, chatMessage } = require('./messages');

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
