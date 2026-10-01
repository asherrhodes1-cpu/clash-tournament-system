import React, { useState, useEffect } from 'react';
import {
  subscribeToLiveState,
  subscribeToLiveRound,
  subscribeToRoundBets,
  subscribeToRecentRounds,
  subscribeToMyGems,
  subscribeToGemLeaderboard,
  placeLiveBet,
  removeLiveBet,
  setLiveVideoUrl,
  createLiveRound,
  featureLiveRound,
  setLiveRoundStatus,
  settleLiveRound,
} from '../api/live';
import {
  parseYouTubeId,
  tallyBets,
  percentOf,
  formatGems,
  STARTING_GEMS,
  FREE_PICK_REWARD,
  ROUND_KINDS,
  roundKind,
  BETTING_SECONDS,
  effectiveStatus,
  secondsLeft,
  bettingEndsAt,
} from './liveUtils';
import { Gems, Countdown, useNow, useHeldGems, Section } from './shared';
import { useChallengeGoal, ChallengeGoalCard, StaffChallengePanel } from './ChallengeGoal';
import Roulette from './Roulette';
import { useGemDrop, GemDropCard, StaffGemDropPanel } from './GemDrop';

const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const OUTLINE_BUTTON = 'border border-white text-white hover:bg-white hover:text-black rounded transition disabled:opacity-50';
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-white';

const STATUS_TEXT = {
  open: 'Betting open',
  closed: 'Betting closed',
  settling: 'Paying out...',
  settled: 'Result is in',
  cancelled: 'Cancelled',
};

// The featured round and its bets, kept live. Shared by the page and the overlay.
export function useFeaturedRound() {
  const [state, setState] = useState({});
  const [round, setRound] = useState(null);
  const [bets, setBets] = useState([]);

  useEffect(() => subscribeToLiveState(setState), []);

  useEffect(() => {
    if (!state.roundId) {
      setRound(null);
      setBets([]);
      return;
    }
    const unsubRound = subscribeToLiveRound(state.roundId, setRound);
    const unsubBets = subscribeToRoundBets(state.roundId, setBets);
    return () => {
      unsubRound();
      unsubBets();
    };
  }, [state.roundId]);

  return { state, round, bets };
}

// A player's gems, counting the starting amount for someone who hasn't bet yet.
// While a roulette spin is animating this is the balance held back for it
// (see holdGems), so every place that shows gems stays in step with the wheel.
export function useMyGems(uid) {
  const [gems, setGems] = useState(null);
  const held = useHeldGems();
  useEffect(() => {
    if (!uid) {
      setGems(null);
      return;
    }
    return subscribeToMyGems(uid, setGems);
  }, [uid]);
  return held ?? gems ?? STARTING_GEMS;
}

