// Database calls are stubbed: this checks which writes reinstatePlayer makes,
// and when it refuses, not Firestore itself.
const mockUpdates = [];
const mockCommit = jest.fn(async () => {});

jest.mock('firebase/firestore', () => ({
  writeBatch: () => ({ update: (ref, data) => mockUpdates.push({ ref, data }), commit: mockCommit }),
  doc: (...parts) => parts.slice(1).join('/'),
  arrayUnion: (v) => ({ union: v }),
  arrayRemove: (v) => ({ remove: v }),
  deleteField: () => 'DELETE',
  collection: jest.fn(), addDoc: jest.fn(), setDoc: jest.fn(), updateDoc: jest.fn(), getDoc: jest.fn(),
  onSnapshot: jest.fn(), query: jest.fn(), orderBy: jest.fn(), where: jest.fn(), or: jest.fn(),
  runTransaction: jest.fn(), getDocs: jest.fn(), collectionGroup: jest.fn(),
}));
jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('../clash', () => ({ fetchClashPlayerData: jest.fn() }));

const { reinstatePlayer } = require('../tournaments');

const tournament = { id: 't1', status: 'in_progress', players: ['yolo'], removedPlayers: ['thanigai'] };
const removedMatch = {
  id: 't1-3', round: 1, player1: 'thanigai', player2: 'yolo', status: 'completed', winner: 'yolo',
  resolvedReason: 'player_removed', resolvedBy: 'Staff', completedAt: 5,
  player1Ready: false, player2Ready: true,
};

beforeEach(() => { mockUpdates.length = 0; mockCommit.mockClear(); });

test('reopens the match and puts the player back', async () => {
  await reinstatePlayer(tournament, [removedMatch], 'thanigai');
  const match = mockUpdates.find((u) => u.ref.includes('matches'));
  expect(match.data).toEqual({ status: 'pending', winner: null, completedAt: null, resolvedBy: 'DELETE', resolvedReason: 'DELETE' });
  const t = mockUpdates.find((u) => !u.ref.includes('matches'));
  expect(t.data).toEqual({ players: { union: 'thanigai' }, removedPlayers: { remove: 'thanigai' } });
  expect(mockCommit).toHaveBeenCalledTimes(1);
});

test('rebuilds the status a match had from its ready flags and votes', async () => {
  const bothReady = { ...removedMatch, player1Ready: true, player2Ready: true };
  await reinstatePlayer(tournament, [bothReady], 'thanigai');
  expect(mockUpdates[0].data.status).toBe('scheduled');
  mockUpdates.length = 0;
  await reinstatePlayer(tournament, [{ ...bothReady, winner2Vote: 'yolo' }], 'thanigai');
  expect(mockUpdates[0].data.status).toBe('waiting_for_opponent');
});

test('refuses once the next round has been created, and writes nothing', async () => {
  const nextRound = { id: 't1-r2-0', round: 2, player1: 'yolo', player2: 'someone', status: 'pending' };
  await expect(reinstatePlayer(tournament, [removedMatch, nextRound], 'thanigai')).rejects.toThrow(/next round has already been created/);
  expect(mockCommit).not.toHaveBeenCalled();
});

test('refuses when removal did not decide any of their matches', async () => {
  await expect(reinstatePlayer(tournament, [{ ...removedMatch, resolvedReason: undefined }], 'thanigai')).rejects.toThrow(/nothing to restore/);
});

test('only works while the tournament is in progress', async () => {
  await expect(reinstatePlayer({ ...tournament, status: 'completed' }, [removedMatch], 'thanigai')).rejects.toThrow(/in progress/);
});
