import React, { useState, useEffect } from 'react';
import {
  LADDER_ID,
  subscribeToLadderLeaderboard,
  subscribeToLadderRating,
  subscribeToLadderQueue,
  subscribeToRecentLadderResults,
  subscribeToLadderReviewMatches,
  leaveLadderQueue,
} from '../api/ladder';

const CARD = 'bg-gray-800 rounded-lg border border-gray-700 p-6';
const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const OUTLINE_BUTTON = 'border border-white text-white hover:bg-white hover:text-black rounded transition disabled:opacity-50';

// Keep in step with functions/ladder.js, which is what actually applies them.
export const START_RATING = 1000;
const PROVISIONAL_GAMES = 30;
function allowedGap(waitedMs) {
  return 200 + 100 * Math.floor(Math.max(0, waitedMs) / (10 * 60 * 1000));
}

function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

// A player's rating change from a finished match, or null if it's not rated yet.
function deltaFor(match, username) {
  if (!match.rating) return null;
  return match.player1 === username ? match.rating.p1.delta : match.rating.p2.delta;
}

function DeltaBadge({ delta }) {
  if (delta == null) return null;
  const color = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400';
  return <span className={`font-bold ${color}`}>{signed(delta)}</span>;
}

// How a finished 1v1 reads in one line.
function resultText(match) {
  if (match.resolvedReason === 'both_no_show') return `${match.player1} and ${match.player2} both no-showed`;
  const loser = match.winner === match.player1 ? match.player2 : match.player1;
  if (match.resolvedReason === 'opponent_no_show') return `${loser} no-showed against ${match.winner}`;
  return `${match.winner} beat ${loser}`;
}

