// What the stream overlays show, as staff fill it in on the control page:
// one match, entered once, turned into the settings each overlay page under
// public/overlays reads.

// The troop cards built into the overlays, by the number each goes by there.
export const TROOPS = ['Cannon', 'Fire wizard', 'Green dragon', 'P.E.K.K.A', 'Hog glider', 'Baby dragon', 'Giant', 'Goggles skeleton', 'Archer', 'Night Witch', 'Skeleton balloon', 'Barbarian'];

export const ARMY_SLOTS = 6;
export const ATTACK_SLOTS = 8;
export const MAX_GAMES = 7;
// A Builder Base attack is out of six stars: three for each stage.
export const MAX_STARS = 6;

export const blankPlayer = (name = 'New player', seed = '') => ({ name, seed, trophies: '0', best: '—', stage1: '0', stage2: '0', army: Array(ARMY_SLOTS).fill('') });

export const blankAttack = () => ({ side: 'r', stars: 0, percent: '0', time: '0:00', troops: Array(ATTACK_SLOTS).fill('') });

export const blankMatch = () => ({
  title: 'BUILDER LEAGUE',
  round: 'Quarterfinal',
  // Best of this many games, and who won each so far: 'r' or 'b', in order.
  bestOf: 3,
  games: [],
  redVotes: '0',
  blueVotes: '0',
  red: blankPlayer('Player One', 'Seed #1'),
  blue: blankPlayer('Player Two', 'Seed #2'),
  casters: [{ name: 'Caster One', channel: 'ChannelName' }, { name: 'Caster Two', channel: 'ChannelName' }],
  attack: blankAttack(),
});

const text = (value, fallback) => (typeof value === 'string' ? value : value == null ? fallback : String(value));
const slots = (list, count) => Array.from({ length: count }, (_, i) => text(list?.[i], ''));

// A match with anything missing or out of range put right, so one saved by
// an older version of the page, or half-filled, still draws.
export function soundMatch(saved) {
  const blank = blankMatch();
  const from = saved ?? {};
  const player = (given, fallback) => ({
    name: text(given?.name, fallback.name),
    seed: text(given?.seed, fallback.seed),
    trophies: text(given?.trophies, fallback.trophies),
    best: text(given?.best, fallback.best),
    stage1: text(given?.stage1, fallback.stage1),
    stage2: text(given?.stage2, fallback.stage2),
    army: slots(given?.army, ARMY_SLOTS),
  });
  const bestOf = Math.max(1, Math.min(MAX_GAMES, Math.round(Number(from.bestOf)) || blank.bestOf));
  return {
    title: text(from.title, blank.title),
    round: text(from.round, blank.round),
    bestOf,
    games: (Array.isArray(from.games) ? from.games : []).filter((g) => g === 'r' || g === 'b').slice(0, bestOf),
    redVotes: text(from.redVotes, blank.redVotes),
    blueVotes: text(from.blueVotes, blank.blueVotes),
    red: player(from.red, blank.red),
    blue: player(from.blue, blank.blue),
    casters: blank.casters.map((fallback, i) => ({ name: text(from.casters?.[i]?.name, fallback.name), channel: text(from.casters?.[i]?.channel, fallback.channel) })),
    attack: {
      side: from.attack?.side === 'b' ? 'b' : 'r',
      stars: Math.max(0, Math.min(MAX_STARS, Math.round(Number(from.attack?.stars)) || 0)),
      percent: text(from.attack?.percent, '0'),
      time: text(from.attack?.time, '0:00'),
      troops: slots(from.attack?.troops, ATTACK_SLOTS),
    },
  };
}

