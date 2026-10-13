import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import LeaguePage from '../league/LeaguePage';
import LeaguePopup from '../league/LeaguePopup';
import LeagueControl from '../league/LeagueControl';
import { soundLeague, soundQuestion } from '../league/leagueState';
import * as api from '../api/league';

// No Firebase: every call the pages make is a stand-in.
jest.mock('../api/league', () => ({
  subscribeToLeague: jest.fn(),
  subscribeToQuestions: jest.fn(),
  subscribeToVotes: jest.fn(),
  subscribeToAnswers: jest.fn(),
  subscribeToMyVote: jest.fn(),
  subscribeToMyAnswer: jest.fn(),
  subscribeToLeagueScores: jest.fn(),
  subscribeToMyScore: jest.fn(),
  castVote: jest.fn(),
  answerQuiz: jest.fn(),
  saveLeague: jest.fn(),
  saveQuestions: jest.fn(),
  awardPoints: jest.fn(),
  resetLeagueScores: jest.fn(),
}));
jest.mock('../PlayerName', () => ({ name }) => name);

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const viewer = { uid: 'u1', username: 'Ann', isGuest: false };
const guest = { uid: null, username: null, isGuest: true };
const vote = (status = 'open') => ({ matchId: 'm1', red: 'MrSixStar', blue: 'J3fri', status, redVotes: 3, blueVotes: 1 });
const question = (status = 'open', more = {}) => ({ id: 'q1', question: 'How many stars is a perfect attack?', options: ['3', '6', '9'], points: 250, status, ...more });

let host;
let root;
let state;
const mount = (element, league) => {
  state = { league: soundLeague(league), bank: { questions: [], up: null }, votes: [], answers: [], myVote: null, myAnswer: null };
  api.subscribeToLeague.mockImplementation((onChange) => { onChange(state.league); return () => {}; });
  api.subscribeToQuestions.mockImplementation((onChange) => { onChange(state.bank); return () => {}; });
  api.subscribeToVotes.mockImplementation((id, onChange) => { onChange(state.votes); return () => {}; });
  api.subscribeToAnswers.mockImplementation((id, onChange) => { onChange(state.answers); return () => {}; });
  api.subscribeToMyVote.mockImplementation((id, uid, onChange) => { onChange(state.myVote); return () => {}; });
  api.subscribeToMyAnswer.mockImplementation((id, uid, onChange) => { onChange(state.myAnswer); return () => {}; });
  api.subscribeToLeagueScores.mockImplementation((onChange) => { onChange([{ uid: 'u9', username: 'Top', points: 500 }]); return () => {}; });
  api.subscribeToMyScore.mockImplementation((uid, onChange) => { onChange(250); return () => {}; });
  for (const name of ['castVote', 'answerQuiz', 'saveLeague', 'saveQuestions', 'awardPoints', 'resetLeagueScores']) api[name].mockImplementation(() => Promise.resolve());
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(element(state)));
};
beforeEach(() => { jest.clearAllMocks(); window.sessionStorage.clear(); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(label));
const click = (label) => act(async () => { button(label).click(); });

test('the finals page is closed unless staff have switched it on', () => {
  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: false, voting: vote() });
  expect(host.textContent).toMatch(/opens while the finals are being streamed/);
  expect(button('MrSixStar')).toBeUndefined();
});

test('a viewer votes for a side while voting is open, and sees the split', async () => {
  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: true, voting: vote() });
  expect(button('MrSixStar').textContent).toContain('75%');
  await click('J3fri');
  expect(api.castVote).toHaveBeenCalledWith('m1', viewer, 'b');
});

test('once the match has started the vote buttons go', () => {
  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: true, voting: vote('locked') });
  expect(button('MrSixStar')).toBeUndefined();
  expect(host.querySelector('[aria-label="Match vote"]')).toBeNull();
});

test('someone not signed in is asked to log in instead', async () => {
  const onLogin = jest.fn();
  mount(() => <LeaguePage user={guest} onLogin={onLogin} onHome={() => {}} />, { active: true, voting: vote(), quiz: question() });
  expect(button('MrSixStar').disabled).toBe(true);
  await click('Log in to vote');
  expect(onLogin).toHaveBeenCalled();
  expect(api.castVote).not.toHaveBeenCalled();
});

