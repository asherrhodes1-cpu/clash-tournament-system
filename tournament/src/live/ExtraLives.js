import React, { useState, useEffect, useRef } from 'react';
import PlayerName from '../PlayerName';
import { Heart } from 'lucide-react';
import {
  subscribeToLifeRun,
  subscribeToLifeWindowDonors,
  startLifeRun,
  featureLifeRun,
  setLifeRunLives,
  endLifeRun,
  openLifeWindow,
  closeLifeWindow,
  donateToLifeGoal,
} from '../api/live';
import { percentOf, formatGems } from './liveUtils';
import { Gems, Countdown, useNow } from './shared';

const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const OUTLINE_BUTTON = 'border border-white text-white hover:bg-white hover:text-black rounded transition disabled:opacity-50';
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-white';

export const DEFAULT_LIVES = 3;
// 500,000 for the first extra life, doubling each time: 1,000,000, 2,000,000, ...
export const DEFAULT_LIFE_PRICE = 500000;
export const DEFAULT_LIFE_MULTIPLIER = 2;
// Must match nextPrice in functions/lives.js, which sets the real price.
const nextPrice = (price, multiplier) => Math.round(price * multiplier);
const MAX_LIFE_PRICE = 100000000;
// Hearts are drawn one each up to this many; past it, one heart and a count.
const MAX_HEARTS = 8;
// How long the overlay keeps announcing how the last goal ended.
const ANNOUNCE_MS = 20000;

// The run on screen and the biggest donors to its open goal, kept live.
export function useLifeRun(runId) {
  const [run, setRun] = useState(null);
  const [donors, setDonors] = useState([]);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      return;
    }
    return subscribeToLifeRun(runId, setRun);
  }, [runId]);

  const windowId = run?.window?.id || null;
  useEffect(() => {
    if (!runId || !windowId) {
      setDonors([]);
      return;
    }
    return subscribeToLifeWindowDonors(runId, windowId, setDonors);
  }, [runId, windowId]);

  return { run, donors };
}

// Where the run's timed extra-life goal is right now:
//   'open'    - taking donations, countdown running
//   'closing' - time ran out (or staff cancelled); donations being refunded
//   'none'    - no goal open
// Must agree with windowIsOpen in functions/lives.js, which is what decides.
function windowPhase(run, now) {
  const w = run.window;
  if (!w) return 'none';
  if (w.state !== 'open') return 'closing';
  if (w.openedAtMs == null) return 'open';
  return now < w.openedAtMs + w.ms ? 'open' : 'closing';
}

