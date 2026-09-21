// fetch that waits and retries when Discord says "you are being rate limited"
// (HTTP 429). A tournament start sends dozens of messages at once, and Discord
// rejects the overflow with a retry_after; without a retry those notifications
// were simply lost.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, options, { fetchImpl = fetch, maxRetries = 4, maxWaitMs = 5000, sleepImpl = sleep } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchImpl(url, options);
    if (res.status !== 429 || attempt >= maxRetries) return res;
    let retryAfter = 1;
    try {
      const info = await res.json();
      if (typeof info.retry_after === 'number') retryAfter = info.retry_after;
    } catch (err) { /* keep the 1s default */ }
    // A little extra so we land just after the window reopens, not on it.
    await sleepImpl(Math.min(Math.ceil(retryAfter * 1000) + 100, maxWaitMs));
  }
}

// For the Clash of Clans relay: gives each attempt a time limit (so a hung
// relay fails fast instead of running out the platform's whole request
// timeout) and retries a few times, with growing pauses, on a network error or
// a status that usually means "try again" (rate limited, bad gateway, service
// unavailable, gateway timeout). Returns the last response if it never comes
// good, and only throws if every attempt failed at the network level.
const TRANSIENT_STATUSES = [429, 500, 502, 503, 504];

async function fetchTransientRetry(url, options, {
  fetchImpl = fetch, attempts = 3, timeoutMs = 15000, baseDelayMs = 500, sleepImpl = sleep, statuses = TRANSIENT_STATUSES,
} = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const last = attempt === attempts - 1;
    try {
      const res = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
      if (!statuses.includes(res.status) || last) return res;
    } catch (err) {
      lastError = err;
      if (last) throw err;
    }
    await sleepImpl(baseDelayMs * 2 ** attempt);
  }
  throw lastError;
}

module.exports = { fetchWithRetry, fetchTransientRetry, TRANSIENT_STATUSES };
