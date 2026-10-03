import React, { useState, useEffect, useRef } from 'react';
import { spinRoulette, subscribeToRecentSpins } from '../api/live';
import { ROULETTE_BETS, POCKETS, POCKET_DEGREES, spinTarget, formatGems } from './liveUtils';
import { Gems, holdGems } from './shared';

const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-white';
const SPIN_MS = 4500;
const RADIUS = 150;
const ICON_RADIUS = 128;

// A point on the wheel, `angle` degrees clockwise from the top.
function polar(angle, r) {
  const rad = (angle * Math.PI) / 180;
  return [r * Math.sin(rad), -r * Math.cos(rad)];
}

function pocketPath(start, end) {
  const [x1, y1] = polar(start, RADIUS);
  const [x2, y2] = polar(end, RADIUS);
  return `M 0 0 L ${x1} ${y1} A ${RADIUS} ${RADIUS} 0 0 1 ${x2} ${y2} Z`;
}

// The wheel: 37 equal pockets, each coloured and marked with its icon.
function Wheel({ rotation, spinning }) {
  return (
    <div className="relative mx-auto w-full max-w-[340px] aspect-square">
      {/* Pointer */}
      <div className="absolute left-1/2 -top-1 -translate-x-1/2 z-10 w-0 h-0 border-l-[14px] border-r-[14px] border-t-[24px] border-l-transparent border-r-transparent border-t-white drop-shadow" />
      <svg
        viewBox="-160 -160 320 320"
        className="w-full h-full"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.6, 0.1, 1)` : 'none',
        }}
      >
        <circle r={RADIUS + 8} fill="#0a1230" />
        {POCKETS.map((kind, i) => (
          <path
            key={i}
            d={pocketPath(i * POCKET_DEGREES, (i + 1) * POCKET_DEGREES)}
            fill={ROULETTE_BETS[kind].color}
            stroke="#0a1230"
            strokeWidth="1"
          />
        ))}
        {POCKETS.map((kind, i) => {
          const mid = (i + 0.5) * POCKET_DEGREES;
          const [x, y] = polar(mid, ICON_RADIUS);
          const size = 17;
          return (
            <image
              key={i}
              href={ROULETTE_BETS[kind].icon}
              x={x - size / 2}
              y={y - size / 2}
              width={size}
              height={size}
              transform={`rotate(${mid} ${x} ${y})`}
            />
          );
        })}
        <circle r="100" fill="#111827" stroke="#0a1230" strokeWidth="4" />
        <image href="/gold.png" x="-34" y="-34" width="68" height="68" />
      </svg>
    </div>
  );
}

function BetIcon({ kind, className = 'w-5 h-5' }) {
  return <img src={ROULETTE_BETS[kind].icon} alt="" className={`${className} object-contain inline-block`} />;
}

export default function Roulette({ user, gems, onLogin }) {
  const [pick, setPick] = useState(null);
  const [amount, setAmount] = useState('');
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  // The feed as it was when the wheel started; shown until it stops, since
  // the server logs the spin (with its result) straight away.
  const [frozenRecent, setFrozenRecent] = useState(null);
  const timer = useRef(null);

  useEffect(() => subscribeToRecentSpins(setRecent), []);
  useEffect(() => () => {
    clearTimeout(timer.current);
    holdGems(null);
  }, []);

  const stake = Number(amount);
  const stakeValid = Number.isInteger(stake) && stake >= 1 && stake <= gems;
  const picked = pick ? ROULETTE_BETS[pick] : null;

  const spin = async () => {
    setError('');
    setResult(null);
    setSpinning(true);
    // Until the wheel stops: the stake is gone, the winnings not yet shown.
    setFrozenRecent(recent);
    holdGems(gems - stake);
    let outcome;
    try {
      outcome = await spinRoulette(pick, stake);
    } catch (err) {
      setError(err.message || 'The wheel jammed - try again.');
      setSpinning(false);
      setFrozenRecent(null);
      holdGems(null);
      return;
    }
    setRotation((current) => spinTarget(current, outcome.pocket, Math.random()));
    timer.current = setTimeout(() => {
      setSpinning(false);
      setResult({ ...outcome, stake });
      setFrozenRecent(null);
      holdGems(null);
    }, SPIN_MS + 100);
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
        <div>
          <h2 className="text-2xl font-bold">Roulette</h2>
          <p className="text-sm text-gray-300">
            Bet on an Elixir or Gold pocket to double your bet, or on the single Gem pocket for 36x.
          </p>
        </div>
        <Wheel rotation={rotation} spinning={spinning} />
        <div className="min-h-[3.5rem] text-center">
          {spinning && <p className="text-lg font-bold text-gray-300">Spinning...</p>}
          {!spinning && result && (
            <>
              <p className="text-lg flex items-center justify-center gap-2">
                Landed on <BetIcon kind={result.landed} className="w-6 h-6" />
                <span className="font-bold">{ROULETTE_BETS[result.landed].name}</span>
              </p>
              <p className="text-xl font-bold">
                {result.payout > 0 ? <>You won <Gems amount={result.payout} />!</> : <>You lost <Gems amount={result.stake} />.</>}
              </p>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(ROULETTE_BETS).map(([key, bet]) => (
              <button
                key={key}
                onClick={() => setPick(key)}
                disabled={spinning}
                className={`rounded-lg border-4 p-3 text-center transition ${
                  pick === key ? 'border-white' : 'border-transparent hover:border-gray-400'
                }`}
                style={{ backgroundColor: bet.color }}
              >
                <BetIcon kind={key} className="w-12 h-12 mx-auto" />
                <div className="text-lg font-bold mt-1">{bet.name}</div>
                <div className="text-sm">pays {bet.payout}x</div>
              </button>
            ))}
          </div>

          {user.isGuest ? (
            <button onClick={onLogin} className={`${GOLD_BUTTON} w-full py-2`}>Log in to spin</button>
          ) : (
            <div className="space-y-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={gems}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Gold to bet (you have ${formatGems(gems)})`}
                className={INPUT}
              />
              <div className="grid grid-cols-4 gap-2 text-sm">
                {[['10%', 0.1], ['25%', 0.25], ['50%', 0.5], ['All in', 1]].map(([label, share]) => (
                  <button
                    key={label}
                    type="button"
                    disabled={gems <= 0}
                    onClick={() => setAmount(String(Math.max(1, Math.floor(gems * share))))}
                    className="border border-gray-600 hover:border-white rounded py-1 transition disabled:opacity-50"
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={spin} disabled={!picked || !stakeValid || spinning} className={`${GOLD_BUTTON} w-full py-3 text-lg`}>
                {spinning
                  ? 'Spinning...'
                  : gems <= 0
                  ? 'You\'re out of Gold'
                  : !picked
                  ? 'Pick Elixir, Gold or Gem'
                  : !stakeValid
                  ? `Bet between 1 and ${formatGems(gems)}`
                  : <>Spin: <Gems amount={stake} /> on {picked.name} - win <Gems amount={stake * picked.payout} /></>}
              </button>
              {error && <p className="text-red-400 text-sm">{error}</p>}
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h3 className="text-lg font-bold mb-2">Recent spins</h3>
          {(frozenRecent || recent).length === 0 ? (
            <p className="text-sm text-gray-400">No spins yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(frozenRecent || recent).filter((s) => ROULETTE_BETS[s.landed] && ROULETTE_BETS[s.pick]).map((s) => (
                <li key={s.id} className="flex justify-between items-center gap-3">
                  <span className="truncate flex items-center gap-1">
                    <span className="font-bold truncate">{s.username || 'Unknown'}</span>
                    <span className="text-gray-400">bet</span>
                    <BetIcon kind={s.pick} className="w-4 h-4" />
                    <span className="text-gray-400">landed</span>
                    <BetIcon kind={s.landed} className="w-4 h-4" />
                  </span>
                  {s.payout > 0 ? (
                    <Gems amount={s.payout} className="font-bold text-green-400 shrink-0" />
                  ) : (
                    <span className="text-gray-400 shrink-0">-{formatGems(s.amount)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
