// Gem drops: staff hand out free gems on stream. For a short window anyone
// logged in can claim the drop once; claimGemDrop in index.js applies this.

// A drop can be claimed from when it opened until its countdown runs out,
// checked on the server clock.
function dropIsOpen(drop, now) {
  return drop.openedAtMs != null && now >= drop.openedAtMs && now < drop.openedAtMs + drop.durationMs;
}

module.exports = { dropIsOpen };
