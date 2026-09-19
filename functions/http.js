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

module.exports = { fetchWithRetry };
