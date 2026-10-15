import { blankMatch, blankPlayer, isOnSide, matchLabel, overlayStates, seriesSlots, seriesWinner, soundLibrary, ties, soundMatch, wins, withPlayer, withSavedMatch, withSavedPlayer, withoutMatch, withoutPlayer } from '../overlays/overlayState';

const match = () => ({
  ...blankMatch(),
  title: 'BUILDER LEAGUE',
  round: 'Grand Final',
  bestOf: 5,
  games: ['r', 'b', 'r'],
  redVotes: '128',
  blueVotes: '72',
  red: { name: 'MrSixStar', seed: 'Seed #3', trophies: '6120', best: '2nd Place', stage1: '82.5', stage2: '61', army: ['12', '3', '', '', '', ''] },
  blue: { name: 'J3fri', seed: 'Seed #1', trophies: '6480', best: 'Champion', stage1: '90', stage2: '70', army: ['9', '', '', '', '', ''] },
  casters: [{ name: 'AJ', channel: 'MercifulAj' }, { name: 'Sam', channel: 'SamCasts' }],
  attack: { side: 'b', stars: 2, percent: '87.5', time: '2:41', troops: ['12', '3', '', '', '', '', '', ''] },
});

test('one match fills every overlay under the names its page uses', () => {
  const states = overlayStates(match());
  expect(Object.keys(states).sort()).toEqual(['attack-overview', 'caster-desk', 'in-game', 'player-blue', 'player-red']);
  expect(states['in-game']).toMatchObject({ rName: 'MrSixStar', bName: 'J3fri', rSeed: 'Seed #3', bTroph: '6480', rS1: '82.5', bS2: '70', round: 'Grand Final', bo: 5, games: ['r', 'b', 'r'], rVote: '128', bVote: '72' });
  expect(states['caster-desk']).toMatchObject({ c1Name: 'AJ', c1Chan: 'MercifulAj', c2Name: 'Sam', rName: 'MrSixStar', bName: 'J3fri', bo: 5 });
  expect(states['player-red']).toMatchObject({ name: 'MrSixStar', best: '2nd Place', s1: '82.5', s2: '61', army: ['12', '3', '', '', '', ''], c2Chan: 'SamCasts' });
  expect(states['player-blue']).toMatchObject({ name: 'J3fri', seed: 'Seed #1', army: ['9', '', '', '', '', ''] });
});

test('the attack overview names the attacker first, whichever side that is', () => {
  expect(overlayStates(match())['attack-overview']).toEqual({ c1Name: 'AJ', c1Chan: 'MercifulAj', c2Name: 'Sam', c2Chan: 'SamCasts', side: 'b', aName: 'J3fri', dName: 'MrSixStar', stars: 2, pct: '87.5', time: '2:41', troops: ['12', '3', '', '', '', '', '', ''] });
  const red = { ...match(), attack: { ...match().attack, side: 'r' } };
  expect(overlayStates(red)['attack-overview']).toMatchObject({ side: 'r', aName: 'MrSixStar', dName: 'J3fri' });
});

test('a saved match with pieces missing or out of range is put right', () => {
  expect(soundMatch(undefined)).toEqual(blankMatch());
  const odd = soundMatch({ bestOf: 99, games: ['r', 'x', 'b', 'b', 'b', 'b', 'b', 'b', 'b'], red: { name: 'Solo' }, attack: { stars: 9, side: 'q', troops: ['4'] } });
  expect(odd.bestOf).toBe(7);
  expect(odd.games).toEqual(['r', 'b', 'b', 'b', 'b', 'b', 'b']);
  expect(odd.red).toMatchObject({ name: 'Solo', seed: 'Seed #1', army: ['', '', '', '', '', ''] });
  expect(odd.attack).toMatchObject({ side: 'r', stars: 6, troops: ['4', '', '', '', '', '', '', ''] });
  // Fewer games than were already played: the extra ones are dropped.
  expect(soundMatch({ bestOf: 1, games: ['r', 'b'] }).games).toEqual(['r']);
});

