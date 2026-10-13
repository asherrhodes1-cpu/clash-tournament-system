import React, { useEffect, useRef, useState } from 'react';
import {
  awardPoints, resetLeagueScores, saveLeague, saveQuestions, subscribeToAnswers, subscribeToLeague, subscribeToQuestions, subscribeToVotes,
} from '../api/league';
import { parseYouTubeId } from '../live/liveUtils';
import {
  DEFAULT_POINTS, DEFAULT_VOTE_REWARD, MAX_OPTIONS, asked, isReady, newId, quizWinners, soundQuestion, tallyAnswers, tallyVotes, voteShares, voteWinners,
} from './leagueState';

const CARD = 'bg-gray-800 rounded-lg border border-gray-700 p-5';
const INPUT = 'w-full bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white focus:border-white focus:outline-none';
const BUTTON = 'px-3 py-2 rounded border border-gray-500 bg-gray-700 hover:bg-gray-600 text-sm font-bold disabled:opacity-40 disabled:hover:bg-gray-700';
const BIG = 'px-4 py-3 rounded-lg border-2 border-gray-500 bg-gray-700 hover:bg-gray-600 font-bold text-base disabled:opacity-40 disabled:hover:bg-gray-700';
const ON = 'bg-white text-black hover:bg-white';
const LABEL = 'block text-xs uppercase tracking-wide text-gray-400 mb-1';
const LETTERS = ['A', 'B', 'C', 'D'];

// How long vote totals settle for before they are passed on, so a rush of
// votes is a handful of saves and not one for each.
const TOTALS_AFTER_MS = 1200;