test('a quiz answer is given once, and the result shows when it is revealed', async () => {
  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: true, quiz: question() });
  await click('6');
  expect(api.answerQuiz).toHaveBeenCalledWith('q1', viewer, 1);
  act(() => root.unmount());
  host.remove();

  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: true, quiz: question('revealed', { correct: 1, counts: [1, 3, 0] }) });
  // Their answer is already in, so the buttons are off and the result is shown.
  act(() => api.subscribeToMyAnswer.mock.calls.at(-1)[2](1));
  expect(button('6').disabled).toBe(true);
  expect(host.textContent).toMatch(/Correct! \+250 trophies/);
  expect(button('6').textContent).toMatch(/75% picked this · correct/);
});

test('the stream plays on the finals page, with answer buttons under it only while something is up', () => {
  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: true, videoUrl: 'https://www.youtube.com/live/abcdefghijk' });
  expect(host.querySelector('iframe').src).toContain('youtube.com/embed/abcdefghijk');
  expect(host.querySelector('[aria-label="Match vote"]')).toBeNull();
  expect(host.querySelector('[aria-label="Quiz question"]')).toBeNull();
  act(() => api.subscribeToLeague.mock.calls.at(-1)[0](soundLeague({ active: true, voting: vote(), quiz: question() })));
  expect(host.textContent).toMatch(/The stream will show here/);
  expect(button('MrSixStar')).toBeDefined();
  expect(button('6')).toBeDefined();
});

