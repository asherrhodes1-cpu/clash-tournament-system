// Wording for the per-player DMs. Every DM comes from the same bot, so the
// text has to make clear who a message is about: a player gets a new opponent
// each round, and their chat messages arrive in the same DM thread.
const { discordTime } = require('./reminders');

const dayOf = (match) => match.day ?? match.round;

// Sent to one player when a match with a new opponent is created.
function newOpponentMessage(match, player, now = Date.now()) {
  const opponent = match.player1 === player ? match.player2 : match.player1;
  const opensLater = match.unlockAt && match.unlockAt > now;
  const when = opensLater ? `Your match opens ${discordTime(match.unlockAt)}.` : 'Your match is open, so ready up!';
  return {
    text:
      `🆕 **New opponent:** you're up against **${opponent}** in Day ${dayOf(match)}.\n` +
      `${when}\n` +
      `💬 Anything **${opponent}** writes in your match chat will be sent to you here as a DM from this bot.`,
    linkLabel: opensLater ? 'Open Rainbow League' : 'Open Rainbow League to ready up',
  };
}

// Relays a chat message to the other player. Replies don't go back through
// the bot, so it says where to reply.
function chatMessage(match, sender, text) {
  const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
  const quoted = preview.split('\n').map((line) => `> ${line}`).join('\n');
  return {
    text:
      `💬 **${sender}** (your Day ${dayOf(match)} opponent) wrote:\n${quoted}\n` +
      `↩️ Replying here won't reach them. Reply in your match chat on the site.`,
    linkLabel: 'Open Rainbow League to reply',
  };
}

module.exports = { newOpponentMessage, chatMessage };