function QueueCard({ user, rating, queue, activeCount, onJoinQueue, onLogin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const mine = user.uid ? queue.find((q) => q.uid === user.uid) : null;

  useEffect(() => {
    if (!mine) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, [!!mine]);

  const run = async (action) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const games = rating?.games || 0;
  const others = queue.filter((q) => q.uid !== user.uid).length;

  return (
    <div className={`${CARD} space-y-4`}>
      {user.isGuest ? (
        <>
          <p className="text-gray-300">Log in to queue for a 1v1 and get on the leaderboard.</p>
          <button onClick={onLogin} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>Log in to play</button>
        </>
      ) : (
        <>
          <div className="flex justify-between items-end gap-4 flex-wrap">
            <div>
              <p className="text-sm text-gray-400 uppercase tracking-wide">Your rating</p>
              <p className="text-4xl font-bold">{rating ? rating.rating : START_RATING}</p>
              <p className="text-sm text-gray-400">
                {rating ? `${rating.wins}W - ${rating.losses}L` : 'No 1v1s played yet'}
                {games < PROVISIONAL_GAMES && ' · rating moves faster for your first 30 games'}
              </p>
            </div>
            {activeCount > 0 && (
              <p className="text-sm text-gray-300">{activeCount} 1v1{activeCount === 1 ? '' : 's'} in progress</p>
            )}
          </div>

          {mine ? (
            <div className="space-y-2">
              <div className="rounded border border-green-500 bg-green-500/10 p-3">
                <p className="font-bold text-green-400">In the queue - looking for an opponent...</p>
                <p className="text-sm text-gray-300">
                  Matching ratings within {allowedGap(now - mine.joinedAt)} of yours. The range widens every 10 minutes, and
                  you'll get a Discord DM the moment you're matched - you don't need to stay on this page.
                </p>
              </div>
              <button onClick={() => run(leaveLadderQueue)} disabled={busy} className={`${OUTLINE_BUTTON} w-full py-2`}>
                {busy ? 'Leaving...' : 'Leave the queue'}
              </button>
            </div>
          ) : (
            <button onClick={() => run(onJoinQueue)} disabled={busy} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>
              {busy ? 'Finding a match...' : 'Find a 1v1'}
            </button>
          )}
          <p className="text-xs text-gray-400">
            {others === 0 ? 'Nobody else is queuing right now.' : `${others} other player${others === 1 ? ' is' : 's are'} queuing.`}
          </p>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </>
      )}
    </div>
  );
}

function Leaderboard({ rows, user, onViewProfile }) {
  return (
    <div className={CARD}>
      <h2 className="text-xl font-bold mb-3">Leaderboard</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No rated 1v1s yet. Everyone starts at {START_RATING}.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((row, i) => (
            <li
              key={row.username}
              className={`flex justify-between items-center gap-3 px-2 py-1 rounded ${row.username === user.username ? 'bg-gray-700' : ''}`}
            >
              <span className="truncate">
                <span className="text-gray-400 inline-block w-8">{i + 1}.</span>
                <button onClick={() => onViewProfile(row.username)} className="font-bold hover:underline">{row.username}</button>
              </span>
              <span className="shrink-0 text-right">
                <span className="font-bold">{row.rating}</span>
                <span className="text-xs text-gray-400 ml-2">{row.wins}W-{row.losses}L</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export default function LadderPage({ user, userMatches, renderMatch, onJoinQueue, onLogin, onViewProfile }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [rating, setRating] = useState(null);
  const [queue, setQueue] = useState([]);
  const [recent, setRecent] = useState([]);
  const [review, setReview] = useState([]);

  useEffect(() => subscribeToLadderLeaderboard(setLeaderboard), []);
  useEffect(() => subscribeToRecentLadderResults(setRecent), []);
  useEffect(() => {
    if (!user.username) {
      setRating(null);
      return;
    }
    return subscribeToLadderRating(user.username, setRating);
  }, [user.username]);
  useEffect(() => {
    if (!user.uid) {
      setQueue([]);
      return;
    }
    return subscribeToLadderQueue(setQueue);
  }, [user.uid]);
  useEffect(() => {
    if (!user.isStaff) {
      setReview([]);
      return;
    }
    return subscribeToLadderReviewMatches(setReview);
  }, [user.isStaff]);

  const mine = userMatches.filter((m) => m.tournamentId === LADDER_ID);
  const active = mine.filter((m) => m.status !== 'completed').sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const finished = mine
    .filter((m) => m.status === 'completed')
    .sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))
    .slice(0, 5);
  // Staff see matches needing a decision even when they aren't in them.
  const reviewOthers = review.filter((m) => !active.some((a) => a.id === m.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">1v1 Ladder</h1>
        <p className="text-gray-300 mt-1">
          Queue up, get matched with someone near your rating, and you both have 24 hours to play it. Ready up, attack,
          and report the result - just like a tournament match. Wins and losses move your rating.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <QueueCard
            user={user}
            rating={rating}
            queue={queue}
            activeCount={active.length}
            onJoinQueue={onJoinQueue}
            onLogin={onLogin}
          />

          {!user.isGuest && (
            <div className={`${CARD} space-y-3`}>
              <h2 className="text-xl font-bold">Your 1v1s</h2>
              {active.length === 0 && <p className="text-sm text-gray-400">No 1v1s in progress. Find one above!</p>}
              {active.map((m) => <div key={m.id}>{renderMatch(m)}</div>)}
              {finished.length > 0 && (
                <div className="pt-2">
                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Recently finished</p>
                  <ul className="space-y-1 text-sm">
                    {finished.map((m) => (
                      <li key={m.id} className="flex justify-between gap-3">
                        <span className="truncate">{resultText(m)}</span>
                        <DeltaBadge delta={deltaFor(m, user.username)} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {user.isStaff && (
            <div className={`${CARD} space-y-3 border-2 border-white`}>
              <h2 className="text-xl font-bold">Needs a decision <span className="text-sm text-gray-400">[STAFF]</span></h2>
              {reviewOthers.length === 0 ? (
                <p className="text-sm text-gray-400">No 1v1s waiting on staff.</p>
              ) : (
                reviewOthers.map((m) => <div key={m.id}>{renderMatch(m)}</div>)
              )}
            </div>
          )}

          <div className={CARD}>
            <h2 className="text-xl font-bold mb-3">How ratings work</h2>
            <ul className="text-sm text-gray-300 space-y-1 list-disc list-inside">
              <li>Everyone starts at {START_RATING}. It's Elo, like chess: beat a higher-rated player and you gain more; lose to a lower-rated one and you lose more.</li>
              <li>You're only matched with players near your rating. The range starts at 200 and widens by 100 every 10 minutes you wait.</li>
              <li>Don't show up (never ready up) and you lose rating as if you'd lost - your opponent gains nothing for a match that wasn't played.</li>
              <li>If you both report different winners, or neither of you reports, staff decide it.</li>
            </ul>
          </div>
        </div>

        <div className="space-y-6">
          <Leaderboard rows={leaderboard} user={user} onViewProfile={onViewProfile} />
          <div className={CARD}>
            <h2 className="text-xl font-bold mb-3">Recent results</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-gray-400">No 1v1s finished yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recent.map((m) => (
                  <li key={m.id}>
                    <p>{resultText(m)}</p>
                    {m.rating && (
                      <p className="text-xs text-gray-400">
                        {m.player1} <DeltaBadge delta={m.rating.p1.delta} /> · {m.player2} <DeltaBadge delta={m.rating.p2.delta} />
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
