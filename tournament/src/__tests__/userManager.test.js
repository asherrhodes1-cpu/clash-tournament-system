import { matchesSearch, sortUsers, parseGold } from '../staff/UserManager';

// Only the search and sort helpers are under test - no Firebase needed.
jest.mock('../api/nameStyles', () => ({ subscribeToGoldNames: () => () => {}, setGoldName: async () => {} }));
jest.mock('../api/users', () => ({}));

const users = [
  { id: '1', username: 'BuilderBoss', clashTag: '#ABC123', createdAt: '2026-09-01T10:00:00.000Z' },
  { id: '2', username: 'xX_badWord_Xx', clashTag: '', createdAt: '2026-10-02T10:00:00.000Z' },
  { id: '3', username: 'asher', clashTag: '#ZZZ999', createdAt: '2026-08-01T10:00:00.000Z' },
];

test('search finds text anywhere in a username, ignoring case', () => {
  const found = (q) => users.filter((u) => matchesSearch(u, q)).map((u) => u.username);
  expect(found('badword')).toEqual(['xX_badWord_Xx']);
  expect(found('B')).toEqual(['BuilderBoss', 'xX_badWord_Xx']);
  expect(found('  ASH ')).toEqual(['asher']);
  expect(found('nobody')).toEqual([]);
});

test('an empty search lists everyone, and a Clash tag can be searched too', () => {
  expect(users.filter((u) => matchesSearch(u, ''))).toHaveLength(3);
  expect(users.filter((u) => matchesSearch(u, '#zzz')).map((u) => u.username)).toEqual(['asher']);
});

test('newest accounts come first by default, or A to Z', () => {
  expect(sortUsers(users, 'newest').map((u) => u.username)).toEqual(['xX_badWord_Xx', 'BuilderBoss', 'asher']);
  expect(sortUsers(users, 'name').map((u) => u.username)).toEqual(['asher', 'BuilderBoss', 'xX_badWord_Xx']);
  // An account with no join date sorts last, not first.
  expect(sortUsers([...users, { id: '4', username: 'old' }], 'newest').at(-1).username).toBe('old');
});

test('richest first puts players who have never used Gold last', () => {
  const list = [
    { id: '1', username: 'poor', gold: 0 },
    { id: '2', username: 'never', gold: null },
    { id: '3', username: 'rich', gold: 5000000 },
    { id: '4', username: 'debt', gold: -200 },
  ];
  expect(sortUsers(list, 'gold').map((u) => u.username)).toEqual(['rich', 'poor', 'debt', 'never']);
});

test('a Gold amount can be typed with commas, but must be a whole number of 0 or more', () => {
  expect(parseGold('0')).toBe(0);
  expect(parseGold('1,000,000')).toBe(1000000);
  expect(parseGold(' 2 500 ')).toBe(2500);
  expect(parseGold('')).toBeNull();
  expect(parseGold('-5')).toBeNull();
  expect(parseGold('12.5')).toBeNull();
  expect(parseGold('lots')).toBeNull();
});
