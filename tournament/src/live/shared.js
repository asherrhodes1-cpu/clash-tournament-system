import React, { useState, useEffect, useSyncExternalStore } from 'react';
import { ChevronDown } from 'lucide-react';
import { formatGems } from './liveUtils';

// Small pieces used across the Live page, the challenge goal and the overlay.

// An amount of Gold (the Live section's pretend currency - stored as `gems`,
// its original name) with the gold icon in front, sized to the surrounding text.
export function Gems({ amount, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap align-middle ${className}`}>
      <img src="/gold.png" alt="Gold" className="w-[1.1em] h-[1.1em] object-contain" />
      {formatGems(amount)}
    </span>
  );
}

// The current time, ticking a few times a second so countdowns stay smooth.
export function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

// A countdown (betting, challenge votes): time left in big type over a bar
// that drains to empty. Turns red for the last 10 seconds, gone at 0.
export function Countdown({ endsAt, durationMs, now, label, large = false }) {
  if (endsAt == null || now >= endsAt) return null;
  const left = Math.ceil((endsAt - now) / 1000);
  const share = Math.max(0, Math.min(1, (endsAt - now) / durationMs));
  const urgent = left <= 10;
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-bold uppercase tracking-wide text-gray-300">{label}</span>
        <span className={`font-bold tabular-nums ${large ? 'text-4xl' : 'text-3xl'} ${urgent ? 'text-red-400' : 'text-white'}`}>
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
      </div>
      <div className="h-2 rounded bg-gray-700 overflow-hidden">
        <div
          className={`h-full ${urgent ? 'bg-red-500' : 'bg-yellow-500'} transition-[width] duration-200 ease-linear`}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

// A gem balance to show in place of the real one for a moment. The roulette
// sets it while the wheel turns, because the server has already paid out and
// the live balance would give the result away before the wheel stops.
let heldGems = null;
const heldListeners = new Set();

export function holdGems(value) {
  heldGems = value;
  heldListeners.forEach((listener) => listener());
}

export function useHeldGems() {
  return useSyncExternalStore(
    (listener) => {
      heldListeners.add(listener);
      return () => heldListeners.delete(listener);
    },
    () => heldGems
  );
}

// A collapsible section of the staff controls: a header you click to open
// or close it, remembered per section in this browser. `summary` is a short
// status shown in the header, so a closed section still says what's going on.
export function Section({ id, title, summary = null, defaultOpen = false, children }) {
  const key = `live-section:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved == null ? defaultOpen : saved === 'open';
    } catch {
      return defaultOpen;
    }
  });

  const toggle = () => {
    setOpen((was) => {
      try {
        localStorage.setItem(key, was ? 'closed' : 'open');
      } catch {
        // Storage blocked (private window etc.) - it just won't be remembered.
      }
      return !was;
    });
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/40">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-700/40 rounded-lg transition"
      >
        <span className="font-bold text-lg">{title}</span>
        <span className="flex items-center gap-3 min-w-0">
          {summary && <span className="text-sm text-gray-300 truncate">{summary}</span>}
          <ChevronDown className={`w-5 h-5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && <div className="px-4 pb-4 pt-1">{children}</div>}
    </div>
  );
}
