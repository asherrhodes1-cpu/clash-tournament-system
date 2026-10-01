import React, { useEffect } from 'react';
import { useFeaturedRound, SideBars } from './LivePage';
import { useChallengeGoal, ChallengeOverlayCard } from './ChallengeGoal';
import { useGemDrop, GemDropOverlayCard } from './GemDrop';
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

const STATUS_TEXT = {
  closed: 'Betting closed',
  settling: 'Paying out...',
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
// transparent, so only the cards show on stream: a gem drop while it's open,
// the betting round and the challenge goal, each disappearing when hidden.
export default function LiveOverlay() {
  const { state, round, bets } = useFeaturedRound();
  const { goal, donations } = useChallengeGoal(state.goalId);
  const { drop, claims } = useGemDrop(state.dropId);

  useEffect(() => {
    const els = [document.documentElement, document.body, document.getElementById('root')];
    els.forEach((el) => el && (el.style.background = 'transparent'));
  }, []);

  if (!round && !goal && !drop) return null;

  return (
    <div className="p-6 space-y-4" style={{ zoom: overlayScale() }}>
      {drop && <GemDropOverlayCard drop={drop} claims={claims} />}
      {round && <BetOverlayCard round={round} bets={bets} />}
      {goal && <ChallengeOverlayCard goal={goal} donations={donations} />}
    </div>
  );
}
