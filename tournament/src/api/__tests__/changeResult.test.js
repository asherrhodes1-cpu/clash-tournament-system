// Database calls are stubbed: this checks which writes each function makes,
// and when it refuses, not Firestore itself.
const mockWrites = [];
const mockCommit = jest.fn(async () => {});

jest.mock('firebase/firestore', () => ({
  writeBatch: () => ({
    update: (ref, data) => mockWrites.push({ ref, data }),
    delete: (ref) => mockWrites.push({ ref, deleted: true }),
    commit: mockCommit,
  }),
  updateDoc: async (ref, data) => { mockWrites.push({ ref, data }); },
  doc: (...parts) => parts.slice(1).join('/'),
  arrayUnion: (v) => ({ union: v }),
  arrayRemove: (v) => ({ remove: v }),
  deleteField: () => 'DELETE',
  collection: jest.fn(), addDoc: jest.fn(), setDoc: jest.fn(), getDoc: jest.fn(),
  onSnapshot: jest.fn(), query: jest.fn(), orderBy: jest.fn(), where: jest.fn(), or: jest.fn(),
  runTransaction: jest.fn(), getDocs: jest.fn(), collectionGroup: jest.fn(),
}));
jest.mock('../../firebase', () => ({ db: {} }));
jest.mock('../clash', () => ({ fetchClashPlayerData: jest.fn() }));

const { changeMatchWinner, reopenMatch } = require('../tournaments');

const tournament = {
  id: 't1', status: 'in_progress', format: 'single_elimination',
  playerStats: { Ana: { tag: '#ANA' }, Bo: { tag: '#BO' } },
};
// Staff picked Bo by mistake; Ana should have won.
const decided = {
  id: 't1-0', round: 1, player1: 'Ana', player2: 'Bo', status: 'completed', winner: 'Bo',
  resolvedReason: 'staff_override', resolvedBy: 'Staff', completedAt: 5, player1Ready: true, player2Ready: true,
};
const nextMatch = { id: 't1-r2-0', round: 2, player1: 'Bo', player2: 'Cy', status: 'pending', player1Ready: false, player2Ready: false };

beforeEach(() => { mockWrites.length = 0; mockCommit.mockClear(); });

