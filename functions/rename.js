// Renaming an account. A username isn't just a label here: tournament and
// match docs record players by name (player lists, placements keyed by name,
// brackets, player1/player2, winners, votes), so a rename has to rewrite
// those too. Pure helpers - renameUser in index.js does the Firestore work.

const USERNAME_PATTERN = /^[A-Za-z0-9_.-]+$/;

// The same rules signUp applies. Returns the trimmed name, or throws an
// Error whose message is safe to show.
function checkNewUsername(raw) {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (name.length < 3) throw new Error('Username must be at least 3 characters');
  if (name.length > 30) throw new Error('Username must be 30 characters or fewer');
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error('Username may only contain letters, numbers, underscores, hyphens, and periods');
  }
  return name;
}

// Fields that are never a player's name, even if their text happens to
// match one (a tournament called the same as a player, say).
const NOT_A_NAME = new Set([
  'id', 'tournamentId', 'name', 'description', 'prize', 'status', 'format', 'kind', 'bracket',
  'resolvedReason', 'bannerPath', 'signupDeadline', 'createdAt',
]);

// A copy of `value` with every string equal to `from` - and every map key
// equal to it - replaced by `to`, at any depth. `key` is the field the value
// sits under, so fields that are never names are left alone (but a `bracket`
// array of player names inside a tournament is still walked: only a
// top-level string under those keys is skipped).
function renameIn(value, from, to, key = null) {
  if (typeof value === 'string') return value === from && !NOT_A_NAME.has(key) ? to : value;
  if (Array.isArray(value)) return value.map((item) => renameIn(item, from, to, null));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k === from ? to : k] = renameIn(v, from, to, k);
    return out;
  }
  return value; // numbers, booleans, null, Firestore Timestamps
}

// The top-level fields of a doc that a rename changes: { field: newValue },
// for an update(). A key that was the old name (not expected at the top
// level of our docs) would show up as both a removal and an addition; the
// caller only gets changed values for fields that still exist.
function renameChanges(data, from, to) {
  const changes = {};
  for (const [key, value] of Object.entries(data)) {
    const renamed = renameIn(value, from, to, key);
    if (JSON.stringify(renamed) !== JSON.stringify(value)) changes[key] = renamed;
  }
  return changes;
}

module.exports = { checkNewUsername, renameIn, renameChanges };