test('a tied game counts for nobody, and adds a game when the series is still level', () => {
  const series = soundMatch({ bestOf: 3, games: ['r', 't', 'b', 'x'] });
  expect(series.games).toEqual(['r', 't', 'b']);
  expect([wins(series, 'r'), wins(series, 'b'), ties(series), seriesWinner(series)]).toEqual([1, 1, 1, null]);
  // Three played and nobody through: a fourth badge, for the decider.
  expect(seriesSlots(series)).toBe(4);
  const decided = soundMatch({ bestOf: 3, games: ['r', 't', 'b', 'b'] });
  expect([seriesWinner(decided), seriesSlots(decided)]).toEqual(['b', 4]);
  // A tie on the way to a win adds nothing.
  expect(seriesSlots(soundMatch({ bestOf: 3, games: ['r', 't', 'r'] }))).toBe(3);
  // No more games are kept than the series length plus its ties.
  expect(soundMatch({ bestOf: 3, games: ['r', 'b', 'r', 'b'] }).games).toEqual(['r', 'b', 'r']);
});

test('a series is won with more than half its games', () => {
  const series = soundMatch({ bestOf: 5, games: ['r', 'b', 'r'] });
  expect([wins(series, 'r'), wins(series, 'b'), seriesWinner(series)]).toEqual([2, 1, null]);
  expect(seriesWinner(soundMatch({ bestOf: 5, games: ['r', 'b', 'r', 'r'] }))).toBe('r');
  expect(seriesWinner(soundMatch({ bestOf: 1, games: ['b'] }))).toBe('b');
});

test('prepared players go on either side without disturbing the rest of the match', () => {
  const library = withSavedPlayer(withSavedPlayer(soundLibrary(), { ...blankPlayer('Tryhard', 'Seed #7'), best: 'Top 8' }), blankPlayer('Rookie', 'Seed #9'));
  expect(library.players.map((p) => p.name)).toEqual(['Tryhard', 'Rookie']);
  expect(new Set(library.players.map((p) => p.id)).size).toBe(2);
  const on = withPlayer(match(), 'b', library.players[0]);
  expect(on.blue).toMatchObject({ name: 'Tryhard', seed: 'Seed #7', best: 'Top 8' });
  expect(on.blue.id).toBeUndefined();
  expect([on.red.name, on.games, on.casters[0].name]).toEqual(['MrSixStar', ['r', 'b', 'r'], 'AJ']);
  expect([isOnSide(on, 'b', library.players[0]), isOnSide(on, 'r', library.players[0])]).toEqual([true, false]);
  // Saving one that is already there changes it rather than adding another.
  const changed = withSavedPlayer(library, { ...library.players[0], seed: 'Seed #1' });
  expect(changed.players.map((p) => [p.name, p.seed])).toEqual([['Tryhard', 'Seed #1'], ['Rookie', 'Seed #9']]);
  expect(withoutPlayer(changed, changed.players[0].id).players.map((p) => p.name)).toEqual(['Rookie']);
});

test('a saved match keeps a name, its own or one made from the players and round', () => {
  expect(matchLabel(soundMatch(match()))).toBe('MrSixStar vs J3fri · Grand Final');
  const library = withSavedMatch(withSavedMatch(soundLibrary(), match()), match(), '  Finals day  ');
  expect(library.matches.map((m) => m.label)).toEqual(['MrSixStar vs J3fri · Grand Final', 'Finals day']);
  expect(library.matches[0].match.red.name).toBe('MrSixStar');
  expect(withoutMatch(library, library.matches[0].id).matches.map((m) => m.label)).toEqual(['Finals day']);
  // Whatever was saved by an older page still loads.
  expect(soundLibrary({ players: [{ name: 'Solo' }], matches: [{}] })).toMatchObject({ players: [{ name: 'Solo', army: ['', '', '', '', '', ''] }], matches: [{ label: 'Player One vs Player Two · Quarterfinal' }] });
});
