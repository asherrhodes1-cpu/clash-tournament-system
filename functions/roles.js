// Gives a member a role in the server they ran /link in. Never throws: a
// missing permission or a wrong role id must not stop the link itself, so the
// caller just gets { ok: false, ... } to log.
const DISCORD_API = 'https://discord.com/api/v10';

async function addGuildRole({ token, guildId, userId, roleId, fetchImpl = fetch, timeoutMs = 2000 }) {
  if (!token || !guildId || !userId || !roleId) return { ok: false, reason: 'not_configured' };
  try {
    const res = await fetchImpl(`${DISCORD_API}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
      method: 'PUT',
      headers: { Authorization: `Bot ${token}`, 'X-Audit-Log-Reason': 'Linked tournament account' },
      // The interaction has to be answered within 3 seconds, so don't wait long.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.ok) return { ok: true }; // Discord answers 204 No Content
    return { ok: false, status: res.status, body: await res.text() };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = { addGuildRole };
