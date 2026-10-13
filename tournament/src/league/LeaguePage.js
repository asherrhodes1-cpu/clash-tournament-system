import React, { useEffect, useState } from 'react';
import PlayerName from '../PlayerName';
import {
  answerQuiz, castVote, subscribeToLeague, subscribeToLeagueScores, subscribeToMyAnswer, subscribeToMyScore, subscribeToMyVote,
} from '../api/league';
import { parseYouTubeId } from '../live/liveUtils';
import { voteShares } from './leagueState';

// The page wears the stream overlays' look (see index.css): the caster cams'
// stone frame around each part, over the sky the whole site sits on.
const FRAME = 'league-stone';
const INSET = 'league-inset p-4 sm:p-5';
const LOGIN = 'border-2 border-white text-white hover:bg-white hover:text-black px-3 py-1 rounded-lg font-bold transition';

// The broadcast itself, so the finals can be watched from the site. The
// questions are asked on it, by the stream's own overlay.
function Stream({ videoUrl }) {
  const videoId = parseYouTubeId(videoUrl);
  if (!videoId) {
    return (
      <div className={FRAME}>
        <div className="league-inset p-10 text-center">
          <p className="text-xl font-bold mb-2">The stream will show here</p>
          <p className="league-note">It appears as soon as the broadcast starts.</p>
        </div>
      </div>
    );
  }
  return (
    <div className={FRAME}>
      <div className="league-inset overflow-hidden" style={{ paddingTop: '56.25%' }}>
        <iframe
          className="absolute inset-0 w-full h-full"
          src={`https://www.youtube.com/embed/${videoId}?rel=0&playsinline=1`}
          title="Builder League finals stream"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// The top of a set of answer buttons, as on the overlay: what it is on a
// stone tab in the corner, and what has become of the viewer's go in the middle.
const Prompt = ({ label, note, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
    <h2 className="league-tab uppercase">{label}</h2>
    {children}
    <p className="league-note w-full text-center text-sm sm:text-base uppercase tracking-wide min-h-[1.25em] break-words" role="status">{note}</p>
  </div>
);

// The two sides of the match being voted on, there while voting is open:
// pick one, and change it, until staff lock it as the match starts.
function VoteBar({ voting, user, onLogin }) {
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setMine(null);
    if (!user.uid) return undefined;
    return subscribeToMyVote(voting.matchId, user.uid, setMine);
  }, [voting.matchId, user.uid]);

  const shares = voteShares(voting.redVotes, voting.blueVotes);
  const vote = async (side) => {
    setError('');
    try {
      await castVote(voting.matchId, user, side);
    } catch (err) {
      setError('That vote didn\'t go through - voting may have just locked.');
    }
  };
  const sides = [['r', voting.red, 'is-red'], ['b', voting.blue, 'is-blue']];

  return (
    <section className={`league-pop ${FRAME}`} aria-label="Match vote">
      <div className={INSET}>
      <Prompt label="Who wins?" note={error || (user.isGuest ? '' : mine ? 'Your pick is in. You can change it until the match starts.' : 'Pick a side before the match starts.')}>
        {user.isGuest && <button type="button" onClick={onLogin} className={LOGIN}>Log in to vote</button>}
      </Prompt>
      <div className="grid grid-cols-2 gap-3">
        {sides.map(([side, name, colour]) => (
          <button
            key={side}
            type="button"
            aria-pressed={mine === side}
            disabled={user.isGuest}
            onClick={() => vote(side)}
            className={`league-side ${colour} ${mine === side ? 'is-picked' : mine ? 'is-passed' : ''} flex flex-col sm:flex-row items-center justify-between gap-x-3 px-3 sm:px-5 py-3 disabled:cursor-default`}
          >
            <span className="min-w-0 max-w-full text-sm sm:text-xl font-bold break-words text-center sm:text-left">{name}{mine === side && <span className="block text-xs font-normal">Your pick</span>}</span>
            <span className="text-xl sm:text-2xl font-bold">{shares[side]}%</span>
          </button>
        ))}
      </div>
      </div>
    </section>
  );
}

// The answers to the question on the stream, there while it is up: one
// answer each, and no changing it.
function QuizBar({ quiz, user, onLogin }) {
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
  const note = error
    || (revealed ? (answered ? (mine === quiz.correct ? `Correct! +${quiz.points} points.` : 'Not this time.') : 'The answer is in.')
      : answered ? 'Locked in. The answer is coming up.'
        : open ? (user.isGuest ? '' : 'One answer each, and it can\'t be changed.')
          : 'Answers are closed. The answer is coming up.');

  return (
    <section className={`league-pop ${FRAME}`} aria-label="Quiz question">
      <div className={INSET}>
      <Prompt label={`${quiz.points} points`} note={note}>
        {user.isGuest && open && <button type="button" onClick={onLogin} className={LOGIN}>Log in to answer</button>}
      </Prompt>
      {/* Also asked on the stream, which runs a little behind these buttons. */}
      <p className="text-xl sm:text-3xl font-bold text-center mb-4 break-words">{quiz.question}</p>
      <div className={`grid grid-cols-2 gap-3 ${quiz.options.length === 3 ? 'md:grid-cols-3' : quiz.options.length === 4 ? 'md:grid-cols-4' : ''}`}>
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
              className={`league-answer ${right ? 'is-right' : picked ? 'is-picked' : ''} px-3 py-3 text-center text-lg sm:text-xl font-bold disabled:cursor-default`}
            >
              <span className="break-words">{option}</span>
              {revealed && <span className="block text-sm font-normal league-note mt-1">{total ? Math.round((quiz.counts[i] / total) * 100) : 0}% picked this{right ? ' · correct' : ''}</span>}
              {picked && !revealed && <span className="block text-sm font-normal league-note mt-1">Your answer</span>}
            </button>
          );
        })}
      </div>
      </div>
    </section>
  );
}