describe('changeMatchWinner', () => {
  test('switches the winner when nothing has been built on it', async () => {
    await changeMatchWinner(tournament, [decided], 't1-0', 'Ana', 'Boss');
    expect(mockWrites).toHaveLength(1);
    expect(mockWrites[0].data).toMatchObject({ winner: 'Ana', resolvedBy: 'Boss', resolvedReason: 'staff_override' });
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  test('swaps the right player into the next round if their match hasn\'t started', async () => {
    await changeMatchWinner(tournament, [decided, nextMatch], 't1-0', 'Ana', 'Boss');
    const next = mockWrites.find((w) => w.ref.includes('r2'));
    expect(next.data).toEqual({ player1: 'Ana', player1Tag: '#ANA', player1Stats: { tag: '#ANA' } });
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  test('also fixes a bye match, where the winner is the one player in it', async () => {
    const bye = { ...nextMatch, player2: 'BYE', status: 'completed', winner: 'Bo' };
    await changeMatchWinner(tournament, [decided, bye], 't1-0', 'Ana', 'Boss');
    const next = mockWrites.find((w) => w.ref.includes('r2'));
    expect(next.data.player1).toBe('Ana');
    expect(next.data.winner).toBe('Ana');
  });

  test('refuses if the wrong winner has already started their next match, writing nothing', async () => {
    await expect(changeMatchWinner(tournament, [decided, { ...nextMatch, player1Ready: true }], 't1-0', 'Ana', 'Boss')).rejects.toThrow(/already started/);
    await expect(changeMatchWinner(tournament, [decided, { ...nextMatch, status: 'scheduled' }], 't1-0', 'Ana', 'Boss')).rejects.toThrow(/already started/);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('refuses once later rounds exist', async () => {
    const round3 = { id: 't1-r3-0', round: 3, player1: 'Bo', player2: 'Di', status: 'pending' };
    await expect(changeMatchWinner(tournament, [decided, nextMatch, round3], 't1-0', 'Ana', 'Boss')).rejects.toThrow(/Later rounds/);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('refuses in double elimination once the next round exists', async () => {
    const de = { ...tournament, format: 'double_elimination' };
    await expect(changeMatchWinner(de, [decided, nextMatch], 't1-0', 'Ana', 'Boss')).rejects.toThrow(/double elimination/);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  test('only touches results staff decided by hand, in a running tournament, to the other player', async () => {
    await expect(changeMatchWinner(tournament, [{ ...decided, resolvedReason: undefined }], 't1-0', 'Ana', 'Boss')).rejects.toThrow(/by hand/);
    await expect(changeMatchWinner({ ...tournament, status: 'completed' }, [decided], 't1-0', 'Ana', 'Boss')).rejects.toThrow(/in progress/);
    await expect(changeMatchWinner(tournament, [decided], 't1-0', 'Zed', 'Boss')).rejects.toThrow(/isn't in this match/);
    await expect(changeMatchWinner(tournament, [decided], 't1-0', 'Bo', 'Boss')).rejects.toThrow(/already the winner/);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});

describe('reopenMatch', () => {
  test('reopens the match with the status it had, clearing the decision', async () => {
    await reopenMatch(tournament, [decided], 't1-0');
    expect(mockWrites[0].data).toEqual({
      status: 'scheduled', winner: null, completedAt: null,
      resolvedBy: 'DELETE', resolvedReason: 'DELETE', autoResolvedAt: 'DELETE',
    });
  });

  // Sven never readied up and was forfeited automatically; Clap had readied.
  const forfeited = {
    id: 't1-0', round: 1, player1: 'Sven', player2: 'Clap', status: 'completed', winner: 'Clap',
    resolvedReason: 'opponent_no_show', autoResolvedAt: 9, completedAt: 9, player1Ready: false, player2Ready: true,
  };

  test('reopens an automatic no-show forfeit, back to pending with the opponent still ready', async () => {
    await reopenMatch(tournament, [forfeited], 't1-0');
    expect(mockWrites[0].data).toMatchObject({ status: 'pending', winner: null, resolvedReason: 'DELETE', autoResolvedAt: 'DELETE' });
  });

  test('other automatic results are not reversible here', async () => {
    await expect(reopenMatch(tournament, [{ ...forfeited, resolvedReason: 'opponent_timeout' }], 't1-0')).rejects.toThrow(/by hand, or an automatic no-show/);
  });

  const clapNext = { id: 't1-r2-0', round: 2, player1: 'Clap', player2: 'Cy', status: 'pending', player1Ready: false, player2Ready: false };

  test('removes the winner\'s not-yet-started next match (the scheduler makes it again), then reopens', async () => {
    await reopenMatch(tournament, [forfeited, clapNext], 't1-0');
    expect(mockWrites.find((w) => w.ref.includes('r2'))).toEqual({ ref: expect.stringContaining('t1-r2-0'), deleted: true });
    expect(mockWrites.find((w) => w.data)?.data.status).toBe('pending');
    expect(mockCommit).toHaveBeenCalledTimes(1);
  });

  test('also removes a bye the winner was given', async () => {
    const byeNext = { ...clapNext, player2: 'BYE', status: 'completed', winner: 'Clap' };
    await reopenMatch(tournament, [forfeited, byeNext], 't1-0');
    expect(mockWrites.some((w) => w.deleted)).toBe(true);
  });

  test('refuses if the winner has already started their next match, writing nothing', async () => {
    await expect(reopenMatch(tournament, [forfeited, { ...clapNext, player1Ready: true }], 't1-0')).rejects.toThrow(/already started/);
    await expect(reopenMatch(tournament, [forfeited, { ...clapNext, status: 'scheduled' }], 't1-0')).rejects.toThrow(/already started/);
    expect(mockCommit).not.toHaveBeenCalled();
    expect(mockWrites).toHaveLength(0);
  });

  test('refuses once later rounds exist, in double elimination, or in a whole-round tournament', async () => {
    const round3 = { id: 't1-r3-0', round: 3, player1: 'Clap', player2: 'Di', status: 'pending' };
    await expect(reopenMatch(tournament, [forfeited, clapNext, round3], 't1-0')).rejects.toThrow(/Later rounds/);
    await expect(reopenMatch({ ...tournament, format: 'double_elimination' }, [forfeited, clapNext], 't1-0')).rejects.toThrow(/double elimination/);
    const grace = { id: 'x', round: 1, status: 'completed', resolvedReason: 'grace_period', player1: 'P', player2: 'Q' };
    await expect(reopenMatch(tournament, [forfeited, clapNext, grace], 't1-0')).rejects.toThrow(/whole round at a time/);
    expect(mockCommit).not.toHaveBeenCalled();
  });
});
