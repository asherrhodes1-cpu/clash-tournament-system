import React, { useState, useEffect, useMemo } from 'react';
import { fetchAllUsers, removeUser } from '../api/users';

const INPUT = 'bg-gray-700 border border-gray-600 rounded px-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-white';
const PAGE = 50;

// Whether a user matches the search: the text anywhere in their username or
// Clash tag, ignoring case. An empty search matches everyone.
export function matchesSearch(user, search) {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (user.username || '').toLowerCase().includes(q) || (user.clashTag || '').toLowerCase().includes(q);
}

// Newest accounts first (a bad name is usually a recent one), or A to Z.
export function sortUsers(users, order) {
  const byName = (a, b) => (a.username || '').localeCompare(b.username || '', undefined, { sensitivity: 'base' });
  if (order === 'name') return [...users].sort(byName);
  return [...users].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || byName(a, b));
}

// Staff: search every account and remove ones with inappropriate names.
export default function UserManager({ currentUser, onViewProfile }) {
  const [users, setUsers] = useState(null);
  const [search, setSearch] = useState('');
  const [order, setOrder] = useState('newest');
  const [shown, setShown] = useState(PAGE);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [removing, setRemoving] = useState(null);

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

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Users</h2>
        <p className="text-sm text-gray-400">
          Search every account by username or Clash tag, and remove any with an inappropriate name. Removing deletes
          the account for good and blocks the name from being used again.
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
                    {user.username}
                  </button>
                  {user.isStaff && <span className="ml-2 text-xs font-bold">[STAFF]</span>}
                  <div className="text-xs text-gray-400">
                    {user.clashTag || 'No Clash account'}
                    {user.clashTag && !user.clashVerified && ' (unverified)'}
                    {user.createdAt && ` · joined ${new Date(user.createdAt).toLocaleDateString()}`}
                  </div>
                </div>
                {user.isStaff || user.id === currentUser.uid ? (
                  <span className="text-xs text-gray-500">{user.id === currentUser.uid ? 'You' : 'Staff - can\'t be removed here'}</span>
                ) : (
                  <button
                    onClick={() => remove(user)}
                    disabled={removing !== null}
                    className="border border-red-500 text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 px-3 py-1 rounded text-sm transition disabled:opacity-50"
                  >
                    {removing === user.id ? 'Removing...' : 'Remove'}
                  </button>
                )}
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
