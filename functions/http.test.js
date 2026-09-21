const test = require('node:test');
const assert = require('node:assert');
const { fetchWithRetry, fetchTransientRetry } = require('./http');

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

const status = (n) => ({ status: n, ok: n < 400 });

test('a transient failure is retried with growing pauses, then succeeds', async () => {
  const responses = [status(503), status(429), status(200)];
  const waits = [];
  const res = await fetchTransientRetry('u', {}, { fetchImpl: async () => responses.shift(), sleepImpl: async (ms) => waits.push(ms) });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(waits, [500, 1000]);
});

test('an ordinary error status (like not found) is returned at once, not retried', async () => {
  let calls = 0;
  const res = await fetchTransientRetry('u', {}, { fetchImpl: async () => { calls++; return status(404); }, sleepImpl: async () => {} });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(calls, 1);
});

test('gives back the last response if it never comes good', async () => {
  let calls = 0;
  const res = await fetchTransientRetry('u', {}, { fetchImpl: async () => { calls++; return status(503); }, sleepImpl: async () => {} });
  assert.strictEqual(res.status, 503);
  assert.strictEqual(calls, 3);
});

test('a network error is retried, and thrown only when every attempt failed', async () => {
  const outcomes = [new Error('reset'), status(200)];
  const res = await fetchTransientRetry('u', {}, { fetchImpl: async () => { const o = outcomes.shift(); if (o instanceof Error) throw o; return o; }, sleepImpl: async () => {} });
  assert.strictEqual(res.status, 200);
  await assert.rejects(fetchTransientRetry('u', {}, { fetchImpl: async () => { throw new Error('down'); }, sleepImpl: async () => {} }), /down/);
});

test('every attempt is given a time limit', async () => {
  let signal;
  await fetchTransientRetry('u', {}, { fetchImpl: async (u, o) => { signal = o.signal; return status(200); } });
  assert.ok(signal instanceof AbortSignal);
});