// Asks the server to close (and refund) a goal whose time has run out, and
// keeps asking every few seconds until it's gone. The server only acts once
// the countdown really is over, so this is safe from the overlay with no
// login. Used by the overlay and the staff page, not by every viewer.
function useCloseWhenExpired(run, phase) {
  const lastTry = useRef(0);
  const runId = run?.id;
  useEffect(() => {
    if (!runId || phase !== 'closing') return;
    const attempt = () => {
      if (Date.now() - lastTry.current < 4000) return;
      lastTry.current = Date.now();
      closeLifeWindow(runId).catch(() => {});
    };
    attempt();
    const id = setInterval(attempt, 5000);
    return () => clearInterval(id);
  }, [runId, phase]);
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

// How full the bar toward the life is.
function LifeGoalBar({ raised, price, large = false }) {
  return (
    <div className={`relative overflow-hidden rounded bg-gray-900 border border-gray-700 ${large ? 'h-10' : 'h-6'}`}>
      <div
        className="absolute inset-y-0 left-0 bg-red-600 transition-all duration-500"
        style={{ width: `${percentOf(raised, price)}%` }}
      />
      <div className={`relative h-full flex items-center justify-center font-bold ${large ? 'text-xl' : 'text-sm'}`}>
        <Gems amount={raised} />
        <span className="mx-1">/</span>
        {formatGems(price)}
      </div>
    </div>
  );
}

// How the last goal ended, in a sentence.
function lastWindowText(last) {
  if (!last) return null;
  if (last.result === 'bought') return `Extra life bought by ${last.by || 'the community'}!`;
  if (last.result === 'cancelled') return 'The last goal was called off - everyone was refunded.';
  return 'The last goal wasn\'t filled in time - everyone was refunded.';
}

export function ExtraLivesCard({ run, donors, user, gems, onLogin }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const active = run.status === 'active';
  const now = useNow(active && !!run.window);
  const phase = active ? windowPhase(run, now) : 'none';
  const raised = run.window?.raised || 0;
  const remaining = Math.max(0, run.price - raised);

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

      {!active && (
        <p className="text-gray-400">This run is over{run.bought > 0 ? ` - you bought ${run.bought} extra ${run.bought === 1 ? 'life' : 'lives'}` : ''}.</p>
      )}

      {active && phase === 'none' && (
        <div className="space-y-1 text-sm">
          <p className="text-gray-300">
            A failed attack costs me a life. When I open an extra-life goal you'll have 5 minutes to fill the bar
            together and buy me one - it'll cost <Gems amount={run.price} className="font-bold text-white" />.
          </p>
          {run.lastWindow && <p className="text-gray-400">{lastWindowText(run.lastWindow)}</p>}
        </div>
      )}

      {active && phase === 'closing' && (
        <div className="rounded p-3 text-center bg-gray-700">Time's up - the bar wasn't filled. Refunding everyone's Gold...</div>
      )}

      {active && phase === 'open' && (
        <>
          <div className="space-y-2">
            <p className="text-sm text-gray-300">
              {run.lives === 0 ? 'I\'m out of lives - fill the bar to bring me back with one!' : 'Fill the bar before time runs out to buy me an extra life!'}
            </p>
            <Countdown endsAt={run.window.openedAtMs + run.window.ms} durationMs={run.window.ms} now={now} label="Goal closes in" />
            <LifeGoalBar raised={raised} price={run.price} />
            <p className="text-xs text-gray-400">If it isn't filled in time, everyone gets their Gold back.</p>
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
                    onClick={() => setAmount(String(Math.max(0, Math.min(n, gems, remaining))))}
                    className="border border-gray-600 hover:border-white rounded py-1 transition"
                  >
                    {formatGems(n)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAmount(String(Math.max(0, Math.min(gems, remaining))))}
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
                  : gems <= 0
                  ? 'You\'re out of Gold'
                  : 'Enter an amount'}
              </button>
            </div>
          )}

          {donors.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top donors</p>
              <ol className="space-y-0.5 text-sm">
                {donors.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3">
                    <span className="truncate"><PlayerName name={d.username || 'Unknown'} /></span>
                    <Gems amount={d.gems} className="font-bold shrink-0" />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}
    </div>
  );
}

