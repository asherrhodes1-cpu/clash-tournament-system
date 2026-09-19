// Wording for the per-player DMs. Every DM comes from the same bot, so a
// player has to be told once, when they get a new opponent, that that
// opponent's chat messages will arrive here and that replies must go through
// the site. After that, a relayed message is just the message.
const { discordTime } = require('./reminders');

const dayOf = (match) => match.day ?? match.round;

// Sent to one player when a match with a new opponent is created.
function newOpponentMessage(match, player, now = Date.now()) {
  const opponent = match.player1 === player ? match.player2 : match.player1;
  const opensLater = match.unlockAt && match.unlockAt > now;
  const when = opensLater ? `Your match opens ${discordTime(match.unlockAt)}.` : 'Your match is open, so ready up!';
  return {
    text:
      `🆕 **New opponent:** **${opponent}** (Day ${dayOf(match)}). ${when}\n` +
      `💬 Their match chat messages will show up here. Replying here won't reach them, so reply in your match chat on the site.`,
    linkLabel: opensLater ? 'Open Rainbow League' : 'Open Rainbow League to ready up',
  };
}

// Relays a chat message to the other player: just who said what.
function chatMessage(sender, text) {
  const preview = text.length > 200 ? `${text.slice(0, 200)}...` : text;
  return {
    text: `💬 **${sender}:** ${preview}`,
    linkLabel: 'Open Rainbow League to reply',
  };
}

module.exports = { newOpponentMessage, chatMessage };