// The finals section's controls, for the overlay control page: what viewers
// can do on /league while the finals are streamed. `match` is the match on
// the overlays, and `onVotes` is told the vote totals so the overlays' vote
// bar follows them.
//
// Returns two sets of cards: `live`, the buttons pressed during a broadcast
// (the section's switch, the match vote, the quiz), and `prepare`, what is
// set up beforehand (the quiz questions, the title, the leaderboard). It
// counts the votes for as long as the page it is used on is open, whichever
// of the two is showing.
export function useLeagueControl(match, onVotes) {
  const [league, setLeague] = useState(null);
  const [bank, setBank] = useState({ questions: [], up: null });
  const [votes, setVotes] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [status, setStatus] = useState('');
  // The prepared question being edited.
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeToLeague(setLeague, () => setStatus('Could not load the finals section.')), []);
  useEffect(() => subscribeToQuestions(setBank), []);

  const matchId = league?.voting?.matchId ?? null;
  useEffect(() => {
    setVotes([]);
    return matchId ? subscribeToVotes(matchId, setVotes) : undefined;
  }, [matchId]);

  const quizId = league?.quiz?.id ?? null;
  useEffect(() => {
    setAnswers([]);
    return quizId ? subscribeToAnswers(quizId, setAnswers) : undefined;
  }, [quizId]);

  const run = async (work, done = '') => {
    setStatus('Saving…');
    try {
      await work();
      setStatus(done);
    } catch (err) {
      setStatus('That didn\'t save: are you still signed in as staff?');
    }
  };
  const update = (changes, done) => run(() => saveLeague({ ...league, ...changes }), done);

  // Vote totals, counted here from every vote, are kept in the section for
  // viewers and passed to the overlays' vote bar.
  const tally = tallyVotes(votes);
  const latest = useRef({});
  latest.current = { league, onVotes };
  useEffect(() => {
    if (!matchId) return undefined;
    const timer = setTimeout(() => {
      const now = latest.current.league;
      if (!now?.voting || now.voting.matchId !== matchId) return;
      if (now.voting.redVotes === tally.r && now.voting.blueVotes === tally.b) return;
      saveLeague({ ...now, voting: { ...now.voting, redVotes: tally.r, blueVotes: tally.b } }).catch(() => {});
      latest.current.onVotes(tally.r, tally.b);
    }, TOTALS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [matchId, tally.r, tally.b]);

  if (!league) return { live: <div className={CARD}>{status || 'Loading…'}</div>, prepare: null };

  const { voting, quiz } = league;
  const shares = voteShares(tally.r, tally.b);
  const counts = quiz ? tallyAnswers(answers, quiz.options.length) : [];
  const correct = quiz && bank.up?.quizId === quiz.id ? bank.up.correct : null;

  const openVoting = () => {
    onVotes(0, 0);
    update({ voting: { matchId: newId(), red: match.red.name, blue: match.blue.name, status: 'open', redVotes: 0, blueVotes: 0, reward: league.voteReward, winner: null } }, 'Voting is open.');
  };
  // Says who won the match: everyone who picked them is given the trophies, once.
  const payVote = async (side) => {
    if (!voting || voting.winner || busy) return;
    setBusy(true);
    const winners = voteWinners(votes, side);
    await run(async () => {
      await awardPoints(winners, voting.reward);
      await saveLeague({ ...league, voting: { ...voting, status: 'locked', redVotes: tally.r, blueVotes: tally.b, winner: side } });
    }, `${side === 'r' ? voting.red : voting.blue} won. ${winners.length} picked them and were given ${voting.reward} trophies.`);
    setBusy(false);
  };
  const putUp = (question) => run(async () => {
    const up = asked(question);
    // The right answer is kept where only staff can read it.
    await saveQuestions({ questions: bank.questions, up: { quizId: up.id, correct: question.correct } });
    await saveLeague({ ...league, quiz: up });
  }, 'The question is up.');
  const reveal = async () => {
    if (correct == null || quiz.status === 'revealed' || busy) return;
    setBusy(true);
    const winners = quizWinners(answers, correct);
    await run(async () => {
      await awardPoints(winners, quiz.points);
      await saveLeague({ ...league, quiz: { ...quiz, status: 'revealed', correct, counts } });
    }, `Revealed. ${winners.length} got it right and were given ${quiz.points} trophies.`);
    setBusy(false);
  };
  const saveBank = (questions) => run(() => saveQuestions({ questions, up: bank.up }), 'Questions saved.');

  const live = (
    <>
        <section className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="text-xl font-bold">Final 8 section</h2>
            <span className="text-sm text-gray-400" role="status">{status}</span>
          </div>
          <p className="text-sm text-gray-400 mb-3">While this is on, everyone on the site gets a large pop-up sending them to the finals page, where they watch the stream and answer under it. Votes and quiz questions are asked on the caster desk overlay, and the answer buttons come up under the video. Turn it off when the broadcast ends.</p>
          {!parseYouTubeId(league.videoUrl) && <p className="text-sm text-amber-300 mb-3">No stream link is set, so the finals page has no video. Add it on the Prepare tab.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" aria-pressed={league.active} className={`${BIG} ${league.active ? ON : ''}`} onClick={() => update({ active: !league.active }, league.active ? 'The section is off.' : 'The section is live.')}>
              {league.active ? 'Live: turn the section off' : 'Turn the section on'}
            </button>
            <a className={BUTTON} href="/league" target="_blank" rel="noreferrer">Open the viewers' page</a>
          </div>
        </section>

        <section className={CARD}>
          <h2 className="text-xl font-bold mb-1">Match vote</h2>
          <p className="text-sm text-gray-400 mb-3">Opening it asks "Who wins?" on the caster desk's vote bar and puts the two buttons under the stream. Lock it as the match starts and both go. When the match ends, say who won: everyone who picked them gets trophies. The totals fill the overlays' audience vote bar by themselves.</p>
          {voting ? (
            <>
              <p className="font-bold text-lg mb-2">
                {voting.red} {shares.r}% ({tally.r}) · {voting.blue} {shares.b}% ({tally.b})
              </p>
              <p className="text-sm text-gray-300 mb-3">
                {voting.winner ? `${voting.winner === 'r' ? voting.red : voting.blue} won, and those who picked them were given ${voting.reward} trophies. Clear the vote before the next match.`
                  : voting.status === 'open' ? `Voting is open. Picking the winner pays ${voting.reward} trophies.` : 'Voting is locked. When the match ends, say who won.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {voting.status === 'open' && <button type="button" className={`${BIG} border-red-500`} onClick={() => update({ voting: { ...voting, status: 'locked' } }, 'Voting is locked.')}>Lock voting: the match has started</button>}
                {voting.status !== 'open' && !voting.winner && (
                  <>
                    <button type="button" className={`${BIG} border-red-500`} disabled={busy} onClick={() => payVote('r')}>{voting.red} won: give {voting.reward} trophies</button>
                    <button type="button" className={`${BIG} border-sky-400`} disabled={busy} onClick={() => payVote('b')}>{voting.blue} won: give {voting.reward} trophies</button>
                    <button type="button" className={BIG} onClick={() => update({ voting: { ...voting, status: 'open' } }, 'Voting is open again.')}>Reopen voting</button>
                  </>
                )}
                <button type="button" className={BIG} onClick={() => update({ voting: null }, 'The vote is cleared.')}>Clear the vote</button>
              </div>
            </>
          ) : (
            <button type="button" className={`${BIG} border-white`} onClick={openVoting}>Open voting: {match.red.name} vs {match.blue.name}</button>
          )}
          {voting && (voting.red !== match.red.name || voting.blue !== match.blue.name) && (
            <p className="text-sm text-amber-300 mt-3">This vote is for {voting.red} vs {voting.blue}, but the overlays now show {match.red.name} vs {match.blue.name}. Clear it and open a new one for the next match.</p>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-xl font-bold mb-1">Quiz</h2>
          {quiz ? (
            <>
              <p className="font-bold text-lg break-words">{quiz.question}</p>
              <ul className="my-3 space-y-1">
                {quiz.options.map((option, i) => (
                  <li key={i} className={`flex justify-between gap-3 px-3 py-2 rounded ${correct === i ? 'bg-green-900 border border-green-500' : 'bg-gray-900'}`}>
                    <span className="break-words"><b className="mr-2">{LETTERS[i]}.</b>{option}{correct === i && ' (right answer)'}</span>
                    <b>{counts[i]}</b>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-300 mb-3">
                {quiz.status === 'open' ? `Taking answers. ${answers.length} in so far.` : quiz.status === 'closed' ? `Answers are closed. ${answers.length} came in.` : 'Revealed, and trophies given.'}
              </p>
              <div className="flex flex-wrap gap-2">
                {quiz.status === 'open' && <button type="button" className={`${BIG} border-red-500`} onClick={() => update({ quiz: { ...quiz, status: 'closed' } }, 'Answers are closed.')}>Close answers</button>}
                {quiz.status !== 'revealed' && <button type="button" className={`${BIG} border-white`} disabled={correct == null || busy} onClick={reveal}>Reveal the answer and give trophies</button>}
                <button type="button" className={BIG} onClick={() => update({ quiz: null }, 'The question is down.')}>Take the question down</button>
              </div>
              {correct == null && quiz.status !== 'revealed' && <p className="text-sm text-amber-300 mt-3">The right answer for this question wasn't found, so it can't be revealed. Take it down and put it up again.</p>}
            </>
          ) : (
            <>
              <p className="text-sm text-gray-400 mb-3">Put a prepared question up with one click: it shows on the caster desk overlay, with the answer buttons under the stream. Viewers get one answer each.</p>
              {bank.questions.length === 0 && <p className="text-sm text-gray-400">None prepared yet. Add some on the Prepare tab.</p>}
              <div className="flex flex-col gap-2">
                {bank.questions.map((question) => (
                  <button key={question.id} type="button" className={`${BIG} text-left`} disabled={!isReady(question)} onClick={() => putUp(question)}>
                    {question.question || 'Untitled question'} <span className="font-normal text-gray-300">· {question.points} trophies</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
    </>
  );

  const prepare = (
    <>
        <section className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
            <h2 className="text-xl font-bold">Quiz questions</h2>
            <button type="button" className={BUTTON} onClick={() => setEditing(soundQuestion({ options: ['', '', '', ''] }))}>Add a question</button>
          </div>
          <p className="text-sm text-gray-400 mb-3">Write these before the broadcast. Viewers can't see them, or the right answers, until you put one up and reveal it.</p>
          <div className="flex flex-col gap-2 mb-3">
            {bank.questions.map((question) => (
              <button key={question.id} type="button" aria-pressed={editing?.id === question.id} className={`${BUTTON} text-left ${editing?.id === question.id ? ON : ''}`} onClick={() => setEditing(question)}>
                {question.question || 'Untitled question'}{!isReady(question) && ' (not finished)'}
              </button>
            ))}
          </div>
          {editing && (
            <div className="border-t border-gray-700 pt-3 space-y-3">
              <label className="block">
                <span className={LABEL}>Question</span>
                <input className={INPUT} value={editing.question} onChange={(e) => setEditing({ ...editing, question: e.target.value })} />
              </label>
              <div>
                <span className={LABEL}>Answers: pick the right one</span>
                <div className="space-y-2">
                  {editing.options.map((option, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <button type="button" aria-pressed={editing.correct === i} aria-label={`Answer ${LETTERS[i]} is right`} className={`${BUTTON} w-10 ${editing.correct === i ? 'bg-green-600 border-green-400 hover:bg-green-600' : ''}`} onClick={() => setEditing({ ...editing, correct: i })}>{LETTERS[i]}</button>
                      <input className={INPUT} aria-label={`Answer ${LETTERS[i]}`} value={option} onChange={(e) => setEditing({ ...editing, options: editing.options.map((o, j) => (j === i ? e.target.value : o)) })} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <button type="button" className={BUTTON} disabled={editing.options.length >= MAX_OPTIONS} onClick={() => setEditing({ ...editing, options: [...editing.options, ''] })}>Add an answer</button>
                  <button type="button" className={BUTTON} disabled={editing.options.length <= 2} onClick={() => setEditing({ ...editing, options: editing.options.slice(0, -1), correct: Math.min(editing.correct, editing.options.length - 2) })}>Remove the last answer</button>
                </div>
              </div>
              <label className="block">
                <span className={LABEL}>Trophies for a right answer</span>
                <input className={INPUT} inputMode="numeric" value={editing.points} onChange={(e) => setEditing({ ...editing, points: e.target.value.replace(/\D/g, '') })} placeholder={String(DEFAULT_POINTS)} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={`${BUTTON} border-white`}
                  onClick={() => {
                    // Blank answers at the end are dropped, down to the two a question needs.
                    const options = [...editing.options];
                    while (options.length > 2 && options[options.length - 1].trim() === '') options.pop();
                    const saved = soundQuestion({ ...editing, options, points: Number(editing.points) });
                    const there = bank.questions.some((q) => q.id === saved.id);
                    saveBank(there ? bank.questions.map((q) => (q.id === saved.id ? saved : q)) : [...bank.questions, saved]);
                    setEditing(saved);
                  }}
                >
                  Save question
                </button>
                {bank.questions.some((q) => q.id === editing.id) && (
                  <button type="button" className={`${BUTTON} border-red-500`} onClick={() => { if (window.confirm('Delete this question?')) { saveBank(bank.questions.filter((q) => q.id !== editing.id)); setEditing(null); } }}>Delete</button>
                )}
                <button type="button" className={BUTTON} onClick={() => setEditing(null)}>Close</button>
              </div>
            </div>
          )}
        </section>

        <section className={CARD}>
          <h2 className="text-xl font-bold mb-1">Final 8 section</h2>
          <label className="block mb-4">
            <span className={LABEL}>Title on the pop-up and page</span>
            <input className={INPUT} defaultValue={league.title} onBlur={(e) => { if (e.target.value !== league.title) update({ title: e.target.value }, 'Title saved.'); }} />
          </label>
          <label className="block mb-4">
            <span className={LABEL}>Under the title on the page</span>
            <input className={INPUT} defaultValue={league.stage} placeholder="Quarterfinals, Grand Final…" onBlur={(e) => { const stage = e.target.value.trim(); if (stage !== league.stage) update({ stage }, stage ? 'Saved.' : 'Removed.'); }} />
            <span className="block text-sm text-gray-400 mt-1">Which part of the finals is on. Leave it empty to show only the title.</span>
          </label>
          <label className="block mb-4">
            <span className={LABEL}>YouTube stream link</span>
            <input
              className={INPUT}
              defaultValue={league.videoUrl}
              placeholder="https://www.youtube.com/live/..."
              onBlur={(e) => {
                const videoUrl = e.target.value.trim();
                if (videoUrl && !parseYouTubeId(videoUrl)) setStatus('That doesn\'t look like a YouTube video or live link.');
                else if (videoUrl !== league.videoUrl) update({ videoUrl }, videoUrl ? 'Stream link saved.' : 'Stream link removed.');
              }}
            />
            <span className="block text-sm text-gray-400 mt-1">The stream plays on the finals page, with the answer buttons under it.</span>
          </label>
          <label className="block mb-4">
            <span className={LABEL}>Trophies for picking a match's winner</span>
            <input className={INPUT} inputMode="numeric" defaultValue={league.voteReward} placeholder={String(DEFAULT_VOTE_REWARD)} onBlur={(e) => { const voteReward = Number(e.target.value.replace(/\D/g, '')) || DEFAULT_VOTE_REWARD; if (voteReward !== league.voteReward) update({ voteReward }, 'Saved. It applies from the next vote you open.'); }} />
          </label>
          <p className="text-sm text-gray-400 mb-3">Trophies carry on through the broadcast. Clear them before a new one.</p>
          <button type="button" className={`${BUTTON} border-red-500`} onClick={() => { if (window.confirm('Clear everyone\'s trophies?')) run(resetLeagueScores, 'The leaderboard is cleared.'); }}>Clear the leaderboard</button>
        </section>
    </>
  );

  return { live, prepare };
}

// Both sets of cards together, one after the other.
export default function LeagueControl({ match, onVotes }) {
  const { live, prepare } = useLeagueControl(match, onVotes);
  return <>{live}{prepare}</>;
}
