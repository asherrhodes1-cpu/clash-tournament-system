// The Builder League finals section: what staff switch on while they stream
// the final eight. The audience votes on who wins each match, until staff
// lock it as the match starts, and answers quiz questions for points.

export const MAX_OPTIONS = 4;
export const DEFAULT_POINTS = 100;

const text = (value, fallback = '') => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const count = (value) => Math.max(0, Math.round(Number(value)) || 0);
export const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// The section as saved in live/league, with anything missing put right.
//   voting: the match being voted on - { matchId, red, blue, status: 'open' |
//           'locked', redVotes, blueVotes } - or null
//   quiz:   the question that is up - { id, question, options, points,
//           status: 'open' | 'closed' | 'revealed', correct, counts } - or
//           null. `correct` and `counts` are only there once it is revealed.
export function soundLeague(saved) {
  const voting = saved?.voting?.matchId ? {
    matchId: text(saved.voting.matchId),
    red: text(saved.voting.red, 'Red'),
    blue: text(saved.voting.blue, 'Blue'),
    status: saved.voting.status === 'open' ? 'open' : 'locked',
    redVotes: count(saved.voting.redVotes),
    blueVotes: count(saved.voting.blueVotes),
  } : null;
  const options = (Array.isArray(saved?.quiz?.options) ? saved.quiz.options : []).map((o) => text(o)).slice(0, MAX_OPTIONS);
  const status = ['open', 'closed', 'revealed'].includes(saved?.quiz?.status) ? saved.quiz.status : 'closed';
  const quiz = saved?.quiz?.id && options.length >= 2 ? {
    id: text(saved.quiz.id),
    question: text(saved.quiz.question),
    options,
    points: count(saved.quiz.points) || DEFAULT_POINTS,
    status,
    correct: status === 'revealed' && Number.isInteger(saved.quiz.correct) ? saved.quiz.correct : null,
    counts: status === 'revealed' && Array.isArray(saved.quiz.counts) ? options.map((_, i) => count(saved.quiz.counts[i])) : null,
  } : null;
  return { active: saved?.active === true, title: text(saved?.title, 'BUILDER LEAGUE: FINAL 8'), voting, quiz };
}

// Votes counted by side: [{ side }] -> { r, b }.
export function tallyVotes(votes) {
  const tally = { r: 0, b: 0 };
  for (const vote of votes) if (vote.side === 'r' || vote.side === 'b') tally[vote.side] += 1;
  return tally;
}

// The share of the votes each side has, as whole percentages that add up to
// 100. With no votes yet it is an even split.
export function voteShares(red, blue) {
  const total = red + blue;
  if (!total) return { r: 50, b: 50 };
  const r = Math.round((red / total) * 100);
  return { r, b: 100 - r };
}

// How many picked each option: [{ choice }] -> a count per option.
export function tallyAnswers(answers, optionCount) {
  const counts = Array(optionCount).fill(0);
  for (const answer of answers) if (Number.isInteger(answer.choice) && answer.choice >= 0 && answer.choice < optionCount) counts[answer.choice] += 1;
  return counts;
}

// Who answered a question right: [{ uid, username, choice }] -> those whose
// choice was `correct`.
export const quizWinners = (answers, correct) => answers.filter((answer) => answer.choice === correct).map(({ uid, username }) => ({ uid, username }));

// A question staff have prepared, with anything missing put right. The right
// answer is kept here and nowhere the audience can read until it is revealed.
export function soundQuestion(given) {
  const options = (Array.isArray(given?.options) ? given.options : []).map((o) => text(o)).slice(0, MAX_OPTIONS);
  while (options.length < 2) options.push('');
  const correct = Number.isInteger(given?.correct) && given.correct >= 0 && given.correct < options.length ? given.correct : 0;
  return { id: text(given?.id) || newId(), question: text(given?.question), options, correct, points: count(given?.points) || DEFAULT_POINTS };
}

export const soundQuestions = (list) => (Array.isArray(list) ? list : []).map(soundQuestion);

// Whether a prepared question is ready to put up: it asks something and has
// at least two answers, none of them blank.
export const isReady = (question) => question.question.trim() !== '' && question.options.length >= 2 && question.options.every((o) => o.trim() !== '');

// A prepared question as the audience is shown it: without the right answer.
export const asked = (question) => ({ id: newId(), question: question.question, options: question.options, points: question.points, status: 'open', correct: null, counts: null });