// On stream: the lives left for the whole run, and - while a goal is open -
// its countdown and bar. How a goal ended is announced for a few seconds.
export function ExtraLivesOverlayCard({ run }) {
  const active = run.status === 'active';
  const recentlyEnded = !!run.lastWindow && Date.now() - run.lastWindow.at < ANNOUNCE_MS;
  const now = useNow(active && (!!run.window || recentlyEnded));
  const phase = active ? windowPhase(run, now) : 'none';
  useCloseWhenExpired(active ? run : null, phase);
  if (!active) return null;

  const announcing = phase === 'none' && run.lastWindow && now - run.lastWindow.at < ANNOUNCE_MS;
  return (
    <div className="w-[520px] bg-gray-950 rounded-xl border-4 border-red-500 p-5 shadow-2xl space-y-3">
      <div className="flex flex-wrap justify-between items-baseline gap-x-3 text-base font-bold uppercase tracking-wide [&>span]:whitespace-nowrap">
        <span className="text-red-400">Lives</span>
        {phase === 'open' && <span className="text-green-400">Buy me a life at {window.location.host}/live</span>}
      </div>
      <Hearts lives={run.lives} size="w-12 h-12" />
      {phase === 'open' && (
        <>
          <Countdown endsAt={run.window.openedAtMs + run.window.ms} durationMs={run.window.ms} now={now} label="Extra life goal closes in" large />
          <LifeGoalBar raised={run.window.raised || 0} price={run.price} large />
        </>
      )}
      {phase === 'closing' && <p className="text-xl font-bold text-gray-200">Time's up - Gold refunded</p>}
      {announcing && (
        <p className={`text-xl font-bold ${run.lastWindow.result === 'bought' ? 'text-green-400' : 'text-gray-200'}`}>
          {run.lastWindow.result === 'bought' ? lastWindowText(run.lastWindow) : 'Goal not filled - Gold refunded'}
        </p>
      )}
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
  const now = useNow(active && !!run.window);
  const phase = active ? windowPhase(run, now) : 'none';
  useCloseWhenExpired(active ? run : null, phase);

  const act = async (action, doneMessage = '') => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await action();
      if (typeof doneMessage === 'function') setMessage(doneMessage(result));
      else if (doneMessage) setMessage(doneMessage);
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

  const cancelGoal = () => {
    if (!window.confirm('Call off this extra-life goal and refund everyone?')) return;
    act(() => closeLifeWindow(run.id, { cancel: true }), ({ refunded }) => `Goal called off - ${formatGems(refunded)} Gold refunded.`);
  };

  // Ending a run with a goal still open would strand its donations, so that
  // goal is called off (and refunded) first.
  const end = () => {
    if (!window.confirm(run.window ? 'End this run? The open extra-life goal will be refunded.' : 'End this run?')) return;
    act(async () => {
      if (run.window) await closeLifeWindow(run.id, { cancel: true });
      await endLifeRun(run.id);
    }, 'Run ended.');
  };

  const secondsLeft = phase === 'open' && run.window.openedAtMs != null
    ? Math.max(0, Math.ceil((run.window.openedAtMs + run.window.ms - now) / 1000))
    : null;

  return (
    <div className="space-y-4">
      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      {run && (
        <div className="rounded border border-gray-700 p-4 space-y-3">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <Hearts lives={run.lives} size="w-6 h-6" />
            <span className="text-sm text-gray-300">{active ? `${run.bought} bought so far` : 'Run over'}</span>
          </div>

          {active && phase === 'none' && (
            <div className="space-y-1">
              <button disabled={busy} onClick={() => act(() => openLifeWindow(run.id), 'Extra-life goal is open for 5 minutes.')} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>
                Open extra-life goal (5 min) - <Gems amount={run.price} />
              </button>
              <p className="text-xs text-gray-500">
                Shows the bar and a 5-minute countdown on the page and the overlay. Filled in time: +1 life, and the next
                goal costs {formatGems(nextPrice(run.price, run.priceMultiplier || 1))}. Not filled: everyone is refunded.
                {run.lastWindow && ` ${lastWindowText(run.lastWindow)}`}
              </p>
            </div>
          )}
          {active && phase === 'open' && (
            <div className="space-y-2">
              <p className="font-bold text-green-400">
                Goal open - {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} left
              </p>
              <LifeGoalBar raised={run.window.raised || 0} price={run.price} />
              <button disabled={busy} onClick={cancelGoal} className={`${OUTLINE_BUTTON} px-3 py-1 text-sm`}>Call it off &amp; refund</button>
            </div>
          )}
          {active && phase === 'closing' && (
            <p className="text-sm text-gray-300">Time's up - refunding everyone's Gold...</p>
          )}

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
            Your lives show on the overlay for the whole run. Viewers buy extra ones in 5-minute goals you open: with
            these numbers the first costs {formatGems(Number(price) || 0)},
            the second {formatGems(nextPrice(Number(price) || 0, Number(multiplier) || 1))},
            the third {formatGems(nextPrice(nextPrice(Number(price) || 0, Number(multiplier) || 1), Number(multiplier) || 1))}, and so on.
          </p>
        </form>
      )}
    </div>
  );
}
