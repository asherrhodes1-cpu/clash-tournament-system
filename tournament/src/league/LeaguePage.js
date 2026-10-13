import React, { useEffect, useState } from 'react';
import PlayerName from '../PlayerName';
import {
  answerQuiz, castVote, subscribeToLeague, subscribeToLeagueScores, subscribeToMyAnswer, subscribeToMyScore, subscribeToMyVote,
} from '../api/league';
import { voteShares } from './leagueState';

const CARD = 'bg-gray-800 rounded-lg border border-gray-700 p-5';
const LETTERS = ['A', 'B', 'C', 'D'];

// The match being voted on: pick a side until staff lock it as it starts.
function VoteCard({ voting, user, onLogin }) {
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setMine(null);
    if (!user.uid) return undefined;
    return subscribeToMyVote(voting.matchId, user.uid, setMine);
  }, [voting.matchId, user.uid]);

  const open = voting.status === 'open';
  const shares = voteShares(voting.redVotes, voting.blueVotes);
  const vote = async (side) => {
    setError('');
    try {
      await castVote(voting.matchId, user, side);
    } catch (err) {
      setError('That vote didn\'t go through - voting may have just locked.');
    }
  };
  const sides = [['r', voting.red, 'border-red-500', 'bg-red-600'], ['b', voting.blue, 'border-sky-400', 'bg-sky-600']];

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-2xl font-bold">Who wins?</h2>
        <span className={`text-sm font-bold px-2 py-1 rounded ${open ? 'bg-white text-black' : 'bg-gray-700 text-gray-300'}`}>{open ? 'Voting is open' : 'Voting is locked'}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {sides.map(([side, name, border, fill]) => (
          <button
            key={side}
            type="button"
            aria-pressed={mine === side}
            disabled={!open || user.isGuest}
            onClick={() => vote(side)}
            className={`rounded-lg border-4 ${border} p-4 text-center transition disabled:cursor-default ${mine === side ? `${fill} text-white` : 'bg-gray-900 hover:bg-gray-700 disabled:hover:bg-gray-900'}`}
          >
            <span className="block text-xl font-bold break-words">{name}</span>
            <span className="block text-3xl font-bold mt-1">{shares[side]}%</span>
            {mine === side && <span className="block text-sm mt-1">Your pick</span>}
          </button>
        ))}
      </div>
      <p className="text-sm text-gray-400 mt-3" role="status">
        {error
          || (user.isGuest ? null
            : !open ? (mine ? 'Voting closed when the match started. Your pick is in.' : 'Voting closed when the match started.')
              : mine ? 'You can change your pick until the match starts.' : 'Pick a side before the match starts.')}
      </p>
      {user.isGuest && open && (
        <button type="button" onClick={onLogin} className="mt-2 border border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded font-bold transition">Log in to vote</button>
      )}
    </section>
  );
}

