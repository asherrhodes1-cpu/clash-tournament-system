import {
  collection, doc, getDocs, increment, limit, onSnapshot, orderBy, query, setDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { soundLeague, soundQuestions } from '../league/leagueState';

// live/league says whether the finals section is on, which match is being
// voted on and which quiz question is up. Public to read, staff to write,
// like the rest of `live`.
const leagueRef = doc(db, 'live', 'league');
const votesRef = (matchId) => collection(db, 'leagueVotes', matchId, 'votes');
const answersRef = (quizId) => collection(db, 'leagueQuiz', quizId, 'answers');
const scoresRef = collection(db, 'leagueScores');
// The prepared quiz questions, right answers included: staff only.
const questionsRef = doc(db, 'leagueStaff', 'questions');

const rows = (snapshot) => snapshot.docs.map((d) => ({ uid: d.id, ...d.data() }));

export function subscribeToLeague(onChange, onError) {
  return onSnapshot(leagueRef, (snapshot) => onChange(soundLeague(snapshot.data())), onError);
}

export const saveLeague = (league) => setDoc(leagueRef, soundLeague(league));

// A viewer's vote on a match: 'r' or 'b'. The rules only take it while
// voting on that match is open, and only as that viewer.
export const castVote = (matchId, user, side) => setDoc(doc(votesRef(matchId), user.uid), { side, username: user.username });

// Calls back with the side a viewer voted for on a match, or null.
export function subscribeToMyVote(matchId, uid, onChange) {
  return onSnapshot(doc(votesRef(matchId), uid), (snapshot) => onChange(snapshot.data()?.side ?? null), () => onChange(null));
}

// Every vote on a match. Staff only.
export function subscribeToVotes(matchId, onChange) {
  return onSnapshot(votesRef(matchId), (snapshot) => onChange(rows(snapshot)), () => onChange([]));
}

// A viewer's answer to the question that is up: the option's place in the
// list. It can't be changed once given.
export const answerQuiz = (quizId, user, choice) => setDoc(doc(answersRef(quizId), user.uid), { choice, username: user.username });

// Calls back with the option a viewer picked, or null.
export function subscribeToMyAnswer(quizId, uid, onChange) {
  return onSnapshot(doc(answersRef(quizId), uid), (snapshot) => onChange(snapshot.data()?.choice ?? null), () => onChange(null));
}

// Every answer to a question. Staff only.
export function subscribeToAnswers(quizId, onChange) {
  return onSnapshot(answersRef(quizId), (snapshot) => onChange(rows(snapshot)), () => onChange([]));
}

// The top of the quiz leaderboard: [{ uid, username, points }].
export function subscribeToLeagueScores(onChange, count = 10) {
  return onSnapshot(query(scoresRef, orderBy('points', 'desc'), limit(count)), (snapshot) => onChange(rows(snapshot)), () => onChange([]));
}

export function subscribeToMyScore(uid, onChange) {
  return onSnapshot(doc(scoresRef, uid), (snapshot) => onChange(snapshot.data()?.points ?? 0), () => onChange(0));
}

// A batch takes 500 writes at most.
async function inBatches(items, write) {
  for (let i = 0; i < items.length; i += 400) {
    const batch = writeBatch(db);
    for (const item of items.slice(i, i + 400)) write(batch, item);
    await batch.commit();
  }
}

// Gives `points` to everyone who got a question right: [{ uid, username }].
export const awardPoints = (winners, points) => inBatches(winners, (batch, winner) => (
  batch.set(doc(scoresRef, winner.uid), { username: winner.username, points: increment(points) }, { merge: true })
));

// Wipes the leaderboard, for a new broadcast.
export async function resetLeagueScores() {
  const everyone = await getDocs(scoresRef);
  await inBatches(everyone.docs, (batch, d) => batch.delete(d.ref));
}

// What staff have prepared: { questions, up }. `up` remembers the right
// answer to the question the audience is being asked - { quizId, correct } -
// so it can be revealed even if the staff page is reloaded in between.
export function subscribeToQuestions(onChange) {
  const bank = (saved) => ({
    questions: soundQuestions(saved?.questions),
    up: saved?.up?.quizId ? { quizId: String(saved.up.quizId), correct: Number(saved.up.correct) || 0 } : null,
  });
  return onSnapshot(questionsRef, (snapshot) => onChange(bank(snapshot.data())), () => onChange(bank(null)));
}

export const saveQuestions = ({ questions, up }) => setDoc(questionsRef, { questions: soundQuestions(questions), up: up ?? null });
