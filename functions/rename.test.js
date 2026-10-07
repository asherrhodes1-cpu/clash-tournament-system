const test = require('node:test');
const assert = require('node:assert');
const { checkNewUsername, renameIn, renameChanges } = require('./rename');

test('a new username follows the sign-up rules', () => {
  assert.strictEqual(checkNewUsername('  Good_Name.1 '), 'Good_Name.1');
  assert.throws(() => checkNewUsername('ab'), /at least 3/);
  assert.throws(() => checkNewUsername('has space'), /may only contain/);
  assert.throws(() => checkNewUsername('a'.repeat(31)), /30 characters/);
  assert.throws(() => checkNewUsername(null), /at least 3/);
});

test('a match is rewritten wherever the old name appears', () => {
  const match = {
    id: 'r1m1', tournamentId: 't1', status: 'completed', resolvedReason: 'staff_override',
    player1: 'OldName', player2: 'Rival', winner: 'OldName', winner1Vote: 'OldName', winner2Vote: 'Rival',
    player1Ready: true, completedAt: 123, player1ScreenshotPaths: ['matchScreenshots/t1/r1m1/player1/a.png'],
  };
  assert.deepStrictEqual(renameChanges(match, 'OldName', 'NewName'), {
    player1: 'NewName', winner: 'NewName', winner1Vote: 'NewName',
  });
  assert.deepStrictEqual(renameChanges(match, 'Nobody', 'NewName'), {});
});

test('a tournament is rewritten in its lists, its name-keyed maps and its bracket', () => {
  const tournament = {
    id: 't1', name: 'OldName', description: 'OldName', status: 'completed', champion: 'OldName', createdBy: 'Staffer',
    players: ['A', 'OldName', 'B'], removedPlayers: [], placements: { OldName: 1, A: 2 },
    playerStats: { OldName: { tag: '#X', bestBuilderBaseTrophies: 5000 }, A: { tag: '#Y' } },
    bracket: [{ round: 1, matches: [{ player1: 'OldName', player2: 'A' }] }],
  };
  const changes = renameChanges(tournament, 'OldName', 'NewName');
  assert.deepStrictEqual(Object.keys(changes).sort(), ['bracket', 'champion', 'placements', 'playerStats', 'players']);
  assert.deepStrictEqual(changes.players, ['A', 'NewName', 'B']);
  assert.deepStrictEqual(changes.placements, { NewName: 1, A: 2 });
  assert.strictEqual(changes.playerStats.NewName.tag, '#X');
  assert.strictEqual(changes.bracket[0].matches[0].player1, 'NewName');
  // A tournament that merely shares its name with the player keeps its name.
  assert.strictEqual(changes.name, undefined);
  assert.strictEqual(changes.description, undefined);
});

test('only exact matches are renamed - not longer names that contain it', () => {
  assert.deepStrictEqual(renameIn(['Old', 'OldName', 'old'], 'Old', 'New'), ['New', 'OldName', 'old']);
  assert.deepStrictEqual(renameIn({ OldName: 1, Old: 2 }, 'Old', 'New'), { OldName: 1, New: 2 });
});

test('values that are not plain data pass through untouched', () => {
  class Timestamp { constructor() { this.seconds = 5; } }
  const ts = new Timestamp();
  const out = renameIn({ at: ts, n: 3, ok: true, none: null, who: 'Old' }, 'Old', 'New');
  assert.strictEqual(out.at, ts);
  assert.deepStrictEqual({ n: out.n, ok: out.ok, none: out.none, who: out.who }, { n: 3, ok: true, none: null, who: 'New' });
});