// The question that is up: one answer each, and no changing it.
function QuizCard({ quiz, user, onLogin }) {
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setMine(null);
    if (!user.uid) return undefined;
    return subscribeToMyAnswer(quiz.id, user.uid, setMine);
  }, [quiz.id, user.uid]);

  const open = quiz.status === 'open';
  const revealed = quiz.status === 'revealed';
  const answered = mine != null;
  const total = revealed ? quiz.counts.reduce((sum, n) => sum + n, 0) : 0;
  const answer = async (choice) => {
    setError('');
    try {
      await answerQuiz(quiz.id, user, choice);
    } catch (err) {
      setError('That answer didn\'t go through - the question may have just closed.');
    }
  };

  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-2xl font-bold">Quiz</h2>
        <span className="text-sm font-bold px-2 py-1 rounded bg-gray-700 text-gray-200">{quiz.points} points</span>
      </div>
      <p className="text-xl font-bold mb-3 break-words">{quiz.question}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {quiz.options.map((option, i) => {
          const right = revealed && quiz.correct === i;
          const picked = mine === i;
          return (
            <button
              key={i}
              type="button"
              aria-pressed={picked}
              disabled={!open || answered || user.isGuest}
              onClick={() => answer(i)}
              className={`rounded-lg border-2 p-3 text-left transition disabled:cursor-default ${
                right ? 'border-green-400 bg-green-800' : picked ? 'border-white bg-gray-600' : 'border-gray-500 bg-gray-900 hover:bg-gray-700 disabled:hover:bg-gray-900'
              }`}
            >
              <span className="font-bold mr-2">{LETTERS[i]}.</span>
              <span className="break-words">{option}</span>
              {revealed && <span className="block text-sm text-gray-300 mt-1">{total ? Math.round((quiz.counts[i] / total) * 100) : 0}% picked this{right ? ' · correct' : ''}</span>}
              {picked && !revealed && <span className="block text-sm text-gray-300 mt-1">Your answer</span>}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-gray-400 mt-3" role="status">
        {error
          || (revealed ? (answered ? (mine === quiz.correct ? `Correct! +${quiz.points} points.` : 'Not this time.') : 'The answer is in.')
            : answered ? 'Locked in. The answer is coming up.'
              : open ? (user.isGuest ? null : 'One answer each, and it can\'t be changed.')
                : 'Answers are closed. The answer is coming up.')}
      </p>
      {user.isGuest && open && (
        <button type="button" onClick={onLogin} className="mt-2 border border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded font-bold transition">Log in to answer</button>
      )}
    </section>
  );
}

function Leaderboard({ user }) {
  const [top, setTop] = useState([]);
  const [mine, setMine] = useState(0);
  useEffect(() => subscribeToLeagueScores(setTop), []);
  useEffect(() => (user.uid ? subscribeToMyScore(user.uid, setMine) : undefined), [user.uid]);
  return (
    <section className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-2xl font-bold">Quiz leaderboard</h2>
        {!user.isGuest && <span className="text-sm text-gray-300">Your points: <b>{mine}</b></span>}
      </div>
      {top.length === 0 ? <p className="text-gray-400">No points yet. Answer a quiz question to get on the board.</p> : (
        <ol className="space-y-1">
          {top.map((row, i) => (
            <li key={row.uid} className={`flex justify-between gap-3 px-3 py-2 rounded ${row.uid === user.uid ? 'bg-gray-600' : 'bg-gray-900'}`}>
              <span className="min-w-0 truncate"><b className="mr-2">{i + 1}.</b><PlayerName name={row.username} /></span>
              <b>{row.points}</b>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// /league: the Builder League finals section. Only there while staff have
// switched it on for a broadcast.
export default function LeaguePage({ user, onLogin, onHome }) {
  // undefined until it has loaded.
  const [league, setLeague] = useState(undefined);
  useEffect(() => subscribeToLeague(setLeague, () => setLeague(null)), []);

  if (league === undefined) return <div className="max-w-3xl mx-auto p-6 text-gray-400">Loading…</div>;
  if (!league?.active) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center space-y-4">
        <h1 className="text-3xl font-bold">Builder League: Final 8</h1>
        <p className="text-gray-400">This section opens while the finals are being streamed. Check back when the broadcast is live.</p>
        <button type="button" onClick={onHome} className="border border-white text-white hover:bg-white hover:text-black px-4 py-2 rounded font-bold transition">Back to the site</button>
      </div>
    );
  }
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="text-center">
        <h1 className="text-3xl sm:text-4xl font-bold">{league.title}</h1>
        <p className="text-gray-400">Live now. Vote on every match and play the quiz for points.</p>
      </header>
      {league.voting ? <VoteCard voting={league.voting} user={user} onLogin={onLogin} /> : (
        <section className={CARD}><h2 className="text-2xl font-bold mb-1">Who wins?</h2><p className="text-gray-400">Voting opens before the next match.</p></section>
      )}
      {league.quiz ? <QuizCard quiz={league.quiz} user={user} onLogin={onLogin} /> : (
        <section className={CARD}><h2 className="text-2xl font-bold mb-1">Quiz</h2><p className="text-gray-400">The next question will appear here.</p></section>
      )}
      <Leaderboard user={user} />
    </div>
  );
}
