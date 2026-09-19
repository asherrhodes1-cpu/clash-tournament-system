// Wording for the per-player DMs. Every DM comes from the same bot, so a
// player has to be told once, when they get a new opponent, that that
// opponent's chat messages will arrive here and that replies must go through
// the site. After that, a relayed message is just the message.
const { discordTime, TIMEOUT_MS } = require('./reminders');

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

// Sent to a player when their opponent readies up first. The other side has
// TIMEOUT_MS from that moment before they forfeit (see handleTimeouts).
function opponentReadyMessage(readyPlayer, readyTime) {
  return {
    text: `⚔️ **${readyPlayer}** is ready and waiting for you. Ready up before ${discordTime(readyTime + TIMEOUT_MS)} or you'll forfeit the match.`,
    linkLabel: 'Open Rainbow League to ready up',
  };
}

// Sent to both players when their match goes to staff, so they know what's
// happening instead of waiting on a result nobody is going to report.
function sentToStaffMessage(match, player) {
  const opponent = match.player1 === player ? match.player2 : match.player1;
  const why = match.status === 'disputed'
    ? `you and **${opponent}** reported different winners`
    : `neither of you reported a result in time`;
  return {
    text: `🛠️ Your match against **${opponent}** has been sent to staff: ${why}. They'll decide it and you'll be told the outcome.`,
    linkLabel: 'Open Rainbow League',
  };
}

module.exports = { newOpponentMessage, chatMessage, opponentReadyMessage, sentToStaffMessage };
