import React, { useState, useEffect } from 'react';
import { subscribeToGemDrop, subscribeToDropClaims, startGemDrop, featureGemDrop, claimGemDrop } from '../api/live';
import { formatGems } from './liveUtils';
import { Gems, Countdown, useNow } from './shared';

const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const OUTLINE_BUTTON = 'border border-white text-white hover:bg-white hover:text-black rounded transition disabled:opacity-50';
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-white';

export const DEFAULT_DROP_GEMS = 100;
export const DEFAULT_DROP_SECONDS = 60;

// The featured drop and who's claimed it, kept live.
export function useGemDrop(dropId) {
  const [drop, setDrop] = useState(null);
  const [claims, setClaims] = useState([]);

  useEffect(() => {
    if (!dropId) {
      setDrop(null);
      setClaims([]);
      return;
    }
    const unsubDrop = subscribeToGemDrop(dropId, setDrop);
    const unsubClaims = subscribeToDropClaims(dropId, setClaims);
    return () => {
      unsubDrop();
      unsubClaims();
    };
  }, [dropId]);

  return { drop, claims };
}

function dropEndsAt(drop) {
  return drop.openedAtMs == null ? null : drop.openedAtMs + drop.durationMs;
}

function claimedText(count) {
  return `${count} ${count === 1 ? 'player has' : 'players have'} claimed it`;
}

export function GemDropCard({ drop, claims, user, onLogin }) {
  const endsAt = dropEndsAt(drop);
  const now = useNow(endsAt != null && Date.now() < endsAt);
  const open = endsAt != null && now < endsAt;
  const mine = user.uid ? claims.find((c) => c.id === user.uid) : null;
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);

  const claim = async () => {
    setError('');
    setClaiming(true);
    try {
      await claimGemDrop(drop.id);
    } catch (err) {
      setError(err.message || 'Couldn\'t claim it.');
    } finally {
      setClaiming(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border-2 border-yellow-400 p-6 space-y-4 text-center">
      <div className="flex justify-between items-baseline gap-3 text-sm">
        <span className="text-yellow-400 font-bold uppercase tracking-wide">Gem drop</span>
        <span className="text-gray-300">{open ? 'Claim it now!' : 'Over'}</span>
      </div>
      <img
        src="/gem.png"
        alt=""
        className={`w-20 h-20 mx-auto object-contain ${open && !mine ? 'animate-bounce' : ''}`}
      />
      <p className="text-2xl font-bold">
        <Gems amount={drop.amount} /> free
      </p>
      {open && <Countdown endsAt={endsAt} durationMs={drop.durationMs} now={now} label="Ends in" />}

      {mine ? (
        <p className="text-lg font-bold text-green-400">You got <Gems amount={mine.gems} />!</p>
      ) : open ? (
        user.isGuest ? (
          <button onClick={onLogin} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>Log in to claim</button>
        ) : (
          <button onClick={claim} disabled={claiming} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>
            {claiming ? 'Claiming...' : <>Claim <Gems amount={drop.amount} /></>}
          </button>
        )
      ) : (
        <p className="text-gray-400">This drop is over - watch for the next one!</p>
      )}

      <p className="text-sm text-gray-400">{claimedText(claims.length)}</p>
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

// On stream: the drop with its countdown while it's open, then gone.
export function GemDropOverlayCard({ drop, claims }) {
  const endsAt = dropEndsAt(drop);
  const now = useNow(endsAt != null && Date.now() < endsAt);
  if (endsAt == null || now >= endsAt) return null;
  return (
    <div className="w-[520px] bg-gray-950 rounded-xl border-4 border-yellow-400 p-5 shadow-2xl space-y-3">
      <div className="flex flex-wrap justify-between items-baseline gap-x-3 text-base font-bold uppercase tracking-wide [&>span]:whitespace-nowrap">
        <span className="text-yellow-400">Gem drop</span>
        <span className="text-green-400">Claim at {window.location.host}/live</span>
      </div>
      <div className="flex items-center gap-4">
        <img src="/gem.png" alt="" className="w-16 h-16 object-contain animate-bounce" />
        <div>
          <p className="text-3xl font-bold"><Gems amount={drop.amount} /> free</p>
          <p className="text-lg text-gray-200">{claimedText(claims.length)}</p>
        </div>
      </div>
      <Countdown endsAt={endsAt} durationMs={drop.durationMs} now={now} label="Ends in" large />
    </div>
  );
}

export function StaffGemDropPanel({ drop, claims, user }) {
  const [amount, setAmount] = useState(String(DEFAULT_DROP_GEMS));
  const [seconds, setSeconds] = useState(String(DEFAULT_DROP_SECONDS));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const endsAt = drop ? dropEndsAt(drop) : null;
  const now = useNow(endsAt != null && Date.now() < endsAt);
  const running = endsAt != null && now < endsAt;

  const run = async (action, doneMessage = '') => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await action();
      if (doneMessage) setMessage(doneMessage);
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const start = (e) => {
    e.preventDefault();
    const gems = Number(amount);
    const secs = Number(seconds);
    if (!Number.isInteger(gems) || gems < 1 || gems > 100000) {
      setError('Give between 1 and 100,000 gems.');
      return;
    }
    if (!Number.isInteger(secs) || secs < 5 || secs > 600) {
      setError('Run it for 5 to 600 seconds.');
      return;
    }
    run(() => startGemDrop(gems, secs, user.username), `Drop is live - ${formatGems(gems)} gems for ${secs} seconds.`);
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      {drop && (
        <div className="rounded border border-gray-700 p-4 flex flex-wrap justify-between items-center gap-3 text-sm">
          <span>
            {running ? `Live - ${Math.ceil((endsAt - now) / 1000)}s left` : 'Finished'} · <Gems amount={drop.amount} /> · {claimedText(claims.length)}
          </span>
          <button disabled={busy} onClick={() => run(() => featureGemDrop(null))} className={`${OUTLINE_BUTTON} px-3 py-1`}>Hide</button>
        </div>
      )}

      {!running && (
        <form onSubmit={start} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">
              Gems each
              <input type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
            <label className="text-sm">
              Seconds
              <input type="number" min={5} step={1} value={seconds} onChange={(e) => setSeconds(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
          </div>
          <button type="submit" disabled={busy} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>Start gem drop</button>
          <p className="text-xs text-gray-500">Every logged-in viewer can claim it once before the countdown ends.</p>
        </form>
      )}
    </div>
  );
}
