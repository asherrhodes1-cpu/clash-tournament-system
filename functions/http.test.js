const test = require('node:test');
const assert = require('node:assert');
const { fetchWithRetry } = require('./http');

const limited = (retryAfter) => ({ status: 429, json: async () => ({ retry_after: retryAfter }) });
const ok = { status: 200 };

test('returns a normal response straight away', async () => {
  let calls = 0;
  const res = await fetchWithRetry('u', {}, { fetchImpl: async () => { calls++; return ok; }, sleepImpl: async () => {} });
  assert.strictEqual(res, ok);
  assert.strictEqual(calls, 1);
});

test('waits for retry_after on a 429 and tries again', async () => {
  const responses = [limited(0.9), ok];
  const waits = [];
  const res = await fetchWithRetry('u', {}, { fetchImpl: async () => responses.shift(), sleepImpl: async (ms) => waits.push(ms) });
  assert.strictEqual(res, ok);
  assert.deepStrictEqual(waits, [1000]);
});

test('gives up after the retry limit and returns the 429', async () => {
  let calls = 0;
  const res = await fetchWithRetry('u', {}, { fetchImpl: async () => { calls++; return limited(0.1); }, sleepImpl: async () => {}, maxRetries: 2 });
  assert.strictEqual(res.status, 429);
  assert.strictEqual(calls, 3);
});

test('never waits longer than the cap, and copes with an unreadable 429 body', async () => {
  const waits = [];
  const responses = [limited(60), { status: 429, json: async () => { throw new Error('bad json'); } }, ok];
  await fetchWithRetry('u', {}, { fetchImpl: async () => responses.shift(), sleepImpl: async (ms) => waits.push(ms), maxWaitMs: 3000 });
  assert.deepStrictEqual(waits, [3000, 1100]);
});
