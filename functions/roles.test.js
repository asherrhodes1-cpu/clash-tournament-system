const test = require('node:test');
const assert = require('node:assert');
const { addGuildRole } = require('./roles');

const base = { token: 'tok', guildId: '111', userId: '222', roleId: '333' };

test('puts the role on the member with the bot token', async () => {
  let call;
  const fetchImpl = async (url, opts) => { call = { url, opts }; return { ok: true, status: 204 }; };
  assert.deepStrictEqual(await addGuildRole({ ...base, fetchImpl }), { ok: true });
  assert.strictEqual(call.url, 'https://discord.com/api/v10/guilds/111/members/222/roles/333');
  assert.strictEqual(call.opts.method, 'PUT');
  assert.strictEqual(call.opts.headers.Authorization, 'Bot tok');
});

test('does nothing when a role id (or anything else) isn\'t configured', async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return { ok: true }; };
  assert.deepStrictEqual(await addGuildRole({ ...base, roleId: undefined, fetchImpl }), { ok: false, reason: 'not_configured' });
  assert.deepStrictEqual(await addGuildRole({ ...base, guildId: undefined, fetchImpl }), { ok: false, reason: 'not_configured' });
  assert.strictEqual(called, false);
});

test('reports Discord errors such as missing permissions without throwing', async () => {
  const fetchImpl = async () => ({ ok: false, status: 403, text: async () => '{"message":"Missing Permissions"}' });
  const result = await addGuildRole({ ...base, fetchImpl });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, 403);
});

test('a network failure or timeout is reported, not thrown', async () => {
  const fetchImpl = async () => { throw new Error('timeout'); };
  assert.deepStrictEqual(await addGuildRole({ ...base, fetchImpl }), { ok: false, reason: 'timeout' });
});
