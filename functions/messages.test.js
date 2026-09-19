const test = require('node:test');
const assert = require('node:assert');
const { newOpponentMessage, chatMessage } = require('./messages');

const NOW = 1_000_000_000_000;
const match = { player1: 'Ana', player2: 'Bo', round: 2, unlockAt: NOW - 1000 };

test('the new-opponent DM names the opponent from each player\'s point of view', () => {
  assert.match(newOpponentMessage(match, 'Ana', NOW).text, /New opponent:\*\* you're up against \*\*Bo\*\* in Day 2/);
  assert.match(newOpponentMessage(match, 'Bo', NOW).text, /you're up against \*\*Ana\*\*/);
});

test('it says chat messages will arrive as DMs from the bot', () => {
  assert.match(newOpponentMessage(match, 'Ana', NOW).text, /Anything \*\*Bo\*\* writes in your match chat will be sent to you here as a DM/);
});

test('open matches prompt to ready up, future ones say when they open', () => {
  const open = newOpponentMessage(match, 'Ana', NOW);
  assert.match(open.text, /ready up/);
  assert.strictEqual(open.linkLabel, 'Open Rainbow League to ready up');
  const later = newOpponentMessage({ ...match, unlockAt: NOW + 86_400_000 }, 'Ana', NOW);
  assert.match(later.text, /opens <t:\d+:R>/);
  assert.strictEqual(later.linkLabel, 'Open Rainbow League');
});

test('a chat relay names the sender and day, and says to reply on the site', () => {
  const m = chatMessage(match, 'Bo', 'gg, ready when you are');
  assert.match(m.text, /\*\*Bo\*\* \(your Day 2 opponent\) wrote:\n> gg, ready when you are/);
  assert.match(m.text, /Replying here won't reach them\. Reply in your match chat on the site\./);
  assert.strictEqual(m.linkLabel, 'Open Rainbow League to reply');
});

test('long and multi-line messages are trimmed and quoted line by line', () => {
  const m = chatMessage(match, 'Bo', 'line one\nline two');
  assert.match(m.text, /> line one\n> line two/);
  assert.match(chatMessage(match, 'Bo', 'x'.repeat(300)).text, /x{200}\.\.\./);
});

test('day prefers the explicit day field over round', () => {
  assert.match(chatMessage({ ...match, day: 5 }, 'Bo', 'hi').text, /Day 5 opponent/);
});
