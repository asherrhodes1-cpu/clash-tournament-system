const test = require('node:test');
const assert = require('node:assert');
const { dropIsOpen } = require('./drops');

test('a drop can be claimed only during its countdown', () => {
  const drop = { openedAtMs: 10_000, durationMs: 60_000 };
  assert.strictEqual(dropIsOpen(drop, 9_999), false);
  assert.strictEqual(dropIsOpen(drop, 10_000), true);
  assert.strictEqual(dropIsOpen(drop, 69_999), true);
  assert.strictEqual(dropIsOpen(drop, 70_000), false);
  // Timestamp not written yet: closed rather than open forever.
  assert.strictEqual(dropIsOpen({ ...drop, openedAtMs: null }, 20_000), false);
});
