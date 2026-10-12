import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import OverlayControl from '../overlays/OverlayControl';
import { blankMatch, blankPlayer, soundLibrary } from '../overlays/overlayState';
import { saveOverlays, subscribeToOverlays } from '../api/overlays';

jest.mock('../api/overlays', () => ({
  subscribeToOverlays: jest.fn(),
  saveOverlays: jest.fn(() => Promise.resolve()),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const player = (id, name, seed) => ({ ...blankPlayer(name, seed), id, best: `${name}'s best`, army: ['12', '', '', '', '', ''] });
const prepared = () => soundLibrary({
  players: [player('p1', 'MrSixStar', 'Seed #3'), player('p2', 'J3fri', 'Seed #1'), player('p3', 'Tryhard', 'Seed #7')],
  matches: [{ id: 'm1', label: 'Semi 1', match: { ...blankMatch(), round: 'Semifinal', bestOf: 5, red: player('', 'Alpha', 'Seed #2'), blue: player('', 'Bravo', 'Seed #4') } }],
});

let host;
let root;
const mount = (library = prepared()) => {
  subscribeToOverlays.mockImplementation((onChange) => {
    onChange({ match: blankMatch(), library });
    return () => {};
  });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<OverlayControl />));
};
beforeEach(() => {
  jest.useFakeTimers();
  saveOverlays.mockClear();
  window.history.replaceState(null, '', '/overlay-control');
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.useRealTimers();
});

const buttons = (label, within = host) => [...within.querySelectorAll('button')].filter((b) => b.textContent === label);
const button = (label, within) => buttons(label, within)[0];
const group = (label) => host.querySelector(`[aria-label="${label}"]`);
const openTab = (label) => act(() => [...host.querySelectorAll('[role="tab"]')].find((t) => t.textContent === label).click());
const field = (label) => [...host.querySelectorAll('label')].find((l) => l.textContent === label).querySelector('input');
const type = (input, value) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const settle = () => act(async () => { jest.advanceTimersByTime(500); });
const lastSaved = () => saveOverlays.mock.calls[saveOverlays.mock.calls.length - 1][0];

test('the Live tab opens first and puts a prepared player on a side with one click, at once', async () => {
  mount();
  expect(host.querySelector('[role="tab"][aria-selected="true"]').textContent).toBe('Live');
  act(() => button('Tryhard', group('Red player')).click());
  // No waiting for a pause in typing: a click mid-broadcast is sent straight away.
  expect(saveOverlays).toHaveBeenCalledTimes(1);
  expect(lastSaved().match.red).toMatchObject({ name: 'Tryhard', seed: 'Seed #7', best: "Tryhard's best", army: ['12', '', '', '', '', ''] });
  expect(lastSaved().match.blue.name).toBe('Player Two');
  await settle();
  act(() => button('J3fri', group('Blue player')).click());
  expect(lastSaved().match).toMatchObject({ red: { name: 'Tryhard' }, blue: { name: 'J3fri', seed: 'Seed #1' } });
  expect(button('J3fri', group('Blue player')).getAttribute('aria-pressed')).toBe('true');
  // The prepared players themselves are untouched.
  expect(lastSaved().library.players.map((p) => p.name)).toEqual(['MrSixStar', 'J3fri', 'Tryhard']);
});

test('a prepared match goes on screen whole with one click', async () => {
  mount();
  act(() => button('Semi 1').click());
  expect(lastSaved().match).toMatchObject({ round: 'Semifinal', bestOf: 5, red: { name: 'Alpha' }, blue: { name: 'Bravo' } });
});

test('games are added in order, stop at the series length and can be undone', async () => {
  mount();
  act(() => button('Red wins a game').click());
  act(() => button('Blue wins a game').click());
  act(() => button('Red wins a game').click());
  expect(lastSaved().match.games).toEqual(['r', 'b', 'r']);
  // Best of three is full: no more games can be added, and red has won it.
  expect(button('Red wins a game').disabled).toBe(true);
  expect(host.textContent).toMatch(/Player One wins the series/);
  act(() => button('Undo last game').click());
  expect(lastSaved().match.games).toEqual(['r', 'b']);
});

test('the attack overview follows the side chosen and clears for the next attack', async () => {
  mount();
  act(() => button('Blue attacks').click());
  // Out of six: three stars for each stage.
  expect(buttons('6', group('Stars'))).toHaveLength(1);
  act(() => button('5', group('Stars')).click());
  type(field('Destruction % (out of 200)'), '187.5');
  await settle();
  expect(lastSaved().match.attack).toMatchObject({ side: 'b', stars: 5, percent: '187.5' });
  act(() => button('Clear for the next attack').click());
  expect(lastSaved().match.attack).toMatchObject({ side: 'b', stars: 0, percent: '0', time: '0:00' });
});

test('troops are picked by their pictures: each click fills the next slot', async () => {
  mount();
  const add = (name) => act(() => host.querySelector(`[aria-label="Troops to add to Troops used"] [aria-label="Add ${name}"]`).click());
  expect(host.querySelector('[aria-label="Add Barbarian"] img').getAttribute('src')).toBe('/overlays/troops/12.webp');
  add('Barbarian');
  add('Green dragon');
  add('Baby dragon');
  // Sent at once, in the order clicked, as the numbers the overlays know the cards by.
  expect(lastSaved().match.attack.troops).toEqual(['12', '3', '6', '', '', '', '', '']);
  // Clicking a filled slot takes that troop out and closes the gap.
  act(() => host.querySelector('[aria-label="Remove Green dragon from slot 2"]').click());
  expect(lastSaved().match.attack.troops).toEqual(['12', '6', '', '', '', '', '', '']);
  // A full row takes no more.
  for (let i = 0; i < 6; i++) add('Archer');
  expect(lastSaved().match.attack.troops).toEqual(['12', '6', '9', '9', '9', '9', '9', '9']);
  expect(host.querySelector('[aria-label="Troops to add to Troops used"] [aria-label="Add Archer"]').disabled).toBe(true);
});

test('players and matches are prepared on their own tab, typing saved once it pauses', async () => {
  mount(soundLibrary());
  expect(host.textContent).toMatch(/None prepared yet/);
  openTab('Prepare');
  act(() => button('Add a player').click());
  type(field('Name'), 'New');
  type(field('Name'), 'Newcomer');
  expect(saveOverlays).not.toHaveBeenCalled();
  act(() => button('Save player').click());
  await settle();
  expect(saveOverlays).toHaveBeenCalledTimes(1);
  expect(lastSaved().library.players.map((p) => p.name)).toEqual(['Newcomer']);

  // The match on screen is saved under a name of its own.
  type(host.querySelector('[aria-label="Name for this match"]'), 'Opening match');
  act(() => button('Save this match').click());
  await settle();
  expect(lastSaved().library.matches.map((m) => m.label)).toEqual(['Opening match']);

  // Both then show up as buttons on the Live tab.
  openTab('Live');
  expect(button('Opening match')).toBeTruthy();
  expect(button('Newcomer', group('Red player'))).toBeTruthy();
});

test('the OBS setup tab lists every overlay\'s link, and the overlay can be seen from Live', () => {
  mount();
  expect(host.querySelector('iframe').getAttribute('src')).toBe('/overlays/in-game.html');
  act(() => button('Attack overview', group('Overlay shown below')).click());
  expect(host.querySelector('iframe').getAttribute('src')).toBe('/overlays/attack-overview.html');
  openTab('OBS setup');
  for (const file of ['in-game', 'caster-desk', 'attack-overview', 'player-red', 'player-blue']) {
    expect(host.textContent).toContain(`/overlays/${file}.html`);
  }
});
