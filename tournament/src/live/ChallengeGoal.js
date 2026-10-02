import React, { useState, useEffect } from 'react';
import {
  subscribeToChallengeGoal,
  subscribeToGoalDonations,
  subscribeToChallengeList,
  saveChallengeList,
  startChallengeGoal,
  featureChallengeGoal,
  donateToChallengeGoal,
  voteOnChallenge,
  cancelChallengeGoal,
} from '../api/live';
import {
  goalPhase,
  tallyChallengeVotes,
  challengeResult,
  percentOf,
  formatGems,
  DEFAULT_GOAL_TARGET,
} from './liveUtils';
import { Gems, Countdown, useNow } from './shared';

const GOLD_BUTTON = 'bg-gradient-to-r from-amber-200 to-yellow-500 hover:from-amber-100 hover:to-yellow-400 text-gray-900 font-bold rounded transition disabled:opacity-50';
const OUTLINE_BUTTON = 'border border-white text-white hover:bg-white hover:text-black rounded transition disabled:opacity-50';
const INPUT = 'w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white focus:outline-none focus:border-white';

const PHASE_TEXT = {
  collecting: 'Collecting Gold',
  voting: 'Voting now',
  decided: 'Challenge picked',
  cancelling: 'Refunding...',
  cancelled: 'Cancelled',
};

// The featured goal and its donations, kept live.
export function useChallengeGoal(goalId) {
  const [goal, setGoal] = useState(null);
  const [donations, setDonations] = useState([]);

  useEffect(() => {
    if (!goalId) {
      setGoal(null);
      setDonations([]);
      return;
    }
    const unsubGoal = subscribeToChallengeGoal(goalId, setGoal);
    const unsubDonations = subscribeToGoalDonations(goalId, setDonations);
    return () => {
      unsubGoal();
      unsubDonations();
    };
  }, [goalId]);

  return { goal, donations };
}

function GoalProgress({ goal, large = false }) {
  const pct = percentOf(goal.raised, goal.target);
  return (
    <div className="space-y-1">
      <div className={`relative overflow-hidden rounded bg-gray-900 border border-gray-700 ${large ? 'h-10' : 'h-6'}`}>
        <div className="absolute inset-y-0 left-0 bg-lime-600 transition-all duration-500" style={{ width: `${pct}%` }} />
        <div className={`relative h-full flex items-center justify-center font-bold ${large ? 'text-xl' : 'text-sm'}`}>
          <Gems amount={goal.raised} />
          <span className="mx-1">/</span>
          {formatGems(goal.target)}
        </div>
      </div>
    </div>
  );
}

// The vote options with their counts. Donors click one to vote (or change
// their vote); the result stays highlighted once voting is over.
function ChallengeOptions({ goal, donations, myVote = null, onVote = null, winner = null }) {
  const counts = tallyChallengeVotes(goal.options || [], donations);
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <div className="space-y-2">
      {(goal.options || []).map((option, i) => {
        const frame = `relative block w-full overflow-hidden rounded border-2 bg-gray-900 text-left ${
          winner === i || myVote === i ? 'border-white' : 'border-gray-700'
        }`;
        const content = (
          <>
            <div
              className={`absolute inset-y-0 left-0 ${winner != null && winner !== i ? 'bg-gray-600' : 'bg-lime-600'} transition-all duration-500`}
              style={{ width: `${percentOf(counts[i], total)}%` }}
            />
            <div className="relative flex justify-between items-center gap-3 px-4 py-3">
              <span className="font-bold">
                {option}
                {myVote === i && <span className="ml-2 text-xs text-gray-300">(your vote)</span>}
              </span>
              <span className="text-sm font-bold shrink-0">{counts[i]} {counts[i] === 1 ? 'vote' : 'votes'}</span>
            </div>
          </>
        );
        return onVote ? (
          <button key={i} onClick={() => onVote(i)} className={`${frame} hover:border-gray-400 transition`}>{content}</button>
        ) : (
          <div key={i} className={frame}>{content}</div>
        );
      })}
    </div>
  );
}

// What the vote decided, in words.
function ResultBanner({ goal, donations, large = false }) {
  const result = challengeResult(tallyChallengeVotes(goal.options || [], donations));
  const size = large ? 'text-3xl' : 'text-2xl';
  if (result.winner != null) {
    return (
      <div className="rounded bg-lime-600 p-4 text-center">
        <p className="text-sm font-bold uppercase tracking-wide">The community picked</p>
        <p className={`${size} font-bold`}>{goal.options[result.winner]}</p>
      </div>
    );
  }
  return (
    <div className="rounded bg-gray-700 p-4 text-center font-bold">
      {result.tied
        ? `Tie between ${result.tied.map((i) => goal.options[i]).join(' and ')} - I'll pick`
        : 'Nobody voted - I\'ll pick the challenge'}
    </div>
  );
}

