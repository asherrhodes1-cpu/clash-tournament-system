import React, { useState, useEffect } from 'react';
import { useFeaturedRound, SideBars } from './LivePage';
import { useChallengeGoal, ChallengeOverlayCard } from './ChallengeGoal';
import { useGemDrop, GemDropOverlayCard } from './GemDrop';
import { useLifeRun, ExtraLivesOverlayCard } from './ExtraLives';
import { useNow, Countdown } from './shared';
import { effectiveStatus, bettingEndsAt, roundKind } from './liveUtils';

// How much bigger than the page the overlay draws, so small labels stay
// readable once the stream is shrunk onto a viewer's screen. Set it from the
// OBS Browser source URL, e.g. /live/overlay?scale=2.
const DEFAULT_SCALE = 1.5;
function overlayScale() {
  const value = Number(new URLSearchParams(window.location.search).get('scale'));
  return value >= 0.5 && value <= 4 ? value : DEFAULT_SCALE;
}

// How to draw the overlay so every card fits inside the Browser source (a
// tall exact-stars table plus a gem drop won't fit OBS's default 800x600 at
// full size): cards stacked or side by side, whichever lets them be drawn
// bigger, at the requested scale or as much smaller as it takes. Measured
// from the cards' own sizes, which don't depend on the arrangement, and
// re-measured whenever they change or the source is resized.
const PAD = 24; // p-6
const GAP = 16; // gap-4
// `cards` names the cards on screen, so one appearing or going re-measures.
function useFitLayout(el, cards) {
  const wanted = overlayScale();
  const [layout, setLayout] = useState({ scale: wanted, row: false });
  useEffect(() => {
    if (!el) return;
    const fit = () => {
      const sizes = [...el.children].map((c) => ({ w: c.offsetWidth, h: c.offsetHeight }));
      if (!sizes.length) return;
      const gaps = GAP * (sizes.length - 1);
      const sum = (key) => sizes.reduce((total, c) => total + c[key], 0);
      const max = (key) => Math.max(...sizes.map((c) => c[key]));
      const scaleFor = (w, h) => Math.min(wanted, window.innerWidth / (w + 2 * PAD), window.innerHeight / (h + 2 * PAD));
      const stacked = scaleFor(max('w'), sum('h') + gaps);
      const sideBySide = scaleFor(sum('w') + gaps, max('h'));
      const row = sizes.length > 1 && sideBySide > stacked;
      setLayout({ scale: row ? sideBySide : stacked, row });
    };
    fit();
    const observer = new ResizeObserver(fit);
    [...el.children].forEach((c) => observer.observe(c));
    window.addEventListener('resize', fit);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', fit);
    };
  }, [el, wanted, cards]);
  return layout;
}

const STATUS_TEXT = {
  closed: 'Betting closed',
  settling: 'Paying out...',
  undoing: 'Correcting the result...',
  cancelled: 'Cancelled - bets refunded',
};

function BetOverlayCard({ round, bets }) {
  const now = useNow(round.status === 'open');
  const current = effectiveStatus(round, now);
  let status;
  if (current === 'open') status = <span className="text-green-400">Bet at {window.location.host}/live</span>;
  else if (round.status === 'settled') status = <span className="text-white">{roundKind(round).results[round.result]}</span>;
  else status = <span className="text-gray-300">{STATUS_TEXT[current]}</span>;

  return (
    <div className="w-[520px] bg-gray-950 rounded-xl border-4 border-yellow-500 p-5 shadow-2xl">
      <div className="flex flex-wrap justify-between items-baseline gap-x-3 mb-1 text-base font-bold uppercase tracking-wide [&>span]:whitespace-nowrap">
        <span className="text-yellow-400">Live bet</span>
        {status}
      </div>
      <h2 className="text-2xl font-bold mb-4">{round.description}</h2>
      {current === 'open' && (
        <div className="mb-4"><Countdown endsAt={bettingEndsAt(round)} durationMs={round.bettingMs} now={now} label="Betting closes in" large /></div>
      )}
      <SideBars round={round} bets={bets} large />
    </div>
  );
}

// Loaded on its own at /live/overlay as an OBS Browser source. The page is
// transparent, so only the cards show on stream: a Gold drop while it's open,
// the lives run, the betting round and the challenge goal, each disappearing
// when hidden.
export default function LiveOverlay() {
  const { state, round, bets } = useFeaturedRound();
  const { goal, donations } = useChallengeGoal(state.goalId);
  const { drop, claims } = useGemDrop(state.dropId);
  const { run: lifeRun } = useLifeRun(state.lifeRunId);
  const [content, setContent] = useState(null);
  const { scale, row } = useFitLayout(content, [drop && 'drop', lifeRun && 'lives', round && 'round', goal && 'goal'].filter(Boolean).join());

  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById('root')];
    els.forEach((el) => el && (el.style.background = 'transparent'));
    // Never show scrollbars in OBS; the overlay scales itself to fit instead.
    document.documentElement.style.overflow = 'hidden';
  }, []);

  if (!round && !goal && !drop && !lifeRun) return null;

  return (
    <div
      ref={setContent}
      className={`live-overlay p-6 w-max flex gap-4 ${row ? 'flex-row items-start' : 'flex-col'}`}
      style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
    >
      {drop && <GemDropOverlayCard drop={drop} claims={claims} />}
      {lifeRun && <ExtraLivesOverlayCard run={lifeRun} />}
      {round && <BetOverlayCard round={round} bets={bets} />}
      {goal && <ChallengeOverlayCard goal={goal} donations={donations} />}
    </div>
  );
}
