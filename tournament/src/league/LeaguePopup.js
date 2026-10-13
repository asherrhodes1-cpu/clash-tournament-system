import React, { useEffect, useState } from 'react';
import { subscribeToLeague } from '../api/league';

// Remembered for the visit, so closing it once is enough.
const KEY = 'league-popup-closed';
const wasClosed = () => {
  try {
    return window.sessionStorage.getItem(KEY) === '1';
  } catch (err) {
    return false;
  }
};

// The large notice shown across the site while staff are streaming the
// Builder League finals: it sends people to the section where they can vote
// and play the quiz. Nothing is shown the rest of the time.
export default function LeaguePopup({ hidden, onJoin }) {
  const [league, setLeague] = useState(null);
  const [closed, setClosed] = useState(wasClosed);
  useEffect(() => subscribeToLeague(setLeague, () => setLeague(null)), []);

  if (!league?.active || closed || hidden) return null;
  const close = () => {
    setClosed(true);
    try {
      window.sessionStorage.setItem(KEY, '1');
    } catch (err) {
      // Not remembered; it stays closed until the page is loaded again.
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-label={league.title}>
      <div className="w-full max-w-2xl rounded-2xl border-4 border-white bg-gray-900 p-8 sm:p-12 text-center shadow-2xl">
        <p className="text-sm font-bold tracking-widest text-red-400 mb-3">● LIVE NOW</p>
        <h2 className="text-4xl sm:text-5xl font-bold mb-4 break-words">{league.title}</h2>
        <p className="text-lg text-gray-300 mb-8">The finals are being streamed right now. Vote on who wins each match before it starts, and play the live quiz for points.</p>
        <div className="flex flex-col sm:flex-row justify-center gap-3">
          <button type="button" onClick={() => { close(); onJoin(); }} className="bg-white text-black px-8 py-4 rounded-lg font-bold text-xl border-2 border-white hover:bg-black hover:text-white transition">Join in</button>
          <button type="button" onClick={close} className="px-8 py-4 rounded-lg font-bold text-xl border-2 border-gray-500 text-gray-300 hover:border-white hover:text-white transition">Not now</button>
        </div>
      </div>
    </div>
  );
}