export function ChallengeGoalCard({ goal, donations, user, gems, onLogin }) {
  const now = useNow(goal.status === 'voting');
  const phase = goalPhase(goal, now);
  const myDonation = user.uid ? donations.find((d) => d.id === user.uid) : null;
  const remaining = Math.max(0, goal.target - goal.raised);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const act = async (action) => {
    setError('');
    setMessage('');
    setSubmitting(true);
    try {
      await action();
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  const donation = Number(amount);
  const donationValid = Number.isInteger(donation) && donation >= 1 && donation <= gems;
  const donate = () => act(async () => {
    const { taken } = await donateToChallengeGoal(goal.id, donation);
    setAmount('');
    setMessage(taken < donation ? `The goal only needed ${formatGems(taken)} - that's all you were charged.` : 'Thanks for donating!');
  });

  const topDonors = [...donations].sort((a, b) => b.gems - a.gems).slice(0, 5);
  const result = phase === 'decided' ? challengeResult(tallyChallengeVotes(goal.options || [], donations)) : null;

  return (
    <div className="bg-gray-800 rounded-lg border border-lime-500 p-6 space-y-4">
      <div>
        <div className="flex justify-between items-baseline gap-3 mb-1 text-sm">
          <span className="text-lime-400 font-bold uppercase tracking-wide">Challenge goal</span>
          <span className="text-gray-300 whitespace-nowrap">{PHASE_TEXT[phase]}</span>
        </div>
        {phase === 'collecting' && (
          <p className="text-sm text-gray-300">
            Fill it up together and everyone who donated votes on a challenge for my next attack.
          </p>
        )}
      </div>

      {phase === 'collecting' && (
        <>
          <GoalProgress goal={goal} />
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
                {[100, 500, 1000].map((n) => (
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
                {submitting ? 'Donating...' : donationValid ? <>Donate <Gems amount={Math.min(donation, remaining)} /></> : gems === 0 ? 'You\'re out of Gold' : 'Enter an amount'}
              </button>
              {myDonation && (
                <p className="text-sm text-gray-300">You've donated <Gems amount={myDonation.gems} className="font-bold text-white" /> to this goal.</p>
              )}
            </div>
          )}
          {topDonors.length > 0 && (
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Top donors</p>
              <ol className="space-y-0.5 text-sm">
                {topDonors.map((d) => (
                  <li key={d.id} className="flex justify-between gap-3">
                    <span className="truncate">{d.username || 'Unknown'}</span>
                    <Gems amount={d.gems} className="font-bold shrink-0" />
                  </li>
                ))}
              </ol>
            </div>
          )}
        </>
      )}

      {phase === 'voting' && (
        <>
          <h2 className="text-xl font-bold">Goal reached! Pick my challenge</h2>
          <Countdown
            endsAt={goal.votingOpenedAtMs + goal.votingMs}
            durationMs={goal.votingMs}
            now={now}
            label="Voting closes in"
          />
          <ChallengeOptions
            goal={goal}
            donations={donations}
            myVote={myDonation?.vote ?? null}
            onVote={myDonation && !submitting ? (i) => act(() => voteOnChallenge(goal.id, i)) : null}
          />
          {!myDonation && (
            <p className="text-sm text-gray-400">Only people who donated to this goal can vote. Donate to the next one to get a say!</p>
          )}
          {myDonation && <p className="text-sm text-gray-400">You can change your vote until time runs out.</p>}
        </>
      )}

      {phase === 'decided' && (
        <>
          <ResultBanner goal={goal} donations={donations} />
          <ChallengeOptions goal={goal} donations={donations} myVote={myDonation?.vote ?? null} winner={result?.winner ?? null} />
        </>
      )}

      {(phase === 'cancelling' || phase === 'cancelled') && (
        <div className="rounded p-3 text-center bg-gray-700">Goal cancelled - every donation was refunded.</div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}
    </div>
  );
}

// The goal as it appears on stream: progress while collecting, the live vote
// with its countdown, then the result.
export function ChallengeOverlayCard({ goal, donations }) {
  const now = useNow(goal.status === 'voting');
  const phase = goalPhase(goal, now);
  if (phase === 'cancelling' || phase === 'cancelled') return null;

  return (
    <div className="w-[520px] bg-gray-950 rounded-xl border-4 border-lime-500 p-5 shadow-2xl space-y-3">
      <div className="flex flex-wrap justify-between items-baseline gap-x-3 text-base font-bold uppercase tracking-wide [&>span]:whitespace-nowrap">
        <span className="text-lime-400">Challenge goal</span>
        {phase === 'collecting' && <span className="text-green-400">Donate at {window.location.host}/live</span>}
        {phase === 'voting' && <span className="text-green-400">Donors: vote now!</span>}
      </div>
      {phase === 'collecting' && <GoalProgress goal={goal} large />}
      {phase === 'voting' && (
        <>
          <Countdown endsAt={goal.votingOpenedAtMs + goal.votingMs} durationMs={goal.votingMs} now={now} label="Voting closes in" large />
          <ChallengeOptions goal={goal} donations={donations} />
        </>
      )}
      {phase === 'decided' && <ResultBanner goal={goal} donations={donations} large />}
    </div>
  );
}

export function StaffChallengePanel({ goal, user }) {
  const [list, setList] = useState([]);
  const [newChallenge, setNewChallenge] = useState('');
  const [target, setTarget] = useState(String(DEFAULT_GOAL_TARGET));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const now = useNow(goal?.status === 'voting');

  useEffect(() => subscribeToChallengeList(setList), []);

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

  const addChallenge = (e) => {
    e.preventDefault();
    const text = newChallenge.trim();
    if (!text) return;
    if (list.includes(text)) {
      setError('That challenge is already on the list.');
      return;
    }
    run(async () => {
      await saveChallengeList([...list, text]);
      setNewChallenge('');
    });
  };

  const phase = goal ? goalPhase(goal, now) : null;
  // A new goal would strand donations on a live one, so that has to finish
  // (vote over) or be cancelled first.
  const goalActive = phase === 'collecting' || phase === 'voting' || phase === 'cancelling';
  const targetNumber = Number(target);

  const startGoal = (e) => {
    e.preventDefault();
    if (!Number.isInteger(targetNumber) || targetNumber < 1) {
      setError('Set a goal of at least 1 Gold.');
      return;
    }
    if (list.length < 2) {
      setError('Add at least 2 challenges to your list first.');
      return;
    }
    run(() => startChallengeGoal(targetNumber, list, user.username), `Goal started - ${formatGems(targetNumber)} Gold to go.`);
  };

  const cancel = () => {
    if (!window.confirm('Cancel this goal and refund every donation?')) return;
    run(() => cancelChallengeGoal(goal.id), ({ refunded }) => `Cancelled - ${formatGems(refunded)} Gold refunded.`);
  };

  return (
    <div className="space-y-6">

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {message && <p className="text-green-400 text-sm">{message}</p>}

      <div className="space-y-2">
        <p className="font-bold">Current goal</p>
        {goal ? (
          <div className="rounded border border-gray-700 p-4 space-y-2">
            <p className="text-sm">
              {PHASE_TEXT[phase]} · <Gems amount={goal.raised} /> / {formatGems(goal.target)}
            </p>
            <div className="flex flex-wrap gap-2 text-sm">
              <button disabled={busy} onClick={() => run(() => featureChallengeGoal(null))} className={`${OUTLINE_BUTTON} px-3 py-1`}>Hide</button>
              {goalActive && (
                <button disabled={busy} onClick={cancel} className={`${OUTLINE_BUTTON} px-3 py-1`}>
                  {phase === 'cancelling' ? 'Finish refunding' : 'Cancel & refund'}
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">No goal on screen.</p>
        )}
      </div>

      {!goalActive && (
        <form onSubmit={startGoal} className="space-y-2">
          <label className="block font-bold">Start a new goal</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="number"
              min={1}
              step={1}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className={INPUT}
            />
            <button type="submit" disabled={busy} className={`${GOLD_BUTTON} px-4 py-2 shrink-0`}>Start goal</button>
          </div>
          <p className="text-xs text-gray-500">
            When it fills, 3 random challenges from your list go to a 60-second vote for everyone who donated.
          </p>
        </form>
      )}

      <div className="space-y-2">
        <p className="font-bold">Your challenge list ({list.length})</p>
        {list.length === 0 && <p className="text-sm text-gray-400">No challenges yet - add a few below.</p>}
        <ul className="space-y-1">
          {list.map((challenge) => (
            <li key={challenge} className="flex justify-between items-center gap-3 rounded bg-gray-900 px-3 py-2">
              <span>{challenge}</span>
              <button
                aria-label={`Remove ${challenge}`}
                disabled={busy}
                onClick={() => run(() => saveChallengeList(list.filter((c) => c !== challenge)))}
                className="text-gray-400 hover:text-white px-2"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={addChallenge} className="flex flex-col sm:flex-row gap-2">
          <input
            value={newChallenge}
            onChange={(e) => setNewChallenge(e.target.value)}
            placeholder="No heroes"
            maxLength={80}
            className={INPUT}
          />
          <button type="submit" disabled={busy || !newChallenge.trim()} className={`${OUTLINE_BUTTON} px-4 py-2 shrink-0`}>Add</button>
        </form>
        <p className="text-xs text-gray-500">Editing the list doesn't change a goal that's already running.</p>
      </div>
    </div>
  );
}