function Leaderboard({ user }) {
  const [top, setTop] = useState([]);
  const [mine, setMine] = useState(0);
  useEffect(() => subscribeToLeagueScores(setTop), []);
  useEffect(() => (user.uid ? subscribeToMyScore(user.uid, setMine) : undefined), [user.uid]);
  return (
    <section className={FRAME}>
      <div className={INSET}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-2xl font-bold">Quiz leaderboard</h2>
        {!user.isGuest && <span className="league-tab">Your points: {mine}</span>}
      </div>
      {top.length === 0 ? <p className="league-note">No points yet. Answer a quiz question to get on the board.</p> : (
        <ol className="space-y-1">
          {top.map((row, i) => (
            <li key={row.uid} className={`league-answer ${row.uid === user.uid ? 'is-picked' : ''} flex justify-between gap-3 px-3 py-2`}>
              <span className="min-w-0 truncate"><b className="mr-2">{i + 1}.</b><PlayerName name={row.username} /></span>
              <b>{row.points}</b>
            </li>
          ))}
        </ol>
      )}
      </div>
    </section>
  );
}

// /league: the Builder League finals section. Only there while staff have
// switched it on for a broadcast. The stream plays on the page and asks the
// questions; the buttons to answer them come up under it when staff put a
// vote or a quiz question up, and go again afterwards.
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

  const { voting, quiz } = league;
  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
      <header className="flex flex-col items-center gap-2 text-center">
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          <img src="/badges/builder-league.png" alt="" className="w-10 h-10 sm:w-20 sm:h-20 object-contain shrink-0" />
          <h1 className="text-2xl sm:text-5xl font-bold break-words min-w-0">{league.title}</h1>
        </div>
        {league.stage && <p className="league-round">{league.stage}</p>}
      </header>
      <div className="space-y-4">
        <Stream videoUrl={league.videoUrl} />
        {quiz && <QuizBar quiz={quiz} user={user} onLogin={onLogin} />}
        {voting?.status === 'open' && <VoteBar voting={voting} user={user} onLogin={onLogin} />}
      </div>
      <Leaderboard user={user} />
    </div>
  );
}