// Succeed vs fail, each bar filled to its share of the gems bet. Once a
// round is settled the winning side stays lit and the other dims.
export function SideBars({ round, bets, large = false }) {
  const kind = roundKind(round);
  const totals = tallyBets(bets, kind.sides);
  const pot = kind.sides.reduce((sum, side) => sum + totals[side].gems, 0);
  // Exact stars has 7 options, so each gets one slim line instead of two.
  const compact = kind.sides.length > 2;
  // On the stream overlay every label is one size up and on a single line,
  // since the small second line doesn't survive the stream being shrunk.
  if (large) {
    return (
      <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
        {kind.sides.map((side) => {
          const { gems, bettors } = totals[side];
          const won = round.status === 'settled' && round.result === side;
          const lost = round.status === 'settled' && round.result !== side;
          return (
            <div key={side} className={`relative overflow-hidden rounded border-2 bg-gray-900 ${won ? 'border-white' : 'border-gray-600'}`}>
              <div
                className={`absolute inset-y-0 left-0 ${lost ? 'bg-gray-600' : kind.colors[side]} transition-all duration-500`}
                style={{ width: `${percentOf(gems, pot)}%` }}
              />
              <div className={`relative flex justify-between items-center gap-3 px-4 ${compact ? 'py-1 text-lg' : 'py-3 text-2xl'}`}>
                <span className="font-bold">
                  {kind.labels[side]}
                  <span className="ml-2 text-gray-200">{kind.multipliers[side]}x</span>
                  {won && <span className="ml-2">WINNER</span>}
                </span>
                <span className="font-bold shrink-0">
                  <Gems amount={gems} />
                  <span className="ml-2 text-gray-200">· {bettors} {bettors === 1 ? 'bet' : 'bets'}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className={compact ? 'space-y-1' : 'space-y-2'}>
      {kind.sides.map((side) => {
        const { gems, bettors } = totals[side];
        const won = round.status === 'settled' && round.result === side;
        const lost = round.status === 'settled' && round.result !== side;
        return (
          <div key={side} className={`relative overflow-hidden rounded border-2 bg-gray-900 ${won ? 'border-white' : 'border-gray-700'}`}>
            <div
              className={`absolute inset-y-0 left-0 ${lost ? 'bg-gray-600' : kind.colors[side]} transition-all duration-500`}
              style={{ width: `${percentOf(gems, pot)}%` }}
            />
            {compact ? (
              <div className="relative flex justify-between items-center gap-3 px-3 py-1 text-sm">
                <span className="font-bold">
                  {kind.labels[side]} <span className="text-xs text-gray-300">{kind.multipliers[side]}x</span>
                  {won && <span className="text-xs ml-1">WINNER</span>}
                </span>
                <span className="shrink-0">
                  <Gems amount={gems} className="font-bold" /> <span className="text-xs">({bettors})</span>
                </span>
              </div>
            ) : (
              <div className="relative flex justify-between items-center gap-3 px-4 py-2">
                <div>
                  <div className="font-bold">
                    {kind.labels[side]} <span className="text-xs text-gray-300">pays {kind.multipliers[side]}x</span>
                  </div>
                  {won && <div className="text-xs font-bold">WINNER</div>}
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold"><Gems amount={gems} /></div>
                  <div className="text-xs">{bettors} {bettors === 1 ? 'bettor' : 'bettors'}</div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BetCard({ round, bets, user, gems, onLogin }) {
  const now = useNow(round.status === 'open');
  const status = effectiveStatus(round, now);
  const myBet = user.uid ? bets.find((b) => b.id === user.uid) : null;
  const [side, setSide] = useState(myBet?.side || null);
  const [amount, setAmount] = useState(myBet ? String(myBet.amount) : '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Follow the saved bet when it loads or changes (e.g. from another tab).
  useEffect(() => {
    if (myBet) {
      setSide(myBet.side);
      setAmount(String(myBet.amount));
    }
  }, [myBet?.side, myBet?.amount]);

  const isOpen = status === 'open';
  const kind = roundKind(round);
  // Gems you could put on this round: your balance plus what's already on it.
  const available = gems + (myBet?.amount || 0);
  const freePick = available === 0;
  const stake = freePick ? 0 : Number(amount);
  const stakeValid = freePick || (Number.isInteger(stake) && stake >= 1 && stake <= available);

  const submit = async () => {
    setError('');
    setSubmitting(true);
    try {
      await placeLiveBet(round.id, side, stake);
    } catch (err) {
      setError(err.message || 'Your bet didn\'t go through.');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    setError('');
    setSubmitting(true);
    try {
      await removeLiveBet(round.id);
      setSide(null);
      setAmount('');
    } catch (err) {
      setError(err.message || 'Couldn\'t take your bet back.');
    } finally {
      setSubmitting(false);
    }
  };

  const unchanged = myBet && myBet.side === side && myBet.amount === stake;

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
      <div>
        <div className="flex justify-between items-baseline gap-3 mb-1 text-sm">
          <span className="text-gray-400 font-bold uppercase tracking-wide">Live bet</span>
          <span className={isOpen ? 'text-green-400' : 'text-gray-400'}>{STATUS_TEXT[status]}</span>
        </div>
        <h2 className="text-xl font-bold">{round.description}</h2>
      </div>

      {isOpen && <Countdown endsAt={bettingEndsAt(round)} durationMs={round.bettingMs} now={now} label="Betting closes in" />}

      {round.status === 'settled' && (
        <div className={`rounded p-3 text-center font-bold text-lg ${kind.colors[round.result]}`}>
          {kind.results[round.result]}
        </div>
      )}
      {round.status === 'cancelled' && (
        <div className="rounded p-3 text-center bg-gray-700">Round cancelled - every bet was refunded.</div>
      )}

      <SideBars round={round} bets={bets} />

      {isOpen && user.isGuest && (
        <button onClick={onLogin} className={`${GOLD_BUTTON} w-full py-2`}>
          Log in to bet
        </button>
      )}

      {isOpen && !user.isGuest && (
        <div className="space-y-3 border-t border-gray-700 pt-4">
          <div className={`grid gap-2 ${kind.sides.length > 2 ? 'grid-cols-4' : 'grid-cols-2'}`}>
            {kind.sides.map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={`py-3 rounded font-bold border-2 transition ${
                  side === s ? `${kind.colors[s]} border-white` : 'bg-gray-900 border-gray-700 hover:border-gray-400'
                }`}
              >
                <div>{kind.sides.length > 2 ? s : kind.labels[s]}</div>
                <div className="text-xs text-gray-300">{kind.multipliers[s]}x</div>
              </button>
            ))}
          </div>

          {freePick ? (
            <p className="text-sm text-gray-300">
              You're out of gems, but you can still pick a side for free. Get it right and you win <Gems amount={FREE_PICK_REWARD} className="font-bold text-white" />.
            </p>
          ) : (
            <div className="space-y-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={available}
                step={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Gems to bet (you have ${formatGems(available)})`}
                className={INPUT}
              />
              <div className="grid grid-cols-4 gap-2 text-sm">
                {[['10%', 0.1], ['25%', 0.25], ['50%', 0.5], ['All in', 1]].map(([label, share]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAmount(String(Math.max(1, Math.floor(available * share))))}
                    className="border border-gray-600 hover:border-white rounded py-1 transition"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={!side || !stakeValid || submitting || unchanged}
            className={`${GOLD_BUTTON} w-full py-2`}
          >
            {submitting
              ? 'Saving...'
              : unchanged
              ? 'Bet placed'
              : !side
              ? 'Pick one'
              : freePick
              ? `Pick ${kind.labels[side]} for free`
              : !stakeValid
              ? `Bet between 1 and ${formatGems(available)}`
              : <>{myBet ? 'Update bet' : 'Bet'} <Gems amount={stake} /> on {kind.labels[side]} - win <Gems amount={Math.floor(stake * kind.multipliers[side])} /></>}
          </button>
          {myBet && (
            <button onClick={remove} disabled={submitting} className={`${OUTLINE_BUTTON} w-full py-2 text-sm`}>
              Take my bet back
            </button>
          )}
        </div>
      )}

      {myBet && (
        <p className="text-sm text-gray-300">
          {myBet.amount > 0
            ? <>Your bet: <Gems amount={myBet.amount} className="font-bold text-white" /> on <span className="font-bold text-white">{kind.labels[myBet.side]}</span>.</>
            : <>Your free pick: <span className="font-bold text-white">{kind.labels[myBet.side]}</span>.</>}
          {isOpen && ' You can change it until betting closes.'}
        </p>
      )}
      {round.status === 'settled' && myBet && (
        <p className="font-bold text-lg">
          {myBet.payout > 0
            ? <>You won <Gems amount={myBet.payout} />!</>
            : myBet.amount > 0
            ? <>You lost <Gems amount={myBet.amount} />.</>
            : 'Not this time.'}
        </p>
      )}
      {error && <p className="text-red-400 text-sm">{error}</p>}
    </div>
  );
}

function Leaderboard({ user }) {
  const [rows, setRows] = useState([]);
  useEffect(() => subscribeToGemLeaderboard(setRows), []);

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <h2 className="text-xl font-bold mb-3">Most gems</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">Nobody has bet yet. Everyone starts with <Gems amount={STARTING_GEMS} />.</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className={`flex justify-between gap-3 px-2 py-1 rounded ${row.id === user.uid ? 'bg-gray-700' : ''}`}
            >
              <span className="truncate">
                <span className="text-gray-400 inline-block w-6">{i + 1}.</span>
                {row.username || 'Unknown'}
              </span>
              <Gems amount={row.gems} className="font-bold shrink-0" />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// The staff controls, as collapsible sections. `children` are extra
// sections (gem drop, challenge goal) slotted in after Rounds.
function StaffLivePanel({ state, user, children }) {
  const [videoInput, setVideoInput] = useState(state.videoUrl || '');
  const [description, setDescription] = useState('');
  const [recentRounds, setRecentRounds] = useState([]);
  const [showFinished, setShowFinished] = useState(false);
  const now = useNow(recentRounds.some((r) => r.status === 'open'));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setVideoInput(state.videoUrl || ''), [state.videoUrl]);
  useEffect(() => subscribeToRecentRounds(setRecentRounds), []);

  const run = async (action, doneMessage = '') => {
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

  const saveVideo = (e) => {
    e.preventDefault();
    if (videoInput.trim() && !parseYouTubeId(videoInput)) {
      setError('That doesn\'t look like a YouTube video or live link.');
      return;
    }
    run(() => setLiveVideoUrl(videoInput.trim()), videoInput.trim() ? 'Stream link saved.' : 'Stream link cleared.');
  };

  // One click, no typing: a standard round of either kind.
  const newAttack = (kindKey) => run(
    () => createLiveRound(ROUND_KINDS[kindKey].description, user.username, kindKey),
    `New attack is up - betting closes in ${BETTING_SECONDS} seconds.`
  );

  const startRound = (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setError('Say what you\'re attempting.');
      return;
    }
    run(async () => {
      await createLiveRound(description.trim(), user.username, 'outcome');
      setDescription('');
    }, `Betting is open for ${BETTING_SECONDS} seconds.`);
  };

  const settle = (round, result) => {
    const prompt = result === 'cancel'
      ? `Cancel "${round.description}" and refund every bet?`
      : `Settle "${round.description}" as ${roundKind(round).results[result]}? This pays out and can't be undone.`;
    if (!window.confirm(prompt)) return;
    run(
      () => settleLiveRound(round.id, result),
      ({ bettors, paidOut }) => `Done - ${bettors} ${bettors === 1 ? 'bet' : 'bets'}, ${formatGems(paidOut)} gems paid out.`
    );
  };

  const overlayUrl = `${window.location.origin}/live/overlay`;

  const openRounds = recentRounds.filter((r) => effectiveStatus(r, now) === 'open').length;
  const toSettle = recentRounds.filter((r) => effectiveStatus(r, now) === 'closed').length;
  const roundsSummary = [openRounds && `${openRounds} betting`, toSettle && `${toSettle} to settle`].filter(Boolean).join(' · ');
  // Rounds that still need something from you come first; finished ones
  // (settled or cancelled) sit behind a toggle so the list stays short.
  const finished = (r) => r.status === 'settled' || r.status === 'cancelled';
  const activeRounds = recentRounds.filter((r) => !finished(r));
  const finishedRounds = recentRounds.filter(finished);

  return (
    <div className="bg-gray-800 rounded-lg border-2 border-white p-6 space-y-3">
      <h2 className="text-xl font-bold">Stream controls <span className="text-sm text-gray-400">[STAFF]</span></h2>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      <Section id="new-attack" title="New attack" defaultOpen>
        <div className="space-y-2">
          <div className="grid sm:grid-cols-2 gap-2">
            {Object.entries(ROUND_KINDS).map(([key, kind]) => (
              <button
                key={key}
                onClick={() => newAttack(key)}
                disabled={busy}
                className={`${GOLD_BUTTON} py-4`}
              >
                <div className="text-xl">New attack</div>
                <div className="text-sm">{kind.name}</div>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            Starts a round with a {BETTING_SECONDS}-second betting countdown on the page and the overlay - "{ROUND_KINDS.outcome.description}" or "{ROUND_KINDS.stars.description}". Betting closes by itself when it hits 0.
          </p>
        </div>
      </Section>

      <Section id="rounds" title="Rounds" summary={roundsSummary} defaultOpen>
        <div className="space-y-3">
          {activeRounds.length === 0 && (
            <p className="text-sm text-gray-400">Nothing running - start a New attack above.</p>
          )}
          {finishedRounds.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFinished((v) => !v)}
              className="text-sm text-gray-300 underline hover:text-white"
            >
              {showFinished ? 'Hide' : 'Show'} finished rounds ({finishedRounds.length})
            </button>
          )}
          {[...activeRounds, ...(showFinished ? finishedRounds : [])].map((round) => {
            const featured = state.roundId === round.id;
            const canSettle = round.status === 'open' || round.status === 'closed';
            const status = effectiveStatus(round, now);
            const left = status === 'open' ? secondsLeft(round, now) : null;
            return (
              <div key={round.id} className={`rounded border p-4 space-y-3 ${featured ? 'border-yellow-500' : 'border-gray-700'}`}>
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="font-bold">{round.description}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(round.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      {' · '}
                      {STATUS_TEXT[status]}
                      {left != null && ` (${left}s left)`}
                      {round.status === 'settled' && ` - ${roundKind(round).results[round.result]}`}
                      {featured && ' · On screen'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end shrink-0 text-sm">
                    {featured ? (
                      <button disabled={busy} onClick={() => run(() => featureLiveRound(null))} className={`${OUTLINE_BUTTON} px-3 py-1`}>Hide</button>
                    ) : (
                      <button disabled={busy} onClick={() => run(() => featureLiveRound(round.id))} className={`${OUTLINE_BUTTON} px-3 py-1`}>Show</button>
                    )}
                    {status === 'open' && (
                      <button disabled={busy} onClick={() => run(() => setLiveRoundStatus(round.id, 'closed'))} className={`${OUTLINE_BUTTON} px-3 py-1`}>Close now</button>
                    )}
                    {status === 'closed' && (
                      <button
                        disabled={busy}
                        onClick={() => run(() => setLiveRoundStatus(round.id, 'open'), `Betting reopened for ${BETTING_SECONDS} seconds.`)}
                        className={`${OUTLINE_BUTTON} px-3 py-1`}
                      >
                        Reopen ({BETTING_SECONDS}s)
                      </button>
                    )}
                  </div>
                </div>
                {canSettle && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-400">Result:</span>
                    {roundKind(round) === ROUND_KINDS.stars ? (
                      ROUND_KINDS.stars.sides.map((stars) => (
                        <button
                          key={stars}
                          disabled={busy}
                          onClick={() => settle(round, stars)}
                          className={`px-3 py-1 rounded font-bold ${ROUND_KINDS.stars.colors[stars]} hover:opacity-80 transition disabled:opacity-50`}
                        >
                          {ROUND_KINDS.stars.labels[stars]}
                        </button>
                      ))
                    ) : (
                      <>
                        <button disabled={busy} onClick={() => settle(round, 'succeed')} className="px-3 py-1 rounded font-bold bg-green-600 hover:bg-green-500 transition disabled:opacity-50">I succeeded</button>
                        <button disabled={busy} onClick={() => settle(round, 'fail')} className="px-3 py-1 rounded font-bold bg-red-600 hover:bg-red-500 transition disabled:opacity-50">I failed</button>
                      </>
                    )}
                    <button disabled={busy} onClick={() => settle(round, 'cancel')} className={`${OUTLINE_BUTTON} px-3 py-1`}>Cancel &amp; refund</button>
                  </div>
                )}
                {round.status === 'settling' && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-gray-400">Payout didn't finish.</span>
                    <button disabled={busy} onClick={() => settle(round, round.pendingResult)} className={`${GOLD_BUTTON} px-3 py-1`}>Finish paying out</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {children}

      <Section id="custom-round" title="Custom round">
        <form onSubmit={startRound} className="space-y-2">
          <label className="block text-sm text-gray-300">Your own question, same 45-second betting</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Can I 6-star this base first try?"
              maxLength={200}
              className={INPUT}
            />
            <button type="submit" disabled={busy} className={`${GOLD_BUTTON} px-4 py-2 shrink-0`}>Open betting</button>
          </div>
          <p className="text-xs text-gray-500">
            Same as New attack, with your own question. Settle it with the result once the attack is done.
          </p>
        </form>
      </Section>

      <Section id="stream-link" title="Stream link & overlay">
        <div className="space-y-4">
        <p className="text-sm text-gray-400">
          OBS overlay: add a Browser source pointing to{' '}
          <button
            onClick={() => run(() => navigator.clipboard.writeText(overlayUrl), 'Overlay link copied.')}
            className="underline hover:text-white"
          >
            {overlayUrl}
          </button>
          {' '}(click to copy). It shows what's on screen - bets, gem drops, challenge goals - and is transparent everywhere else. Too big or small on stream? Add <span className="font-mono">?scale=2</span> (bigger) or <span className="font-mono">?scale=1</span> (smaller) to the end of the link - the default is 1.5.
        </p>
        <form onSubmit={saveVideo} className="space-y-2">
          <label className="block font-bold">YouTube stream link</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={videoInput}
              onChange={(e) => setVideoInput(e.target.value)}
              placeholder="https://www.youtube.com/live/..."
              className={INPUT}
            />
            <button type="submit" disabled={busy} className={`${GOLD_BUTTON} px-4 py-2 shrink-0`}>Save</button>
          </div>
          <p className="text-xs text-gray-500">Leave it empty and save to take the player off the page.</p>
        </form>
        </div>
      </Section>

    </div>
  );
}

export default function LivePage({ user, onLogin }) {
  const { state, round, bets } = useFeaturedRound();
  const { goal, donations } = useChallengeGoal(state.goalId);
  const { drop, claims } = useGemDrop(state.dropId);
  const gems = useMyGems(user.uid);
  const videoId = parseYouTubeId(state.videoUrl);
  const [tab, setTab] = useState('stream');

  const tabClass = (key) => `px-4 py-2 rounded font-bold transition ${
    tab === key ? 'bg-white text-black' : 'border border-gray-600 hover:border-white'
  }`;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold mr-2">Live</h1>
          <button onClick={() => setTab('stream')} className={tabClass('stream')}>Stream</button>
          <button onClick={() => setTab('roulette')} className={tabClass('roulette')}>Roulette</button>
        </div>
        {!user.isGuest && (
          <p className="text-lg">
            <span className="text-gray-400">Your gems: </span>
            <Gems amount={gems} className="font-bold" />
          </p>
        )}
      </div>

      {tab === 'roulette' && <Roulette user={user} gems={gems} onLogin={onLogin} />}

      {tab === 'stream' && (
      <>
      <div className="grid lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          {videoId ? (
            <div className="relative w-full overflow-hidden rounded-lg border border-gray-700 bg-gray-900" style={{ paddingTop: '56.25%' }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${videoId}?rel=0`}
                title="Live stream"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-10 text-center">
              <p className="text-xl font-bold mb-2">We're not live right now</p>
              <p className="text-gray-400">Check back during the next stream - betting opens here while we're on.</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          {drop && <GemDropCard drop={drop} claims={claims} user={user} onLogin={onLogin} />}
          {round ? (
            <BetCard round={round} bets={bets} user={user} gems={gems} onLogin={onLogin} />
          ) : (
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 text-center text-gray-400">
              No bet running. When an attack starts during the stream, bet your gems on how it goes.
            </div>
          )}
          {goal && <ChallengeGoalCard goal={goal} donations={donations} user={user} gems={gems} onLogin={onLogin} />}
          <Leaderboard user={user} />
        </div>
      </div>

      {user.isStaff && (
        <StaffLivePanel state={state} user={user}>
          <Section id="gem-drop" title="Gem drop" summary={drop ? `${claims.length} claimed` : null}>
            <StaffGemDropPanel drop={drop} claims={claims} user={user} />
          </Section>
          <Section id="challenge-goal" title="Challenge goal" summary={goal ? `${formatGems(goal.raised)} / ${formatGems(goal.target)}` : null}>
            <StaffChallengePanel goal={goal} user={user} />
          </Section>
        </StaffLivePanel>
      )}
      </>
      )}
    </div>
  );
}
