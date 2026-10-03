import React, { useState, useEffect } from 'react';
import { Heart } from 'lucide-react';
import {
  subscribeToLifeRun,
  subscribeToLifeDonors,
  startLifeRun,
  featureLifeRun,
  setLifeRunLives,
  endLifeRun,
  donateToLifeGoal,
} from '../api/live';
import { percentOf, formatGems } from './liveUtils';
import { Gems } from './shared';

const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const OUTLINE_BUTTON = 'border border-white text-white hover:bg-white hover:text-black rounded transition disabled:opacity-50';
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-white';

export const DEFAULT_LIVES = 3;
// 100,000 for the first extra life, then 250,000, 625,000, ...
export const DEFAULT_LIFE_PRICE = 100000;
export const DEFAULT_LIFE_MULTIPLIER = 2.5;
// Must match nextPrice in functions/lives.js, which sets the real price.
const nextPrice = (price, multiplier) => Math.round(price * multiplier);
const MAX_LIFE_PRICE = 100000000;
// Hearts are drawn one each up to this many; past it, one heart and a count.
const MAX_HEARTS = 8;

// The run on screen and its biggest donors, kept live.
export function useLifeRun(runId) {
  const [run, setRun] = useState(null);
  const [donors, setDonors] = useState([]);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setDonors([]);
      return;
    }
    const unsubRun = subscribeToLifeRun(runId, setRun);
    const unsubDonors = subscribeToLifeDonors(runId, setDonors);
    return () => {
      unsubRun();
      unsubDonors();
    };
  }, [runId]);

  return { run, donors };
}

