import React, { useState, useEffect, useMemo } from 'react';
import { fetchAllUsers, removeUser, renameUser, setUserGold } from '../api/users';
import { setGoldName } from '../api/nameStyles';
import PlayerName, { useGoldNames, hasGoldName } from '../PlayerName';

const INPUT = 'bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white';
const PAGE = 50;

// Whether a user matches the search: the text anywhere in their username or
// Clash tag, ignoring case. An empty search matches everyone.
export function matchesSearch(user, search) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (user.username || '').toLowerCase().includes(q) || (user.clashTag || '').toLowerCase().includes(q);
}

// What a "set Gold" entry means: a whole number, 0 or more, commas and
// spaces allowed ("1,000,000"). null if it isn't one.
export function parseGold(text) {
  const cleaned = String(text ?? '').replace(/[,\s]/g, '');
  return /^\d+$/.test(cleaned) ? Number(cleaned) : null;
}

// Newest accounts first (a bad name is usually a recent one), A to Z, or
// richest first (players who've never used Gold last).
export function sortUsers(users, order) {
  const byName = (a, b) => (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' });
  if (order === 'name') return [...users].sort(byName);
  if (order === 'gold') return [...users].sort((a, b) => (b.gold ?? -Infinity) - (a.gold ?? -Infinity) || byName(a, b));
  return [...users].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || byName(a, b));
}