test('staff set the stream link ahead of the broadcast', async () => {
  mount(() => <LeagueControl match={match} onVotes={() => {}} />, { active: true });
  expect(host.textContent).toMatch(/No stream link is set/);
  const input = host.querySelector('input[placeholder*="youtube.com/live"]');
  const leave = (value) => act(async () => { input.value = value; input.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await leave('not a link');
  expect(api.saveLeague).not.toHaveBeenCalled();
  await leave('https://youtu.be/abcdefghijk');
  expect(api.saveLeague.mock.calls.at(-1)[0].videoUrl).toBe('https://youtu.be/abcdefghijk');
});

test('the pop-up shows only while the section is on, and closing it lasts the visit', async () => {
  const onJoin = jest.fn();
  mount(() => <LeaguePopup hidden={false} onJoin={onJoin} />, { active: false });
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  act(() => root.unmount());
  host.remove();

  mount(() => <LeaguePopup hidden={false} onJoin={onJoin} />, { active: true, title: 'FINAL 8' });
  expect(host.querySelector('[role="dialog"]').textContent).toMatch(/FINAL 8/);
  await click('Join in');
  expect(onJoin).toHaveBeenCalled();
  expect(host.querySelector('[role="dialog"]')).toBeNull();
  expect(window.sessionStorage.getItem('league-popup-closed')).toBe('1');
});

const match = { red: { name: 'MrSixStar' }, blue: { name: 'J3fri' } };

test('staff open voting for the match on the overlays, then lock it as it starts', async () => {
  const onVotes = jest.fn();
  mount(() => <LeagueControl match={match} onVotes={onVotes} />, { active: true });
  await click('Open voting: MrSixStar vs J3fri');
  expect(api.saveLeague.mock.calls.at(-1)[0].voting).toMatchObject({ red: 'MrSixStar', blue: 'J3fri', status: 'open', redVotes: 0, blueVotes: 0 });
  expect(onVotes).toHaveBeenCalledWith(0, 0);
  act(() => root.unmount());
  host.remove();

  mount(() => <LeagueControl match={match} onVotes={onVotes} />, { active: true, voting: vote() });
  await click('Lock voting');
  expect(api.saveLeague.mock.calls.at(-1)[0].voting.status).toBe('locked');
});

test('when the match ends staff say who won, and those who picked them get trophies once', async () => {
  mount(() => <LeagueControl match={match} onVotes={() => {}} />, { active: true, voteReward: 150, voting: { ...vote('locked'), reward: 150 } });
  act(() => api.subscribeToVotes.mock.calls.at(-1)[1]([{ uid: 'a', username: 'Ann', side: 'r' }, { uid: 'b', username: 'Bo', side: 'b' }, { uid: 'c', username: 'Cy', side: 'b' }]));
  await click('J3fri won');
  expect(api.awardPoints).toHaveBeenCalledWith([{ uid: 'b', username: 'Bo' }, { uid: 'c', username: 'Cy' }], 150);
  expect(api.saveLeague.mock.calls.at(-1)[0].voting).toMatchObject({ status: 'locked', winner: 'b' });
  act(() => root.unmount());
  host.remove();

  // Once it has been paid there is nothing left to press but clearing it.
  mount(() => <LeagueControl match={match} onVotes={() => {}} />, { active: true, voting: { ...vote('locked'), winner: 'b' } });
  expect(button('J3fri won')).toBeUndefined();
  expect(host.textContent).toMatch(/J3fri won, and those who picked them were given 100 trophies/);
});

test('a viewer sees who won and what their pick earned', () => {
  mount(() => <LeaguePage user={viewer} onLogin={() => {}} onHome={() => {}} />, { active: true, voting: { ...vote('locked'), winner: 'b', reward: 150 } });
  act(() => api.subscribeToMyVote.mock.calls.at(-1)[2]('b'));
  const result = host.querySelector('[aria-label="Match result"]');
  expect(result.textContent).toMatch(/J3fri won the match/);
  expect(result.textContent).toMatch(/You picked right: \+150/);
});

test('vote totals are counted from the votes and passed to the overlays', async () => {
  jest.useFakeTimers();
  const onVotes = jest.fn();
  mount(() => <LeagueControl match={match} onVotes={onVotes} />, { active: true, voting: vote() });
  act(() => api.subscribeToVotes.mock.calls.at(-1)[1]([{ uid: 'a', side: 'r' }, { uid: 'b', side: 'b' }, { uid: 'c', side: 'b' }]));
  await act(async () => { jest.advanceTimersByTime(1500); });
  expect(onVotes).toHaveBeenCalledWith(1, 2);
  expect(api.saveLeague.mock.calls.at(-1)[0].voting).toMatchObject({ redVotes: 1, blueVotes: 2 });
  jest.useRealTimers();
});

test('a prepared question goes up without its answer, which is revealed with points for those who got it', async () => {
  const prepared = soundQuestion({ id: 'p1', question: 'How many stars is a perfect attack?', options: ['3', '6', '9'], correct: 1, points: 250 });
  mount(() => <LeagueControl match={match} onVotes={() => {}} />, { active: true });
  act(() => api.subscribeToQuestions.mock.calls.at(-1)[0]({ questions: [prepared], up: null }));
  await click('How many stars is a perfect attack?');
  const up = api.saveLeague.mock.calls.at(-1)[0].quiz;
  expect(up).toMatchObject({ status: 'open', correct: null, points: 250 });
  // The right answer went only to the staff-only store.
  expect(api.saveQuestions.mock.calls.at(-1)[0].up).toEqual({ quizId: up.id, correct: 1 });
  act(() => root.unmount());
  host.remove();

  mount(() => <LeagueControl match={match} onVotes={() => {}} />, { active: true, quiz: { ...up, status: 'closed' } });
  act(() => api.subscribeToQuestions.mock.calls.at(-1)[0]({ questions: [prepared], up: { quizId: up.id, correct: 1 } }));
  act(() => api.subscribeToAnswers.mock.calls.at(-1)[1]([{ uid: 'a', username: 'Ann', choice: 1 }, { uid: 'b', username: 'Bo', choice: 0 }, { uid: 'c', username: 'Cy', choice: 1 }]));
  await click('Reveal the answer and give trophies');
  expect(api.awardPoints).toHaveBeenCalledWith([{ uid: 'a', username: 'Ann' }, { uid: 'c', username: 'Cy' }], 250);
  expect(api.saveLeague.mock.calls.at(-1)[0].quiz).toMatchObject({ status: 'revealed', correct: 1, counts: [1, 2, 0] });
});