// The lives left, as hearts. `size` is a Tailwind size class pair.
function Hearts({ lives, size = 'w-8 h-8' }) {
  if (lives === 0) {
    return (
      <div className="flex items-center gap-2">
        <Heart className={`${size} text-gray-500`} />
        <span className="font-bold text-gray-300">Out of lives</span>
      </div>
    );
  }
  if (lives > MAX_HEARTS) {
    return (
      <div className="flex items-center gap-2">
        <Heart className={`${size} text-red-500`} fill="currentColor" />
        <span className="text-2xl font-bold">x {lives}</span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-1" aria-label={`${lives} ${lives === 1 ? 'life' : 'lives'} left`}>
      {Array.from({ length: lives }, (_, i) => (
        <Heart key={i} className={`${size} text-red-500`} fill="currentColor" />
      ))}
    </div>
  );
}

// How full the bar toward the next life is.
function LifeGoalBar({ run, large = false }) {
  return (
    <div className={`relative overflow-hidden rounded bg-gray-900 border border-gray-700 ${large ? 'h-10' : 'h-6'}`}>
      <div
        className="absolute inset-y-0 left-0 bg-red-600 transition-all duration-500"
        style={{ width: `${percentOf(run.raised, run.price)}%` }}
      />
      <div className={`relative h-full flex items-center justify-center font-bold ${large ? 'text-xl' : 'text-sm'}`}>
        <Gems amount={run.raised} />
        <span className="mx-1">/</span>
        {formatGems(run.price)}
      </div>
    </div>
  );
}

export function ExtraLivesCard({ run, donors, user, gems, onLogin }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const active = run.status === 'active';
  const remaining = Math.max(0, run.price - run.raised);

  const donation = Number(amount);
  const donationValid = Number.isInteger(donation) && donation >= 1 && donation <= gems;

  const donate = async () => {
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      const { taken, lifeBought } = await donateToLifeGoal(run.id, donation);
      setAmount('');
      if (lifeBought) setMessage('You bought the extra life!');
      else if (taken < donation) setMessage(`The bar only needed ${formatGems(taken)} - that's all you were charged.`);
      else setMessage('Thanks for donating!');
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg border border-red-500 p-6 space-y-4">
      <div className="flex justify-between items-baseline gap-3 text-sm">
        <span className="text-red-400 font-bold uppercase tracking-wide">Extra lives</span>
        <span className="text-gray-300 whitespace-nowrap">{active ? `${run.lives} ${run.lives === 1 ? 'life' : 'lives'} left` : 'Run over'}</span>
      </div>
      <Hearts lives={run.lives} />

      {active ? (
        <>
          <div className="space-y-1">
            <p className="text-sm text-gray-300">
              {run.lives === 0
                ? 'I\'m out of lives - fill the bar to bring me back with one.'
                : 'A failed attack costs me a life. Fill the bar together to buy me another.'}
            </p>
            <LifeGoalBar run={run} />
            <p className="text-xs text-gray-400">
              {run.priceMultiplier > 1
                ? <>The next one after this costs <Gems amount={nextPrice(run.price, run.priceMultiplier)} />.</>
                : 'Every life costs the same.'}
              {run.lastBuyer && ` Last life bought by ${run.lastBuyer}.`}
            </p>
          </div>

          {user.isGuest ? (
            <button onClick={onLogin} className={`${GOLD_BUTTON} w-full py-2`}>Log in to donate</button>
          ) : (
            <div className="space-y-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Gold to donate (you have ${formatGems(gems)})`}
                className={INPUT}
              />
              <div className="grid grid-cols-4 gap-2 text-sm">
                {[1000, 10000, 100000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAmount(String(Math.min(n, gems, remaining)))}
                    className="border border-gray-600 hover:border-white rounded py-1 transition"
                  >
                    {formatGems(n)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.min(gems, remaining)))}
                  className="border border-gray-600 hover:border-white rounded py-1 transition"
                >
                  Fill it
                </button>
              </div>
              <button onClick={donate} disabled={!donationValid || submitting} className={`${GOLD_BUTTON} w-full py-2`}>
                {submitting
                  ? 'Donating...'
                  : donationValid
                  ? <>Donate <Gems amount={Math.min(donation, remaining)} /></>
                  : gems === 0
                  ? 'You\'re out of Gold'
                  : 'Enter an amount'}
              </button>
            </div>
          )}

          {donors.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top donors this run</p>
              <ol className="space-y-0.5 text-sm">
                {donors.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3">
                    <span className="truncate">{d.username || 'Unknown'}</span>
                    <Gems amount={d.gems} className="font-bold shrink-0" />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      ) : (
        <p className="text-gray-400">This run is over{run.bought > 0 ? ` - you bought ${run.bought} extra ${run.bought === 1 ? 'life' : 'lives'}` : ''}.</p>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}
    </div>
  );
}

// On stream: the lives left and the bar toward the next one.
export function ExtraLivesOverlayCard({ run }) {
  if (run.status !== 'active') return null;
  return (
    <div className="w-[520px] bg-gray-950 rounded-xl border-4 border-red-500 p-5 shadow-2xl space-y-3">
      <div className="flex flex-wrap justify-between items-baseline gap-x-3 text-base font-bold uppercase tracking-wide [&>span]:whitespace-nowrap">
        <span className="text-red-400">Lives</span>
        <span className="text-green-400">Buy me a life at {window.location.host}/live</span>
      </div>
      <Hearts lives={run.lives} size="w-12 h-12" />
      <LifeGoalBar run={run} large />
      {run.lastBuyer && <p className="text-lg text-gray-200">Last life bought by {run.lastBuyer}</p>}
    </div>
  );
}

export function StaffLivesPanel({ run, user }) {
  const [lives, setLives] = useState(String(DEFAULT_LIVES));
  const [price, setPrice] = useState(String(DEFAULT_LIFE_PRICE));
  const [multiplier, setMultiplier] = useState(String(DEFAULT_LIFE_MULTIPLIER));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const active = run?.status === 'active';

  const act = async (action, doneMessage = '') => {
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
    const [l, p, m] = [Number(lives), Number(price), Number(multiplier)];
    if (!Number.isInteger(l) || l < 0 || l > 99) return setError('Start with 0 to 99 lives.');
    if (!Number.isInteger(p) || p < 1 || p > MAX_LIFE_PRICE) return setError(`Price the first extra life between 1 and ${formatGems(MAX_LIFE_PRICE)} Gold.`);
    if (!(m >= 1 && m <= 10)) return setError('The price multiplier has to be between 1 (same price every time) and 10.');
    return act(() => startLifeRun({ lives: l, price: p, priceMultiplier: m }, user.username), `Run started with ${l} ${l === 1 ? 'life' : 'lives'}.`);
  };

  const end = () => {
    if (!window.confirm('End this run? Viewers won\'t be able to donate to it any more.')) return;
    act(() => endLifeRun(run.id), 'Run ended.');
  };

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      {run && (
        <div className="rounded border border-gray-700 p-4 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <Hearts lives={run.lives} size="w-6 h-6" />
            <span className="text-sm text-gray-300">
              {active ? <>Next life: <Gems amount={run.raised} /> / {formatGems(run.price)}</> : 'Run over'} · {run.bought} bought
            </span>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {active && (
              <>
                <button
                  disabled={busy || run.lives === 0}
                  onClick={() => act(() => setLifeRunLives(run.id, run.lives - 1))}
                  className={`${OUTLINE_BUTTON} px-3 py-1`}
                >
                  - 1 life
                </button>
                <button
                  disabled={busy || run.lives >= 99}
                  onClick={() => act(() => setLifeRunLives(run.id, run.lives + 1))}
                  className={`${OUTLINE_BUTTON} px-3 py-1`}
                >
                  + 1 life
                </button>
                <button disabled={busy} onClick={end} className={`${OUTLINE_BUTTON} px-3 py-1`}>End run</button>
              </>
            )}
            <button disabled={busy} onClick={() => act(() => featureLifeRun(null))} className={`${OUTLINE_BUTTON} px-3 py-1`}>Hide</button>
          </div>
          {active && (
            <p className="text-xs text-gray-500">
              Settling an attack as failed (or under 6 stars) takes a life automatically. Use the buttons to correct it.
            </p>
          )}
        </div>
      )}

      {!active && (
        <form onSubmit={start} className="space-y-2">
          <div className="grid grid-cols-3 gap-2 items-end">
            <label className="text-sm">
              Starting lives
              <input type="number" min={0} step={1} value={lives} onChange={(e) => setLives(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
            <label className="text-sm">
              First life costs
              <input type="number" min={1} step={1} value={price} onChange={(e) => setPrice(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
            <label className="text-sm">
              Then multiply by
              <input type="number" min={1} max={10} step="any" value={multiplier} onChange={(e) => setMultiplier(e.target.value)} className={`${INPUT} mt-1`} />
            </label>
          </div>
          <button type="submit" disabled={busy} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>Start a lives run</button>
          <p className="text-xs text-gray-500">
            Viewers pool Gold to buy you extra lives. With these numbers the first costs {formatGems(Number(price) || 0)},
            the second {formatGems(nextPrice(Number(price) || 0, Number(multiplier) || 1))},
            the third {formatGems(nextPrice(nextPrice(Number(price) || 0, Number(multiplier) || 1), Number(multiplier) || 1))}, and so on.
          </p>
        </form>
      )}
    </div>
  );
}