// Staff: search every account, rename it, give it a golden name, or remove it.
export default function UserManager({ currentUser, onViewProfile }) {
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('newest');
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState(null);
  const goldNames = useGoldNames();

  const load = async () => {
    setError('');
    try {
      setUsers(await fetchAllUsers());
    } catch (err) {
      setError(err.message || 'Couldn\'t load the user list.');
      setUsers([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // A new search starts back at the first page of results.
  useEffect(() => setShown(PAGE), [search, order]);

  const matches = useMemo(
    () => sortUsers((users || []).filter((u) => matchesSearch(u, search)), order),
    [users, search, order]
  );

  const remove = async (user) => {
    if (!window.confirm(
      `Remove "${user.username}"?\n\nThis permanently deletes the account: they can't log in again, their Gold and 1v1 rating are wiped, and the name can't be registered again. It can't be undone.`
    )) return;
    setError('');
    setMessage('');
    setRemoving(user.id);
    try {
      const { signupsRemoved } = await removeUser(user.id);
      setUsers((list) => list.filter((u) => u.id !== user.id));
      setMessage(`Removed ${user.username}.${signupsRemoved ? ` Also taken out of ${signupsRemoved} tournament signup${signupsRemoved === 1 ? '' : 's'}.` : ''}`);
    } catch (err) {
      setError(err.message || 'Couldn\'t remove that account.');
    } finally {
      setRemoving(null);
    }
  };

  const rename = async (user) => {
    const typed = window.prompt(
      `New username for "${user.username}"?\n\nLetters, numbers, _ . and - only, at least 3 characters. They'll be signed out and log back in with the new name (same password).`,
      user.username
    );
    if (typed == null || typed.trim() === user.username) return;
    setError('');
    setMessage('');
    setRemoving(user.id);
    try {
      const { to, tournaments, matches: matchCount } = await renameUser(user.id, typed);
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, username: to, usernameLower: to.toLowerCase() } : u)));
      setMessage(`Renamed ${user.username} to ${to}${tournaments || matchCount ? ` (updated in ${tournaments} tournament${tournaments === 1 ? '' : 's'} and ${matchCount} match${matchCount === 1 ? '' : 'es'})` : ''}. They need to log in again with the new name.`);
    } catch (err) {
      setError(err.message || 'Couldn\'t rename that account.');
    } finally {
      setRemoving(null);
    }
  };

  const setGold = async (user) => {
    const typed = window.prompt(
      `Set ${user.username}'s Gold to how much?\n\nThey have ${user.gold == null ? 'never used Gold (so the standard 1,000)' : user.gold.toLocaleString('en-US')} now. Enter 0 to wipe it.`,
      '0'
    );
    if (typed == null) return;
    const gold = parseGold(typed);
    if (gold == null) {
      setError('Enter a whole number, 0 or more.');
      return;
    }
    setError('');
    setMessage('');
    setRemoving(user.id);
    try {
      const { from, to } = await setUserGold(user.id, gold);
      setUsers((list) => list.map((u) => (u.id === user.id ? { ...u, gold: to } : u)));
      setMessage(`${user.username}'s Gold: ${from.toLocaleString('en-US')} -> ${to.toLocaleString('en-US')}.`);
    } catch (err) {
      setError(err.message || 'Couldn\'t change that balance.');
    } finally {
      setRemoving(null);
    }
  };

  const toggleGold = async (user) => {
    const on = !hasGoldName(goldNames, user.username);
    setError('');
    setMessage('');
    try {
      await setGoldName(user.username, on);
      setMessage(on ? `${user.username} now has a golden name.` : `${user.username}'s golden name was taken away.`);
    } catch (err) {
      setError(err.message || 'Couldn\'t change that.');
    }
  };

  const SMALL_BUTTON = 'border border-gray-600 hover:border-white px-3 py-1 rounded text-sm transition disabled:opacity-50';

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="text-sm text-gray-400">
          Search every account by username or Clash tag. Set a player's Gold, rename them, give them a shimmering
          golden name, or remove them - removing deletes the account for good and blocks the name from being used again.
        </p>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search usernames..."
          className={`${INPUT} flex-1 min-w-[12rem]`}
        />
        <select value={order} onChange={(e) => setOrder(e.target.value)} className={INPUT} aria-label="Sort users">
          <option value="newest">Newest first</option>
          <option value="name">A to Z</option>
          <option value="gold">Most Gold</option>
        </select>
        <button onClick={load} className="border border-gray-600 hover:border-white px-4 py-2 rounded transition">Refresh</button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      {users === null ? (
        <p className="text-gray-400">Loading users...</p>
      ) : (
        <>
          <p className="text-sm text-gray-400">
            {search.trim()
              ? `${matches.length} of ${users.length} accounts match "${search.trim()}"`
              : `${users.length} accounts`}
          </p>
          <ul className="divide-y divide-gray-700">
            {matches.slice(0, shown).map((user) => (
              <li key={user.id} className="py-2 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <button onClick={() => onViewProfile(user.username)} className="font-bold hover:underline break-all text-left">
                    <PlayerName name={user.username} />
                  </button>
                  {user.isStaff && <span className="ml-2 text-xs font-bold">[STAFF]</span>}
                  <div className="text-xs text-gray-400">
                    {user.clashTag || 'No Clash account'}
                    {user.clashTag && !user.clashVerified && ' (unverified)'}
                    {user.createdAt && ` · joined ${new Date(user.createdAt).toLocaleDateString()}`}
                  </div>
                  <div className="text-xs text-gray-300 flex items-center gap-1">
                    <img src="/gold.png" alt="Gold" className="w-3.5 h-3.5 object-contain" />
                    {user.gold == null ? 'Never used Gold' : user.gold.toLocaleString('en-US')}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => toggleGold(user)} disabled={removing !== null} className={SMALL_BUTTON}>
                    {hasGoldName(goldNames, user.username) ? 'Remove gold name' : 'Gold name'}
                  </button>
                  <button onClick={() => setGold(user)} disabled={removing !== null} className={SMALL_BUTTON}>
                    Set Gold
                  </button>
                  <button onClick={() => rename(user)} disabled={removing !== null} className={SMALL_BUTTON}>
                    {removing === user.id ? 'Working...' : 'Rename'}
                  </button>
                  {user.isStaff || user.id === currentUser.uid ? (
                    <span className="text-xs text-gray-500">{user.id === currentUser.uid ? 'You' : 'Staff'}</span>
                  ) : (
                    <button
                      onClick={() => remove(user)}
                      disabled={removing !== null}
                      className="border border-red-500 text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 px-3 py-1 rounded text-sm transition disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {matches.length === 0 && <p className="text-gray-400">No accounts match.</p>}
          {matches.length > shown && (
            <button
              onClick={() => setShown((n) => n + PAGE)}
              className="border border-gray-600 hover:border-white px-4 py-2 rounded transition w-full"
            >
              Show more ({matches.length - shown} more)
            </button>
          )}
        </>
      )}
    </div>
  );
}