// One player with anything missing put right.
export function soundPlayer(given, fallback = blankPlayer()) {
  return soundMatch({ red: { ...fallback, ...(given ?? {}) } }).red;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// What staff prepare ahead of a broadcast so nothing has to be typed during
// it: players, each ready to be put on either side with one click, and whole
// matches ready to be put on screen. Anything missing is put right.
export function soundLibrary(saved) {
  const players = (Array.isArray(saved?.players) ? saved.players : []).map((player) => ({ id: text(player?.id, '') || newId(), ...soundPlayer(player) }));
  const matches = (Array.isArray(saved?.matches) ? saved.matches : []).map((entry) => {
    const match = soundMatch(entry?.match);
    return { id: text(entry?.id, '') || newId(), label: text(entry?.label, '') || matchLabel(match), match };
  });
  return { players, matches };
}

// What a saved match is called if staff give it no name of their own.
export function matchLabel(match) {
  return `${match.red.name} vs ${match.blue.name}${match.round ? ` · ${match.round}` : ''}`;
}

// A match with a prepared player put on one side: 'r' or 'b'. Everything
// else about the match - the score, the casters - stays as it is.
export function withPlayer(match, side, player) {
  const { id, ...details } = player;
  return soundMatch({ ...match, [side === 'b' ? 'blue' : 'red']: details });
}

// Whether a prepared player is the one on a side just now.
export const isOnSide = (match, side, player) => (side === 'b' ? match.blue : match.red).name === player.name;

// The library with a player added, or changed if it is already there.
export function withSavedPlayer(library, player) {
  const entry = { id: player.id || newId(), ...soundPlayer(player) };
  const there = library.players.some((p) => p.id === entry.id);
  return { ...library, players: there ? library.players.map((p) => (p.id === entry.id ? entry : p)) : [...library.players, entry] };
}

export const withoutPlayer = (library, id) => ({ ...library, players: library.players.filter((p) => p.id !== id) });

export function withSavedMatch(library, match, label = '') {
  const sound = soundMatch(match);
  return { ...library, matches: [...library.matches, { id: newId(), label: label.trim() || matchLabel(sound), match: sound }] };
}

export const withoutMatch = (library, id) => ({ ...library, matches: library.matches.filter((m) => m.id !== id) });

// Games won by a side, and whether that has won it the series.
export const wins = (match, side) => match.games.filter((g) => g === side).length;
export const seriesWinner = (match) => ['r', 'b'].find((side) => wins(match, side) > match.bestOf / 2) ?? null;

// The settings each overlay page takes, by the page's name. The names inside
// are the overlay pages' own.
export function overlayStates(given) {
  const match = soundMatch(given);
  const [first, second] = match.casters;
  const series = { title: match.title, round: match.round, rVote: match.redVotes, bVote: match.blueVotes, bo: match.bestOf, games: match.games };
  const casters = { c1Name: first.name, c1Chan: first.channel, c2Name: second.name, c2Chan: second.channel };
  const overview = (player) => ({ name: player.name, seed: player.seed, best: player.best, s1: player.stage1, s2: player.stage2, army: player.army, ...casters });
  const [attacker, defender] = match.attack.side === 'b' ? [match.blue, match.red] : [match.red, match.blue];
  return {
    'in-game': {
      ...series,
      rName: match.red.name, rSeed: match.red.seed, rTroph: match.red.trophies, rBest: match.red.best, rS1: match.red.stage1, rS2: match.red.stage2,
      bName: match.blue.name, bSeed: match.blue.seed, bTroph: match.blue.trophies, bBest: match.blue.best, bS1: match.blue.stage1, bS2: match.blue.stage2,
    },
    'caster-desk': { ...series, ...casters, rName: match.red.name, bName: match.blue.name },
    'player-red': overview(match.red),
    'player-blue': overview(match.blue),
    'attack-overview': { side: match.attack.side, aName: attacker.name, dName: defender.name, stars: match.attack.stars, pct: match.attack.percent, time: match.attack.time, troops: match.attack.troops },
  };
}

// The overlay pages, for the list of OBS sources. `under` is what goes
// beneath each in OBS, on a 1920 by 1080 canvas.
export const OVERLAYS = [
  { file: 'in-game', label: 'In-game', about: 'Game capture on the left, player panel on the right', under: ['Game capture: x 0, y 0, 1446 × 1080'] },
  { file: 'caster-desk', label: 'Caster desk', about: 'Two caster cams, the matchup and the audience vote', under: ['Caster 1: x 120, y 206, 760 × 428', 'Caster 2: x 1040, y 206, 760 × 428'] },
  { file: 'attack-overview', label: 'Attack overview', about: 'Stars, destruction, time and troops used', under: [] },
  { file: 'player-red', label: 'Player overview: red', about: 'Red player stats and favorite army, with caster cams', under: ['Caster 1: x 1492, y 150, 400 × 225', 'Caster 2: x 1492, y 600, 400 × 225'] },
  { file: 'player-blue', label: 'Player overview: blue', about: 'Blue player stats and favorite army, with caster cams', under: ['Caster 1: x 1492, y 150, 400 × 225', 'Caster 2: x 1492, y 600, 400 × 225'] },
];
